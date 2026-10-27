package `in`.printsaathi.app.engine.office.pptx

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import `in`.printsaathi.app.engine.office.OfficeRefused
import `in`.printsaathi.app.engine.office.docx.DPara
import `in`.printsaathi.app.engine.office.docx.DText
import `in`.printsaathi.app.engine.office.docx.DocxPdf
import java.io.OutputStream

/**
 * Phase 46: draws a [PptxDeck] as PDF pages inside the isolated engine — one slide per A4 sideways page (842 × 595
 * pt), scaled to fit inside 6 mm edges and centred, keeping its shape. Backgrounds, filled and outlined shapes, text
 * (Word's tested paragraph layout, autofit's shrink applied), pictures, lines, simple tables and marked boxes.
 */
object PptxPdf {
    const val PAGE_W = 842
    const val PAGE_H = 595
    private const val EDGE = 6f * 72f / 25.4f
    private const val CELL_X = 7.2f
    private const val CELL_Y = 3.6f

    fun draw(deck: PptxDeck, out: OutputStream, maxPages: Int): DocxPdf.Drawn {
        if (deck.slides.isEmpty()) throw OfficeRefused("no slides")
        if (deck.slides.size > maxPages) throw DocxPdf.TooManyPages()
        val sw = deck.slideW.coerceAtLeast(1f)
        val sh = deck.slideH.coerceAtLeast(1f)
        val s = minOf((PAGE_W - 2 * EDGE) / sw, (PAGE_H - 2 * EDGE) / sh)
        val ox = (PAGE_W - sw * s) / 2
        val oy = (PAGE_H - sh * s) / 2
        val art = DocxPdf.Art(deck.media).also { it.scale = s }
        val pdf = PdfDocument()
        try {
            deck.slides.forEachIndexed { i, slide ->
                art.page = i + 1
                val page = pdf.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, i + 1).create())
                val c = page.canvas
                c.save()
                c.translate(ox, oy)
                c.scale(s, s)
                c.clipRect(0f, 0f, sw, sh)
                c.drawRect(0f, 0f, sw, sh, Paint().apply { color = slide.bg ?: Color.WHITE })
                slide.bgImage?.let { art.picture(c, it, 0f, 0f, sw, sh) }
                for (shape in slide.shapes) shape(c, shape, art, sh)
                c.restore()
                pdf.finishPage(page)
            }
            pdf.writeTo(out)
            return DocxPdf.Drawn(deck.slides.size, art.missed)
        } finally {
            pdf.close()
        }
    }

    private fun shape(c: Canvas, shape: PShape, art: DocxPdf.Art, slideH: Float) {
        c.save()
        if (shape.rot != 0f) c.rotate(shape.rot, shape.x + shape.w / 2, shape.y + shape.h / 2)
        when (shape) {
            is PText -> text(c, shape, art, slideH)
            is PPicture -> art.picture(c, shape.mediaKey, shape.x, shape.y, shape.w, shape.h, shape.crop)
            is PLine -> {
                val x0 = if (shape.flipH) shape.x + shape.w else shape.x
                val x1 = if (shape.flipH) shape.x else shape.x + shape.w
                val y0 = if (shape.flipV) shape.y + shape.h else shape.y
                val y1 = if (shape.flipV) shape.y else shape.y + shape.h
                c.drawLine(x0, y0, x1, y1, stroke(shape.color, shape.widthPt))
            }
            is PTable -> table(c, shape, art, slideH)
            is PPlaceholderBox -> art.placeholder(c, shape.label, shape.x, shape.y, shape.w, shape.h)
        }
        c.restore()
    }

    private fun stroke(color: Int, w: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = w.coerceIn(0.25f, 20f)
        this.color = color
    }

    private fun text(c: Canvas, t: PText, art: DocxPdf.Art, slideH: Float) {
        val r = RectF(t.x, t.y, t.x + t.w, t.y + t.h)
        val round = minOf(t.w, t.h) * 0.1667f
        t.fill?.let { f ->
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = f }
            when (t.geom) {
                Geom.RECT -> c.drawRect(r, p)
                Geom.ROUND_RECT -> c.drawRoundRect(r, round, round, p)
                Geom.ELLIPSE -> c.drawOval(r, p)
                Geom.OTHER -> Unit
            }
        }
        t.line?.let { l ->
            val p = stroke(l, t.lineW)
            when (t.geom) {
                Geom.RECT -> c.drawRect(r, p)
                Geom.ROUND_RECT -> c.drawRoundRect(r, round, round, p)
                Geom.ELLIPSE -> c.drawOval(r, p)
                Geom.OTHER -> Unit
            }
        }
        if (t.paras.isEmpty()) return
        val innerW = (t.w - t.insets.left - t.insets.right).coerceAtLeast(6f)
        val laid = t.paras.map { scaled(it, t.fontScale) }.mapNotNull { DocxPdf.laid(it, innerW, slideH, art) }
        val total = laid.sumOf { it.height.toDouble() }.toFloat()
        val room = t.h - t.insets.top - t.insets.bottom
        var y = when (t.anchor) {
            Anchor.TOP -> t.y + t.insets.top
            Anchor.MIDDLE -> t.y + t.insets.top + (room - total) / 2
            Anchor.BOTTOM -> t.y + t.h - t.insets.bottom - total
        }
        // Text that does not fit runs past the shape, as PowerPoint shows it.
        for (l in laid) {
            l.draw(c, t.x + t.insets.left, y)
            y += l.height
        }
    }

    /** A paragraph with autofit's shrink applied to its text. */
    private fun scaled(p: DPara, f: Float): DPara = if (f >= 0.999f) p else p.copy(
        runs = p.runs.map { if (it is DText) it.copy(sizePt = it.sizePt * f) else it },
        markSizePt = p.markSizePt * f,
        spaceBefore = p.spaceBefore * f,
        spaceAfter = p.spaceAfter * f,
    )

    private fun table(c: Canvas, t: PTable, art: DocxPdf.Art, slideH: Float) {
        val boxes = t.boxes()
        val ncol = maxOf(t.colWidths.size, t.rows.maxOfOrNull { it.size } ?: 0).coerceAtLeast(1)
        val widths = FloatArray(ncol) { t.colWidths.getOrNull(it)?.takeIf { w -> w > 0f } ?: (t.w / ncol) }
        val colX = FloatArray(ncol + 1).also { for (i in 0 until ncol) it[i + 1] = it[i] + widths[i] }
        // Each cell's text, laid out; a row grows to fit its text, and a tall merged cell grows its last row.
        val laid = boxes.map { b -> b.cell.paras.mapNotNull { DocxPdf.laid(it, (colX[b.col1] - colX[b.col0] - 2 * CELL_X).coerceAtLeast(6f), slideH, art) } }
        val need = { k: Int -> laid[k].sumOf { it.height.toDouble() }.toFloat() + 2 * CELL_Y }
        val heights = FloatArray(t.rows.size) { r -> maxOf(t.rowHeights.getOrNull(r) ?: 0f, 6f) }
        boxes.forEachIndexed { k, b -> if (b.lastRow == b.row) heights[b.row] = maxOf(heights[b.row], need(k)) }
        boxes.forEachIndexed { k, b ->
            val have = (b.row..b.lastRow).sumOf { heights[it].toDouble() }.toFloat()
            if (need(k) > have) heights[b.lastRow] += need(k) - have
        }
        val rowY = FloatArray(t.rows.size + 1).also { for (i in t.rows.indices) it[i + 1] = it[i] + heights[i] }
        val grid = stroke(Color.BLACK, 0.75f)
        boxes.forEachIndexed { k, b ->
            val box = RectF(t.x + colX[b.col0], t.y + rowY[b.row], t.x + colX[b.col1], t.y + rowY[b.lastRow + 1])
            b.cell.fill?.let { c.drawRect(box, Paint().apply { color = it }) }
            var ty = box.top + CELL_Y
            for (l in laid[k]) {
                l.draw(c, box.left + CELL_X, ty)
                ty += l.height
            }
            c.drawRect(box, grid)
        }
    }
}
