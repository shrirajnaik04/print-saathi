package `in`.printsaathi.app.engine.jobs

import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Phase 10 finding: the daily retention job runs in a process where the web app has not yet said which jobs are on
 * the screen (Android also runs it at once when it is first scheduled, at every start after a force-stop or reboot),
 * so it deleted an old job the shopkeeper was looking at. The open jobs are kept on disk too, for as long as the web app would
 * still bring that screen back (30 minutes, PLAN §D5).
 */
class OpenJobsTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun theJobsOnScreenAreRememberedForAsLongAsTheScreenCanComeBack() {
        val root = tmp.newFolder()
        OpenJobs(root).save(setOf("a", "b"), nowMs = 1_000)
        assertEquals(setOf("a", "b"), OpenJobs(root).recent(nowMs = 1_000 + OpenJobs.RESTORE_MS))
        assertEquals(emptySet<String>(), OpenJobs(root).recent(nowMs = 1_000 + OpenJobs.RESTORE_MS + 60_001))
    }

    @Test fun leavingAJobForgetsIt() {
        val root = tmp.newFolder()
        OpenJobs(root).save(setOf("a"), nowMs = 1_000)
        OpenJobs(root).save(emptySet(), nowMs = 2_000)
        assertEquals(emptySet<String>(), OpenJobs(root).recent(nowMs = 2_000))
    }

    @Test fun nothingSavedOrABrokenFileProtectsNothing() {
        val root = tmp.newFolder()
        assertEquals(emptySet<String>(), OpenJobs(root).recent(nowMs = 0))
        File(root, "state").mkdirs()
        File(root, "state/open-jobs.json").writeText("{not json")
        assertEquals(emptySet<String>(), OpenJobs(root).recent(nowMs = 0))
    }

    @Test fun aClockSetBackKeepsProtectingWhileTheWebAppWouldStillRestore() {
        val root = tmp.newFolder()
        OpenJobs(root).save(setOf("a"), nowMs = 10 * OpenJobs.RESTORE_MS)
        // Saved "in the future" (the clock went back): persist.ts restores any negative age, so the job is protected
        // too (review M1), until the next screen change saves the open jobs again.
        assertEquals(setOf("a"), OpenJobs(root).recent(nowMs = 10 * OpenJobs.RESTORE_MS - 1_000))
        assertEquals(setOf("a"), OpenJobs(root).recent(nowMs = 0))
    }

    @Test fun theSweepKeepsAnOldJobThatIsStillOnScreen() {
        val root = tmp.newFolder()
        val day = 24L * 3600 * 1000
        val jobs = File(root, "jobs").apply { mkdirs() }
        for (id in listOf("onscreen", "left")) {
            File(jobs, id).mkdirs()
            File(jobs, "$id/job.json").writeText("""{"id":"$id","updatedAt":0}""")
            File(jobs, "$id/job.json").setLastModified(0)
            File(jobs, id).setLastModified(0)
        }
        OpenJobs(root).save(setOf("onscreen"), nowMs = 3 * day)
        val deleted = JobSweeper(root).sweep(3 * day, day, Long.MAX_VALUE, OpenJobs(root).recent(3 * day))
        assertEquals(setOf("left"), deleted)
    }

    @Test fun theWindowIsTheWebAppsRestoreWindow() {
        val ts = File("../../src/core/nav/persist.ts").readText()
        assert(Regex("""export const RESTORE_MS = 30 \* 60 \* 1000;""").containsMatchIn(ts)) { "persist.ts RESTORE_MS changed" }
        assertEquals(30L * 60 * 1000, OpenJobs.RESTORE_MS)
    }
}
