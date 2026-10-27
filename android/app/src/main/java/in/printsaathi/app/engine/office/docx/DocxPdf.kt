package `in`.printsaathi.app.engine.office.docx

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.text.LineBreaker
import android.os.Build
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.LeadingMarginSpan
import android.text.style.MetricAffectingSpan
import android.text.style.ReplacementSpan
import android.text.style.TabStopSpan
import java.io.OutputStream
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * Phase 45: draws a [DocxDoc] as PDF pages inside the isolated engine — each section at its own page size, text as
 * real (vector) text in the phone's fonts (so Devanagari prints), tables with their grid, borders and shading, and
 * pictures at up to 300 dpi of their printed size. A paragraph or table that does not fit is split at a line or row
 * end, never through a line. More pages than [draw]'s limit: [TooManyPages].
 */
object DocxPdf {
    class TooManyPages : Exception()

    /** Pages drawn, and whether something (a picture the phone could not open) was drawn as a marked box. */
    data class Drawn(val pages: Int, val missed: Boolean)

    const val CELL_PAD = 5.4f
    private const val DPI = 300f
    private const val MAX_PIXELS = 24_000_000
    private const val TAB = 36f
    private const val BORDER = 0.75f

    fun draw(doc: DocxDoc, out: OutputStream, maxPages: Int): Drawn {
        val pdf = PdfDocument()
        try {
            val pager = Pager(pdf, doc, maxPages)
            for (s in doc.sections) {
                pager.section(s)
                for (b in s.blocks) pager.place(b)
            }
            pager.finishPage()
            pdf.writeTo(out)
            return Drawn(pager.number, pager.art.missed)
        } finally {
            pdf.close()
        }
    }

    /** A block laid out at a width: its [height], where it may be split between pages, and how it draws. */
    internal abstract class Laid {
        abstract val height: Float
        /** Split points from its top, ascending (line and row ends). */
        abstract val breaks: FloatArray
        /** Draws the whole block with its top-left at ([x], [top]); the page clips what is not on it. */
        abstract fun draw(c: Canvas, x: Float, top: Float)
    }

    private class Pager(val pdf: PdfDocument, val doc: DocxDoc, val maxPages: Int) {
        var number = 0
        val art = Art(doc.media)
        var page: PdfDocument.Page? = null
        lateinit var c: Canvas
        lateinit var sec: DSection
        var pageW = 0
        var pageH = 0
        var top = 0f
        var bottom = 0f
        var y = 0f

        val contentW get() = (sec.pageW - sec.margins.left - sec.margins.right).coerceAtLeast(36f)

        fun section(s: DSection) {
            val continues = page != null && !s.newPage && s.pageW.roundToInt() == pageW && s.pageH.roundToInt() == pageH
            sec = s
            if (!continues) {
                firstOfSection = true
                newPage()
            }
        }

        /** The next page started is its section's first ("different first page" headers). */
        var firstOfSection = false

        fun finishPage() {
            page?.let { pdf.finishPage(it) }
            page = null
        }

        fun newPage() {
            finishPage()
            if (number >= maxPages) throw TooManyPages()
            number++
            art.page = number
            pageW = sec.pageW.roundToInt().coerceIn(72, 14400)
            pageH = sec.pageH.roundToInt().coerceIn(72, 14400)
            val p = pdf.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, number).create())
            page = p
            c = p.canvas
            val left = sec.margins.left
            var t = sec.margins.top
            var b = pageH - sec.margins.bottom
            val room = pageH * 0.4f
            val first = firstOfSection
            firstOfSection = false
            val header = (if (first) sec.firstHeader else null) ?: sec.header
            val footer = (if (first) sec.firstFooter else null) ?: sec.footer
            if (header.isNotEmpty()) {
                var hy = sec.headerFrom
                for (blk in header) {
                    val l = laid(blk, contentW, room) ?: continue
                    l.draw(c, left, hy)
                    hy += l.height
                }
                t = maxOf(t, hy)
            }
            if (footer.isNotEmpty()) {
                val ls = footer.mapNotNull { laid(it, contentW, room) }
                var fy = pageH - sec.footerFrom - ls.sumOf { it.height.toDouble() }.toFloat()
                b = minOf(b, fy)
                for (l in ls) {
                    l.draw(c, left, fy)
                    fy += l.height
                }
            }
            // Room for at least half an inch of body, whatever the header and footer take.
            if (b - t < 36f) b = minOf(pageH.toFloat(), t + 36f)
            top = t
            bottom = b
            y = t
        }

        fun place(b: DBlock) {
            if (b is DBreak) {
                newPage()
                return
            }
            if (b is DPara && b.pageBreakBefore && y > top + 0.01f) newPage()
            val l = laid(b, contentW, bottom - top) ?: return
            var from = if (y <= top + 0.01f && b is DPara) minOf(b.spaceBefore, l.height) else 0f
            while (true) {
                val room = bottom - y
                if (l.height - from <= room + 0.01f) {
                    slice(l, from, l.height)
                    y += l.height - from
                    return
                }
                val cut = l.breaks.lastOrNull { it > from + 0.01f && it - from <= room + 0.01f }
                if (cut == null) {
                    if (y > top + 0.01f) {
                        newPage()
                        if (from == 0f && b is DPara) from = minOf(b.spaceBefore, l.height)
                        continue
                    }
                    // Nothing fits even on an empty page (a line taller than the page): cut at the page end.
                    slice(l, from, from + room)
                    from += room
                    newPage()
                    continue
                }
                slice(l, from, cut)
                from = cut
                newPage()
            }
        }

        fun slice(l: Laid, from: Float, to: Float) {
            c.save()
            c.clipRect(0f, y, pageW.toFloat(), y + (to - from))
            l.draw(c, sec.margins.left, y - from)
            c.restore()
        }

        fun laid(b: DBlock, width: Float, maxH: Float): Laid? = laid(b, width, maxH, art)

    }

    /** What paragraphs and tables draw with: the page number, the file's pictures, and whether one was missed. */
    internal class Art(val media: Map<String, ByteArray>) {
        var page = 0
        var missed = false
        /** Printed size of one point drawn (a slide is scaled onto its page). */
        var scale = 1f

        /** A box [w] × [h] shrunk (keeping its shape) to fit [maxW] × [maxH]. */
        fun fit(w: Float, h: Float, maxW: Float, maxH: Float): Pair<Float, Float> {
            val ww = w.coerceAtLeast(1f)
            val hh = h.coerceAtLeast(1f)
            val s = minOf(1f, maxW / ww, maxH * 0.98f / hh)
            return ww * s to hh * s
        }

        /** Picture [key] in the box; [crop]: fractions of the picture cut from each side. */
        fun picture(c: Canvas, key: String, x: Float, top: Float, w: Float, h: Float, crop: Insets4? = null) {
            val keepW = 1f - (crop?.let { it.left + it.right } ?: 0f)
            val keepH = 1f - (crop?.let { it.top + it.bottom } ?: 0f)
            val bmp = if (keepW > 0.01f && keepH > 0.01f) decode(key, w / keepW, h / keepH) else null
            if (bmp == null) {
                missed = true
                placeholder(c, "Picture", x, top, w, h)
                return
            }
            val src = crop?.let {
                android.graphics.Rect(
                    (it.left * bmp.width).roundToInt(), (it.top * bmp.height).roundToInt(),
                    ((1f - it.right) * bmp.width).roundToInt(), ((1f - it.bottom) * bmp.height).roundToInt(),
                )
            }
            c.drawBitmap(bmp, src, RectF(x, top, x + w, top + h), Paint(Paint.FILTER_BITMAP_FLAG))
            bmp.recycle()
        }

        /** The picture at up to 300 dpi of its printed size (never more than 24 MP, never enlarged). */
        fun decode(key: String, w: Float, h: Float): Bitmap? {
            val bytes = media[key] ?: return null
            val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
            if (o.outWidth <= 0 || o.outHeight <= 0) return null
            val tw = w * scale / 72f * DPI
            val th = h * scale / 72f * DPI
            var sample = 1
            while (o.outWidth / (sample * 2) >= tw && o.outHeight / (sample * 2) >= th) sample *= 2
            while ((o.outWidth / sample).toLong() * (o.outHeight / sample) > MAX_PIXELS) sample *= 2
            val bmp = runCatching {
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            }.getOrNull() ?: return null
            // Halving stops above the size needed; finish at exactly 300 dpi of the printed size (round 9 review: a
            // Word file of phone photos made a 100 MB print file). Never enlarged.
            val s = maxOf(tw / bmp.width, th / bmp.height)
            if (s >= 0.95f) return bmp
            val w2 = (bmp.width * s).roundToInt().coerceAtLeast(1)
            val h2 = (bmp.height * s).roundToInt().coerceAtLeast(1)
            return runCatching { Bitmap.createScaledBitmap(bmp, w2, h2, true) }.getOrNull()?.also { if (it !== bmp) bmp.recycle() } ?: bmp
        }

        fun placeholder(c: Canvas, label: String, x: Float, top: Float, w: Float, h: Float) {
            val r = RectF(x, top, x + w, top + h)
            c.drawRect(r, Paint().apply { color = 0xFFEEEEEE.toInt() })
            c.drawRect(r, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 0.75f; color = 0xFF9E9E9E.toInt() })
            val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = 0xFF616161.toInt()
                textSize = minOf(14f, h / 3f).coerceAtLeast(4f)
                typeface = Typeface.SANS_SERIF
                textAlign = Paint.Align.CENTER
            }
            c.drawText(label, x + w / 2, top + h / 2 + tp.textSize / 3, tp)
        }
    }

    /** [b] laid out at [width] (pictures no taller than [maxH]); a page break lays out as nothing. */
    internal fun laid(b: DBlock, width: Float, maxH: Float, art: Art): Laid? = when (b) {
        is DPara -> ParaLaid(b, width, maxH, art)
        is DTable -> TableLaid(b, width, maxH, art)
        DBreak -> null
    }

    // ---- paragraphs (Word pages and slides) ----

    internal class ParaLaid(val p: DPara, width: Float, maxH: Float, val art: Art) : Laid() {
        val layout: StaticLayout
        val base: Float
        val labelX: Float
        val labelPaint: TextPaint?
        override val height: Float
        override val breaks: FloatArray

        init {
            val firstText = p.runs.filterIsInstance<DText>().firstOrNull()
            labelPaint = p.label?.let {
                TextPaint(Paint.ANTI_ALIAS_FLAG).also { lp ->
                    val t = firstText ?: DText("", sizePt = p.markSizePt)
                    RunSpan(t.copy(underline = false, strike = false, highlight = null, superSub = SuperSub.NONE)).apply(lp)
                    lp.color = t.color
                }
            }
            labelX = p.indentLeft + p.indentFirst
            val textFirst = if (labelPaint != null) {
                val after = labelX + labelPaint.measureText(p.label) + maxOf(3f, labelPaint.textSize * 0.3f)
                if (p.indentFirst < 0) maxOf(p.indentLeft, after) else after
            } else {
                p.indentLeft + p.indentFirst
            }
            base = minOf(textFirst, p.indentLeft, labelX)
            val w = (width - p.indentRight - base).coerceAtLeast(10f)
            val text = build(w, maxH)
            text.setSpan(
                LeadingMarginSpan.Standard((textFirst - base).roundToInt(), (p.indentLeft - base).roundToInt()),
                0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE,
            )
            var k = 1
            while (k * TAB < w && k < 60) text.setSpan(TabStopSpan.Standard((k++ * TAB).roundToInt()), 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
            val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = p.markSizePt
                color = Color.BLACK
                typeface = Typeface.SANS_SERIF
            }
            val builder = StaticLayout.Builder.obtain(text, 0, text.length, paint, w.roundToInt())
                .setAlignment(
                    when (p.align) {
                        Align.CENTER -> Layout.Alignment.ALIGN_CENTER
                        Align.RIGHT -> Layout.Alignment.ALIGN_OPPOSITE
                        else -> Layout.Alignment.ALIGN_NORMAL
                    },
                )
                .setLineSpacing(0f, p.lineMul)
                .setIncludePad(false)
            if (p.align == Align.JUSTIFY && Build.VERSION.SDK_INT >= 26) builder.setJustificationMode(LineBreaker.JUSTIFICATION_MODE_INTER_WORD)
            layout = builder.build()
            height = p.spaceBefore + layout.height + p.spaceAfter
            breaks = FloatArray(layout.lineCount + 1) { i -> if (i < layout.lineCount) p.spaceBefore + layout.getLineBottom(i) else height }
        }

        fun build(w: Float, maxH: Float): SpannableStringBuilder {
            val sb = SpannableStringBuilder()
            var last: DText? = null
            for (r in p.runs) {
                val start = sb.length
                when (r) {
                    is DText -> {
                        sb.append(r.text)
                        sb.setSpan(RunSpan(r), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        last = r
                    }
                    is DField -> {
                        sb.append(art.page.toString())
                        sb.setSpan(RunSpan(last ?: DText("", sizePt = p.markSizePt)), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    is DImage -> {
                        val (iw, ih) = art.fit(r.wPt, r.hPt, w, maxH)
                        sb.append('￼')
                        sb.setSpan(BoxSpan(iw, ih) { c, x, t -> art.picture(c, r.mediaKey, x, t, iw, ih) }, start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    is DPlaceholder -> {
                        val (iw, ih) = art.fit(r.wPt.coerceAtLeast(72f), r.hPt.coerceAtLeast(36f), w, maxH)
                        sb.append('￼')
                        sb.setSpan(BoxSpan(iw, ih) { c, x, t -> art.placeholder(c, r.label, x, t, iw, ih) }, start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                }
            }
            return sb
        }

        override fun draw(c: Canvas, x: Float, top: Float) {
            c.save()
            c.translate(x + base, top + p.spaceBefore)
            layout.draw(c)
            if (labelPaint != null && layout.lineCount > 0) c.drawText(p.label!!, labelX - base, layout.getLineBaseline(0).toFloat(), labelPaint)
            c.restore()
        }
    }

    // ---- tables ----

    internal class TableLaid(val t: DTable, width: Float, val maxH: Float, val art: Art) : Laid() {
        val widths: FloatArray
        val colX: FloatArray
        val rowTop: FloatArray
        /** Each cell: its row, first column, the rows it covers, and its laid-out blocks. */
        inner class Cell(val row: Int, val col: Int, val cell: DCell, var lastRow: Int, val blocks: List<Laid>) {
            val contentH = blocks.sumOf { it.height.toDouble() }.toFloat()
        }
        val cells = ArrayList<Cell>()
        override val height: Float
        override val breaks: FloatArray

        init {
            val ncol = maxOf(t.colWidths.size, t.rows.maxOfOrNull { r -> r.cells.sumOf { it.span } } ?: 0).coerceAtLeast(1)
            val given = FloatArray(ncol) { t.colWidths.getOrNull(it) ?: 0f }
            val known = given.filter { it > 0f }
            val fill = if (known.isEmpty()) width / ncol else ((width - known.sum()) / (ncol - known.size).coerceAtLeast(1)).coerceAtLeast(18f)
            for (i in given.indices) if (given[i] <= 0f) given[i] = fill
            val sum = given.sum()
            if (sum > width) for (i in given.indices) given[i] *= width / sum
            widths = given
            colX = FloatArray(ncol + 1).also { for (i in 0 until ncol) it[i + 1] = it[i] + widths[i] }

            val natural = FloatArray(t.rows.size)
            val open = HashMap<Int, Cell>() // column → the merged cell still open there
            t.rows.forEachIndexed { r, row ->
                var col = 0
                for (dc in row.cells) {
                    val c0 = col.coerceAtMost(ncol - 1)
                    val c1 = (col + dc.span).coerceAtMost(ncol)
                    col += dc.span
                    if (dc.vMerge == VMerge.CONTINUE) {
                        open[c0]?.let { it.lastRow = r }
                        continue
                    }
                    val cw = (colX[c1] - colX[c0] - 2 * CELL_PAD).coerceAtLeast(6f)
                    val laid = dc.blocks.mapNotNull { laid(it, cw, maxH, art) }
                    val cell = Cell(r, c0, dc, r, laid)
                    cells += cell
                    if (dc.vMerge == VMerge.RESTART) open[c0] = cell else open.remove(c0)
                    if (dc.vMerge != VMerge.RESTART) natural[r] = maxOf(natural[r], cell.contentH)
                }
                natural[r] = maxOf(natural[r], row.minHeight, 4f)
            }
            // A merged cell taller than its rows makes its last row taller.
            for (cell in cells) if (cell.cell.vMerge == VMerge.RESTART) {
                val have = (cell.row..cell.lastRow).sumOf { natural[it].toDouble() }.toFloat()
                if (cell.contentH > have) natural[cell.lastRow] += cell.contentH - have
            }
            rowTop = FloatArray(t.rows.size + 1).also { for (i in t.rows.indices) it[i + 1] = it[i] + natural[i] }
            height = rowTop.last()
            // Row ends, and inside a row the places where no cell's line is cut.
            val pts = sortedSetOf<Float>()
            for (r in t.rows.indices) {
                pts += rowTop[r + 1]
                val inRow = cells.filter { it.row == r && it.cell.vMerge != VMerge.RESTART }
                val candidates = inRow.flatMap { c -> stacked(c).map { rowTop[r] + it } }
                for (y in candidates) if (y < rowTop[r + 1] && inRow.all { safe(it, y - rowTop[r]) }) pts += y
            }
            breaks = pts.toFloatArray()
        }

        /** A cell's split points from its top. */
        fun stacked(c: Cell): List<Float> {
            val out = ArrayList<Float>()
            var off = 0f
            for (b in c.blocks) {
                for (br in b.breaks) out += off + br
                off += b.height
            }
            return out
        }

        fun safe(c: Cell, y: Float) = y >= c.contentH - 0.01f || stacked(c).any { kotlin.math.abs(it - y) < 0.01f }

        override fun draw(c: Canvas, x: Float, top: Float) {
            val fillPaint = Paint()
            for (cell in cells) cell.cell.fill?.let {
                fillPaint.color = it
                c.drawRect(x + colX[cell.col], top + rowTop[cell.row], x + colX[spanEnd(cell)], top + rowTop[cell.lastRow + 1], fillPaint)
            }
            for (cell in cells) {
                var y = top + rowTop[cell.row]
                for (b in cell.blocks) {
                    b.draw(c, x + colX[cell.col] + CELL_PAD, y)
                    y += b.height
                }
            }
            val line = Paint().apply {
                color = Color.BLACK
                strokeWidth = BORDER
                style = Paint.Style.STROKE
            }
            for (cell in cells) {
                val l = x + colX[cell.col]
                val r = x + colX[spanEnd(cell)]
                val t0 = top + rowTop[cell.row]
                val b0 = top + rowTop[cell.lastRow + 1]
                val bd = cell.cell.borders
                if (bd.top) c.drawLine(l, t0, r, t0, line)
                if (bd.bottom) c.drawLine(l, b0, r, b0, line)
                if (bd.left) c.drawLine(l, t0, l, b0, line)
                if (bd.right) c.drawLine(r, t0, r, b0, line)
            }
        }

        fun spanEnd(cell: Cell) = (cell.col + cell.cell.span).coerceAtMost(widths.size)
    }

    /** A text run's look: size, family, bold and italic, raised or lowered, colour, underline, strike, highlight. */
    private class RunSpan(val t: DText) : MetricAffectingSpan() {
        fun apply(p: TextPaint) {
            val style = when {
                t.bold && t.italic -> Typeface.BOLD_ITALIC
                t.bold -> Typeface.BOLD
                t.italic -> Typeface.ITALIC
                else -> Typeface.NORMAL
            }
            val face = Typeface.create(
                when (t.family) {
                    Family.SERIF -> Typeface.SERIF
                    Family.MONO -> Typeface.MONOSPACE
                    Family.SANS -> Typeface.SANS_SERIF
                },
                style,
            )
            p.typeface = face
            p.isFakeBoldText = t.bold && !face.isBold
            p.textSkewX = if (t.italic && !face.isItalic) -0.25f else 0f
            val size = t.sizePt.coerceIn(1f, 400f)
            when (t.superSub) {
                SuperSub.SUPER -> {
                    p.textSize = size * 0.65f
                    p.baselineShift -= (size * 0.33f).roundToInt()
                }
                SuperSub.SUB -> {
                    p.textSize = size * 0.65f
                    p.baselineShift += (size * 0.15f).roundToInt()
                }
                SuperSub.NONE -> p.textSize = size
            }
        }

        override fun updateMeasureState(p: TextPaint) = apply(p)

        override fun updateDrawState(p: TextPaint) {
            apply(p)
            p.color = t.color
            p.isUnderlineText = t.underline
            p.isStrikeThruText = t.strike
            if (t.highlight != null) p.bgColor = t.highlight
        }
    }

    /** A picture or a marked box in a line of text, [w] × [h] points, sitting on the line. */
    private class BoxSpan(val w: Float, val h: Float, val paint: (Canvas, Float, Float) -> Unit) : ReplacementSpan() {
        override fun getSize(p: Paint, text: CharSequence?, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
            if (fm != null) {
                fm.ascent = -ceil(h).toInt()
                fm.top = fm.ascent
                fm.descent = 0
                fm.bottom = 0
            }
            return ceil(w).toInt()
        }

        override fun draw(c: Canvas, text: CharSequence?, start: Int, end: Int, x: Float, top: Int, y: Int, bottom: Int, p: Paint) =
            paint(c, x, y - h)
    }
}
