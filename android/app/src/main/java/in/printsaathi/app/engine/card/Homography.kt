package `in`.printsaathi.app.engine.card

import kotlin.math.abs

/**
 * A projective map from an output rectangle (0..w × 0..h) onto a card's four corners in the photo (Phase 14, spec
 * Part 2): the straightened card's pixel (x, y) is read from the photo at [map]. Square-to-quad (Heckbert 1989),
 * scaled to the rectangle.
 */
class Homography private constructor(private val m: DoubleArray, private val w: Double, private val h: Double) {
    fun map(x: Double, y: Double): Pair<Double, Double> {
        val u = x / w
        val v = y / h
        val d = m[6] * u + m[7] * v + 1.0
        return ((m[0] * u + m[1] * v + m[2]) / d) to ((m[3] * u + m[4] * v + m[5]) / d)
    }

    companion object {
        /** [quad]: x0,y0 … x3,y3 in order top-left, top-right, bottom-right, bottom-left. */
        fun fromRectToQuad(w: Double, h: Double, quad: DoubleArray): Homography {
            require(quad.size == 8 && quad.all { it.isFinite() }) { "a quad is 4 corners" }
            require(w > 0 && h > 0) { "empty rectangle" }
            require(!degenerate(quad)) { "three corners in a line" }
            val (x0, y0) = quad[0] to quad[1]
            val (x1, y1) = quad[2] to quad[3]
            val (x2, y2) = quad[4] to quad[5]
            val (x3, y3) = quad[6] to quad[7]
            val sx = x0 - x1 + x2 - x3
            val sy = y0 - y1 + y2 - y3
            val m = if (abs(sx) < 1e-12 && abs(sy) < 1e-12) {
                doubleArrayOf(x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0.0, 0.0)
            } else {
                val dx1 = x1 - x2
                val dx2 = x3 - x2
                val dy1 = y1 - y2
                val dy2 = y3 - y2
                val den = dx1 * dy2 - dx2 * dy1
                require(abs(den) > 1e-12) { "three corners in a line" }
                val g = (sx * dy2 - dx2 * sy) / den
                val hh = (dx1 * sy - sx * dy1) / den
                doubleArrayOf(
                    x1 - x0 + g * x1, x3 - x0 + hh * x3, x0,
                    y1 - y0 + g * y1, y3 - y0 + hh * y3, y0,
                    g, hh,
                )
            }
            return Homography(m, w, h)
        }

        /** Any three of the corners (nearly) on one line: no card shape. */
        fun degenerate(q: DoubleArray): Boolean {
            val scale = maxOf(1.0, (0 until 4).maxOf { maxOf(abs(q[2 * it]), abs(q[2 * it + 1])) })
            for (a in 0 until 4) {
                val b = (a + 1) % 4
                val c = (a + 2) % 4
                val cross = (q[2 * b] - q[2 * a]) * (q[2 * c + 1] - q[2 * a + 1]) - (q[2 * b + 1] - q[2 * a + 1]) * (q[2 * c] - q[2 * a])
                if (abs(cross) < 1e-6 * scale * scale) return true
            }
            return false
        }
    }
}
