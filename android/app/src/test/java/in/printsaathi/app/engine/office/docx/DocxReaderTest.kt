package `in`.printsaathi.app.engine.office.docx

import `in`.printsaathi.app.engine.office.OfficeFixtures
import `in`.printsaathi.app.engine.office.SafeZip
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

/**
 * Phase 45 (owner, round 9: "when doc file is shared … we get this error"): a customer's Word file read into pages'
 * worth of paragraphs, tables and pictures — styles, lists, sections, breaks, fields, tracked changes, headers and
 * footers, footnotes and text boxes as the spec lists them; charts and diagrams become marked boxes (missed).
 */
class DocxReaderTest {
    private val W = OfficeFixtures.W
    private fun read(
        body: String,
        styles: String? = null,
        numbering: String? = null,
        rels: String = "",
        parts: List<Pair<String, ByteArray>> = emptyList(),
    ): DocxDoc = DocxReader.read(
        SafeZip.read(ByteArrayInputStream(OfficeFixtures.docx(body, styles, numbering, rels, parts)), { true }).parts,
    )

    private fun p(text: String, pPr: String = "", rPr: String = "") =
        "<w:p><w:pPr>$pPr</w:pPr><w:r><w:rPr>$rPr</w:rPr><w:t xml:space=\"preserve\">$text</w:t></w:r></w:p>"
    private fun DBlock.text() = (this as DPara).runs.filterIsInstance<DText>().joinToString("") { it.text }
    private fun DocxDoc.blocks() = sections.flatMap { it.blocks }
    private fun DocxDoc.para(i: Int) = blocks()[i] as DPara
    private fun DocxDoc.run(i: Int, r: Int = 0) = para(i).runs[r] as DText
    private fun rel(id: String, type: String, target: String) =
        "<Relationship Id=\"$id\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/$type\" Target=\"$target\"/>"
    private fun xml(root: String, inner: String) = "<?xml version=\"1.0\"?><$root $W>$inner</$root>".toByteArray()

    @Test fun stylesInheritBasedOnAndDocDefaults() {
        val styles = "<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val=\"22\"/></w:rPr></w:rPrDefault></w:docDefaults>" +
            "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style>" +
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:basedOn w:val=\"Normal\"/>" +
            "<w:pPr><w:spacing w:before=\"240\"/></w:pPr><w:rPr><w:b/><w:sz w:val=\"48\"/></w:rPr></w:style>" +
            "<w:style w:type=\"paragraph\" w:styleId=\"Heading2\"><w:basedOn w:val=\"Heading1\"/><w:rPr><w:sz w:val=\"32\"/></w:rPr></w:style>"
        val doc = read(
            p("Title", "<w:pStyle w:val=\"Heading1\"/>") + p("Sub", "<w:pStyle w:val=\"Heading2\"/>") + p("Body"),
            styles,
        )
        assertEquals(24f, doc.run(0).sizePt)
        assertTrue(doc.run(0).bold)
        assertEquals(12f, doc.para(0).spaceBefore)
        assertEquals(16f, doc.run(1).sizePt)
        assertTrue(doc.run(1).bold)
        assertEquals(12f, doc.para(1).spaceBefore)
        assertEquals(11f, doc.run(2).sizePt)
        assertFalse(doc.run(2).bold)
    }

    @Test fun directRunPropsWinOverStyles() {
        val styles = "<w:style w:type=\"character\" w:styleId=\"Strong\"><w:rPr><w:b/></w:rPr></w:style>"
        val direct = "<w:rStyle w:val=\"Strong\"/><w:b w:val=\"0\"/><w:i/><w:sz w:val=\"30\"/><w:color w:val=\"FF0000\"/>" +
            "<w:u w:val=\"single\"/><w:strike/><w:highlight w:val=\"yellow\"/><w:vertAlign w:val=\"superscript\"/>" +
            "<w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\"/>"
        val doc = read(p("x", rPr = direct) + p("y", rPr = "<w:rStyle w:val=\"Strong\"/>"), styles)
        val x = doc.run(0)
        assertFalse(x.bold)
        assertTrue(x.italic && x.underline && x.strike)
        assertEquals(15f, x.sizePt)
        assertEquals(0xFFFF0000.toInt(), x.color)
        assertEquals(0xFFFFFF00.toInt(), x.highlight)
        assertEquals(Family.MONO, x.family)
        assertEquals(SuperSub.SUPER, x.superSub)
        assertTrue(doc.run(1).bold)
    }

    @Test fun numberedAndBulletedLists() {
        val lvl = { i: Int, fmt: String, t: String ->
            "<w:lvl w:ilvl=\"$i\"><w:start w:val=\"1\"/><w:numFmt w:val=\"$fmt\"/><w:lvlText w:val=\"$t\"/>" +
                "<w:pPr><w:ind w:left=\"${720 * (i + 1)}\" w:hanging=\"360\"/></w:pPr></w:lvl>"
        }
        val numbering = "<w:abstractNum w:abstractNumId=\"0\">${lvl(0, "decimal", "%1.")}${lvl(1, "lowerLetter", "%2.")}</w:abstractNum>" +
            "<w:abstractNum w:abstractNumId=\"1\">${lvl(0, "bullet", "")}</w:abstractNum>" +
            "<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num><w:num w:numId=\"2\"><w:abstractNumId w:val=\"1\"/></w:num>" +
            "<w:num w:numId=\"3\"><w:abstractNumId w:val=\"0\"/></w:num>"
        val li = { t: String, num: Int, ilvl: Int -> p(t, "<w:numPr><w:ilvl w:val=\"$ilvl\"/><w:numId w:val=\"$num\"/></w:numPr>") }
        val doc = read(
            li("a", 1, 0) + li("b", 1, 0) + li("b1", 1, 1) + li("c", 1, 0) + li("dot", 2, 0) + li("again", 3, 0),
            numbering = numbering,
        )
        assertEquals(listOf("1.", "2.", "a.", "3.", "•", "1."), (0..5).map { doc.para(it).label })
        assertEquals(36f, doc.para(0).indentLeft)
        assertEquals(-18f, doc.para(0).indentFirst)
        assertEquals(72f, doc.para(2).indentLeft)
    }

    @Test fun tableGridSpanAndVMerge() {
        val tc = { pr: String, t: String -> "<w:tc><w:tcPr>$pr</w:tcPr>${p(t)}</w:tc>" }
        val borders = "<w:tblBorders>" + listOf("top", "left", "bottom", "right", "insideH", "insideV")
            .joinToString("") { "<w:$it w:val=\"single\" w:sz=\"4\"/>" } + "</w:tblBorders>"
        val tbl = "<w:tbl><w:tblPr>$borders</w:tblPr><w:tblGrid><w:gridCol w:w=\"2000\"/><w:gridCol w:w=\"2000\"/><w:gridCol w:w=\"2000\"/></w:tblGrid>" +
            "<w:tr>${tc("<w:gridSpan w:val=\"2\"/><w:shd w:val=\"clear\" w:fill=\"D9D9D9\"/>", "A")}${tc("<w:vMerge w:val=\"restart\"/>", "B")}</w:tr>" +
            "<w:tr>${tc("", "C")}${tc("", "D")}${tc("<w:vMerge/>", "")}</w:tr></w:tbl>"
        val t = read(tbl + p("")).blocks()[0] as DTable
        assertEquals(listOf(100f, 100f, 100f), t.colWidths)
        val a = t.rows[0].cells[0]
        assertEquals(2, a.span)
        assertEquals(0xFFD9D9D9.toInt(), a.fill)
        assertTrue(a.borders.top && a.borders.left && a.borders.bottom && a.borders.right)
        assertEquals("A", a.blocks[0].text())
        assertEquals(VMerge.RESTART, t.rows[0].cells[1].vMerge)
        assertEquals(VMerge.CONTINUE, t.rows[1].cells[2].vMerge)
        assertEquals(VMerge.NONE, t.rows[1].cells[0].vMerge)
    }

    @Test fun sectionsCarryPageSizeMarginsAndOrientation() {
        val a4 = "<w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/>"
        val sideways = "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\" w:orient=\"landscape\"/>" +
            "<w:pgMar w:top=\"720\" w:right=\"720\" w:bottom=\"720\" w:left=\"720\"/></w:sectPr>"
        val doc = read(p("one", "<w:sectPr>$a4</w:sectPr>") + p("two") + sideways)
        assertEquals(2, doc.sections.size)
        val (s1, s2) = doc.sections
        assertEquals(595.3f, s1.pageW, 0.1f)
        assertEquals(841.9f, s1.pageH, 0.1f)
        assertEquals(Insets4(72f, 72f, 72f, 72f), s1.margins)
        assertEquals(listOf("one"), s1.blocks.map { it.text() })
        assertEquals(841.9f, s2.pageW, 0.1f)
        assertEquals(595.3f, s2.pageH, 0.1f)
        assertEquals(36f, s2.margins.left)
        assertEquals(listOf("two"), s2.blocks.map { it.text() })
    }

    @Test fun pageBreakAndPageBreakBefore() {
        val doc = read(
            p("a") + "<w:p><w:r><w:t>b</w:t><w:br w:type=\"page\"/><w:t>c</w:t></w:r></w:p>" +
                p("d", "<w:pageBreakBefore/>") + "<w:p><w:r><w:t>e</w:t><w:br/><w:t>f</w:t></w:r></w:p>",
        )
        val b = doc.blocks()
        assertEquals(6, b.size)
        assertEquals("a", b[0].text())
        assertEquals("b", b[1].text())
        assertTrue(b[2] is DBreak)
        assertEquals("c", b[3].text())
        assertTrue((b[4] as DPara).pageBreakBefore)
        assertFalse((b[0] as DPara).pageBreakBefore)
        assertEquals("e\nf", b[5].text())
    }

    @Test fun inlineAndAnchoredPicturesBecomeImages() {
        val pic = { cx: Long, cy: Long ->
            "<wp:extent cx=\"$cx\" cy=\"$cy\"/><wp:docPr id=\"1\" name=\"p\"/><a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">" +
                "<pic:pic><pic:blipFill><a:blip r:embed=\"rId5\"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>"
        }
        val inline = "<w:p><w:r><w:t>x</w:t></w:r><w:r><w:drawing><wp:inline>${pic(1_270_000, 635_000)}</wp:inline></w:drawing></w:r></w:p>"
        val anchor = "<w:p><w:r><w:t>y</w:t></w:r><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom=\"column\"><wp:align>center</wp:align></wp:positionH>" +
            "${pic(2_540_000, 1_270_000)}</wp:anchor></w:drawing></w:r></w:p>"
        val doc = read(
            inline + anchor,
            rels = rel("rId5", "image", "media/image1.png"),
            parts = listOf("word/media/image1.png" to OfficeFixtures.png(4, 2, 0x336699)),
        )
        assertEquals(DImage("word/media/image1.png", 100f, 50f), doc.para(0).runs[1])
        val images = doc.blocks().flatMap { (it as DPara).runs }.filterIsInstance<DImage>()
        assertTrue(images.contains(DImage("word/media/image1.png", 200f, 100f)))
        assertTrue(doc.media.containsKey("word/media/image1.png"))
        assertFalse(doc.missed)
    }

    @Test fun chartsAndSmartArtBecomePlaceholdersAndSetMissed() {
        val graphic = { uri: String, inner: String ->
            "<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"2540000\" cy=\"1270000\"/><a:graphic><a:graphicData uri=\"$uri\">$inner</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
        }
        val doc = read(
            graphic("http://schemas.openxmlformats.org/drawingml/2006/chart", "<c:chart r:id=\"rId9\"/>") +
                graphic("http://schemas.openxmlformats.org/drawingml/2006/diagram", "<dgm:relIds r:dm=\"rId10\"/>") + p("text"),
        )
        val runs = doc.blocks().flatMap { (it as DPara).runs }
        assertTrue(runs.contains(DPlaceholder("Chart", 200f, 100f)))
        assertTrue(runs.contains(DPlaceholder("Diagram", 200f, 100f)))
        assertTrue(doc.missed)
        assertFalse(read(p("plain")).missed)
    }

    @Test fun trackedInsertionsKeptDeletionsDropped() {
        val doc = read(
            "<w:p><w:r><w:t xml:space=\"preserve\">keep </w:t></w:r><w:ins w:id=\"1\"><w:r><w:t>added</w:t></w:r></w:ins>" +
                "<w:del w:id=\"2\"><w:r><w:delText>gone</w:delText></w:r></w:del><w:moveFrom><w:r><w:t>moved</w:t></w:r></w:moveFrom></w:p>",
        )
        assertEquals("keep added", doc.blocks()[0].text())
    }

    @Test fun fieldsShowTheirCachedTextAndPageFieldsStayLive() {
        val r = { inner: String -> "<w:r>$inner</w:r>" }
        val date = r("<w:t xml:space=\"preserve\">Date </w:t>") + r("<w:fldChar w:fldCharType=\"begin\"/>") +
            r("<w:instrText> DATE \\@ \"dd/MM/yyyy\" </w:instrText>") + r("<w:fldChar w:fldCharType=\"separate\"/>") +
            r("<w:t>27/10/2026</w:t>") + r("<w:fldChar w:fldCharType=\"end\"/>")
        val page = r("<w:fldChar w:fldCharType=\"begin\"/>") + r("<w:instrText> PAGE </w:instrText>") +
            r("<w:fldChar w:fldCharType=\"separate\"/>") + r("<w:t>7</w:t>") + r("<w:fldChar w:fldCharType=\"end\"/>")
        val simple = "<w:fldSimple w:instr=\" PAGE \\* MERGEFORMAT \"><w:r><w:t>3</w:t></w:r></w:fldSimple>"
        val doc = read("<w:p>$date</w:p><w:p>$page</w:p><w:p>$simple</w:p>")
        assertEquals("Date 27/10/2026", doc.blocks()[0].text())
        assertEquals(listOf(DField(FieldKind.PAGE)), doc.para(1).runs.filter { it !is DText || it.text.isNotEmpty() })
        assertEquals(listOf(DField(FieldKind.PAGE)), doc.para(2).runs)
    }

    @Test fun headersAndFootersDefaultOnly() {
        val sect = "<w:sectPr><w:headerReference w:type=\"default\" r:id=\"rIdH1\"/><w:headerReference w:type=\"first\" r:id=\"rIdH2\"/>" +
            "<w:footerReference w:type=\"default\" r:id=\"rIdF1\"/><w:pgSz w:w=\"11906\" w:h=\"16838\"/></w:sectPr>"
        val doc = read(
            p("body") + sect,
            rels = rel("rIdH1", "header", "header1.xml") + rel("rIdH2", "header", "header2.xml") + rel("rIdF1", "footer", "footer1.xml"),
            parts = listOf(
                "word/header1.xml" to xml("w:hdr", p("Shop header")),
                "word/header2.xml" to xml("w:hdr", p("First header")),
                "word/footer1.xml" to xml("w:ftr", "<w:p><w:r><w:t xml:space=\"preserve\">Page </w:t></w:r><w:fldSimple w:instr=\"PAGE\"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>"),
            ),
        )
        val s = doc.sections.single()
        assertEquals(listOf("Shop header"), s.header.map { it.text() })
        assertEquals(listOf(DText("Page ", sizePt = 10f), DField(FieldKind.PAGE)).map { it::class }, (s.footer[0] as DPara).runs.map { it::class })
        assertEquals(listOf("body"), s.blocks.map { it.text() })
    }

    @Test fun footnotesAreAppendedAtTheEnd() {
        val notes = "<w:footnote w:type=\"separator\" w:id=\"-1\"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>" +
            "<w:footnote w:type=\"continuationSeparator\" w:id=\"0\"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>" +
            "<w:footnote w:id=\"2\">${p("The note")}</w:footnote>"
        val doc = read(
            "<w:p><w:r><w:t>Main</w:t></w:r><w:r><w:rPr><w:vertAlign w:val=\"superscript\"/></w:rPr><w:footnoteReference w:id=\"2\"/></w:r></w:p>" + p("Last"),
            rels = rel("rIdN", "footnotes", "footnotes.xml"),
            parts = listOf("word/footnotes.xml" to xml("w:footnotes", notes)),
        )
        val b = doc.blocks()
        assertEquals("Main1", b[0].text())
        assertEquals(SuperSub.SUPER, ((b[0] as DPara).runs[1] as DText).superSub)
        assertEquals("Last", b[1].text())
        assertEquals("The note", b.last().text())
        assertEquals("1", (b.last() as DPara).label)
    }

    // ---- Round 9 review fixes ----

    @Test fun aHugeGridBeforeIsCapped() {
        val tbl = "<w:tbl><w:tblGrid><w:gridCol w:w=\"2000\"/></w:tblGrid><w:tr><w:trPr><w:gridBefore w:val=\"2000000000\"/></w:trPr>" +
            "<w:tc>${p("x")}</w:tc></w:tr></w:tbl>"
        val t = read(tbl + p("")).blocks()[0] as DTable
        assertTrue(t.rows[0].cells.all { it.span <= 64 })
    }

    @Test fun aDifferentFirstPageHeaderIsKept() {
        val sect = "<w:sectPr><w:headerReference w:type=\"default\" r:id=\"rIdH1\"/><w:headerReference w:type=\"first\" r:id=\"rIdH2\"/>" +
            "<w:titlePg/><w:pgSz w:w=\"11906\" w:h=\"16838\"/></w:sectPr>"
        val doc = read(
            p("body") + sect,
            rels = rel("rIdH1", "header", "header1.xml") + rel("rIdH2", "header", "header2.xml"),
            parts = listOf("word/header1.xml" to xml("w:hdr", p("Later pages")), "word/header2.xml" to xml("w:hdr", p("Letterhead"))),
        )
        val s = doc.sections.single()
        assertEquals(listOf("Later pages"), s.header.map { it.text() })
        assertEquals(listOf("Letterhead"), s.firstHeader?.map { it.text() })
        // A different first page with no first footer: page 1 has none.
        assertEquals(emptyList<DBlock>(), s.firstFooter)
        assertEquals(null, read(p("plain")).sections.single().firstHeader)
    }

    @Test fun symbolFontMarksSetMissed() {
        val doc = read("<w:p><w:r><w:t xml:space=\"preserve\">Tick </w:t><w:sym w:font=\"Wingdings\" w:char=\"F0FE\"/></w:r></w:p>")
        assertTrue(doc.missed)
    }

    @Test fun oldHindiFontsAreNotMadeIntoPages() {
        // Kruti Dev and friends draw Hindi through Latin letters: without the font the page would be gibberish.
        val doc = read(p("vkidk Lokxr gS", rPr = "<w:rFonts w:ascii=\"Kruti Dev 010\" w:hAnsi=\"Kruti Dev 010\"/>"))
        assertTrue(doc.legacyFont)
        assertFalse(read(p("नमस्ते", rPr = "<w:rFonts w:ascii=\"Mangal\"/>")).legacyFont)
    }

    @Test fun textBoxContentFollowsItsParagraph() {
        val box = "<w:r><mc:AlternateContent><mc:Choice Requires=\"wps\"><w:drawing><wp:anchor><wp:extent cx=\"1270000\" cy=\"635000\"/>" +
            "<a:graphic><a:graphicData uri=\"http://schemas.microsoft.com/office/word/2010/wordprocessingShape\"><wps:wsp><wps:txbx><w:txbxContent>" +
            p("Inside box") + "</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>" +
            "<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>${p("Inside box")}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>"
        val doc = read("<w:p><w:r><w:t>Before</w:t></w:r>$box</w:p>" + p("After"))
        assertEquals(listOf("Before", "Inside box", "After"), doc.blocks().map { it.text() })
        assertFalse(doc.missed)
    }
}
