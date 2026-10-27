package `in`.printsaathi.app.engine.office.xlsx

import `in`.printsaathi.app.engine.office.OfficeFixtures
import `in`.printsaathi.app.engine.office.SafeZip
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

/**
 * Phase 47 (owner, round 9: "low priority: excel files"): a customer's Excel file read sheet by sheet — shared and
 * typed-in text, numbers in their format (general, fixed, percent, dates), hidden sheets left out, merged cells, the
 * print area — and split into table pages: trailing empties trimmed, fitted to the width down to 50 % then columns
 * carried on, the first row repeated, sideways when wider than tall.
 */
class XlsxReaderTest {
    private val S = OfficeFixtures.S
    private val REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

    /** A workbook of [sheets] (name to the inside of sheetData, plus extra sheet XML after it). */
    private fun book(
        sheets: List<Triple<String, String, String>>,
        shared: List<String> = emptyList(),
        styles: String = "",
        hidden: Set<Int> = emptySet(),
        defined: String = "",
        workbookPr: String = "",
    ): XlsxBook {
        val parts = ArrayList<Pair<String, String>>()
        parts += "xl/workbook.xml" to "<?xml version=\"1.0\"?><workbook $S>$workbookPr<sheets>" +
            sheets.mapIndexed { i, (n, _, _) -> "<sheet name=\"$n\" sheetId=\"${i + 1}\"${if (i in hidden) " state=\"hidden\"" else ""} r:id=\"rId${i + 1}\"/>" }.joinToString("") +
            "</sheets>${if (defined.isEmpty()) "" else "<definedNames>$defined</definedNames>"}</workbook>"
        parts += "xl/_rels/workbook.xml.rels" to "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
            sheets.indices.joinToString("") { "<Relationship Id=\"rId${it + 1}\" Type=\"$REL/worksheet\" Target=\"worksheets/sheet${it + 1}.xml\"/>" } +
            "<Relationship Id=\"rIdS\" Type=\"$REL/sharedStrings\" Target=\"sharedStrings.xml\"/><Relationship Id=\"rIdY\" Type=\"$REL/styles\" Target=\"styles.xml\"/></Relationships>"
        sheets.forEachIndexed { i, (_, data, extra) ->
            parts += "xl/worksheets/sheet${i + 1}.xml" to "<?xml version=\"1.0\"?><worksheet $S><sheetData>$data</sheetData>$extra</worksheet>"
        }
        parts += "xl/sharedStrings.xml" to "<?xml version=\"1.0\"?><sst $S>" + shared.joinToString("") { "<si><t>$it</t></si>" } + "</sst>"
        if (styles.isNotEmpty()) parts += "xl/styles.xml" to "<?xml version=\"1.0\"?><styleSheet $S>$styles</styleSheet>"
        return XlsxReader.read(SafeZip.read(ByteArrayInputStream(OfficeFixtures.xlsx(parts)), { true }).parts)
    }

    private fun col(i: Int): String = if (i < 26) ('A' + i).toString() else ('A' + i / 26 - 1).toString() + ('A' + i % 26)
    private fun num(r: Int, c: Int, v: Any, s: Int? = null) = "<c r=\"${col(c)}${r + 1}\"${s?.let { " s=\"$it\"" } ?: ""}><v>$v</v></c>"
    private fun grid(rows: Int, cols: Int) = (0 until rows).joinToString("") { r -> "<row r=\"${r + 1}\">" + (0 until cols).joinToString("") { c -> num(r, c, r * 100 + c) } + "</row>" }
    private fun XSheet.text(r: Int, c: Int) = rows.getOrNull(r)?.cells?.getOrNull(c)?.text

    @Test fun sharedStringsAndInlineStrings() {
        val data = "<row r=\"1\"><c r=\"A1\" t=\"s\"><v>1</v></c><c r=\"B1\" t=\"inlineStr\"><is><t>Hi</t></is></c>" +
            "<c r=\"C1\" t=\"str\"><f>A1&amp;B1</f><v>calc</v></c><c r=\"D1\" t=\"b\"><v>1</v></c></row>"
        val s = book(listOf(Triple("Fees", data, "")), shared = listOf("Name", "रवि")).sheets.single()
        assertEquals("Fees", s.name)
        assertEquals(listOf("रवि", "Hi", "calc", "TRUE"), (0..3).map { s.text(0, it) })
    }

    @Test fun numbersFormatGeneralFixedPercentDate() {
        val styles = "<numFmts><numFmt numFmtId=\"164\" formatCode=\"dd\\-mmm\\-yyyy\"/><numFmt numFmtId=\"165\" formatCode=\"&quot;₹&quot;#,##0.00\"/></numFmts>" +
            "<fonts><font/></fonts><cellXfs><xf numFmtId=\"0\"/><xf numFmtId=\"4\"/><xf numFmtId=\"10\"/><xf numFmtId=\"14\"/><xf numFmtId=\"164\"/><xf numFmtId=\"165\"/><xf numFmtId=\"3\"/></cellXfs>"
        val data = "<row r=\"1\">${num(0, 0, 1234.5)}${num(0, 1, 1234.5, 1)}${num(0, 2, 0.256, 2)}${num(0, 3, 45292, 3)}${num(0, 4, 45292, 4)}" +
            "${num(0, 5, 1500, 5)}${num(0, 6, 1234567, 6)}${num(0, 7, 0.1 + 0.2)}</row>"
        val s = book(listOf(Triple("S", data, "")), styles = styles).sheets.single()
        assertEquals(listOf("1234.5", "1,234.50", "25.60%", "01/01/2024", "01-Jan-2024", "₹1,500.00", "1,234,567", "0.3"), (0..7).map { s.text(0, it) })
        // Numbers sit on the right, words on the left, unless the cell says.
        assertEquals(XAlign.RIGHT, s.rows[0].cells[0]?.align)
    }

    @Test fun hiddenSheetsSkipped() {
        val b = book(listOf(Triple("Shown", grid(1, 1), ""), Triple("Secret", grid(1, 1), "")), hidden = setOf(1))
        assertEquals(listOf("Shown"), b.sheets.map { it.name })
    }

    @Test fun mergedCellsSpan() {
        val s = book(listOf(Triple("S", grid(2, 3), "<mergeCells count=\"1\"><mergeCell ref=\"A1:C1\"/></mergeCells>"))).sheets.single()
        assertEquals(listOf(XRange(0, 0, 0, 2)), s.merges)
    }

    @Test fun printAreaLimitsTheCells() {
        val b = book(
            listOf(Triple("Sheet1", grid(5, 5), "")),
            defined = "<definedName name=\"_xlnm.Print_Area\" localSheetId=\"0\">'Sheet1'!\$B\$2:\$C\$3</definedName>",
        )
        val s = b.sheets.single()
        assertEquals(XRange(1, 1, 2, 2), s.printArea)
        val page = XlsxLayout.pages(s).single()
        assertEquals(listOf(1, 2), page.rows)
        assertEquals(listOf(1, 2), page.cols)
    }

    @Test fun trailingEmptiesTrimmed() {
        val styles = "<fonts><font/></fonts><cellXfs><xf numFmtId=\"0\"/><xf numFmtId=\"0\"/></cellXfs>"
        val data = grid(2, 2) + "<row r=\"10\"><c r=\"E10\" s=\"1\"/></row>"
        val s = book(listOf(Triple("S", data, "")), styles = styles).sheets.single()
        val page = XlsxLayout.pages(s).single()
        assertEquals(listOf(0, 1), page.rows)
        assertEquals(listOf(0, 1), page.cols)
    }

    @Test fun fitsWidthDownTo50PercentThenSplitsColumns() {
        val wide = { cols: Int -> "<cols><col min=\"1\" max=\"$cols\" width=\"19.05\" customWidth=\"1\"/></cols>" }
        // 10 columns of 100 pt, 80 rows of 15 pt (taller than wide) on an upright A4 (561 pt inside the edges): shrunk
        // to fit, one page.
        val ten = book(listOf(Triple("S", grid(80, 10), wide(10)))).sheets.single()
        assertEquals(100f, ten.colWidthsPt[0], 1f)
        val p10 = XlsxLayout.pages(ten)
        assertEquals(1, p10.size)
        assertFalse(p10[0].sideways)
        assertEquals(561f / 1000f, p10[0].scale, 0.02f)
        // 30 columns of 100 pt: sideways, no smaller than 50 %, the columns carried on to a second page.
        val thirty = XlsxLayout.pages(book(listOf(Triple("S", grid(3, 30), wide(30)))).sheets.single())
        assertEquals(2, thirty.size)
        assertTrue(thirty.all { it.sideways && it.scale == 0.5f })
        assertEquals((0 until 16).toList(), thirty[0].cols)
        assertEquals((16 until 30).toList(), thirty[1].cols)
    }

    @Test fun theFirstRowRepeatsOnEveryPage() {
        val pages = XlsxLayout.pages(book(listOf(Triple("S", grid(200, 3), ""))).sheets.single())
        assertTrue("${pages.size} pages", pages.size >= 3)
        assertTrue(pages.all { it.rows.first() == 0 })
        // Every row printed once (apart from the repeated first row).
        assertEquals((0 until 200).toList(), listOf(0) + pages.flatMap { it.rows.drop(1) })
    }

    @Test fun wideTablesGoSideways() {
        val wide = book(listOf(Triple("S", grid(3, 12), ""))).sheets.single()
        assertTrue(XlsxLayout.pages(wide).all { it.sideways })
        val tall = book(listOf(Triple("S", grid(60, 3), ""))).sheets.single()
        assertTrue(XlsxLayout.pages(tall).none { it.sideways })
    }

    // ---- Round 9 review fixes ----

    @Test fun literalsAndConditionsInsideNumberFormats() {
        val lakh = "[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00"
        assertEquals("12,34,567.00", XlsxReader.format(1234567.0, lakh))
        assertEquals("1,23,45,678.00", XlsxReader.format(12345678.0, lakh))
        assertEquals("99,999.00", XlsxReader.format(99999.0, lakh))
        assertEquals("1234 5678 9012", XlsxReader.format(123456789012.0, "0000 0000 0000"))
        assertEquals("0007", XlsxReader.format(7.0, "0000"))
        assertEquals("(1,500)", XlsxReader.format(-1500.0, "#,##0;(#,##0)"))
        assertEquals("50.0%", XlsxReader.format(0.5, "0.0%"))
        assertEquals("Rs. 1,500", XlsxReader.format(1500.0, "\"Rs. \"#,##0"))
    }

    @Test fun numbersTooWideForTheirCell() {
        val six = { s: String -> s.length * 6f }
        val avg = XCell("1234.5666667", align = XAlign.RIGHT, number = 1234.5666666667, general = true)
        assertEquals("1234.57", XlsxLayout.numberText(avg, 46f, six))
        assertEquals(null, XlsxLayout.numberText(XCell("123456789", align = XAlign.RIGHT, number = 123456789.0, general = true), 30f, six))
        assertEquals(null, XlsxLayout.numberText(XCell("1,234.50", align = XAlign.RIGHT, number = 1234.5), 30f, six))
        assertEquals("1,234.50", XlsxLayout.numberText(XCell("1,234.50", align = XAlign.RIGHT, number = 1234.5), 60f, six))
    }

    @Test fun dates1904() {
        val styles = "<fonts><font/></fonts><cellXfs><xf numFmtId=\"0\"/><xf numFmtId=\"14\"/></cellXfs>"
        val b = book(listOf(Triple("S", "<row r=\"1\">${num(0, 0, 0, 1)}${num(0, 1, 366, 1)}</row>", "")), styles = styles, workbookPr = "<workbookPr date1904=\"1\"/>")
        assertEquals(listOf("01/01/1904", "01/01/1905"), (0..1).map { b.sheets.single().text(0, it) })
    }

    @Test fun aFormulaWithNoSavedResultSetsMissed() {
        val b = book(listOf(Triple("S", "<row r=\"1\"><c r=\"A1\"><v>1</v></c><c r=\"B1\"><f>A1*2</f></c></row>", "")))
        assertTrue(b.missed)
        assertFalse(book(listOf(Triple("S", grid(2, 2), ""))).missed)
    }

    @Test fun aSmallTableThatFitsUprightStaysUpright() {
        // 3 columns × 6 rows is wider than tall, but fits an upright page at full size: turning it gains nothing.
        val small = XlsxLayout.pages(book(listOf(Triple("S", grid(6, 3), ""))).sheets.single()).single()
        assertFalse(small.sideways)
        assertEquals(1f, small.scale)
    }
}
