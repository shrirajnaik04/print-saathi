package `in`.printsaathi.app.engine.office

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * Round 9: the engine names a customer's Office file by what is inside it (never its file name): Word, PowerPoint or
 * Excel, new (OOXML), old (OLE), OpenDocument or RTF. Anything it cannot tell is an "Office file".
 */
class OfficeKindTest {
    private val dir = Files.createTempDirectory("kind").toFile()
    private fun kind(bytes: ByteArray) = OfficeKind.detect(File(dir, "f${bytes.size}").apply { writeBytes(bytes) })

    @Test fun newWordPowerPointExcel() {
        assertEquals(OfficeKind.WORD to OfficeFormat.OOXML, kind(OfficeFixtures.docx("<w:p/>")))
        assertEquals(OfficeKind.POWERPOINT to OfficeFormat.OOXML, kind(OfficeFixtures.pptx(listOf("ppt/presentation.xml" to "<p:presentation/>"))))
        assertEquals(OfficeKind.EXCEL to OfficeFormat.OOXML, kind(OfficeFixtures.xlsx(listOf("xl/workbook.xml" to "<workbook/>"))))
    }

    @Test fun oldBinaryFiles() {
        assertEquals(OfficeKind.WORD to OfficeFormat.OLE, kind(OfficeFixtures.ole("WordDocument", "1Table")))
        assertEquals(OfficeKind.POWERPOINT to OfficeFormat.OLE, kind(OfficeFixtures.ole("PowerPoint Document")))
        assertEquals(OfficeKind.EXCEL to OfficeFormat.OLE, kind(OfficeFixtures.ole("Workbook")))
        assertEquals(OfficeKind.EXCEL to OfficeFormat.OLE, kind(OfficeFixtures.ole("Book")))
    }

    @Test fun anEncryptedDocxIsAnOfficeFileNotWord() {
        // A password-protected .docx is an OLE file holding the encrypted package.
        assertEquals(OfficeKind.OFFICE to OfficeFormat.OLE, kind(OfficeFixtures.ole("EncryptionInfo", "EncryptedPackage")))
    }

    @Test fun openDocumentAndRtf() {
        assertEquals(OfficeKind.WORD to OfficeFormat.ODF, kind(OfficeFixtures.odf("application/vnd.oasis.opendocument.text")))
        assertEquals(OfficeKind.POWERPOINT to OfficeFormat.ODF, kind(OfficeFixtures.odf("application/vnd.oasis.opendocument.presentation")))
        assertEquals(OfficeKind.EXCEL to OfficeFormat.ODF, kind(OfficeFixtures.odf("application/vnd.oasis.opendocument.spreadsheet")))
        assertEquals(OfficeKind.WORD to OfficeFormat.RTF, kind("{\\rtf1\\ansi Hello}".toByteArray()))
    }

    @Test fun aPlainZipOrJunkIsAnOfficeFileOfUnknownFormat() {
        assertEquals(OfficeKind.OFFICE to OfficeFormat.UNKNOWN, kind(OfficeFixtures.zip(listOf("a.txt" to "x".toByteArray()))))
        assertEquals(OfficeKind.OFFICE to OfficeFormat.UNKNOWN, kind(ByteArray(100) { 7 }))
        assertEquals(OfficeKind.OFFICE to OfficeFormat.UNKNOWN, kind(ByteArray(0)))
    }
}
