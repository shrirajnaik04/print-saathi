package `in`.printsaathi.app.engine.isolated

import java.io.BufferedInputStream
import java.io.InputStream

/** What one pass over a JPEG tells: the photo's own frame (not an EXIF thumbnail's) and whether its data ends. */
data class JpegFacts(val progressive: Boolean, val width: Int, val height: Int, val complete: Boolean)

/**
 * Runs inside the engine before decoding (Phase 0 carry-over, spikes.md (e)):
 * - a JPEG whose image data never reaches its end marker was cut off in transfer; decoders fill the missing part
 *   with grey, so it is reported as damaged instead (PLAN §F2 "truncated files are detected");
 * - a progressive JPEG is decoded whole (measured: 108 MP took 427–484 MB), so one over this phone's budget is
 *   refused before decoding.
 * Segments before the image data are skipped by their length, so an EXIF thumbnail (its own frame and end marker
 * inside APP1) never counts as the photo.
 */
object JpegScan {
    private const val MB = 1024L * 1024

    /** PLAN §F2 budgets by RAM (2 GB -> 16 MP, 3 GB -> 24 MP, 4 GB+ -> 40 MP); [memTotalBytes] < 0 = unknown. */
    fun progressiveBudgetPixels(memTotalBytes: Long): Long = when {
        memTotalBytes < 0 -> 16_000_000L
        memTotalBytes < 2560 * MB -> 16_000_000L
        memTotalBytes < 3584 * MB -> 24_000_000L
        else -> 40_000_000L
    }

    /** Null when [input] is not a JPEG. Reads the whole stream once; never allocates the image. */
    fun scan(input: InputStream): JpegFacts? {
        val s = BufferedInputStream(input, 64 * 1024)
        if (s.read() != 0xFF || s.read() != 0xD8) return null
        var progressive = false
        var width = 0
        var height = 0
        var frameSeen = false
        while (true) {
            // Next marker: skip to 0xFF, then past fill bytes.
            var b = s.read()
            while (b != -1 && b != 0xFF) b = s.read()
            while (b == 0xFF) b = s.read()
            if (b == -1) return JpegFacts(progressive, width, height, complete = false)
            when (b) {
                0xD9 -> return JpegFacts(progressive, width, height, complete = false) // ends before any image data
                in 0xD0..0xD7, 0x01 -> continue
                0xDA -> {
                    skip(s, length(s) - 2) ?: return JpegFacts(progressive, width, height, false)
                    return JpegFacts(progressive, width, height, complete = scanImageData(s))
                }
                else -> {
                    val len = length(s)
                    if (len < 2) return JpegFacts(progressive, width, height, false)
                    val isFrame = b in 0xC0..0xCF && b != 0xC4 && b != 0xC8 && b != 0xCC
                    if (isFrame && !frameSeen && len >= 7) {
                        frameSeen = true
                        progressive = b == 0xC2 || b == 0xC6 || b == 0xCA || b == 0xCE
                        s.read() // precision
                        height = (s.read() shl 8) or s.read()
                        width = (s.read() shl 8) or s.read()
                        skip(s, len - 2 - 5) ?: return JpegFacts(progressive, width, height, false)
                    } else {
                        skip(s, len - 2) ?: return JpegFacts(progressive, width, height, false)
                    }
                }
            }
        }
    }

    /**
     * After the first scan header: entropy-coded data, where 0xFF is always followed by 0x00 (a stuffed byte) or
     * a marker. Restart markers continue the data; a progressive photo's later tables and scan headers are skipped
     * by length; the end marker means the photo is whole.
     */
    private fun scanImageData(s: InputStream): Boolean {
        var b = s.read()
        while (b != -1) {
            if (b != 0xFF) {
                b = s.read()
                continue
            }
            var m = s.read()
            while (m == 0xFF) m = s.read()
            when (m) {
                -1 -> return false
                0x00, in 0xD0..0xD7 -> {}
                0xD9 -> return true
                else -> skip(s, length(s) - 2) ?: return false
            }
            b = s.read()
        }
        return false
    }

    private fun length(s: InputStream): Int {
        val hi = s.read()
        val lo = s.read()
        return if (hi < 0 || lo < 0) -1 else (hi shl 8) or lo
    }

    /** Skips [n] bytes; null if the stream ended first. */
    private fun skip(s: InputStream, n: Int): Unit? {
        if (n < 0) return null
        var left = n.toLong()
        while (left > 0) {
            val k = s.skip(left)
            if (k > 0) left -= k else if (s.read() == -1) return null else left--
        }
        return Unit
    }
}
