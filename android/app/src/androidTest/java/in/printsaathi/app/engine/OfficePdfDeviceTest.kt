package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.office.OfficeFixtures
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Phase 45 (owner, round 9): a customer's Word file made into pages by the isolated engine — A4 letters, headings,
 * tables, pictures and Devanagari as Word places them; long files flow over pages and stop at the page limit; parts
 * not drawn still let the text print (missed); hostile files are refused, never crash.
 */
@RunWith(AndroidJUnit4::class)
class OfficePdfDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "office-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)
    private val W = OfficeFixtures.W

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    private val a4 = "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"720\" w:footer=\"720\"/></w:sectPr>"
    private fun p(text: String, rPr: String = "") =
        "<w:p><w:r><w:rPr>$rPr</w:rPr><w:t xml:space=\"preserve\">$text</w:t></w:r></w:p>"

    private fun make(bytes: ByteArray, maxPages: Int = 500): Pair<EngineClient.OfficeResult, File> {
        val src = File(dir, "f.office").apply { writeBytes(bytes) }
        val pdf = File(dir, "f.pdf")
        return client.officeToPdf(src, pdf, maxPages).getOrThrow() to pdf
    }

    /** Page [page] at 2 px per point. */
    private fun render(pdf: File, page: Int = 0): Bitmap =
        PdfRenderer(ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY)).use { r ->
            r.openPage(page).use { p ->
                Bitmap.createBitmap(p.width * 2, p.height * 2, Bitmap.Config.ARGB_8888).also {
                    it.eraseColor(Color.WHITE)
                    p.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                }
            }
        }

    private fun info(pdf: File): IntArray =
        PdfRenderer(ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY)).use { r ->
            r.openPage(0).use { intArrayOf(it.width, it.height, r.pageCount) }
        }

    private fun dark(c: Int) = Color.red(c) < 128 && Color.green(c) < 128 && Color.blue(c) < 128
    private fun ink(b: Bitmap) = (0 until b.height).sumOf { y -> (0 until b.width).count { x -> dark(b.getPixel(x, y)) } }

    /** Bands of rows with dark ink, top to bottom: (first row, last row). */
    private fun bands(b: Bitmap): List<IntRange> {
        val rows = (0 until b.height).filter { y -> (0 until b.width).any { x -> dark(b.getPixel(x, y)) } }
        val out = ArrayList<IntRange>()
        for (y in rows) if (out.isNotEmpty() && out.last().last == y - 1) out[out.size - 1] = out.last().first..y else out += y..y
        return out
    }

    @Test fun aOnePageLetterIsOneA4Page() {
        val (r, pdf) = make(OfficeFixtures.docx((1..6).joinToString("") { p("Line $it of the admission letter.") } + a4))
        assertEquals(1, r.kind)
        assertEquals(1, r.format)
        assertEquals(1, r.pages)
        assertFalse(r.missed)
        val i = info(pdf)
        assertEquals(595, i[0])
        assertEquals(842, i[1])
        assertEquals(1, i[2])
        assertTrue(ink(render(pdf)) > 500)
    }

    @Test fun aHeadingIsTallerThanBodyText() {
        val (_, pdf) = make(
            OfficeFixtures.docx(p("HHHHHH", "<w:b/><w:sz w:val=\"56\"/>") + p("HHHHHH", "<w:sz w:val=\"22\"/>") + a4),
        )
        val b = bands(render(pdf))
        assertEquals(2, b.size)
        val (big, small) = b.map { it.last - it.first + 1 }
        assertTrue("heading $big px, body $small px", big > small * 2)
        // The first line starts at the top margin (72 pt = 144 px).
        assertTrue("heading top ${b[0].first}", b[0].first in 144..220)
    }

    @Test fun tableBordersAreWhereTheGridPutsThem() {
        val tc = "<w:tc>${p("x")}</w:tc>"
        val borders = "<w:tblBorders>" + listOf("top", "left", "bottom", "right", "insideH", "insideV")
            .joinToString("") { "<w:$it w:val=\"single\" w:sz=\"8\"/>" } + "</w:tblBorders>"
        val tbl = "<w:tbl><w:tblPr>$borders</w:tblPr><w:tblGrid><w:gridCol w:w=\"2000\"/><w:gridCol w:w=\"2000\"/></w:tblGrid>" +
            "<w:tr>$tc$tc</w:tr><w:tr>$tc$tc</w:tr></w:tbl>"
        val (r, pdf) = make(OfficeFixtures.docx(tbl + p("") + a4))
        assertEquals(1, r.pages)
        val bmp = render(pdf)
        // Columns at 72, 172 and 272 pt (the grid), 2 px per point; looked for across the first row's middle.
        val y = 144 + 14
        val lines = (0 until bmp.width).filter { x -> dark(bmp.getPixel(x, y)) }
        for (want in listOf(144, 344, 544)) assertTrue("a line near $want px: $lines", lines.any { kotlin.math.abs(it - want) <= 3 })
        // The top border on the top margin.
        assertTrue((140..148).any { yy -> (200..300).all { x -> dark(bmp.getPixel(x, yy)) } })
    }

    @Test fun aPictureLandsAtItsParagraph() {
        val pic = "<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"1270000\" cy=\"635000\"/><wp:docPr id=\"1\" name=\"p\"/>" +
            "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic><pic:blipFill>" +
            "<a:blip r:embed=\"rId5\"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
        val (r, pdf) = make(
            OfficeFixtures.docx(
                p("Above the picture", "<w:sz w:val=\"24\"/>") + pic + a4,
                rels = "<Relationship Id=\"rId5\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image1.png\"/>",
                parts = listOf("word/media/image1.png" to OfficeFixtures.png(40, 20, 0xFF0000)),
            ),
        )
        assertEquals(1, r.pages)
        val bmp = render(pdf)
        val red = ArrayList<Pair<Int, Int>>()
        for (yy in 0 until bmp.height step 2) for (x in 0 until bmp.width step 2) {
            val c = bmp.getPixel(x, yy)
            if (Color.red(c) > 200 && Color.green(c) < 60 && Color.blue(c) < 60) red += x to yy
        }
        val left = red.minOf { it.first }
        val right = red.maxOf { it.first }
        val top = red.minOf { it.second }
        val bottom = red.maxOf { it.second }
        assertTrue("left $left", left in 140..150) // the left margin, 72 pt
        assertTrue("width ${right - left}", (right - left) in 192..204) // 100 pt
        assertTrue("height ${bottom - top}", (bottom - top) in 92..104) // 50 pt
        val textBottom = bands(bmp).first().last
        assertTrue("picture top $top below the text $textBottom", top > textBottom)
    }

    @Test fun devanagariHasInk() {
        val (r, pdf) = make(OfficeFixtures.docx(p("नमस्ते, कृपया यह पत्र पढ़ें।", "<w:sz w:val=\"28\"/>") + a4))
        assertEquals(1, r.pages)
        assertTrue(ink(render(pdf)) > 800)
    }

    @Test fun aLongDocumentFlowsOverPagesAndStopsAt500() {
        val long = OfficeFixtures.docx((1..300).joinToString("") { p("Paragraph $it of a long report, with enough words to fill a line.") } + a4)
        val (r, pdf) = make(long)
        assertTrue("${r.pages} pages", r.pages >= 4)
        assertEquals(r.pages, info(pdf)[2])
        assertTrue(ink(render(pdf, r.pages - 1)) > 100)
        // Past the page limit: not made into pages (it prints from WPS Office).
        assertEquals(0, make(long, maxPages = 2).first.pages)
    }

    @Test fun aDocWithEveryUnsupportedPartStillPrintsItsText() {
        val graphic = { uri: String, inner: String ->
            "<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"2540000\" cy=\"1270000\"/><a:graphic><a:graphicData uri=\"$uri\">$inner</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
        }
        val body = p("Before the chart") +
            graphic("http://schemas.openxmlformats.org/drawingml/2006/chart", "<c:chart r:id=\"rId9\"/>") +
            graphic("http://schemas.openxmlformats.org/drawingml/2006/diagram", "<dgm:relIds r:dm=\"rId10\"/>") +
            "<w:p><w:r><w:pict><v:line from=\"0,0\" to=\"100pt,0\"/></w:pict></w:r></w:p>" + p("After the chart") + a4
        val (r, pdf) = make(OfficeFixtures.docx(body))
        assertEquals(1, r.pages)
        assertTrue(r.missed)
        assertTrue(ink(render(pdf)) > 500)
    }

    @Test fun anEmptyDocumentGivesOneBlankPageNotAFailure() {
        val (r, pdf) = make(OfficeFixtures.docx(""))
        assertEquals(1, r.pages)
        assertEquals(0, ink(render(pdf)))
    }

    @Test fun aHostileDocxIsRefusedNotCrashed() {
        // A zip bomb: 40 MB of one letter packs to a few KB.
        val bomb = OfficeFixtures.zip(
            listOf(
                "[Content_Types].xml" to "<Types/>".toByteArray(),
                "word/document.xml" to ByteArray(40 shl 20) { 'a'.code.toByte() },
            ),
        )
        assertEquals(0, make(bomb).first.pages)
        val doctype = OfficeFixtures.zip(
            listOf(
                "[Content_Types].xml" to "<Types/>".toByteArray(),
                "word/document.xml" to "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY a \"aaaa\">]><w:document $W><w:body>${p("&a;")}</w:body></w:document>".toByteArray(),
            ),
        )
        assertEquals(0, make(doctype).first.pages)
        // The engine still works afterwards.
        assertEquals(1, make(OfficeFixtures.docx(p("still here") + a4)).first.pages)
    }

    // ---- Phase 46: PowerPoint ----

    private val edge = 6f * 72f / 25.4f

    /** Where slide point ([sx], [sy]) of a [slideW] × [slideH] slide lands on the A4 sideways page, in pixels (2 px/pt). */
    private fun onPage(sx: Float, sy: Float, slideW: Float = 720f, slideH: Float = 540f): Pair<Float, Float> {
        val s = minOf((842f - 2 * edge) / slideW, (595f - 2 * edge) / slideH)
        val ox = (842f - slideW * s) / 2
        val oy = (595f - slideH * s) / 2
        return (ox + sx * s) * 2 to (oy + sy * s) * 2
    }

    private fun emu(pt: Int) = pt * 12_700L

    /** The box (left, top, right, bottom px) of pixels matching [pick], looked for every 2 px. */
    private fun boxOf(b: Bitmap, pick: (Int) -> Boolean): IntArray {
        var l = Int.MAX_VALUE
        var t = Int.MAX_VALUE
        var r = -1
        var bt = -1
        for (y in 0 until b.height step 2) for (x in 0 until b.width step 2) if (pick(b.getPixel(x, y))) {
            l = minOf(l, x)
            t = minOf(t, y)
            r = maxOf(r, x)
            bt = maxOf(bt, y)
        }
        return intArrayOf(l, t, r, bt)
    }

    private fun near(got: Int, want: Float, tol: Int = 4) = kotlin.math.abs(got - want) <= tol

    @Test fun oneLandscapePagePerSlide() {
        val s = { t: String -> OfficeFixtures.slide(OfficeFixtures.sp(spPr = OfficeFixtures.xfrm(emu(72), emu(72), emu(400), emu(100)), txBody = "<a:bodyPr/><a:p><a:r><a:t>$t</a:t></a:r></a:p>")) }
        val (r, pdf) = make(OfficeFixtures.deck(listOf(s("One"), s("Two"), s("Three"))))
        assertEquals(2, r.kind)
        assertEquals(3, r.pages)
        assertFalse(r.missed)
        val i = info(pdf)
        assertEquals(842, i[0])
        assertEquals(595, i[1])
        assertEquals(3, i[2])
        for (k in 0 until 3) assertTrue(ink(render(pdf, k)) > 100)
    }

    @Test fun aTextBoxIsDrawnAtItsPlace() {
        val shape = OfficeFixtures.sp(
            spPr = OfficeFixtures.xfrm(emu(100), emu(100), emu(200), emu(50)) + "<a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill>",
            txBody = "<a:bodyPr/><a:p><a:r><a:rPr lang=\"en-US\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill></a:rPr><a:t>Inside</a:t></a:r></a:p>",
        )
        val (r, pdf) = make(OfficeFixtures.deck(listOf(OfficeFixtures.slide(shape))))
        assertEquals(1, r.pages)
        val b = boxOf(render(pdf)) { dark(it) }
        val (x0, y0) = onPage(100f, 100f)
        val (x1, y1) = onPage(300f, 150f)
        assertTrue("box ${b.toList()} vs $x0,$y0 $x1,$y1", near(b[0], x0) && near(b[1], y0) && near(b[2], x1) && near(b[3], y1))
    }

    @Test fun aPictureIsDrawnAtItsPlace() {
        val pic = "<p:pic><p:nvPicPr><p:cNvPr id=\"4\" name=\"p\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed=\"rIdP\"/>" +
            "<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${OfficeFixtures.xfrm(emu(400), emu(200), emu(150), emu(100))}<a:prstGeom prst=\"rect\"/></p:spPr></p:pic>"
        val (r, pdf) = make(
            OfficeFixtures.deck(
                listOf(OfficeFixtures.slide(pic)),
                slideRels = listOf(listOf(Triple("rIdP", "image", "../media/image1.png"))),
                media = listOf("media/image1.png" to OfficeFixtures.png(30, 20, 0xFF0000)),
            ),
        )
        assertEquals(1, r.pages)
        val b = boxOf(render(pdf)) { Color.red(it) > 200 && Color.green(it) < 60 && Color.blue(it) < 60 }
        val (x0, y0) = onPage(400f, 200f)
        val (x1, y1) = onPage(550f, 300f)
        assertTrue("picture ${b.toList()} vs $x0,$y0 $x1,$y1", near(b[0], x0) && near(b[1], y0) && near(b[2], x1) && near(b[3], y1))
    }

    @Test fun theBackgroundColourFillsTheSlide() {
        val (r, pdf) = make(OfficeFixtures.deck(listOf(OfficeFixtures.slide("", OfficeFixtures.bg("00A000")))))
        assertEquals(1, r.pages)
        val bmp = render(pdf)
        val green = { c: Int -> Color.green(c) > 140 && Color.red(c) < 40 && Color.blue(c) < 40 }
        val b = boxOf(bmp, green)
        val (x0, y0) = onPage(0f, 0f)
        val (x1, y1) = onPage(720f, 540f)
        assertTrue("background ${b.toList()} vs $x0,$y0 $x1,$y1", near(b[0], x0) && near(b[1], y0) && near(b[2], x1) && near(b[3], y1))
        // Outside the slide the paper stays white.
        assertEquals(Color.WHITE, bmp.getPixel(4, 4))
    }

    // ---- Phase 47: Excel ----

    /** A one-sheet workbook whose sheetData is [rows] (cells with typed-in text or numbers). */
    private fun workbook(rows: String): ByteArray {
        val rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        return OfficeFixtures.xlsx(
            listOf(
                "xl/workbook.xml" to "<?xml version=\"1.0\"?><workbook ${OfficeFixtures.S}><sheets><sheet name=\"Fees\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
                "xl/_rels/workbook.xml.rels" to "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                    "<Relationship Id=\"rId1\" Type=\"$rel/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>",
                "xl/worksheets/sheet1.xml" to "<?xml version=\"1.0\"?><worksheet ${OfficeFixtures.S}><sheetData>$rows</sheetData></worksheet>",
            ),
        )
    }

    private fun words(r: Int, vararg t: String) =
        "<row r=\"$r\">" + t.mapIndexed { i, s -> "<c r=\"${'A' + i}$r\" t=\"inlineStr\"><is><t>$s</t></is></c>" }.joinToString("") + "</row>"

    @Test fun aSheetOf200RowsFillsSeveralPagesWithTheHeaderRepeated() {
        val rows = words(1, "NAME", "CLASS", "FEE") + (2..200).joinToString("") { r ->
            "<row r=\"$r\"><c r=\"A$r\" t=\"inlineStr\"><is><t>Pupil $r</t></is></c><c r=\"B$r\"><v>${r % 12}</v></c><c r=\"C$r\"><v>${1000 + r}</v></c></row>"
        }
        val (r, pdf) = make(workbook(rows))
        assertEquals(3, r.kind)
        assertTrue("${r.pages} pages", r.pages >= 3)
        val i = info(pdf)
        assertEquals(595, i[0])
        assertEquals(842, i[1])
        // The header row (its text) at the top of every page: 17 pt edge, a 15 pt row → 34..64 px.
        for (k in 0 until r.pages) {
            val b = render(pdf, k)
            val top = (36..62).sumOf { y -> (36..200).count { x -> dark(b.getPixel(x, y)) } }
            assertTrue("page ${k + 1} header ink $top", top > 30)
        }
    }

    @Test fun gridLinesAreDrawn() {
        val (r, pdf) = make(workbook(words(1, "a", "b", "c") + words(2, "d", "e", "f") + words(3, "g", "h", "i")))
        assertEquals(1, r.pages)
        val b = render(pdf)
        val line = { c: Int -> Color.red(c) < 235 }
        // Columns of 48 pt from the 17 pt edge: lines at 17, 65, 113 and 161 pt (2 px per point), in the middle row.
        val y = (17 + 15 + 7) * 2
        val xs = (0 until 400).filter { x -> line(b.getPixel(x, y)) && !dark(b.getPixel(x, y)) }
        for (want in listOf(34, 130, 226, 322)) assertTrue("a grid line near $want px: $xs", xs.any { kotlin.math.abs(it - want) <= 3 })
        // Row lines at 17, 32, 47 and 62 pt, at the first column's middle.
        val ys = (0 until 200).filter { yy -> line(b.getPixel(80, yy)) && !dark(b.getPixel(80, yy)) }
        for (want in listOf(34, 64, 94, 124)) assertTrue("a row line near $want px: $ys", ys.any { kotlin.math.abs(it - want) <= 3 })
    }

    // ---- Round 9 review fixes ----

    /** A phone photo's size and look: 3000 × 4000 with smooth colour and detail, as JPEG. */
    private fun phonePhoto(seed: Int): ByteArray {
        val bmp = Bitmap.createBitmap(3000, 4000, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        c.drawColor(Color.rgb(90 + seed * 7 % 120, 140, 200 - seed * 5 % 100))
        val p = android.graphics.Paint().apply { color = Color.rgb(250, 230, 200) }
        val r = java.util.Random(seed.toLong())
        repeat(400) { c.drawCircle(r.nextFloat() * 3000, r.nextFloat() * 4000, 20f + r.nextFloat() * 120, p.apply { color = Color.rgb(r.nextInt(256), r.nextInt(256), r.nextInt(256)) }) }
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 88, out)
        bmp.recycle()
        return out.toByteArray()
    }

    @Test fun aWordFileWithTwentyPhonePhotosIsMadeInTime() {
        val n = 20
        val body = (1..n).joinToString("") { k ->
            "<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"5486400\" cy=\"7315200\"/><wp:docPr id=\"$k\" name=\"p\"/>" +
                "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic><pic:blipFill>" +
                "<a:blip r:embed=\"rId$k\"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
        }
        val rels = (1..n).joinToString("") { "<Relationship Id=\"rId$it\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/p$it.jpg\"/>" }
        val bytes = OfficeFixtures.docx(body + a4, rels = rels, parts = (1..n).map { "word/media/p$it.jpg" to phonePhoto(it) })
        val t0 = System.currentTimeMillis()
        val (r, pdf) = make(bytes)
        val ms = System.currentTimeMillis() - t0
        android.util.Log.i("OfficePdfDeviceTest", "20 photos: ${r.pages} pages in $ms ms, ${bytes.size / 1024} KB in, ${pdf.length() / 1024} KB out")
        assertEquals(1, r.kind)
        assertEquals(n, r.pages)
        assertTrue("$ms ms", ms < 45_000)
        // Pictures kept at 300 dpi of their printed size, no more (each 6 × 8 inch photo is 1800 × 2400 pixels).
        assertTrue("${pdf.length() / 1024} KB", pdf.length() < 60L * 1024 * 1024)
    }

    @Test fun aSlideWithBrokenNumbersStillPrintsAsPowerPoint() {
        val bad = OfficeFixtures.sp(spPr = "<a:xfrm><a:off x=\"NaN\" y=\"1e999\"/><a:ext cx=\"1270000\" cy=\"Infinity\"/></a:xfrm><a:solidFill><a:srgbClr val=\"FF0000\"/></a:solidFill>")
        val (r, _) = make(OfficeFixtures.deck(listOf(OfficeFixtures.slide(bad))))
        assertEquals(2, r.kind)
        assertEquals(1, r.pages)
    }

    @Test fun aNumberTooWideForItsCellShowsHashesAndSaysSo() {
        val (r, _) = make(workbook("<row r=\"1\"><c r=\"A1\"><v>123456789012345</v></c><c r=\"B1\" t=\"inlineStr\"><is><t>ok</t></is></c></row>"))
        assertEquals(1, r.pages)
        assertTrue(r.missed)
        assertFalse(make(workbook(words(1, "a", "b"))).first.missed)
    }

    @Test fun aLandscapeSectionGivesALandscapePage() {
        val side = "<w:sectPr><w:pgSz w:w=\"16838\" w:h=\"11906\" w:orient=\"landscape\"/><w:pgMar w:top=\"720\" w:right=\"720\" w:bottom=\"720\" w:left=\"720\"/></w:sectPr>"
        val (r, pdf) = make(OfficeFixtures.docx(p("A sideways notice") + side))
        assertEquals(1, r.pages)
        val i = info(pdf)
        assertEquals(842, i[0])
        assertEquals(595, i[1])
    }
}
