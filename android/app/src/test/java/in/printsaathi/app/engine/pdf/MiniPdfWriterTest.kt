package `in`.printsaathi.app.engine.pdf

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream

class MiniPdfWriterTest {
    private val jpeg = javaClass.getResource("/2x2.jpg")!!.readBytes()
    private val a4w = 595.2756
    private val a4h = 841.8898

    private fun onePage(): ByteArray {
        val out = ByteArrayOutputStream()
        MiniPdfWriter(out).apply {
            addPage(a4w, a4h, listOf(PlacedImage(jpeg, ImageKind.JPEG_RGB, 2, 2, RectD(10.0, 20.0, 100.0, 100.0))))
            finish()
        }
        return out.toByteArray()
    }

    @Test fun hasPdfHeaderAndTrailer() {
        val s = String(onePage(), Charsets.ISO_8859_1)
        assertTrue(s.startsWith("%PDF-1.4\n"))
        assertTrue(s.endsWith("%%EOF\n"))
    }

    @Test fun xrefOffsetsPointAtTheirObjects() {
        val bytes = onePage()
        val s = String(bytes, Charsets.ISO_8859_1)
        val startxref = Regex("""startxref\n(\d+)\n""").find(s)!!.groupValues[1].toInt()
        assertTrue(s.startsWith("xref", startxref))
        val entries = Regex("""(\d{10}) 00000 n """).findAll(s.substring(startxref)).map { it.groupValues[1].toInt() }.toList()
        assertTrue(entries.isNotEmpty())
        entries.forEachIndexed { i, off -> assertTrue("object ${i + 1} at $off", s.startsWith("${i + 1} 0 obj", off)) }
    }

    @Test fun mediaBoxIsExactA4InPoints() {
        assertTrue(String(onePage(), Charsets.ISO_8859_1).contains("/MediaBox [0 0 595.2756 841.8898]"))
    }

    @Test fun sameInputGivesByteIdenticalOutput() {
        assertArrayEquals(onePage(), onePage())
    }

    @Test fun placementUsesTopLeftOriginConvertedToPdfSpace() {
        // Box at top-left (10, 20) size 100x100 => PDF y = 841.8898 - 20 - 100 = 721.8898.
        assertTrue(String(onePage(), Charsets.ISO_8859_1).contains("100.0000 0 0 100.0000 10.0000 721.8898 cm"))
    }

    /**
     * A photo drawn with [q] quarter turns anticlockwise inside its box (box already in the turned shape). Box at
     * top-left (10, 20), 100 x 200 on A4: PDF bottom y = 841.8898 - 20 - 200 = 621.8898.
     */
    private fun matrixFor(q: Int): String {
        val out = ByteArrayOutputStream()
        MiniPdfWriter(out).apply {
            addPage(a4w, a4h, listOf(PlacedImage(PdfImage("k", ImageKind.JPEG_RGB, 2, 2) { jpeg }, RectD(10.0, 20.0, 100.0, 200.0), q)))
            finish()
        }
        return Regex("""q (.*) cm /Im""").find(String(out.toByteArray(), Charsets.ISO_8859_1))!!.groupValues[1]
    }

    @Test fun eachQuarterTurnMapsThePhotoOntoItsBoxTheRightWayRound() {
        assertEquals("100.0000 0 0 200.0000 10.0000 621.8898", matrixFor(0))
        // Anticlockwise: the photo's top along the box's left edge (sideways page on a portrait sheet).
        assertEquals("0 200.0000 -100.0000 0 110.0000 621.8898", matrixFor(1))
        // Upside down.
        assertEquals("-100.0000 0 0 -200.0000 110.0000 821.8898", matrixFor(2))
        // Clockwise: the photo's top along the box's right edge.
        assertEquals("0 -200.0000 100.0000 0 10.0000 821.8898", matrixFor(3))
    }

    @Test fun keyedImageIsLoadedAndWrittenOnceAcrossCopies() {
        // Collated copies reference the image already written; its bytes are read once and never kept for later.
        var loads = 0
        val img = PdfImage("photo-1", ImageKind.JPEG_RGB, 2, 2) { loads++; jpeg.copyOf() }
        val out = ByteArrayOutputStream()
        MiniPdfWriter(out).apply {
            repeat(3) { addPage(a4w, a4h, listOf(PlacedImage(img, RectD(0.0, 0.0, 50.0, 50.0)))) }
            finish()
        }
        val s = String(out.toByteArray(), Charsets.ISO_8859_1)
        assertEquals(1, loads)
        assertEquals(1, Regex("""/Subtype /Image""").findAll(s).count())
        assertEquals(3, Regex("""/Type /Page\b""").findAll(s).count())
    }

    @Test fun greyImagesUseDeviceGrayFlate() {
        val out = ByteArrayOutputStream()
        val grey = ByteArray(4) { (it * 60).toByte() }
        MiniPdfWriter(out).apply {
            addPage(a4w, a4h, listOf(PlacedImage(grey, ImageKind.GREY8_RAW, 2, 2, RectD(0.0, 0.0, 50.0, 50.0))))
            finish()
        }
        val s = String(out.toByteArray(), Charsets.ISO_8859_1)
        assertTrue(s.contains("/ColorSpace /DeviceGray"))
        assertTrue(s.contains("/Filter /FlateDecode"))
        assertEquals(1, Regex("""/Type /Page\b""").findAll(s).count())
    }

    /** Phase 8 OCV Black: 1-bit rows (0 = black, padded to bytes) as DeviceGray, 1 bit a pixel, Flate. */
    @Test fun oneBitImagesAreDeviceGrayOneBitFlate() {
        val out = ByteArrayOutputStream()
        val rows = byteArrayOf(0b10100000.toByte(), 0b01011111) // 3 px wide, 2 rows
        MiniPdfWriter(out).apply {
            addPage(a4w, a4h, listOf(PlacedImage(rows, ImageKind.GREY1_RAW, 3, 2, RectD(0.0, 0.0, 50.0, 50.0))))
            finish()
        }
        val s = String(out.toByteArray(), Charsets.ISO_8859_1)
        assertTrue(s.contains("/Width 3 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode"))
        val nl = "\n"
        val start = s.indexOf("stream$nl", s.indexOf("/BitsPerComponent 1")) + "stream$nl".length
        val end = s.indexOf("${nl}endstream", start)
        val inflated = java.util.zip.Inflater().run {
            setInput(out.toByteArray(), start, end - start)
            ByteArray(16).let { b -> b.copyOf(inflate(b)) }
        }
        assertArrayEquals(rows, inflated)
    }

    /** Writes a sample for independent validation by pdf.js (scripts/validate-pdf.mjs). */
    @Test fun writesSampleForIndependentValidation() {
        val file = java.io.File("build/test-pdfs/sample.pdf").apply { parentFile.mkdirs() }
        val shared = PlacedImage(jpeg, ImageKind.JPEG_RGB, 2, 2, RectD(36.0, 36.0, 200.0, 150.0))
        val grey = PlacedImage(ByteArray(64 * 64) { (it % 256).toByte() }, ImageKind.GREY8_RAW, 64, 64, RectD(300.0, 36.0, 100.0, 100.0))
        file.outputStream().use { fos ->
            MiniPdfWriter(fos).apply {
                addPage(a4w, a4h, listOf(shared, grey), listOf(StrokeRect(RectD(36.0, 300.0, 141.7323, 141.7323))))
                addPage(288.0, 432.0, listOf(PlacedImage(jpeg, ImageKind.JPEG_RGB, 2, 2, RectD(10.0, 10.0, 99.2126, 127.5591))))
                addPage(a4w, a4h, listOf(shared)) // a "copy" reusing the same image object
                finish()
            }
        }
        val s = String(file.readBytes(), Charsets.ISO_8859_1)
        assertEquals("JPEG written once despite 3 placements, plus 1 grey image", 2, Regex("""/Subtype /Image""").findAll(s).count())
    }

    @Test fun cutLinesAreThinLightGreyLinesInPdfCoordinates() {
        val out = ByteArrayOutputStream()
        MiniPdfWriter(out).apply {
            addPage(283.464, 425.232, emptyList(), lines = listOf(LineD(100.0, 20.0, 100.0, 400.0)))
            finish()
        }
        val s = String(out.toByteArray(), Charsets.ISO_8859_1)
        // Top-left origin (100, 20) is PDF (100, 425.232 - 20).
        assertTrue(s, s.contains("q 0.3 w 0.6 G 100.0000 405.2320 m 100.0000 25.2320 l S Q"))
    }
}

