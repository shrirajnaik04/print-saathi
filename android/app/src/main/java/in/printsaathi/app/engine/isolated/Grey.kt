package `in`.printsaathi.app.engine.isolated

/**
 * Black & white (PLAN §F4, §G2): Rec.601 grey. Pixels are made exactly grey (R = G = B) before the normal JPEG
 * encoder runs; its RGB -> YCbCr maths then gives neutral chroma, so the print file carries grey data only.
 * (Android's YuvImage encoder was tried first and tinted the right edge of widths that are not a multiple of 16.)
 */
object Grey {
    /** Y = 0.299 R + 0.587 G + 0.114 B, rounded (integer weights summing to 1000). */
    fun luma(argb: Int): Int {
        val r = (argb shr 16) and 0xFF
        val g = (argb shr 8) and 0xFF
        val b = argb and 0xFF
        return (299 * r + 587 * g + 114 * b + 500) / 1000
    }

    /** Turns the first [n] pixels of [row] into opaque grey of their luma, in place. */
    fun toGrey(row: IntArray, n: Int) {
        for (i in 0 until n) {
            val l = luma(row[i])
            row[i] = (0xFF shl 24) or (l shl 16) or (l shl 8) or l
        }
    }
}
