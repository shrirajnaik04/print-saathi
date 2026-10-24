package `in`.printsaathi.app.engine.isolated

import android.graphics.Bitmap
import java.io.BufferedOutputStream
import java.io.OutputStream

/**
 * Runs INSIDE the isolated engine: a print style (Styles) applied to a decoded photo or a drawn PDF page at print
 * size, row by row (PLAN §F4). The samples, the previews and the print file all come through here.
 */
internal object StyleOutput {
    /** Colour styles and Black & White / Sharp Black, in place on a mutable bitmap. OCV Black: use [oneBit]. */
    fun apply(bmp: Bitmap, style: Int) {
        require(style != Styles.OCV) { "1-bit output" }
        if (style == Styles.ORIGINAL) return
        val w = bmp.width
        val row = IntArray(w)
        val levels = if (style == Styles.SHARP) Styles.levels(histogram(bmp)) else null
        for (y in 0 until bmp.height) {
            bmp.getPixels(row, 0, w, 0, y, w, 1)
            styleRow(row, w, style, levels)
            bmp.setPixels(row, 0, w, 0, y, w, 1)
        }
    }

    /** Black & White or Sharp Black as raw 8-bit grey rows (lossless; the app compresses them). */
    fun greyRows(bmp: Bitmap, style: Int, out: OutputStream) {
        require(style == Styles.BW || style == Styles.SHARP) { "grey style" }
        val w = bmp.width
        val row = IntArray(w)
        val bytes = ByteArray(w)
        val levels = if (style == Styles.SHARP) Styles.levels(histogram(bmp)) else null
        val buffered = BufferedOutputStream(out, 256 * 1024)
        for (y in 0 until bmp.height) {
            bmp.getPixels(row, 0, w, 0, y, w, 1)
            styleRow(row, w, style, levels)
            for (x in 0 until w) bytes[x] = row[x].toByte() // R = G = B: take blue
            buffered.write(bytes)
        }
        buffered.flush()
    }

    /**
     * OCV Black: 1-bit rows (MSB first, padded to bytes, 0 = black). Takes [bmp] over: it is recycled as soon as its
     * grey copy is made, so an A4 page at 300 dpi never holds the 35 MB colour page and the threshold's tables at once
     * (gate I1: Android 7 keeps bitmap pixels in the engine's Java heap).
     */
    fun oneBit(bmp: Bitmap, out: OutputStream) {
        val w = bmp.width
        val h = bmp.height
        val grey = ByteArray(w * h)
        val row = IntArray(w)
        for (y in 0 until h) {
            bmp.getPixels(row, 0, w, 0, y, w, 1)
            for (x in 0 until w) grey[y * w + x] = Grey.luma(row[x]).toByte()
        }
        bmp.recycle()
        out.write(Styles.ocv(grey, w, h))
        out.flush()
    }

    private fun styleRow(row: IntArray, n: Int, style: Int, levels: Styles.Levels?) {
        when (style) {
            Styles.VIBRANT -> Styles.vibrant(row, n)
            Styles.SOFT -> Styles.soft(row, n)
            Styles.BW -> Grey.toGrey(row, n)
            Styles.SHARP -> Styles.sharp(row, n, levels ?: Styles.levels(IntArray(256)))
            else -> Unit
        }
    }

    private fun histogram(bmp: Bitmap): IntArray {
        val hist = IntArray(256)
        val row = IntArray(bmp.width)
        for (y in 0 until bmp.height) {
            bmp.getPixels(row, 0, bmp.width, 0, y, bmp.width, 1)
            for (p in row) hist[Grey.luma(p)]++
        }
        return hist
    }
}
