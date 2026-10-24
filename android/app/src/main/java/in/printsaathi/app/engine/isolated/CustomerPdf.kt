package `in`.printsaathi.app.engine.isolated

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.LoadParams
import android.graphics.pdf.PdfRenderer
import android.graphics.pdf.PdfRendererPreV
import android.graphics.pdf.RenderParams
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.annotation.RequiresApi
import androidx.annotation.RequiresExtension
import `in`.printsaathi.app.engine.PdfUnlockTier
import java.io.Closeable
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Runs INSIDE the isolated engine (PLAN §G4, §G5): a customer's PDF, opened with the strongest built-in engine this
 * phone has (password in memory only, for this call). [facts] gives the page count, page sizes and whether forms or
 * stamps were seen; [renderPage] draws one page onto white for printing (300 dpi of its box, chosen by the caller).
 * Errors are PdfOpen's codes (-101 password, -102 unsupported, -103 damaged); never messages, never paths.
 */
object CustomerPdf {
    /** Sizes are returned for at most this many pages (the plan's page limit). */
    const val MAX_SIZED_PAGES = 500

    const val FLAG_FORMS_OR_STAMPS = 1

    /** One opened PDF, whichever built-in engine opened it. */
    private interface Doc : Closeable {
        val pages: Int

        /** Page [i] size in points, as shown (after the page's own rotation). */
        fun size(i: Int): Pair<Int, Int>

        fun render(i: Int, bmp: Bitmap)

        /** Page [i] onto [bmp] through [m] (page points → bitmap pixels). */
        fun render(i: Int, bmp: Bitmap, m: android.graphics.Matrix)
    }

    /**
     * Phase 14: opens [page] of a customer PDF and hands [block] its size in points and a way to draw it (onto a
     * bitmap, through a transform or fitted). Errors are PdfOpen's codes, as for [renderPage].
     */
    fun withPage(
        pdf: ParcelFileDescriptor,
        password: String,
        page: Int,
        block: (pw: Double, ph: Double, draw: (Bitmap, android.graphics.Matrix?) -> Unit) -> IntArray,
    ): IntArray = guarded {
        open(pdf, password).use { d ->
            require(page in 0 until d.pages) { "no such page" }
            val (pw, ph) = d.size(page)
            require(pw > 0 && ph > 0) { "empty page" }
            block(pw.toDouble(), ph.toDouble()) { bmp, m -> if (m == null) d.render(page, bmp) else d.render(page, bmp, m) }
        }
    }

    @SuppressLint("NewApi") // each branch is gated by tier(), which checks the API level / extension first
    private fun open(pdf: ParcelFileDescriptor, password: String): Doc = when (PdfOpen.tier()) {
        PdfUnlockTier.NATIVE_35 -> Native35(pdf, password)
        PdfUnlockTier.PRE_V -> PreV(pdf, password)
        PdfUnlockTier.NONE -> Classic(pdf)
    }

    /** {pages, flags, w1, h1, w2, h2, …} or {code}. */
    fun facts(pdf: ParcelFileDescriptor, password: String): IntArray = guarded {
        val flags = if (formsOrStamps(pdf)) FLAG_FORMS_OR_STAMPS else 0
        open(pdf, password).use { d ->
            require(d.pages > 0) { "no pages" }
            val n = minOf(d.pages, MAX_SIZED_PAGES)
            val out = IntArray(2 + 2 * n)
            out[0] = d.pages
            out[1] = flags
            for (i in 0 until n) {
                val (w, h) = d.size(i)
                require(w > 0 && h > 0) { "empty page" }
                out[2 + 2 * i] = w
                out[3 + 2 * i] = h
            }
            out
        }
    }

    const val MODE_COLOUR_JPEG = 0
    const val MODE_GREY_JPEG = 1
    const val MODE_GREY_RAW = 2
    const val MODE_ONE_BIT = 3

    /**
     * Page [page] onto white, long side [maxLongSide] px, in print [style] (Styles). [mode]: colour JPEG [quality],
     * grey JPEG, raw 8-bit grey rows (lossless; the app compresses them) or raw 1-bit rows (OCV Black). {w, h} or {code}.
     */
    fun renderPage(
        pdf: ParcelFileDescriptor,
        password: String,
        page: Int,
        dst: ParcelFileDescriptor,
        maxLongSide: Int,
        quality: Int,
        mode: Int,
        style: Int = if (mode == MODE_COLOUR_JPEG) Styles.ORIGINAL else Styles.BW,
    ): IntArray {
        // The output fits the style: colour styles as colour JPEG, grey styles as grey, OCV Black as 1-bit. Checked
        // before the file is touched: a wrong request is never reported as a damaged PDF (gate M6).
        val fits = when (mode) {
            MODE_COLOUR_JPEG -> style in Styles.ORIGINAL..Styles.SOFT
            MODE_GREY_JPEG, MODE_GREY_RAW -> style == Styles.BW || style == Styles.SHARP
            MODE_ONE_BIT -> style == Styles.OCV
            else -> false
        }
        if (!fits) throw BadRequest("mode and style")
        return renderChecked(pdf, password, page, dst, maxLongSide, quality, mode, style)
    }

    private fun renderChecked(
        pdf: ParcelFileDescriptor,
        password: String,
        page: Int,
        dst: ParcelFileDescriptor,
        maxLongSide: Int,
        quality: Int,
        mode: Int,
        style: Int,
    ): IntArray = guarded {
        open(pdf, password).use { d ->
            require(page in 0 until d.pages) { "no such page" }
            val (pw, ph) = d.size(page)
            require(pw > 0 && ph > 0) { "empty page" }
            val scale = maxLongSide.toDouble() / max(pw, ph)
            val w = max(1, (pw * scale).roundToInt())
            val h = max(1, (ph * scale).roundToInt())
            // One page bitmap at print size: within the decode budget (an A4 page at 300 dpi is 8.7 MP).
            if (w.toLong() * h > JpegScan.progressiveBudgetPixels(memTotal())) throw TooBigForThisPhone()
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
            try {
                d.render(page, bmp)
                FileOutputStream(dst.fileDescriptor).use { out ->
                    when (mode) {
                        // One pass, straight to bytes: the grey values are never written back into the bitmap.
                        MODE_GREY_RAW -> StyleOutput.greyRows(bmp, style, out)
                        MODE_ONE_BIT -> StyleOutput.oneBit(bmp, out)
                        else -> {
                            StyleOutput.apply(bmp, style)
                            check(bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)) { "encode failed" }
                        }
                    }
                }
            } finally {
                bmp.recycle()
            }
            intArrayOf(w, h)
        }
    }

    /** A password problem, an unsupported file or a damaged one: PdfOpen's codes (TooBig and OOM pass through). */
    private fun guarded(block: () -> IntArray): IntArray = try {
        block()
    } catch (e: SecurityException) {
        intArrayOf(PdfOpen.PASSWORD_REQUIRED)
    } catch (e: UnsupportedOperationException) {
        intArrayOf(PdfOpen.UNSUPPORTED)
    } catch (e: IOException) {
        intArrayOf(PdfOpen.DAMAGED)
    } catch (e: IllegalArgumentException) {
        intArrayOf(PdfOpen.DAMAGED)
    } catch (e: IllegalStateException) {
        intArrayOf(PdfOpen.DAMAGED)
    }

    private fun memTotal(): Long = runCatching {
        java.io.File("/proc/meminfo").useLines { l -> l.first { it.startsWith("MemTotal:") }.filter(Char::isDigit).toLong() * 1024 }
    }.getOrDefault(-1L)

    /**
     * Best-effort scan for form fields or annotations (PLAN §G4: older built-in engines don't draw them). Reads by
     * position, so the renderer's file offset is untouched; compressed object streams can hide them (best effort).
     */
    private fun formsOrStamps(pdf: ParcelFileDescriptor): Boolean {
        val ch = FileInputStream(pdf.fileDescriptor).channel
        val buf = ByteBuffer.allocate(64 * 1024)
        var pos = 0L
        var tail = ByteArray(0)
        while (true) {
            buf.clear()
            val n = ch.read(buf, pos)
            if (n <= 0) return false
            val chunk = tail + buf.array().copyOf(n)
            if (PdfMarks.formsOrStamps(chunk)) return true
            tail = chunk.copyOfRange(maxOf(0, chunk.size - PdfMarks.OVERLAP), chunk.size)
            pos += n
        }
    }

    @RequiresApi(35)
    private class Native35(pdf: ParcelFileDescriptor, password: String) : Doc {
        private val r = PdfRenderer(pdf, LoadParams.Builder().setPassword(password).build())
        override val pages get() = r.pageCount
        override fun size(i: Int) = r.openPage(i).use { it.width to it.height }
        override fun render(i: Int, bmp: Bitmap) = r.openPage(i).use { it.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT) }
        override fun render(i: Int, bmp: Bitmap, m: android.graphics.Matrix) = r.openPage(i).use { it.render(bmp, null, m, PdfRenderer.Page.RENDER_MODE_FOR_PRINT) }
        override fun close() = r.close()
    }

    @RequiresExtension(extension = Build.VERSION_CODES.S, version = 13)
    private class PreV(pdf: ParcelFileDescriptor, password: String) : Doc {
        private val r = PdfRendererPreV(pdf, LoadParams.Builder().setPassword(password).build())
        override val pages get() = r.pageCount
        override fun size(i: Int) = r.openPage(i).use { it.width to it.height }
        override fun render(i: Int, bmp: Bitmap) = r.openPage(i).use {
            it.render(bmp, null, null, RenderParams.Builder(RenderParams.RENDER_MODE_FOR_PRINT).build())
        }
        override fun render(i: Int, bmp: Bitmap, m: android.graphics.Matrix) = r.openPage(i).use {
            it.render(bmp, null, m, RenderParams.Builder(RenderParams.RENDER_MODE_FOR_PRINT).build())
        }
        override fun close() = r.close()
    }

    /** No password support: an encrypted file throws SecurityException (PASSWORD_REQUIRED). */
    private class Classic(pdf: ParcelFileDescriptor) : Doc {
        private val r = PdfRenderer(pdf)
        override val pages get() = r.pageCount
        override fun size(i: Int) = r.openPage(i).use { it.width to it.height }
        override fun render(i: Int, bmp: Bitmap) = r.openPage(i).use { it.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT) }
        override fun render(i: Int, bmp: Bitmap, m: android.graphics.Matrix) = r.openPage(i).use { it.render(bmp, null, m, PdfRenderer.Page.RENDER_MODE_FOR_PRINT) }
        override fun close() = r.close()
    }
}
