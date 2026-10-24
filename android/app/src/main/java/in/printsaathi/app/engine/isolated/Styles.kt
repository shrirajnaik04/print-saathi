package `in`.printsaathi.app.engine.isolated

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Print styles (PLAN §F4), pure functions over pixel rows so the JVM tests them with golden values. Colour styles
 * work on ARGB rows in place; Sharp Black writes exact grey (R = G = B); OCV Black turns a grey page into 1-bit rows.
 * Arithmetic stays in full precision until one final rounding (half up) and clamp. Exact rules: docs/print-styles.md.
 */
object Styles {
    const val ORIGINAL = 0
    const val VIBRANT = 1
    const val SOFT = 2
    const val BW = 3
    const val SHARP = 4
    const val OCV = 5

    /** Black & White, Sharp Black and OCV Black print grey data only. */
    fun isGrey(style: Int) = style >= BW

    private fun clamp(x: Double) = min(255.0, max(0.0, floor(x + 0.5))).toInt()

    private fun luma(r: Double, g: Double, b: Double) = 0.299 * r + 0.587 * g + 0.114 * b

    /** Vibrant: luma-preserving saturation × 1.25, then contrast × 1.08 about mid-grey. */
    fun vibrant(row: IntArray, n: Int) {
        for (i in 0 until n) {
            val p = row[i]
            var r = ((p shr 16) and 0xFF).toDouble()
            var g = ((p shr 8) and 0xFF).toDouble()
            var b = (p and 0xFF).toDouble()
            val y = luma(r, g, b)
            r = y + (r - y) * 1.25
            g = y + (g - y) * 1.25
            b = y + (b - y) * 1.25
            row[i] = pack(128 + (r - 128) * 1.08, 128 + (g - 128) * 1.08, 128 + (b - 128) * 1.08)
        }
    }

    /** Soft Tone: contrast × 0.90 about mid-grey, brightness + 6, then luma-preserving saturation × 0.92. */
    fun soft(row: IntArray, n: Int) {
        for (i in 0 until n) {
            val p = row[i]
            val r = 128 + (((p shr 16) and 0xFF) - 128) * 0.90 + 6
            val g = 128 + (((p shr 8) and 0xFF) - 128) * 0.90 + 6
            val b = 128 + ((p and 0xFF) - 128) * 0.90 + 6
            val y = luma(r, g, b)
            row[i] = pack(y + (r - y) * 0.92, y + (g - y) * 0.92, y + (b - y) * 0.92)
        }
    }

    private fun pack(r: Double, g: Double, b: Double) = (0xFF shl 24) or (clamp(r) shl 16) or (clamp(g) shl 8) or clamp(b)

    /** Sharp Black's levels: black = 5th percentile but at most 90, white = 90th percentile but at least 160. */
    data class Levels(val black: Int, val white: Int) {
        /** Grey 0..255 → stretched between black and white, then gamma 0.85 (output = t^(1/0.85): darker mid-greys). */
        internal val lut: IntArray by lazy {
            IntArray(256) { v ->
                val t = ((v - black).toDouble() / (white - black)).coerceIn(0.0, 1.0)
                clamp(255 * t.pow(1 / 0.85))
            }
        }
    }

    /** [hist]: 256 counts of Rec.601 grey values (Grey.luma) over the whole image. */
    fun levels(hist: IntArray): Levels {
        val total = hist.fold(0L) { s, c -> s + c }
        if (total == 0L) return Levels(90, 160)
        fun percentile(p: Int): Int {
            val need = (total * p + 99) / 100 // ceil
            var cum = 0L
            for (v in 0..255) {
                cum += hist[v]
                if (cum >= need) return v
            }
            return 255
        }
        return Levels(min(percentile(5), 90), max(percentile(90), 160))
    }

    /** Sharp Black on an ARGB row: Rec.601 grey, then the levels' stretch and gamma; R = G = B. */
    fun sharp(row: IntArray, n: Int, levels: Levels) {
        val lut = levels.lut
        for (i in 0 until n) {
            val v = lut[Grey.luma(row[i])]
            row[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
        }
    }

    /**
     * OCV Black: a grey page ([grey], w × h, 0..255) → 1-bit rows packed MSB first, (w + 7) / 8 bytes a row, 1 = white,
     * 0 = black (DeviceGray), padding white.
     * 1. Background flattening: the page at 1/8 scale (the brightest value of each 8 × 8 block: paper, not ink),
     *    widened by 2 cells (thick headings) and blurred (5 × 5 box, twice), read back bilinearly; each pixel becomes
     *    255 × value / background.
     * 2. Bradley–Roth: black where the flattened value < 0.85 × its local mean (window ≈ 1/16 of the shorter side,
     *    odd, at least 15) or < 80. Local means come from a sum table per strip of [stripRows] rows plus the window's
     *    overlap, in 64-bit sums: never a whole-page table, never an overflow; the result does not depend on the strip.
     */
    fun ocv(grey: ByteArray, w: Int, h: Int, stripRows: Int = 256): ByteArray {
        require(w > 0 && h > 0 && grey.size >= w * h && stripRows > 0)
        val bg = Background(grey, w, h)
        val win = max(15, (min(w, h) / 16) or 1)
        val half = win / 2
        val stride = (w + 7) / 8
        val out = ByteArray(stride * h) { 0xFF.toByte() }
        val flatRow = IntArray(w)
        var y0 = 0
        while (y0 < h) {
            val y1 = min(h, y0 + stripRows)
            val top = max(0, y0 - half)
            val bottom = min(h, y1 + half) // exclusive
            val rows = bottom - top
            // Sum table of the flattened values over rows [top, bottom): (rows + 1) × (w + 1).
            val sums = LongArray((rows + 1) * (w + 1))
            val flat = IntArray(rows * w)
            for (r in 0 until rows) {
                bg.flatten(top + r, flatRow)
                System.arraycopy(flatRow, 0, flat, r * w, w)
                var line = 0L
                val base = (r + 1) * (w + 1)
                val above = r * (w + 1)
                for (x in 0 until w) {
                    line += flatRow[x]
                    sums[base + x + 1] = sums[above + x + 1] + line
                }
            }
            for (y in y0 until y1) {
                val ya = max(top, y - half) - top
                val yb = min(bottom - 1, y + half) - top + 1
                for (x in 0 until w) {
                    val xa = max(0, x - half)
                    val xb = min(w - 1, x + half) + 1
                    val sum = sums[yb * (w + 1) + xb] - sums[ya * (w + 1) + xb] - sums[yb * (w + 1) + xa] + sums[ya * (w + 1) + xa]
                    val count = (yb - ya).toLong() * (xb - xa)
                    val v = flat[(y - top) * w + x]
                    if (v < 80 || v * count * 100 < sum * 85) {
                        val i = y * stride + x / 8
                        out[i] = (out[i].toInt() and (0x80 shr (x % 8)).inv()).toByte()
                    }
                }
            }
            y0 = y1
        }
        return out
    }

    /** The paper's brightness at 1/8 scale, smoothed; [flatten] divides one page row by it. */
    private class Background(private val grey: ByteArray, private val w: Int, private val h: Int) {
        private val sw = (w + 7) / 8
        private val sh = (h + 7) / 8
        private val cells: DoubleArray

        init {
            val maxOf = IntArray(sw * sh)
            for (y in 0 until h) for (x in 0 until w) {
                val i = (y / 8) * sw + x / 8
                val v = grey[y * w + x].toInt() and 0xFF
                if (v > maxOf[i]) maxOf[i] = v
            }
            // Widen the paper by 2 cells (a heading stroke thicker than a cell must not count as background).
            val wide = IntArray(sw * sh)
            for (cy in 0 until sh) for (cx in 0 until sw) {
                var m = 0
                for (dy in -2..2) for (dx in -2..2) {
                    val yy = (cy + dy).coerceIn(0, sh - 1)
                    val xx = (cx + dx).coerceIn(0, sw - 1)
                    m = max(m, maxOf[yy * sw + xx])
                }
                wide[cy * sw + cx] = m
            }
            var c = DoubleArray(sw * sh) { wide[it].toDouble() }
            repeat(2) { c = blur(c) }
            cells = c
        }

        private fun blur(src: DoubleArray): DoubleArray {
            val tmp = DoubleArray(src.size)
            for (cy in 0 until sh) for (cx in 0 until sw) {
                var s = 0.0
                for (d in -2..2) s += src[cy * sw + (cx + d).coerceIn(0, sw - 1)]
                tmp[cy * sw + cx] = s / 5
            }
            val out = DoubleArray(src.size)
            for (cy in 0 until sh) for (cx in 0 until sw) {
                var s = 0.0
                for (d in -2..2) s += tmp[(cy + d).coerceIn(0, sh - 1) * sw + cx]
                out[cy * sw + cx] = s / 5
            }
            return out
        }

        private fun at(cx: Int, cy: Int) = cells[cy.coerceIn(0, sh - 1) * sw + cx.coerceIn(0, sw - 1)]

        /** Row [y] divided by the background: 255 × value / background, clamped. */
        fun flatten(y: Int, out: IntArray) {
            val fy = (y + 0.5) / 8 - 0.5
            val cy = floor(fy).toInt()
            val ty = fy - cy
            for (x in 0 until w) {
                val fx = (x + 0.5) / 8 - 0.5
                val cx = floor(fx).toInt()
                val tx = fx - cx
                val b = (at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx) * (1 - ty) + (at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx) * ty
                val v = grey[y * w + x].toInt() and 0xFF
                out[x] = clamp(255.0 * v / max(b, 1.0))
            }
        }
    }
}
