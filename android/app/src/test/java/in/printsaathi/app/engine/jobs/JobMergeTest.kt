package `in`.printsaathi.app.engine.jobs

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.file.Files

/**
 * "New files arrived → Add to this job" (PLAN §I-17, §K9): the new share's files are placed in the open job's own
 * src folder (the only place files are ever decoded from), numbered after the job's own. Both jobs stay complete
 * until the web app has saved the merged job and deleted the new one, so a failure half-way loses nothing.
 */
class JobMergeTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun job(jobs: File, id: String, vararg names: String) = File(jobs, "$id/src").apply {
        mkdirs()
        names.forEach { File(this, it).writeText("$id/$it") }
    }

    private val hardLink: (File, File) -> Boolean = { src, dst -> Files.createLink(dst.toPath(), src.toPath()); true }

    /**
     * Review I1 (round 8): a text message's PDF, its kept text and a PDF made again at another size share one number;
     * they get one new number together, so Edit text and Text size still find the text after Add to this job.
     */
    @Test fun aTextMessagesFilesStayTogetherUnderOneNewNumber() {
        val jobs = tmp.newFolder("jobs")
        job(jobs, "open", "0001.jpg", "0002-12-5.pdf")
        job(jobs, "new", "0001.pdf", "0001.txt", "0001-18-99.pdf")
        val moved = JobMerge(jobs, hardLink).merge(from = "new", into = "open")
        assertEquals(
            setOf("0001.pdf" to "0003.pdf", "0001.txt" to "0003.txt", "0001-18-99.pdf" to "0003-18-99.pdf"),
            moved.map { (a, b) -> a.name to b.name }.toSet(),
        )
        assertEquals("new/0001.txt", `in`.printsaathi.app.engine.intake.TextIntake.read(jobs, "open", 3))
    }

    @Test fun theNewFilesAreNumberedAfterTheOpenJobsOwnAndKeepTheirKind() {
        val jobs = tmp.newFolder("jobs")
        job(jobs, "open", "0001.jpg", "0002.jpg", "0003.pdf")
        job(jobs, "new", "0001.png", "0002.jpg", "0010.jpg", "0003.jpg.part")
        val moved = JobMerge(jobs, hardLink).merge(from = "new", into = "open")
        assertEquals(
            listOf("0001.png" to "0004.png", "0002.jpg" to "0005.jpg", "0010.jpg" to "0006.jpg"),
            moved.map { (a, b) -> a.name to b.name },
        )
        for ((a, b) in moved) {
            assertEquals(File(jobs, "open/src").canonicalFile, b.parentFile.canonicalFile)
            assertArrayEquals(a.readBytes(), b.readBytes())
            assertTrue("the new job stays complete until the web app deletes it", a.exists())
        }
    }

    @Test fun thumbnailsComeAlongSoTheyAreNotMadeAgain() {
        val jobs = tmp.newFolder("jobs")
        job(jobs, "open", "0001.jpg")
        job(jobs, "new", "0001.jpg")
        File(jobs, "new/thumbs").mkdirs()
        File(jobs, "new/thumbs/abc-640.jpg").writeText("thumb")
        File(jobs, "new/thumbs/abc-640.jpg.part").writeText("half")
        JobMerge(jobs, hardLink).merge(from = "new", into = "open")
        assertEquals("thumb", File(jobs, "open/thumbs/abc-640.jpg").readText())
        assertTrue(!File(jobs, "open/thumbs/abc-640.jpg.part").exists())
    }

    @Test fun whenLinkingIsNotPossibleTheFilesAreCopied() {
        val jobs = tmp.newFolder("jobs")
        job(jobs, "open", "0001.jpg")
        job(jobs, "new", "0001.jpg")
        val moved = JobMerge(jobs) { _, _ -> false }.merge(from = "new", into = "open")
        assertEquals("new/0001.jpg", moved.single().second.readText())
    }

    @Test fun oddRequestsAreRefused() {
        val jobs = tmp.newFolder("jobs")
        job(jobs, "open", "0001.jpg")
        job(jobs, "new", "0001.jpg")
        for ((from, into) in listOf("open" to "open", "../x" to "open", "new" to "missing", "missing" to "open")) {
            val r = runCatching { JobMerge(jobs, hardLink).merge(from, into) }
            assertTrue("$from → $into must be refused", r.exceptionOrNull() is IllegalArgumentException)
        }
    }
}
