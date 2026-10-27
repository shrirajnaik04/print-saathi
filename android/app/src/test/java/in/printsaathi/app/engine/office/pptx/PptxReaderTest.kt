package `in`.printsaathi.app.engine.office.pptx

import `in`.printsaathi.app.engine.office.OfficeFixtures
import `in`.printsaathi.app.engine.office.OfficeFixtures.bg
import `in`.printsaathi.app.engine.office.OfficeFixtures.deck
import `in`.printsaathi.app.engine.office.OfficeFixtures.layout
import `in`.printsaathi.app.engine.office.OfficeFixtures.slide
import `in`.printsaathi.app.engine.office.OfficeFixtures.sp
import `in`.printsaathi.app.engine.office.OfficeFixtures.xfrm
import `in`.printsaathi.app.engine.office.SafeZip
import `in`.printsaathi.app.engine.office.docx.DText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

/**
 * Phase 46 (owner, round 9: "also what about .pptx files"): a customer's PowerPoint file read slide by slide — the
 * slide size, shapes at their place (placeholders take theirs from the layout, then the master), text in the master's
 * styles, theme colours, backgrounds, groups, autofit, gradients (their first colour), simple tables; charts and
 * diagrams become marked boxes (missed); hidden slides are left out.
 */
class PptxReaderTest {
    private fun read(bytes: ByteArray) = PptxReader.read(SafeZip.read(ByteArrayInputStream(bytes), { true }).parts)
    private fun t(text: String, pPr: String = "", rPr: String = "<a:rPr lang=\"en-US\"/>") = "<a:p>$pPr<a:r>$rPr<a:t>$text</a:t></a:r></a:p>"
    private fun body(vararg paras: String, bodyPr: String = "<a:bodyPr/>") = bodyPr + "<a:lstStyle/>" + paras.joinToString("")
    private fun PText.text() = paras.joinToString("|") { p -> p.runs.filterIsInstance<DText>().joinToString("") { it.text } }
    private fun PptxDeck.texts(i: Int = 0) = slides[i].shapes.filterIsInstance<PText>()
    private fun fill(hex: String) = "<a:solidFill><a:srgbClr val=\"$hex\"/></a:solidFill>"
    private fun frame(uri: String, inner: String) =
        "<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id=\"7\" name=\"f\"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>" +
            "<p:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"2540000\" cy=\"1270000\"/></p:xfrm><a:graphic><a:graphicData uri=\"$uri\">$inner</a:graphicData></a:graphic></p:graphicFrame>"

    @Test fun slideSizeFromPresentation() {
        val d = read(deck(listOf(slide("")), size = 12_192_000L to 6_858_000L))
        assertEquals(960f, d.slideW, 0.01f)
        assertEquals(540f, d.slideH, 0.01f)
        assertEquals(1, d.slides.size)
    }

    @Test fun placeholderInheritsPlaceFromLayoutThenMaster() {
        val master = sp("<p:ph type=\"title\"/>", xfrm(457_200, 274_638, 8_229_600, 1_143_000), id = 2) +
            sp("<p:ph type=\"body\" idx=\"1\"/>", xfrm(457_200, 1_600_200, 8_229_600, 4_525_963), id = 3)
        val lay = layout(sp("<p:ph type=\"title\"/>", id = 2) + sp("<p:ph idx=\"1\"/>", xfrm(1_270_000, 2_540_000, 3_810_000, 1_270_000), id = 3))
        val d = read(
            deck(
                listOf(slide(sp("<p:ph type=\"title\"/>", txBody = body(t("Hello")), id = 2) + sp("<p:ph idx=\"1\"/>", txBody = body(t("Point")), id = 3))),
                layouts = listOf(lay),
                masterShapes = master,
            ),
        )
        val (title, point) = d.texts()
        assertEquals("Hello", title.text())
        assertEquals(36f, title.x, 0.01f)
        assertEquals(21.625f, title.y, 0.01f)
        assertEquals(648f, title.w, 0.01f)
        assertEquals("Point", point.text())
        assertEquals(100f, point.x, 0.01f)
        assertEquals(200f, point.y, 0.01f)
        assertEquals(300f, point.w, 0.01f)
    }

    @Test fun textStylesComeFromTheMasterLevels() {
        val styles = "<p:titleStyle><a:lvl1pPr algn=\"ctr\"><a:defRPr sz=\"4400\" b=\"1\"/></a:lvl1pPr></p:titleStyle>" +
            "<p:bodyStyle><a:lvl1pPr marL=\"228600\" indent=\"-228600\"><a:buChar char=\"•\"/><a:defRPr sz=\"2800\"/></a:lvl1pPr>" +
            "<a:lvl2pPr marL=\"742950\" indent=\"-285750\"><a:buChar char=\"–\"/><a:defRPr sz=\"2400\"/></a:lvl2pPr></p:bodyStyle>"
        val master = sp("<p:ph type=\"title\"/>", xfrm(0, 0, 9_144_000, 1_000_000), id = 2) +
            sp("<p:ph type=\"body\" idx=\"1\"/>", xfrm(0, 1_000_000, 9_144_000, 5_000_000), id = 3)
        val d = read(
            deck(
                listOf(
                    slide(
                        sp("<p:ph type=\"title\"/>", txBody = body(t("T")), id = 2) +
                            sp("<p:ph idx=\"1\"/>", txBody = body(t("one"), t("two", "<a:pPr lvl=\"1\"/>")), id = 3),
                    ),
                ),
                masterShapes = master,
                txStyles = styles,
            ),
        )
        val (title, bodyShape) = d.texts()
        val tr = title.paras[0].runs[0] as DText
        assertEquals(44f, tr.sizePt)
        assertTrue(tr.bold)
        assertEquals(`in`.printsaathi.app.engine.office.docx.Align.CENTER, title.paras[0].align)
        val (one, two) = bodyShape.paras
        assertEquals(28f, (one.runs[0] as DText).sizePt)
        assertEquals("•", one.label)
        assertEquals(18f, one.indentLeft, 0.01f)
        assertEquals(-18f, one.indentFirst, 0.01f)
        assertEquals(24f, (two.runs[0] as DText).sizePt)
        assertEquals("–", two.label)
        assertEquals(58.5f, two.indentLeft, 0.01f)
    }

    @Test fun schemeColoursResolveThroughTheTheme() {
        val run = "<a:rPr lang=\"en-US\"><a:solidFill><a:schemeClr val=\"tx1\"><a:lumMod val=\"75000\"/><a:lumOff val=\"25000\"/></a:schemeClr></a:solidFill></a:rPr>"
        val d = read(
            deck(
                listOf(
                    slide(
                        sp(spPr = xfrm(0, 0, 1_270_000, 1_270_000) + "<a:solidFill><a:schemeClr val=\"accent1\"/></a:solidFill>", txBody = body(t("x", rPr = run)), id = 2) +
                            sp(spPr = xfrm(0, 0, 1_270_000, 1_270_000) + "<a:solidFill><a:schemeClr val=\"bg1\"/></a:solidFill>", id = 3),
                    ),
                ),
            ),
        )
        val (a, b) = d.texts()
        assertEquals(0xFF4472C4.toInt(), a.fill)
        assertEquals(0xFF404040.toInt(), (a.paras[0].runs[0] as DText).color)
        assertEquals(0xFFFFFFFF.toInt(), b.fill)
    }

    @Test fun backgroundFallsBackSlideLayoutMaster() {
        val d = read(
            deck(
                listOf(slide(""), slide("", bg("00FF00")), slide("")),
                layouts = listOf(layout(), layout(bg = bg("0000FF"))),
                uses = listOf(0, 0, 1),
                masterBg = bg("FF0000"),
            ),
        )
        assertEquals(listOf(0xFFFF0000.toInt(), 0xFF00FF00.toInt(), 0xFF0000FF.toInt()), d.slides.map { it.bg })
    }

    @Test fun groupTransformsMapChildrenIntoPlace() {
        val grp = "<p:grpSp><p:nvGrpSpPr><p:cNvPr id=\"5\" name=\"g\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>" +
            "<a:off x=\"1270000\" y=\"1270000\"/><a:ext cx=\"2540000\" cy=\"2540000\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"1270000\" cy=\"1270000\"/></a:xfrm></p:grpSpPr>" +
            sp(spPr = xfrm(635_000, 635_000, 635_000, 635_000) + fill("FF0000"), id = 6) + "</p:grpSp>"
        val s = read(deck(listOf(slide(grp)))).texts().single()
        assertEquals(200f, s.x, 0.01f)
        assertEquals(200f, s.y, 0.01f)
        assertEquals(100f, s.w, 0.01f)
        assertEquals(100f, s.h, 0.01f)
        assertEquals(0xFFFF0000.toInt(), s.fill)
    }

    @Test fun normAutofitScalesFonts() {
        val s = read(
            deck(listOf(slide(sp(spPr = xfrm(0, 0, 1_270_000, 1_270_000), txBody = body(t("long"), bodyPr = "<a:bodyPr><a:normAutofit fontScale=\"62500\" lnSpcReduction=\"20000\"/></a:bodyPr>"))))),
        ).texts().single()
        assertEquals(0.625f, s.fontScale, 0.001f)
    }

    @Test fun gradientsUseTheirFirstStop() {
        val grad = "<a:gradFill><a:gsLst><a:gs pos=\"0\"><a:srgbClr val=\"112233\"/></a:gs><a:gs pos=\"100000\"><a:srgbClr val=\"445566\"/></a:gs></a:gsLst></a:gradFill>"
        val s = read(deck(listOf(slide(sp(spPr = xfrm(0, 0, 1_270_000, 1_270_000) + grad))))).texts().single()
        assertEquals(0xFF112233.toInt(), s.fill)
    }

    @Test fun chartsAndSmartArtArePlaceholdersAndSetMissed() {
        val d = read(
            deck(
                listOf(
                    slide(
                        frame("http://schemas.openxmlformats.org/drawingml/2006/chart", "<c:chart r:id=\"rId9\"/>") +
                            frame("http://schemas.openxmlformats.org/drawingml/2006/diagram", "<dgm:relIds r:dm=\"rId10\"/>"),
                    ),
                ),
            ),
        )
        val boxes = d.slides[0].shapes.filterIsInstance<PPlaceholderBox>()
        assertEquals(listOf("Chart", "Diagram"), boxes.map { it.label })
        assertEquals(200f, boxes[0].w, 0.01f)
        assertEquals(100f, boxes[0].h, 0.01f)
        assertTrue(d.missed)
        assertFalse(read(deck(listOf(slide(sp(spPr = xfrm(0, 0, 1, 1), txBody = body(t("plain"))))))).missed)
    }

    @Test fun slidesInPresentationOrderAndHiddenSlidesSkipped() {
        val s = { x: String, show: Boolean -> slide(sp(spPr = xfrm(0, 0, 1_270_000, 1_270_000), txBody = body(t(x))), show = show) }
        val d = read(deck(listOf(s("A", true), s("B", true), s("C", false)), order = listOf(1, 0, 2)))
        assertEquals(listOf("B", "A"), d.slides.map { it.shapes.filterIsInstance<PText>().single().text() })
    }

    // ---- Round 9 review fixes ----

    @Test fun mergedTableCellsKeepTheGrid() {
        val tc = { x: String, attrs: String -> "<a:tc$attrs><a:txBody><a:bodyPr/><a:lstStyle/>${t(x)}</a:txBody><a:tcPr/></a:tc>" }
        val tbl = "<a:tbl><a:tblGrid>" + "<a:gridCol w=\"1270000\"/>".repeat(3) + "</a:tblGrid>" +
            "<a:tr h=\"370840\">${tc("AB", " gridSpan=\"2\"")}${tc("", " hMerge=\"1\"")}${tc("C", "")}</a:tr>" +
            "<a:tr h=\"370840\">${tc("tall", " rowSpan=\"2\"")}${tc("B2", "")}${tc("C2", "")}</a:tr>" +
            "<a:tr h=\"370840\">${tc("", " vMerge=\"1\"")}${tc("B3", "")}${tc("C3", "")}</a:tr></a:tbl>"
        val table = read(deck(listOf(slide(frame("http://schemas.openxmlformats.org/drawingml/2006/table", tbl))))).slides[0].shapes.single() as PTable
        val boxes = table.boxes().map { b -> listOf(b.row, b.col0, b.col1, b.lastRow) to (b.cell.paras.firstOrNull()?.runs?.firstOrNull() as? DText)?.text }
        assertEquals(
            listOf(
                listOf(0, 0, 2, 0) to "AB", listOf(0, 2, 3, 0) to "C",
                listOf(1, 0, 1, 2) to "tall", listOf(1, 1, 2, 1) to "B2", listOf(1, 2, 3, 1) to "C2",
                listOf(2, 1, 2, 2) to "B3", listOf(2, 2, 3, 2) to "C3",
            ),
            boxes,
        )
    }

    @Test fun aBrokenNumberIsZeroNotNaN() {
        val s = read(deck(listOf(slide(sp(spPr = "<a:xfrm><a:off x=\"NaN\" y=\"1e999\"/><a:ext cx=\"1270000\" cy=\"Infinity\"/></a:xfrm>" + fill("FF0000")))))).texts().single()
        assertTrue(listOf(s.x, s.y, s.w, s.h).all { it.isFinite() })
    }

    @Test fun aPlaceholderWithNoPlaceSetsMissed() {
        val d = read(deck(listOf(slide(sp("<p:ph type=\"body\" idx=\"5\"/>", txBody = body(t("lost")))))))
        assertTrue(d.missed)
    }

    @Test fun oldHindiFontsAreNotMadeIntoPages() {
        val run = "<a:rPr lang=\"hi-IN\"><a:latin typeface=\"Kruti Dev 010\"/></a:rPr>"
        assertTrue(read(deck(listOf(slide(sp(spPr = xfrm(0, 0, 1_270_000, 1_270_000), txBody = body(t("vkidk", rPr = run))))))).legacyFont)
    }

    @Test fun simpleTablesKeepTheirGridAndText() {
        val cell = { x: String, extra: String -> "<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${t(x)}</a:txBody><a:tcPr>$extra</a:tcPr></a:tc>" }
        val tbl = "<a:tbl><a:tblPr/><a:tblGrid><a:gridCol w=\"1270000\"/><a:gridCol w=\"1270000\"/></a:tblGrid>" +
            "<a:tr h=\"370840\">${cell("A", fill("FFFF00"))}${cell("B", "")}</a:tr><a:tr h=\"370840\">${cell("C", "")}${cell("D", "")}</a:tr></a:tbl>"
        val t = read(deck(listOf(slide(frame("http://schemas.openxmlformats.org/drawingml/2006/table", tbl))))).slides[0].shapes.single() as PTable
        assertEquals(listOf(100f, 100f), t.colWidths)
        assertEquals(2, t.rows.size)
        assertEquals("A", (t.rows[0][0].paras[0].runs[0] as DText).text)
        assertEquals(0xFFFFFF00.toInt(), t.rows[0][0].fill)
        assertEquals("D", (t.rows[1][1].paras[0].runs[0] as DText).text)
    }
}
