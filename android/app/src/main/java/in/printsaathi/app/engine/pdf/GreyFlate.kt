package `in`.printsaathi.app.engine.pdf

import java.io.ByteArrayOutputStream
import java.util.zip.Deflater

/**
 * Lossless 8-bit grey for PDF (PLAN §G2): every row PNG "Up"-filtered (each byte minus the one above), then Flate.
 * Text-like pages, mostly white with repeated rows, shrink a lot; nothing is lost, so text stays sharp.
 * Read back with /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns [w] >>.
 */
object GreyFlate {
    fun encode(raw: ByteArray, w: Int, h: Int): ByteArray {
        require(w > 0 && h > 0 && raw.size == w * h) { "size" }
        val d = Deflater(Deflater.DEFAULT_COMPRESSION)
        val out = ByteArrayOutputStream(raw.size / 8)
        val row = ByteArray(w + 1)
        val buf = ByteArray(64 * 1024)
        for (y in 0 until h) {
            row[0] = 2 // Up
            val o = y * w
            for (x in 0 until w) {
                val above = if (y == 0) 0 else raw[o - w + x].toInt()
                row[x + 1] = (raw[o + x].toInt() - above).toByte()
            }
            d.setInput(row)
            while (!d.needsInput()) {
                val n = d.deflate(buf)
                if (n > 0) out.write(buf, 0, n)
            }
        }
        d.finish()
        while (!d.finished()) {
            val n = d.deflate(buf)
            out.write(buf, 0, n)
        }
        d.end()
        return out.toByteArray()
    }
}
