package `in`.printsaathi.app.engine.office.xlsx

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import `in`.printsaathi.app.engine.office.OfficeRefused
import `in`.printsaathi.app.engine.office.docx.DocxPdf
import java.io.OutputStream

/**
 * Phase 47: draws an [XlsxBook] as table pages inside the isolated engine — each sheet from a new page, split by
 * [XlsxLayout], on A4 (sideways when the table is wider than tall). Light grey grid lines, each cell's text on one
 * line in the phone's sans font (bold and aligned as in Excel), left-aligned text running on into empty cells beside
 * it as Excel shows it, merged cells as one.
 */
object XlsxPdf {
    private const val EDGE = 17f
    private const val TEXT_PT = 10f
    private const val PAD = 2f
    private const val GRID = 0xFFA0A0A0.toInt()

    fun draw(book: XlsxBook, out: OutputStream, maxPages: Int): DocxPdf.Drawn {
        val pages = book.sheets.flatMap { s -> XlsxLayout.pages(s, edge = EDGE).map { s to it } }
        if (pages.isEmpty()) throw OfficeRefused("nothing in the sheets")
        if (pages.size > maxPages) throw DocxPdf.TooManyPages()
        val pdf = PdfDocument()
        var cut = false
        try {
            pages.forEachIndexed { i, (sheet, page) ->
                val (w, h) = if (page.sideways) 842 to 595 else 595 to 842
                val p = pdf.startPage(PdfDocument.PageInfo.Builder(w, h, i + 1).create())
                val c = p.canvas
                c.save()
                c.translate(EDGE, EDGE)
                c.scale(page.scale, page.scale)
                if (draw(c, sheet, page)) cut = true
                c.restore()
                pdf.finishPage(p)
            }
            pdf.writeTo(out)
            return DocxPdf.Drawn(pages.size, cut)
        } finally {
            pdf.close()
        }
    }

    /** Draws one page; true when some cell's text did not fit (cut, or a number shown as ####). */
    private fun draw(c: Canvas, sheet: XSheet, page: XPage): Boolean {
        var cut = false
        val xs = FloatArray(page.cols.size + 1)
        page.cols.forEachIndexed { k, col -> xs[k + 1] = xs[k] + (sheet.colWidthsPt.getOrNull(col) ?: XlsxReader.DEFAULT_COL_PT) }
        val ys = FloatArray(page.rows.size + 1)
        page.rows.forEachIndexed { k, row -> ys[k + 1] = ys[k] + (sheet.rows.getOrNull(row)?.heightPt ?: XlsxReader.DEFAULT_ROW_PT) }
        val colAt = page.cols.withIndex().associate { it.value to it.index }
        val rowAt = page.rows.withIndex().associate { it.value to it.index }

        // Merged cells on this page: their box over the rows and columns shown; the cells under them draw nothing.
        val covered = HashSet<Long>()
        val boxes = ArrayList<Pair<XRange, FloatArray>>()
        for (m in sheet.merges) {
            val ks = (m.c0..m.c1).mapNotNull { colAt[it] }
            val rs = (m.r0..m.r1).mapNotNull { rowAt[it] }
            if (ks.isEmpty() || rs.isEmpty()) continue
            for (r in rs) for (k in ks) covered += key(r, k)
            boxes += m to floatArrayOf(xs[ks.min()], ys[rs.min()], xs[ks.max() + 1], ys[rs.max() + 1])
        }

        val grid = Paint().apply {
            color = GRID
            strokeWidth = 0.5f
            style = Paint.Style.STROKE
        }
        for (r in page.rows.indices) for (k in page.cols.indices) {
            if (key(r, k) in covered) continue
            c.drawRect(xs[k], ys[r], xs[k + 1], ys[r + 1], grid)
        }
        for ((_, b) in boxes) c.drawRect(b[0], b[1], b[2], b[3], grid)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = TEXT_PT
        }
        val cellAt = { r: Int, k: Int -> sheet.rows.getOrNull(page.rows[r])?.cells?.getOrNull(page.cols[k]) }
        for (r in page.rows.indices) for (k in page.cols.indices) {
            if (key(r, k) in covered) continue
            val cell = cellAt(r, k) ?: continue
            var right = xs[k + 1]
            // Left-aligned text runs on over empty cells to its right, as Excel shows it.
            if (cell.align == XAlign.LEFT) {
                paint.typeface = face(cell.bold)
                val need = xs[k] + PAD + paint.measureText(cell.text)
                var n = k + 1
                while (right < need && n < page.cols.size && cellAt(r, n) == null && key(r, n) !in covered) right = xs[++n]
            }
            if (text(c, cell, xs[k], ys[r], right, ys[r + 1], paint)) cut = true
        }
        for ((m, b) in boxes) {
            val cell = sheet.rows.getOrNull(m.r0)?.cells?.getOrNull(m.c0) ?: continue
            if (text(c, cell, b[0], b[1], b[2], b[3], paint)) cut = true
        }
        return cut
    }

    private fun key(r: Int, k: Int) = (r.toLong() shl 32) or k.toLong()

    private fun face(bold: Boolean) = if (bold) Typeface.DEFAULT_BOLD else Typeface.SANS_SERIF

    /**
     * One line of [cell]'s text in its box, sitting on the box's bottom like Excel, cut at the box's sides. A number
     * that does not fit shows fewer decimals (General) or #### instead, never cut digits (review C3). True when
     * something was not shown.
     */
    private fun text(c: Canvas, cell: XCell, l: Float, t: Float, r: Float, b: Float, paint: Paint): Boolean {
        paint.typeface = face(cell.bold)
        val room = r - l - 2 * PAD
        val shown = if (cell.number != null) XlsxLayout.numberText(cell, room, paint::measureText) else cell.text
        val text = shown ?: "#".repeat((room / paint.measureText("#")).toInt().coerceAtLeast(1))
        val w = paint.measureText(text)
        val x = when (cell.align) {
            XAlign.LEFT -> l + PAD
            XAlign.CENTER -> (l + r - w) / 2
            XAlign.RIGHT -> r - PAD - w
        }
        c.save()
        c.clipRect(l, t, r, b)
        c.drawText(text, x, b - PAD - paint.descent(), paint)
        c.restore()
        return shown == null || w > r - l - PAD + 0.5f
    }
}
