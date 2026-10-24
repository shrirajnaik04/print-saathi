package `in`.printsaathi.app.engine.card

import kotlin.math.floor

/**
 * Straightens a card (Phase 14): every output pixel is read from the photo through the card's homography, with
 * bilinear sampling. Where the corners reach outside the photo the output is white paper, never garbage.
 */
object Warp {
    private const val WHITE = 0xffffffff.toInt()

    /** [src]: ARGB pixels [sw]×[sh]; [quadPx]: the card's corners in the photo's pixels (TL, TR, BR, BL). */
    fun warp(src: IntArray, sw: Int, sh: Int, quadPx: DoubleArray, outW: Int, outH: Int): IntArray {
        require(src.size == sw * sh && outW > 0 && outH > 0) { "sizes" }
        val h = Homography.fromRectToQuad(outW.toDouble(), outH.toDouble(), quadPx)
        val out = IntArray(outW * outH)
        for (y in 0 until outH) {
            for (x in 0 until outW) {
                val (fx, fy) = h.map(x + 0.5, y + 0.5)
                out[y * outW + x] = sample(src, sw, sh, fx - 0.5, fy - 0.5)
            }
        }
        return out
    }

    /** Bilinear at (x, y) in pixel-centre coordinates; white outside the photo. */
    fun sample(src: IntArray, sw: Int, sh: Int, x: Double, y: Double): Int {
        if (!(x >= -0.5 && y >= -0.5 && x <= sw - 0.5 && y <= sh - 0.5)) return WHITE
        val x0 = floor(x).toInt().coerceIn(0, sw - 1)
        val y0 = floor(y).toInt().coerceIn(0, sh - 1)
        val x1 = (x0 + 1).coerceAtMost(sw - 1)
        val y1 = (y0 + 1).coerceAtMost(sh - 1)
        val ax = (x - x0).coerceIn(0.0, 1.0)
        val ay = (y - y0).coerceIn(0.0, 1.0)
        val p00 = src[y0 * sw + x0]
        val p10 = src[y0 * sw + x1]
        val p01 = src[y1 * sw + x0]
        val p11 = src[y1 * sw + x1]
        fun ch(shift: Int): Int {
            val a = ((p00 shr shift) and 0xff) * (1 - ax) + ((p10 shr shift) and 0xff) * ax
            val b = ((p01 shr shift) and 0xff) * (1 - ax) + ((p11 shr shift) and 0xff) * ax
            return (a * (1 - ay) + b * ay + 0.5).toInt().coerceIn(0, 255)
        }
        return (0xff shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
    }
}
