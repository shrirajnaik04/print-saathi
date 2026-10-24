package `in`.printsaathi.app.engine.jobs

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** PLAN §E retention: customer files go after the chosen time (default 1 day) and when storage passes 1.5 GB. */
class JobSweeperTest {
    @get:Rule val tmp = TemporaryFolder()

    private val hour = 3_600_000L
    private val day = 24 * hour
    private val now = 100 * day
    private val root get() = tmp.root

    /** A job folder whose files and job.json were last touched [ageMs] ago. */
    private fun job(id: String, ageMs: Long, bytes: Int = 10, printed: Boolean = false, withJson: Boolean = true): File {
        val dir = File(root, "jobs/$id").apply { mkdirs() }
        val src = File(dir, "src").apply { mkdirs() }
        File(src, "0001.jpg").writeBytes(ByteArray(bytes))
        if (withJson) {
            val j = JSONObject().put("id", id).put("rev", 1).put("updatedAt", now - ageMs)
            if (printed) j.put("printedAt", now - ageMs)
            File(dir, "job.json").writeText(j.toString())
        }
        dir.walkTopDown().forEach { it.setLastModified(now - ageMs) }
        File(root, "inbox").mkdirs()
        File(root, "inbox/$id.json").writeText("{}")
        return dir
    }

    private fun sweep(keepMs: Long = day, capBytes: Long = Long.MAX_VALUE, protect: Set<String> = emptySet()) =
        JobSweeper(root).sweep(now, keepMs, capBytes, protect)

    @Test fun deletesJobsOlderThanTheChosenTimeWithTheirIntakeRecord() {
        job("old", 25 * hour)
        job("fresh", 2 * hour)
        assertEquals(setOf("old"), sweep())
        assertFalse(File(root, "jobs/old").exists())
        assertFalse("its intake record goes too", File(root, "inbox/old.json").exists())
        assertTrue(File(root, "jobs/fresh/src/0001.jpg").exists())
        assertTrue(File(root, "inbox/fresh.json").exists())
    }

    @Test fun theSettingChangesTheAge() {
        job("a", 2 * hour)
        assertEquals(setOf("a"), sweep(keepMs = hour))
        job("b", 6 * day)
        assertEquals(emptySet<String>(), sweep(keepMs = 7 * day))
    }

    /** A share received while the app was closed has no job yet: the same rule applies to it. */
    @Test fun receivedFilesWithoutAJobFollowTheSameRule() {
        job("orphan-old", 2 * day, withJson = false)
        job("orphan-new", hour, withJson = false)
        assertEquals(setOf("orphan-old"), sweep())
    }

    @Test fun neverDeletesTheJobOnScreenOrBeingPrinted() {
        job("open", 3 * day)
        assertEquals(emptySet<String>(), sweep(protect = setOf("open")))
        assertTrue(File(root, "jobs/open").exists())
    }

    @Test fun overTheStorageCapTheOldestPrintedJobsGoFirst() {
        job("printed-old", 3 * hour, bytes = 400, printed = true)
        job("unprinted-older", 5 * hour, bytes = 400)
        job("printed-new", hour, bytes = 400, printed = true)
        // ~1440 bytes stored (3 x 400 + each job.json), cap 1000: one job must go, and a printed one is chosen
        // before an unprinted one.
        assertEquals(setOf("printed-old"), sweep(capBytes = 1000))
        // Cap 300: everything except what is protected, printed first, then the oldest unprinted.
        job("printed-old", 3 * hour, bytes = 400, printed = true)
        assertEquals(setOf("printed-old", "printed-new", "unprinted-older"), sweep(capBytes = 300))
    }

    @Test fun clearsLeftoverScratchAndHalfWrittenFilesInKeptJobs() {
        val dir = job("kept", hour)
        File(dir, "work/abc").mkdirs()
        File(dir, "work/abc/1-100.jpg").writeBytes(ByteArray(5))
        File(dir, "out/abc").mkdirs()
        File(dir, "out/abc/print.pdf.part").writeBytes(ByteArray(5))
        sweep()
        assertFalse(File(dir, "work").exists())
        assertFalse(File(dir, "out/abc/print.pdf.part").exists())
        assertTrue(File(dir, "src/0001.jpg").exists())
    }

    /** Re-review I5/I6: the job on screen keeps its unlocked copy, locked page images and decrypted mark. */
    @Test fun theJobOnScreenKeepsWhatItsLockedPdfNeedsAndLosesOnlyScratch() {
        val dir = job("open", hour)
        `in`.printsaathi.app.engine.docs.Decrypted.mark(dir)
        File(dir, "work/abc").mkdirs()
        File(dir, "work/abc/1-100.jpg").writeBytes(ByteArray(5))
        File(dir, "work/unlocked-1.pdf").writeBytes(ByteArray(5))
        File(dir, "work/unlocked-2.pdf.part").writeBytes(ByteArray(5))
        File(dir, "work/page-thumbs").mkdirs()
        File(dir, "work/page-thumbs/1-0.jpg").writeBytes(ByteArray(5))
        sweep(protect = setOf("open"))
        assertTrue("unlocked copy", File(dir, "work/unlocked-1.pdf").exists())
        assertTrue("locked page images", File(dir, "work/page-thumbs/1-0.jpg").exists())
        assertTrue("still marked", `in`.printsaathi.app.engine.docs.Decrypted.isMarked(dir))
        assertFalse("scratch", File(dir, "work/abc").exists())
        assertFalse("half copy", File(dir, "work/unlocked-2.pdf.part").exists())
    }

    /** Re-review I5: a kept job that is not open forgets its decrypted print files too. */
    @Test fun aKeptJobNotOpenForgetsItsDecryptedData() {
        val dir = job("left", hour)
        `in`.printsaathi.app.engine.docs.Decrypted.mark(dir)
        File(dir, "out/abc").mkdirs()
        File(dir, "out/abc/print.pdf").writeBytes(ByteArray(5))
        sweep()
        assertFalse(File(dir, "out/abc").exists())
        assertFalse(`in`.printsaathi.app.engine.docs.Decrypted.isMarked(dir))
        assertTrue(File(dir, "src/0001.jpg").exists())
    }

    @Test fun anUnreadableJobFileFallsBackToTheFolderAge() {
        val dir = job("broken", 2 * day)
        File(dir, "job.json").writeText("{oops")
        File(dir, "job.json").setLastModified(now - 2 * day)
        assertEquals(setOf("broken"), sweep())
    }

    @Test fun deleteAllRemovesEveryJobExceptProtected() {
        job("a", hour)
        job("b", hour)
        assertEquals(setOf("a"), JobSweeper(root).deleteAll(protect = setOf("b")))
        assertTrue(File(root, "jobs/b").exists())
    }

    /** Gate review #4 (privacy): what remains of deleted jobs — the latest-share pointer, content hashes — goes too. */
    @Test fun theLatestSharePointerGoesWithItsJobAndKeptHashesComeFromKeptJobs() {
        val dir = job("old", 2 * day)
        File(dir, "job.json").writeText(JSONObject().put("id", "old").put("updatedAt", now - 2 * day)
            .put("items", org.json.JSONArray().put(JSONObject().put("sha256", "h-old"))).toString())
        File(dir, "job.json").setLastModified(now - 2 * day)
        val kept = job("kept", hour)
        File(kept, "job.json").writeText(JSONObject().put("id", "kept").put("updatedAt", now - hour)
            .put("items", org.json.JSONArray().put(JSONObject().put("sha256", "h-kept"))).toString())
        File(root, "inbox/pending.json").writeText(JSONObject().put("intakeId", "old").toString())
        sweep()
        assertFalse(File(root, "inbox/pending.json").exists())
        assertEquals(setOf("h-kept"), JobSweeper(root).keptHashes())
    }
}
