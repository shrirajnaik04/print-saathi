package `in`.printsaathi.app.engine.isolated

import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.os.ParcelFileDescriptor
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import `in`.printsaathi.app.engine.text.WhatsAppMarks
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * Runs INSIDE the isolated engine (owner, round 8: a customer's WhatsApp message printed): the text as an A4 PDF,
 * like Word — margins 12.7 mm (Narrow), black, line spacing 1.15, left aligned, the phone's own fonts (so Marathi
 * and Hindi print), WhatsApp's marks as bold / italic / struck / fixed-width. Real text (vector), not a picture.
 */
object TextPdf {
    /** A4 in whole points (Android's PdfDocument takes integer page sizes). */
    const val PAGE_W = 595
    const val PAGE_H = 842
    private const val MARGIN = 36f // 12.7 mm
    private const val LINE_SPACING = 1.15f

    /** Longest message printed (the app refuses more first: "This message is too long to print here."). */
    const val MAX_CHARS = 100_000
    private const val MAX_BYTES = MAX_CHARS * 4
    val SIZES_TENTHS = intArrayOf(100, 120, 140, 180)

    /** The text in [src] (UTF-8) as a PDF in [dst] at [sizeTenthsPt]; {pages}, or {-code} via the engine's call. */
    fun write(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, sizeTenthsPt: Int): IntArray {
        if (sizeTenthsPt !in SIZES_TENTHS) throw BadRequest("text size")
        val bytes = FileInputStream(src.fileDescriptor).use { it.readNBytesCompat(MAX_BYTES + 1) }
        if (bytes.size > MAX_BYTES) throw BadRequest("text too long")
        val text = String(bytes, Charsets.UTF_8)
        if (text.isBlank() || text.length > MAX_CHARS) throw BadRequest("text empty or too long")
        val pages = FileOutputStream(dst.fileDescriptor).use { render(text, sizeTenthsPt / 10f, it) }
        return intArrayOf(pages)
    }

    /** Lays [text] out at [sizePt] on A4 pages written to [out]; the number of pages. */
    fun render(text: String, sizePt: Float, out: OutputStream): Int {
        val ss = SpannableStringBuilder()
        for (r in WhatsAppMarks.parse(text.replace("\r\n", "\n").replace('\r', '\n'))) {
            val start = ss.length
            ss.append(r.text)
            val end = ss.length
            val face = when {
                r.bold && r.italic -> Typeface.BOLD_ITALIC
                r.bold -> Typeface.BOLD
                r.italic -> Typeface.ITALIC
                else -> null
            }
            if (face != null) ss.setSpan(StyleSpan(face), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (r.strike) ss.setSpan(StrikethroughSpan(), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (r.mono) ss.setSpan(TypefaceSpan("monospace"), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = sizePt
            color = Color.BLACK
            typeface = Typeface.SANS_SERIF
        }
        val width = (PAGE_W - 2 * MARGIN).toInt()
        val layout = StaticLayout.Builder.obtain(ss, 0, ss.length, paint, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setLineSpacing(0f, LINE_SPACING)
            .setIncludePad(false)
            .build()
        val room = PAGE_H - 2 * MARGIN
        val doc = PdfDocument()
        try {
            var line = 0
            var page = 0
            while (line < layout.lineCount) {
                val top = layout.getLineTop(line)
                var end = line
                while (end < layout.lineCount && layout.getLineBottom(end) - top <= room) end++
                if (end == line) end = line + 1 // a line taller than a page still prints, cut
                val p = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, ++page).create())
                val c = p.canvas
                c.save()
                c.translate(MARGIN, MARGIN - top)
                c.clipRect(0f, top.toFloat(), width.toFloat(), layout.getLineBottom(end - 1).toFloat())
                layout.draw(c)
                c.restore()
                doc.finishPage(p)
                line = end
            }
            doc.writeTo(out)
            return page
        } finally {
            doc.close()
        }
    }

    /** InputStream.readNBytes is Android 13+; this phone may be Android 7. */
    private fun FileInputStream.readNBytesCompat(n: Int): ByteArray {
        val buf = java.io.ByteArrayOutputStream()
        val chunk = ByteArray(64 * 1024)
        while (buf.size() < n) {
            val r = read(chunk, 0, minOf(chunk.size, n - buf.size()))
            if (r < 0) break
            buf.write(chunk, 0, r)
        }
        return buf.toByteArray()
    }
}
