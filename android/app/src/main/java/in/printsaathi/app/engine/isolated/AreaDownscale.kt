package `in`.printsaathi.app.engine.isolated

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Exact area-average (box) downscale, streamed one source row at a time, so memory stays at a few rows
 * regardless of image size. Every source pixel contributes by its overlap area — no aliasing of fine
 * texture (PLAN §F2: never lose print quality to save resources). Transparent pixels are composited onto
 * white, so transparent logos and signatures print on white paper. Pure function: JVM-testable.
 *
 * @param readRow fills `buf` (length [sw], ARGB) with source row `y`; called once per row, in order.
 * @param writeRow receives each finished output row (length [dw], ARGB) in order.
 * @param extentW / [extentH] the true source extent in source pixels (default: all of them), within one
 *   pixel of [sw]/[sh]. A decoder's sample size on an odd dimension makes it differ: 8999 rows at sample size 2
 *   are 4499.5 sampled rows, decoded as 4500 (last pixel counts only by its overlap) or as 4499 (Android's
 *   region decoder rounds sub-regions down; the missing half row repeats the edge instead of stretching).
 */
fun areaDownscaleRows(
    sw: Int,
    sh: Int,
    dw: Int,
    dh: Int,
    readRow: (y: Int, buf: IntArray) -> Unit,
    writeRow: (y: Int, row: IntArray) -> Unit,
) = areaDownscaleRows(sw, sh, dw, dh, sw.toDouble(), sh.toDouble(), readRow, writeRow)

fun areaDownscaleRows(
    sw: Int,
    sh: Int,
    dw: Int,
    dh: Int,
    extentW: Double,
    extentH: Double,
    readRow: (y: Int, buf: IntArray) -> Unit,
    writeRow: (y: Int, row: IntArray) -> Unit,
) {
    require(extentW > sw - 1 && extentW < sw + 1 && extentH > sh - 1 && extentH < sh + 1) { "extent must be within one pixel of the decoded size" }
    require(dw >= 1 && dw <= extentW && dh >= 1 && dh <= extentH) { "only downscaling is supported" }
    val sx = extentW / dw
    val sy = extentH / dh
    val area = sx * sy

    // Horizontal weights: for each output column, the overlapping source columns and their overlap widths.
    val start = IntArray(dw)
    val end = IntArray(dw)
    val weights = ArrayList<DoubleArray>(dw)
    for (ox in 0 until dw) {
        val x0 = ox * sx
        val x1 = x0 + sx
        start[ox] = floor(x0).toInt()
        end[ox] = ceil(x1 - 1e-9).toInt() // may pass sw by one: that column repeats the edge
        weights += DoubleArray(end[ox] - start[ox]) { i -> val x = start[ox] + i; min(x + 1.0, x1) - maxOf(x.toDouble(), x0) }
    }

    val buf = IntArray(sw)
    val h = DoubleArray(dw * 3)
    val acc = DoubleArray(dw * 3)
    val out = IntArray(dw)
    var oy = 0
    for (y in 0 until sh) {
        readRow(y, buf)
        for (ox in 0 until dw) {
            var r = 0.0
            var g = 0.0
            var b = 0.0
            val w = weights[ox]
            for (i in w.indices) {
                val p = buf[min(start[ox] + i, sw - 1)]
                val a = (p ushr 24) and 0xFF
                if (a == 0xFF) {
                    r += w[i] * ((p shr 16) and 0xFF)
                    g += w[i] * ((p shr 8) and 0xFF)
                    b += w[i] * (p and 0xFF)
                } else {
                    // Non-premultiplied ARGB (Bitmap.getPixels) composited onto white paper.
                    val k = a / 255.0
                    val white = 255.0 * (1 - k)
                    r += w[i] * (((p shr 16) and 0xFF) * k + white)
                    g += w[i] * (((p shr 8) and 0xFF) * k + white)
                    b += w[i] * ((p and 0xFF) * k + white)
                }
            }
            h[ox * 3] = r
            h[ox * 3 + 1] = g
            h[ox * 3 + 2] = b
        }
        // Vertical: source row y covers [y, y+1); split it across output-row boundaries.
        oy = spread(y.toDouble(), y + 1.0, oy, dh, sy, area, h, acc, out, writeRow)
    }
    // Extent past the last decoded row: the missing fraction repeats that row (h still holds it).
    if (oy < dh) spread(sh.toDouble(), extentH, oy, dh, sy, area, h, acc, out, writeRow)
}

/** Adds horizontal sums [h] for the source span [top, bottom) to the output rows it overlaps; returns the next row. */
private fun spread(
    from: Double,
    bottom: Double,
    startRow: Int,
    dh: Int,
    sy: Double,
    area: Double,
    h: DoubleArray,
    acc: DoubleArray,
    out: IntArray,
    writeRow: (y: Int, row: IntArray) -> Unit,
): Int {
    val dw = out.size
    var oy = startRow
    var top = from
        while (top < bottom - 1e-9 && oy < dh) {
            val boundary = (oy + 1) * sy
            val seg = min(bottom, boundary) - top
            for (i in acc.indices) acc[i] += h[i] * seg
            top += seg
            if (top >= boundary - 1e-9) {
                for (ox in 0 until dw) {
                    val r = (acc[ox * 3] / area).roundToInt().coerceIn(0, 255)
                    val g = (acc[ox * 3 + 1] / area).roundToInt().coerceIn(0, 255)
                    val b = (acc[ox * 3 + 2] / area).roundToInt().coerceIn(0, 255)
                    out[ox] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
                }
                writeRow(oy, out)
                acc.fill(0.0)
                oy++
            }
        }
    return oy
}
