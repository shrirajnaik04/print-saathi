package `in`.printsaathi.app.engine.render

/** The engine's 1-bit rows (OCV Black: MSB first, rows padded to bytes, 0 = black) as opaque black / white pixels. */
object OneBit {
    fun toArgb(bits: ByteArray, w: Int, h: Int): IntArray {
        val stride = (w + 7) / 8
        require(w > 0 && h > 0 && bits.size >= stride * h) { "size" }
        return IntArray(w * h) { i ->
            val x = i % w
            val bit = (bits[(i / w) * stride + x / 8].toInt() shr (7 - x % 8)) and 1
            if (bit == 0) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
        }
    }

    /** The same rows averaged over [factor] × [factor] blocks into grey pixels ((w / factor) × (h / factor), rounded down). */
    fun toGreyScaled(bits: ByteArray, w: Int, h: Int, factor: Int): IntArray {
        val stride = (w + 7) / 8
        require(w > 0 && h > 0 && factor > 0 && bits.size >= stride * h) { "size" }
        val ow = w / factor
        val oh = h / factor
        require(ow > 0 && oh > 0) { "too small" }
        return IntArray(ow * oh) { i ->
            val ox = i % ow
            val oy = i / ow
            var white = 0
            for (y in oy * factor until (oy + 1) * factor) for (x in ox * factor until (ox + 1) * factor) {
                white += (bits[y * stride + x / 8].toInt() shr (7 - x % 8)) and 1
            }
            val v = 255 * white / (factor * factor)
            (0xFF shl 24) or (v shl 16) or (v shl 8) or v
        }
    }
}
