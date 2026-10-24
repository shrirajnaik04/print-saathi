package `in`.printsaathi.app.engine.docs

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Review I5 (PLAN §G5): a job that held decrypted data — the app's unlocked copy, page images of a locked PDF, print
 * files and their previews made with a password — is marked; leaving it (or a restart) deletes all of that, and only
 * that: the customer's own files and ordinary thumbnails stay until retention.
 */
class DecryptedTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun job(): File = tmp.newFolder("job").apply {
        resolve("src").mkdirs()
        resolve("src/0001.pdf").writeText("customer file")
        resolve("thumbs").mkdirs()
        resolve("thumbs/pdf-abc-0.jpg").writeText("unlocked PDF page image")
        resolve("work/page-thumbs").mkdirs()
        resolve("work/page-thumbs/1-0.jpg").writeText("locked page image")
        resolve("work/unlocked-1.pdf").writeText("decrypted copy")
        resolve("work/0123456789abcdef").mkdirs()
        resolve("work/0123456789abcdef/1-3508-p0").writeText("decrypted page of a cut-off render")
        resolve("out/aaaaaaaaaaaaaaaa/preview").mkdirs()
        resolve("out/aaaaaaaaaaaaaaaa/print.pdf").writeText("decrypted print")
        resolve("out/aaaaaaaaaaaaaaaa/preview/0.jpg").writeText("decrypted preview")
        resolve("out/bbbbbbbbbbbbbbbb").mkdirs()
        resolve("out/bbbbbbbbbbbbbbbb/print.pdf").writeText("being printed")
    }

    @Test fun aMarkedJobForgetsEveryDecryptedThingAndKeepsTheRest() {
        val j = job()
        assertFalse(Decrypted.isMarked(j))
        Decrypted.mark(j)
        assertTrue(Decrypted.isMarked(j))
        Decrypted.forget(j, keepOut = null)
        assertFalse("unlocked copy", j.resolve("work/unlocked-1.pdf").exists())
        assertFalse("locked page images", j.resolve("work/page-thumbs").exists())
        assertFalse("print files and previews", j.resolve("out/aaaaaaaaaaaaaaaa").exists())
        assertFalse("scratch of a cut-off render (re-review m6)", j.resolve("work/0123456789abcdef").exists())
        assertFalse("marker", Decrypted.isMarked(j))
        assertEquals("customer file", j.resolve("src/0001.pdf").readText())
        assertTrue("ordinary thumbnails stay", j.resolve("thumbs/pdf-abc-0.jpg").exists())
    }

    /** Re-review I5: clearing scratch (work/) never loses the mark. */
    @Test fun theMarkIsNotInScratch() {
        val j = job()
        Decrypted.mark(j)
        j.resolve("work").deleteRecursively()
        assertTrue(Decrypted.isMarked(j))
    }

    @Test fun thePrintFileAndroidMayStillBeReadingIsKept() {
        val j = job()
        Decrypted.mark(j)
        Decrypted.forget(j, keepOut = "bbbbbbbbbbbbbbbb")
        assertTrue(j.resolve("out/bbbbbbbbbbbbbbbb/print.pdf").exists())
        assertFalse(j.resolve("out/aaaaaaaaaaaaaaaa").exists())
    }
}
