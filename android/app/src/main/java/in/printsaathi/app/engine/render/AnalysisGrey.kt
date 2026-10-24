package `in`.printsaathi.app.engine.render

/**
 * The smart-crop detector's input (PLAN §F3, §F5): "PSAG", width and height (16-bit big-endian), then raw 8-bit
 * Rec.601 grey rows, ≤ 512 px. Made from the engine's output; read by the web app's worker as a file, never sent over
 * the bridge.
 */
object AnalysisGrey {
    const val MAX_SIDE = 512

    fun withHeader(rows: ByteArray, w: Int, h: Int): ByteArray {
        require(w in 1..0xFFFF && h in 1..0xFFFF && rows.size == w * h) { "size" }
        val out = ByteArray(8 + rows.size)
        "PSAG".toByteArray(Charsets.US_ASCII).copyInto(out)
        out[4] = (w shr 8).toByte()
        out[5] = w.toByte()
        out[6] = (h shr 8).toByte()
        out[7] = h.toByte()
        rows.copyInto(out, 8)
        return out
    }
}
