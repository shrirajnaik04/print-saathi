package `in`.printsaathi.sharesender

import `in`.printsaathi.app.engine.office.OfficeFixtures
import java.io.File

/**
 * Round 9: synthetic Office files for the device smoke (never real documents). Each is a complete package (content
 * types, package relationships), so a real office app opens it too: a Word letter with a heading, Devanagari, a table
 * and a picture; a two-slide PowerPoint file; a fee sheet in Excel; the head of an old Word (.doc) file; an
 * OpenDocument text file; and a plain .txt file.
 */
object OfficeSamples {
    private fun s(x: String) = x.toByteArray(Charsets.UTF_8)

    private const val XML = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
    private const val RELS = "xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\""
    private const val REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    private const val DEVANAGARI = "नमस्ते, कृपया यह पत्र पढ़ें।"

    private fun types(overrides: String) =
        "$XML<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
            "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
            "<Default Extension=\"xml\" ContentType=\"application/xml\"/><Default Extension=\"png\" ContentType=\"image/png\"/>" +
            "$overrides</Types>"

    private fun packageRels(main: String) =
        "$XML<Relationships $RELS><Relationship Id=\"rId1\" Type=\"$REL/officeDocument\" Target=\"$main\"/></Relationships>"

    private val picture = OfficeFixtures.png(64, 32, 0x2E7D32)

    fun docx(dir: File, tag: String): File {
        val run = { t: String, bold: Boolean -> "<w:r>${if (bold) "<w:rPr><w:b/></w:rPr>" else ""}<w:t xml:space=\"preserve\">$t</w:t></w:r>" }
        val cell = { t: String -> "<w:tc><w:tcPr><w:tcW w:w=\"3000\" w:type=\"dxa\"/></w:tcPr><w:p>${run(t, false)}</w:p></w:tc>" }
        val border = "<w:tblBorders>" + listOf("top", "left", "bottom", "right", "insideH", "insideV")
            .joinToString("") { "<w:$it w:val=\"single\" w:sz=\"8\" w:space=\"0\" w:color=\"000000\"/>" } + "</w:tblBorders>"
        val body = "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr>${run("Admission letter", false)}</w:p>" +
            "<w:p>${run(DEVANAGARI, false)}</w:p>" +
            "<w:p>${run("Please bring this letter to the office. ", false)}${run("Fees are due on Monday.", true)}</w:p>" +
            "<w:tbl><w:tblPr><w:tblW w:w=\"9000\" w:type=\"dxa\"/>$border</w:tblPr>" +
            "<w:tblGrid><w:gridCol w:w=\"3000\"/><w:gridCol w:w=\"3000\"/><w:gridCol w:w=\"3000\"/></w:tblGrid>" +
            "<w:tr>${cell("Name")}${cell("Class")}${cell("Fee")}</w:tr>" +
            "<w:tr>${cell("Asha")}${cell("5")}${cell("1200")}</w:tr></w:tbl>" +
            "<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"1828800\" cy=\"914400\"/><wp:docPr id=\"1\" name=\"Picture 1\"/>" +
            "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:pic>" +
            "<pic:nvPicPr><pic:cNvPr id=\"1\" name=\"image1.png\"/><pic:cNvPicPr/></pic:nvPicPr>" +
            "<pic:blipFill><a:blip r:embed=\"rId1\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
            "<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"1828800\" cy=\"914400\"/></a:xfrm><a:prstGeom prst=\"rect\"/></pic:spPr>" +
            "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>" +
            "<w:p>${run("Sample $tag", false)}</w:p>" +
            "<w:sectPr><w:pgSz w:w=\"11906\" w:h=\"16838\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr>"
        val styles = "$XML<w:styles ${OfficeFixtures.W}><w:style w:type=\"paragraph\" w:styleId=\"Heading1\"><w:name w:val=\"heading 1\"/>" +
            "<w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr></w:style></w:styles>"
        return write(
            dir, "letter-$tag.docx",
            listOf(
                "[Content_Types].xml" to types(
                    "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
                        "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>",
                ),
                "_rels/.rels" to packageRels("word/document.xml"),
                "word/document.xml" to "$XML<w:document ${OfficeFixtures.W}><w:body>$body</w:body></w:document>",
                "word/styles.xml" to styles,
                "word/_rels/document.xml.rels" to "$XML<Relationships $RELS>" +
                    "<Relationship Id=\"rId1\" Type=\"$REL/image\" Target=\"media/image1.png\"/>" +
                    "<Relationship Id=\"rId2\" Type=\"$REL/styles\" Target=\"styles.xml\"/></Relationships>",
            ),
            listOf("word/media/image1.png" to picture),
        )
    }

    fun pptx(dir: File, tag: String): File {
        val text = { id: Int, y: Long, t: String, size: Int ->
            "<p:sp><p:nvSpPr><p:cNvPr id=\"$id\" name=\"Text $id\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>" +
                "<p:spPr><a:xfrm><a:off x=\"609600\" y=\"$y\"/><a:ext cx=\"10972800\" cy=\"1143000\"/></a:xfrm><a:prstGeom prst=\"rect\"/></p:spPr>" +
                "<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang=\"en-IN\" sz=\"$size\"/><a:t>$t</a:t></a:r></a:p></p:txBody></p:sp>"
        }
        val slide = { shapes: String -> "$XML<p:sld ${OfficeFixtures.P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>$shapes</p:spTree></p:cSld></p:sld>" }
        val pic = "<p:pic><p:nvPicPr><p:cNvPr id=\"4\" name=\"Picture\"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>" +
            "<p:blipFill><a:blip r:embed=\"rId1\"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>" +
            "<p:spPr><a:xfrm><a:off x=\"609600\" y=\"3429000\"/><a:ext cx=\"3657600\" cy=\"1828800\"/></a:xfrm><a:prstGeom prst=\"rect\"/></p:spPr></p:pic>"
        val slideRels = { media: Boolean ->
            "$XML<Relationships $RELS>" + (if (media) "<Relationship Id=\"rId1\" Type=\"$REL/image\" Target=\"../media/image1.png\"/>" else "") + "</Relationships>"
        }
        return write(
            dir, "talk-$tag.pptx",
            listOf(
                "[Content_Types].xml" to types(
                    "<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>" +
                        (1..2).joinToString("") { "<Override PartName=\"/ppt/slides/slide$it.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>" },
                ),
                "_rels/.rels" to packageRels("ppt/presentation.xml"),
                "ppt/presentation.xml" to "$XML<p:presentation ${OfficeFixtures.P}><p:sldIdLst><p:sldId id=\"256\" r:id=\"rId1\"/><p:sldId id=\"257\" r:id=\"rId2\"/></p:sldIdLst>" +
                    "<p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/></p:presentation>",
                "ppt/_rels/presentation.xml.rels" to "$XML<Relationships $RELS>" +
                    "<Relationship Id=\"rId1\" Type=\"$REL/slide\" Target=\"slides/slide1.xml\"/>" +
                    "<Relationship Id=\"rId2\" Type=\"$REL/slide\" Target=\"slides/slide2.xml\"/></Relationships>",
                "ppt/slides/slide1.xml" to slide(text(2, 457200, "School annual day", 4400) + text(3, 1828800, DEVANAGARI, 2800) + pic),
                "ppt/slides/_rels/slide1.xml.rels" to slideRels(true),
                "ppt/slides/slide2.xml" to slide(text(2, 457200, "Programme", 4000) + text(3, 1828800, "Songs, a play and prizes. Sample $tag", 2400)),
                "ppt/slides/_rels/slide2.xml.rels" to slideRels(false),
            ),
            listOf("ppt/media/image1.png" to picture),
        )
    }

    fun xlsx(dir: File, tag: String): File {
        val strings = listOf("Name", "Class", "Fee", "Asha", "रवि", "Total", "Sample $tag")
        val str = { ref: String, i: Int -> "<c r=\"$ref\" t=\"s\"><v>$i</v></c>" }
        val num = { ref: String, v: Int -> "<c r=\"$ref\"><v>$v</v></c>" }
        val rows = "<row r=\"1\">${str("A1", 0)}${str("B1", 1)}${str("C1", 2)}</row>" +
            "<row r=\"2\">${str("A2", 3)}${num("B2", 5)}${num("C2", 1200)}</row>" +
            "<row r=\"3\">${str("A3", 4)}${num("B3", 6)}${num("C3", 1350)}</row>" +
            "<row r=\"4\">${str("A4", 5)}<c r=\"C4\"><f>SUM(C2:C3)</f><v>2550</v></c></row>" +
            "<row r=\"6\">${str("A6", 6)}</row>"
        return write(
            dir, "fees-$tag.xlsx",
            listOf(
                "[Content_Types].xml" to types(
                    "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                        "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
                        "<Override PartName=\"/xl/sharedStrings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml\"/>",
                ),
                "_rels/.rels" to packageRels("xl/workbook.xml"),
                "xl/workbook.xml" to "$XML<workbook ${OfficeFixtures.S}><sheets><sheet name=\"Fees\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
                "xl/_rels/workbook.xml.rels" to "$XML<Relationships $RELS>" +
                    "<Relationship Id=\"rId1\" Type=\"$REL/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
                    "<Relationship Id=\"rId2\" Type=\"$REL/sharedStrings\" Target=\"sharedStrings.xml\"/></Relationships>",
                "xl/worksheets/sheet1.xml" to "$XML<worksheet ${OfficeFixtures.S}><sheetData>$rows</sheetData></worksheet>",
                "xl/sharedStrings.xml" to "$XML<sst ${OfficeFixtures.S.substringBefore(" xmlns:r")} count=\"${strings.size}\" uniqueCount=\"${strings.size}\">" +
                    strings.joinToString("") { "<si><t>$it</t></si>" } + "</sst>",
            ),
        )
    }

    /** The head of an old binary Word file: PrintSaathi names it a Word file; only an office app can print it. */
    fun doc(dir: File, tag: String): File =
        File(dir, "old-letter-$tag.doc").apply { writeBytes(OfficeFixtures.ole("WordDocument", "1Table") + s(tag)) }

    fun odt(dir: File, tag: String): File =
        File(dir, "letter-$tag.odt").apply { writeBytes(OfficeFixtures.odf("application/vnd.oasis.opendocument.text")) }

    fun txt(dir: File, tag: String): File = File(dir, "notice-$tag.txt").apply {
        writeText((1..12).joinToString("\n") { "Line $it of the notice. $DEVANAGARI $tag" } + "\n")
    }

    private fun write(dir: File, name: String, xml: List<Pair<String, String>>, media: List<Pair<String, ByteArray>> = emptyList()) =
        File(dir, name).apply { writeBytes(OfficeFixtures.zip(xml.map { (n, x) -> n to s(x) } + media)) }
}
