package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest

/**
 * Owner, round 8: a customer's text message (shared from WhatsApp or pasted) becomes a job whose one file is the PDF the
 * engine made of it, with the text kept beside it (NNNN.txt) for Edit text and Text size. Only inside the job's folder.
 */
class TextIntakeTest {
    private val root: File = Files.createTempDirectory("jobs").toFile()
    private var asked = 0
    private val fakePdf: (File, File, Int) -> Result<Int> = { txt, pdf, size ->
        asked++
        pdf.writeBytes("%PDF-1.4 ${txt.readText().length} at $size".toByteArray())
        Result.success(2)
    }
    private fun sha(f: File) = MessageDigest.getInstance("SHA-256").digest(f.readBytes()).joinToString("") { "%02x".format(it) }

    @Test fun aMessageBecomesOneJobFileThePdfWithItsTextBeside() {
        val r = TextIntake.make(root, "i1", "नमस्कार *THANK YOU*", fakePdf)
        val files = r.getJSONArray("files")
        assertEquals(1, files.length())
        val f = files.getJSONObject(0)
        assertEquals(1, f.getInt("index"))
        assertEquals("pdf", f.getString("sniffedType"))
        val pdf = File(f.getString("path"))
        assertEquals(File(root, "i1/src/0001.pdf").canonicalPath, pdf.canonicalPath)
        assertEquals(sha(pdf), f.getString("sha256"))
        assertEquals(pdf.length(), f.getLong("bytes"))
        assertEquals(12, f.getJSONObject("text").getInt("size"))
        assertEquals("नमस्कार *THANK YOU*", File(root, "i1/src/0001.txt").readText(Charsets.UTF_8))
        assertEquals("text", r.getString("pick"))
        assertEquals(0, r.getInt("rejected"))
    }

    @Test fun emptyOrTooLongTextIsRefusedWithItsReasonAndNothingIsKept() {
        val empty = TextIntake.make(root, "i2", "  \n ", fakePdf)
        assertEquals(0, empty.getJSONArray("files").length())
        assertEquals("emptyText", empty.getJSONArray("problems").getJSONObject(0).getString("reason"))
        val long = TextIntake.make(root, "i3", "a".repeat(TextIntake.MAX_CHARS + 1), fakePdf)
        assertEquals("textTooLong", long.getJSONArray("problems").getJSONObject(0).getString("reason"))
        assertEquals(0, asked)
        assertFalse(File(root, "i3/src/0001.txt").exists())
    }

    @Test fun anEngineFailureIsAProblemAndLeavesNoHalfFiles() {
        val r = TextIntake.make(root, "i4", "hello", { _, _, _ -> Result.failure(IllegalStateException("x")) })
        assertEquals(0, r.getJSONArray("files").length())
        assertEquals("failed", r.getJSONArray("problems").getJSONObject(0).getString("reason"))
        assertFalse(File(root, "i4/src/0001.pdf").exists())
        assertFalse(File(root, "i4/src/0001.txt").exists())
    }

    @Test fun editTextAndTextSizeMakeANewPdfOfTheSameItem() {
        TextIntake.make(root, "i5", "first", fakePdf)
        val bigger = TextIntake.remake(root, "i5", 1, null, 18, 1000L, fakePdf)
        val p1 = File(bigger.getString("path"))
        assertTrue(p1.exists())
        assertTrue(p1.readText().endsWith("at 180"))
        assertEquals(2, bigger.getInt("pages"))
        assertEquals("first", TextIntake.read(root, "i5", 1))
        val edited = TextIntake.remake(root, "i5", 1, "second, longer", 12, 2000L, fakePdf)
        assertEquals("second, longer", TextIntake.read(root, "i5", 1))
        assertTrue(File(edited.getString("path")).name != p1.name)
        assertEquals(sha(File(edited.getString("path"))), edited.getString("sha256"))
    }

    @Test fun onlyFilesInsideThatJobsFolderAreTouched() {
        TextIntake.make(root, "i6", "mine", fakePdf)
        for (job in listOf("../i6", "i6/../i6", "", "a/b", "..")) assertNull(job, TextIntake.read(root, job, 1))
        assertNull(TextIntake.read(root, "i6", 0))
        assertNull(TextIntake.read(root, "i6", 10_000))
        assertNull(TextIntake.read(root, "missing", 1))
        assertTrue(runCatching { TextIntake.remake(root, "../x", 1, "y", 12, 1L, fakePdf) }.isFailure)
        assertTrue(runCatching { TextIntake.remake(root, "i6", 1, "y", 13, 1L, fakePdf) }.isFailure)
        assertTrue(runCatching { TextIntake.remake(root, "i6", 1, "", 12, 1L, fakePdf) }.isFailure)
    }
}
