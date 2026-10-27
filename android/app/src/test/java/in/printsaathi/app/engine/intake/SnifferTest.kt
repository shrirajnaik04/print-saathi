package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Test

class SnifferTest {
    private fun b(vararg x: Int) = ByteArray(x.size) { x[it].toByte() }
    private fun ascii(s: String) = s.toByteArray(Charsets.US_ASCII)

    @Test fun recognisesImagesByMagicBytes() {
        assertEquals(SniffedType.JPEG, sniff(b(0xFF, 0xD8, 0xFF, 0xE0, 0, 0)))
        assertEquals(SniffedType.PNG, sniff(b(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)))
        assertEquals(SniffedType.WEBP, sniff(ascii("RIFF") + b(0, 0, 0, 0) + ascii("WEBPVP8 ")))
        assertEquals(SniffedType.GIF, sniff(ascii("GIF89a")))
        assertEquals(SniffedType.HEIF, sniff(b(0, 0, 0, 0x18) + ascii("ftypheic")))
    }

    @Test fun findsPdfHeaderWithinFirstKilobyte() {
        assertEquals(SniffedType.PDF, sniff(ascii("%PDF-1.7\n")))
        assertEquals(SniffedType.PDF, sniff(ByteArray(300) { 0x20 } + ascii("%PDF-1.4")))
    }

    @Test fun recognisesOfficeAndVideoToRefuseThem() {
        assertEquals(SniffedType.OFFICE, sniff(b(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1)))
        assertEquals(SniffedType.OFFICE, sniff(b(0x50, 0x4B, 0x03, 0x04) + ascii("....[Content_Types].xml...word/document.xml")))
        assertEquals(SniffedType.VIDEO, sniff(b(0, 0, 0, 0x20) + ascii("ftypisom")))
    }

    @Test fun misleadingOrEmptyContentIsOther() {
        assertEquals(SniffedType.OTHER, sniff(ascii("hello, this is not a pdf")))
        assertEquals(SniffedType.OTHER, sniff(ByteArray(0)))
        assertEquals(SniffedType.OTHER, sniff(b(0x50, 0x4B, 0x03, 0x04) + ascii("plain zip")))
    }

    private fun ftyp(brand: String) = b(0, 0, 0, 0x18) + ascii("ftyp$brand") + ByteArray(12)

    /** Gate 2 minor 13: other HEIF/HEVC brands phones write, and AVIF sequences. */
    @Test fun recognisesAllHeifBrands() {
        for (brand in listOf("heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1", "avif", "avis")) {
            assertEquals(brand, SniffedType.HEIF, sniff(ftyp(brand)))
        }
    }

    /** A .docx whose first ZIP entry is not word/ (e.g. [Content_Types].xml or docProps/) is still Office. */
    @Test fun recognisesOfficeZipByAnyOoxmlOrOdfMarker() {
        val zip = b(0x50, 0x4B, 0x03, 0x04) + ByteArray(26)
        assertEquals(SniffedType.OFFICE, sniff(zip + ascii("[Content_Types].xml")))
        assertEquals(SniffedType.OFFICE, sniff(zip + ascii("docProps/thumbnail.jpeg")))
        assertEquals(SniffedType.OFFICE, sniff(zip + ascii("mimetypeapplication/vnd.oasis.opendocument.text")))
        assertEquals(SniffedType.OTHER, sniff(zip + ascii("photos/IMG_0001.jpg")))
    }

    /** BMP decodes on every Android version, so it is a printable image; TIFF is not decodable. */
    @Test fun bmpIsAnImageAndTiffIsOther() {
        assertEquals(SniffedType.BMP, sniff(ascii("BM") + ByteArray(52)))
        assertEquals(SniffedType.OTHER, sniff(b(0x49, 0x49, 0x2A, 0x00) + ByteArray(8)))
        assertEquals(SniffedType.OTHER, sniff(b(0x4D, 0x4D, 0x00, 0x2A) + ByteArray(8)))
    }

    // Round 9 review C1: an RTF file is a Word file (Print with WPS Office), never a text message of RTF code.
    @Test fun rtfIsAWordFileNotText() {
        val rtf = ascii("{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times;}}Hello}")
        assertEquals(SniffedType.OFFICE, sniff(rtf))
        assertEquals("word", officeHint(rtf))
    }
}
