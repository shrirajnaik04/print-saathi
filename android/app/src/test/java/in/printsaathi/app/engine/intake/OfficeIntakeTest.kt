package `in`.printsaathi.app.engine.intake

import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.jobs.JobMerge
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * Round 9: a received Office file is made into pages by the engine while it is received, its original kept beside them
 * (NNNN.office next to NNNN.pdf) for Print with WPS Office; one that is not made stays an Office file named by its kind.
 * A file that is not a picture or a document but is readable text becomes a text message.
 */
class OfficeIntakeTest {
    private val root: File = Files.createTempDirectory("jobs").toFile()
    private val src = File(root, "j1/src").apply { mkdirs() }

    private fun office(name: String = "0001.office") = File(src, name).apply { writeBytes("PK office bytes".toByteArray()) }

    private fun conv(
        office: (File, File) -> Result<EngineClient.OfficeResult> = { _, _ -> Result.failure(IllegalStateException()) },
        text: (File, File, File) -> Result<Int> = { _, _, _ -> Result.failure(IllegalStateException()) },
    ) = Converters(office, text)

    private val made = conv(office = { _, pdf ->
        pdf.writeBytes("%PDF-1.4 made".toByteArray())
        Result.success(EngineClient.OfficeResult(1, 1, 3, true))
    })

    @Test fun aConvertedWordFileBecomesPagesWithItsOriginalKept() {
        val f = office()
        val r = OfficeIntake.place(f, 1, SniffedType.OFFICE, made)!!
        assertEquals(SniffedType.PDF, r.type)
        assertEquals(File(src, "0001.pdf").absolutePath, r.path)
        assertEquals("word", r.office)
        assertEquals("ooxml", r.format)
        assertTrue(r.missed)
        assertTrue(File(src, "0001.office").exists())
        assertEquals(File(src, "0001.pdf").length(), r.bytes)
        assertEquals(64, r.sha256.length)
    }

    @Test fun aFileThatCannotBeMadeStaysAnOfficeFileNamedByKind() {
        val f = office()
        val notMade = conv(office = { _, _ -> Result.success(EngineClient.OfficeResult(2, 2, 0, false)) })
        val r = OfficeIntake.place(f, 1, SniffedType.OFFICE, notMade)!!
        assertEquals(SniffedType.OFFICE, r.type)
        assertEquals(f.absolutePath, r.path)
        assertEquals("powerpoint", r.office)
        assertEquals("ole", r.format)
        assertFalse(File(src, "0001.pdf").exists())
    }

    @Test fun anEngineFailureLeavesAnOfficeFileNotAHole() {
        val f = office()
        val r = OfficeIntake.place(f, 1, SniffedType.OFFICE, conv())!!
        assertEquals(SniffedType.OFFICE, r.type)
        assertEquals("office", r.office)
        assertTrue(f.exists())
        assertFalse(File(src, "0001.pdf").exists())
    }

    // Round 9 review I3: the engine failing (a hostile file, out of memory, too slow) keeps the kind the file's start
    // suggests, so the card still says "Word file" and WPS is told the right type.
    @Test fun anEngineFailureKeepsTheKindTheFileStartSuggests() {
        val r = OfficeIntake.place(office(), 1, SniffedType.OFFICE, conv(), hint = "excel")!!
        assertEquals(SniffedType.OFFICE, r.type)
        assertEquals("excel", r.office)
        assertEquals("ooxml", r.format)
    }

    @Test fun aTextFileBecomesATextMessage() {
        val f = File(src, "0002.bin").apply { writeBytes("hello".toByteArray()) }
        val c = conv(text = { _, txt, pdf ->
            txt.writeText("hello")
            pdf.writeBytes("%PDF text".toByteArray())
            Result.success(1)
        })
        val r = OfficeIntake.place(f, 2, SniffedType.OTHER, c)!!
        assertEquals(SniffedType.PDF, r.type)
        assertTrue(r.text)
        assertEquals("hello", File(src, "0002.txt").readText())
        assertFalse("the raw copy goes", f.exists())
        assertNull(r.office)
    }

    @Test fun aBinaryOtherFileStaysOther() {
        val f = File(src, "0003.bin").apply { writeBytes(ByteArray(20) { 1 }) }
        assertNull(OfficeIntake.place(f, 3, SniffedType.OTHER, conv()))
        assertTrue(f.exists())
        assertFalse(File(src, "0003.txt").exists())
        assertFalse(File(src, "0003.pdf").exists())
        // Too big to be a text message: not even tried.
        var tried = false
        val big = File(src, "0004.bin").apply { writeBytes(ByteArray(500_000)) }
        assertNull(OfficeIntake.place(big, 4, SniffedType.OTHER, conv(text = { _, _, _ -> tried = true; Result.success(1) })))
        assertFalse(tried)
    }

    @Test fun photosAndPdfsAreLeftAlone() {
        val f = File(src, "0005.jpg").apply { writeBytes(ByteArray(3)) }
        assertNull(OfficeIntake.place(f, 5, SniffedType.JPEG, made))
    }

    @Test fun anOriginalKeepsItsNumberBesideItsPages() {
        OfficeIntake.place(office(), 1, SniffedType.OFFICE, made)
        File(root, "open/src").mkdirs()
        File(root, "open/src/0001.jpg").writeBytes(ByteArray(1))
        val moved = JobMerge(root) { s, d -> s.copyTo(d); true }.merge(from = "j1", into = "open").map { it.second.name }.toSet()
        assertEquals(setOf("0002.office", "0002.pdf"), moved)
    }
}
