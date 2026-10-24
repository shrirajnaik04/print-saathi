package `in`.printsaathi.app.engine.isolated

data class Size(val width: Int, val height: Int)

/** Long side scaled down to [maxLongSide], aspect kept, never upscaled (PLAN §F2). */
fun targetSize(srcW: Int, srcH: Int, maxLongSide: Int): Size {
    val long = maxOf(srcW, srcH)
    if (long <= maxLongSide) return Size(srcW, srcH)
    val scale = maxLongSide.toDouble() / long
    return Size(maxOf(1, Math.round(srcW * scale).toInt()), maxOf(1, Math.round(srcH * scale).toInt()))
}

/** Largest power-of-two subsample whose decoded size still covers [target] (old-phone decode path). */
fun sampleSizeFor(srcW: Int, srcH: Int, target: Size): Int {
    var s = 1
    while (srcW / (s * 2) >= target.width && srcH / (s * 2) >= target.height) s *= 2
    return s
}

private const val STRIP_BYTES_CAP = 16 * 1024 * 1024

/**
 * Sampled rows per decode strip: 512 (measured: 2.0 s vs 5.1 s at 64 rows for 108 MP, spike e), but a
 * strip never exceeds 16 MB so very wide panoramas stay memory-safe; never fewer than 64 rows.
 */
fun stripRowsFor(sampledWidth: Int): Int = (STRIP_BYTES_CAP / (sampledWidth.toLong() * 4)).toInt().coerceIn(64, 512)

/**
 * A crop of the upright photo ({x, y, w, h} fractions) as the matching area of the stored pixels, before the EXIF
 * orientation (mirror first, then [rotation] degrees clockwise) is applied, so only that area is decoded.
 */
fun storedCrop(upright: DoubleArray, rotation: Int, flipped: Boolean): DoubleArray {
    val (x, y, w, h) = upright.toList()
    // Undo the clockwise turn: a turned point (u, v) is the unturned point (v, 1 - u) for one quarter turn.
    val unturned = when (Math.floorMod(rotation / 90, 4)) {
        1 -> doubleArrayOf(y, 1 - x - w, h, w)
        2 -> doubleArrayOf(1 - x - w, 1 - y - h, w, h)
        3 -> doubleArrayOf(1 - y - h, x, h, w)
        else -> doubleArrayOf(x, y, w, h)
    }
    return if (flipped) doubleArrayOf(1 - unturned[0] - unturned[2], unturned[1], unturned[2], unturned[3]) else unturned
}

/** The pixel rectangle {left, top, right, bottom} covering [crop] of a [w] x [h] image: never empty, never outside. */
fun cropPixels(crop: DoubleArray, w: Int, h: Int): IntArray {
    val eps = 1e-9
    val left = Math.floor(crop[0] * w + eps).toInt().coerceIn(0, w - 1)
    val top = Math.floor(crop[1] * h + eps).toInt().coerceIn(0, h - 1)
    val right = Math.ceil((crop[0] + crop[2]) * w - eps).toInt().coerceIn(left + 1, w)
    val bottom = Math.ceil((crop[1] + crop[3]) * h - eps).toInt().coerceIn(top + 1, h)
    return intArrayOf(left, top, right, bottom)
}

/**
 * Whether a whole-photo decode for a crop fits this phone (formats the region decoder cannot read; PLAN §F2): the
 * photo decoded so its long side is [decodeLong] (never above its own [photoLong]) peaks at the sampled decode (power
 * of two: up to 4x the pixels needed, never more than the photo) plus the scaled copy and the cut. That peak must stay
 * within the RAM tier's [budgetPixels]; before Android 8 bitmaps live on the Java heap, where it may use a quarter.
 */
fun wholeDecodeFits(decodeLong: Int, photoLong: Int, photoShort: Int, budgetPixels: Long, heapBytes: Long, sdk: Int): Boolean {
    if (photoLong <= 0 || photoShort <= 0) return false
    val long = minOf(decodeLong, photoLong).toLong()
    val needed = long * long * photoShort / photoLong
    val sampled = minOf(photoLong.toLong() * photoShort, needed * 4)
    val peak = sampled + 2 * needed
    if (peak > budgetPixels) return false
    return sdk >= 26 || peak * 4 <= heapBytes / 4
}
