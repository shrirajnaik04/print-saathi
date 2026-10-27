package `in`.printsaathi.app.engine.office.xlsx

/**
 * Phase 47: a sheet split into table pages (pure, no drawing). Its print area, else everything up to the last cell
 * with something in it (empty rows and columns at the end left out, hidden ones too); A4 sideways when the table is
 * wider than tall and too wide for an upright page; shrunk to the page width down to 50 %, then the columns that do not fit carry on to later pages;
 * the first row repeated at the top of every page. Pages go down, then across.
 */
object XlsxLayout {
    const val MIN_SCALE = 0.5f

    fun pages(sheet: XSheet, pageW: Float = 595f, pageH: Float = 842f, edge: Float = 17f): List<XPage> {
        val all = sheet.printArea ?: XRange(0, 0, sheet.rows.size - 1, sheet.colWidthsPt.size - 1)
        val filled = { r: Int, c: Int -> !sheet.rows.getOrNull(r)?.cells?.getOrNull(c)?.text.isNullOrEmpty() }
        val lastRow = (all.r1 downTo all.r0).firstOrNull { r -> (all.c0..all.c1).any { filled(r, it) } } ?: return emptyList()
        val lastCol = (all.c1 downTo all.c0).firstOrNull { c -> (all.r0..lastRow).any { filled(it, c) } } ?: return emptyList()
        val height = { r: Int -> sheet.rows.getOrNull(r)?.heightPt ?: XlsxReader.DEFAULT_ROW_PT }
        val width = { c: Int -> sheet.colWidthsPt.getOrNull(c) ?: XlsxReader.DEFAULT_COL_PT }
        val rows = (all.r0..lastRow).filter { height(it) > 0f }
        val cols = (all.c0..lastCol).filter { width(it) > 0f }
        if (rows.isEmpty() || cols.isEmpty()) return emptyList()

        val totalW = cols.sumOf { width(it).toDouble() }.toFloat()
        val totalH = rows.sumOf { height(it).toDouble() }.toFloat()
        // Sideways only for a table wider than tall that does not fit an upright page at full size.
        val sideways = totalW > totalH && totalW > pageW - 2 * edge
        val (pw, ph) = if (sideways) pageH to pageW else pageW to pageH
        val roomW = pw - 2 * edge
        val roomH = ph - 2 * edge
        val scale = minOf(1f, roomW / totalW).coerceAtLeast(MIN_SCALE)

        val colBands = bands(cols, roomW / scale, width)
        val header = rows.first()
        val body = rows.drop(1)
        val rowBands = if (body.isEmpty()) {
            listOf(listOf(header))
        } else {
            bands(body, roomH / scale - height(header), height).map { listOf(header) + it }
        }
        return colBands.flatMap { cb -> rowBands.map { rb -> XPage(rb, cb, sideways, scale) } }
    }

    /**
     * A number's text in [room] points, as Excel shows it (review C3): as it is when it fits; in General, with fewer
     * decimals while the whole number still fits; otherwise null (the cell shows ####, never cut digits).
     */
    fun numberText(cell: XCell, room: Float, measure: (String) -> Float): String? {
        if (measure(cell.text) <= room) return cell.text
        val v = cell.number ?: return cell.text
        if (!cell.general) return null
        for (d in 9 downTo 0) {
            val s = java.math.BigDecimal(v).setScale(d, java.math.RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
            if (measure(s) <= room) return s
        }
        return null
    }

    /** [items] packed in order into runs no longer than [room] (at least one each). */
    private fun bands(items: List<Int>, room: Float, size: (Int) -> Float): List<List<Int>> {
        val out = ArrayList<List<Int>>()
        var cur = ArrayList<Int>()
        var used = 0f
        for (i in items) {
            val s = size(i)
            if (cur.isNotEmpty() && used + s > room + 0.01f) {
                out += cur
                cur = ArrayList()
                used = 0f
            }
            cur += i
            used += s
        }
        if (cur.isNotEmpty()) out += cur
        return out
    }
}
