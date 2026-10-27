package `in`.printsaathi.app.engine.office.xlsx

/**
 * Phase 47: a customer's Excel file as the engine prints it: each visible sheet's cells as the text Excel shows
 * (cached values in their number format; no formula is worked out), in points. [missed]: charts or pictures on a
 * sheet, which print only from WPS Office.
 */
data class XlsxBook(val sheets: List<XSheet>, val missed: Boolean = false)

/** Cells from row [r0] column [c0] to row [r1] column [c1], counted from 0, both ends included. */
data class XRange(val r0: Int, val c0: Int, val r1: Int, val c1: Int)

enum class XAlign { LEFT, CENTER, RIGHT }

/** A cell's text as Excel shows it; [number]: its value when it is a number, [general]: in the General format. */
data class XCell(
    val text: String,
    val bold: Boolean = false,
    val align: XAlign = XAlign.LEFT,
    val number: Double? = null,
    val general: Boolean = false,
)

/** A row's cells by column (null: empty); [heightPt] 0: a hidden row. */
data class XRow(val cells: List<XCell?>, val heightPt: Float)

/** A sheet; a column [colWidthsPt] of 0 is hidden. */
data class XSheet(
    val name: String,
    val colWidthsPt: List<Float>,
    val rows: List<XRow>,
    val merges: List<XRange>,
    val printArea: XRange?,
)

/** One printed page of a sheet: the rows and columns on it (the first row repeated at the top), its size and shrink. */
data class XPage(val rows: List<Int>, val cols: List<Int>, val sideways: Boolean, val scale: Float)
