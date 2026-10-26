package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

/**
 * Owner, round 8 (scan pages): the phone's own camera writes one photo straight into the job's private folder through
 * the app's non-exported provider. Only the one waiting photo can be opened, only for writing; a photo taken is
 * imported exactly once, even when Android stopped the app while the camera was open; nothing taken leaves nothing.
 */
class CaptureStoreTest {
    private val base: File = Files.createTempDirectory("ps").toFile()
    private val root = File(base, "jobs")
    private val store = CaptureStore(File(base, "inbox"), root)
    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(2000) { 7 }

    private fun sha(f: File) = MessageDigest.getInstance("SHA-256").digest(f.readBytes()).joinToString("") { "%02x".format(it) }

    @Test fun onlyTheWaitingPhotoOpensAndOnlyForWriting() {
        val p = store.start(into = null, retake = null, nowMs = 1L)
        val file = File(root, "${p.intakeId}/src/0001.capture")
        for (mode in listOf("w", "wt", "rw", "rwt")) assertEquals(mode, file.canonicalPath, store.fileFor("/c/${p.token}", mode)?.canonicalPath)
        assertNull("read only", store.fileFor("/c/${p.token}", "r"))
        for (path in listOf("/c/other", "/c/${p.token}/x", "/c/${p.token}/../x", "/x/${p.token}", "/c/", "", null))
            assertNull("$path", store.fileFor(path, "w"))
        store.claim()
        assertNull("after it was taken", store.fileFor("/c/${p.token}", "w"))
    }

    @Test fun aPhotoTakenIsImportedOnceAsAScanIntake() {
        val p = store.start(into = null, retake = null, nowMs = 1L)
        store.fileFor("/c/${p.token}", "w")!!.apply { parentFile!!.mkdirs() }.writeBytes(jpeg)
        val claimed = store.claim()
        assertNotNull(claimed)
        assertNull("only once", store.claim())
        val intake = store.toIntake(claimed!!)
        assertNotNull(intake)
        assertEquals(p.intakeId, intake!!.getString("intakeId"))
        assertEquals("scan", intake.getString("pick"))
        val f = intake.getJSONArray("files").getJSONObject(0)
        val photo = File(f.getString("path"))
        assertEquals(File(root, "${p.intakeId}/src/0001.jpg").canonicalPath, photo.canonicalPath)
        assertEquals("jpeg", f.getString("sniffedType"))
        assertEquals(sha(photo), f.getString("sha256"))
        assertEquals(jpeg.size.toLong(), f.getLong("bytes"))
        assertFalse(File(root, "${p.intakeId}/src/0001.capture").exists())
    }

    @Test fun nothingTakenLeavesNothing() {
        // Cancelled: the camera wrote nothing, or an empty file.
        for (empty in listOf(false, true)) {
            val p = store.start(into = null, retake = null, nowMs = 1L)
            if (empty) store.fileFor("/c/${p.token}", "w")!!.apply { parentFile!!.mkdirs() }.writeBytes(ByteArray(0))
            val claimed = store.claim()!!
            assertNull(store.toIntake(claimed))
            assertFalse(File(root, p.intakeId).exists())
        }
    }

    @Test fun somethingThatIsNotAPhotoIsRefusedAndRemoved() {
        val p = store.start(into = null, retake = null, nowMs = 1L)
        store.fileFor("/c/${p.token}", "w")!!.apply { parentFile!!.mkdirs() }.writeBytes("%PDF-1.4 not a photo".toByteArray())
        val intake = store.toIntake(store.claim()!!)!!
        assertEquals(0, intake.getJSONArray("files").length())
        assertEquals("notPhoto", intake.getJSONArray("problems").getJSONObject(0).getString("reason"))
        assertFalse(File(root, "${p.intakeId}/src/0001.capture").exists())
    }

    @Test fun addingToAJobAndRetakingAreKeptWithThePhoto() {
        val p = store.start(into = "job-1", retake = 3, nowMs = 5L)
        store.fileFor("/c/${p.token}", "w")!!.apply { parentFile!!.mkdirs() }.writeBytes(jpeg)
        val intake = store.toIntake(store.claim()!!)!!
        val scan = intake.getJSONObject("scan")
        assertEquals("job-1", scan.getString("into"))
        assertEquals(3, scan.getInt("retake"))
        assertTrue(runCatching { store.start(into = "../x", retake = null, nowMs = 1L) }.isFailure)
        assertTrue(runCatching { store.start(into = "job-1", retake = 0, nowMs = 1L) }.isFailure)
    }

    @Test fun aDamagedRecordIsDropped() {
        File(base, "inbox").mkdirs()
        File(base, "inbox/capture.json").writeText("{not json")
        assertNull(store.claim())
        assertFalse(File(base, "inbox/capture.json").exists())
        assertNull(store.waitingIntakeId())
    }

    @Test fun theWaitingFolderIsKnownSoRetentionLeavesIt() {
        val p = store.start(into = null, retake = null, nowMs = 1L)
        assertEquals(p.intakeId, store.waitingIntakeId())
        store.claim()
        assertNull(store.waitingIntakeId())
    }
}
