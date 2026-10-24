package `in`.printsaathi.app.engine.isolated

import java.io.BufferedInputStream
import java.io.DataInputStream
import java.io.EOFException
import java.io.InputStream

/**
 * Whether a PNG or WebP reaches its own end undamaged (PLAN §F2: a file cut off or damaged in transfer is refused;
 * decoders would print its missing rows blank). JPEGs are checked by [JpegScan]. Runs inside the engine before decoding; reads the stream
 * once, skipping image data by its declared lengths, and never allocates the image.
 */
object ImageScan {
    private val PNG = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    /** True: whole. False: cut off (or lengths that cannot be). Null: not a PNG or WebP. */
    fun complete(input: InputStream): Boolean? {
        val s = DataInputStream(BufferedInputStream(input, 64 * 1024))
        val head = ByteArray(12)
        val n = s.readNBytesCompat(head)
        return when {
            n >= 8 && head.copyOf(8).contentEquals(PNG) -> pngComplete(s, head.copyOfRange(8, n))
            n == 12 && String(head, 0, 4, Charsets.US_ASCII) == "RIFF" && String(head, 8, 4, Charsets.US_ASCII) == "WEBP" -> {
                // RIFF size counts everything after the size field itself ("WEBP" + chunks).
                val declared = (head[4].toLong() and 0xFF) or ((head[5].toLong() and 0xFF) shl 8) or
                    ((head[6].toLong() and 0xFF) shl 16) or ((head[7].toLong() and 0xFF) shl 24)
                skipFully(s, declared - 4)
            }
            else -> null
        }
    }

    /**
     * Walks chunks (length, type, data, CRC) until IEND. Critical chunks (IHDR, IDAT, …) must have their right CRC, as
     * libpng requires: Android's decoder stops at damaged image data and leaves the rest blank. A damaged optional
     * chunk (text, time…) is ignored, as libpng does. [already]: bytes read past the signature.
     */
    private fun pngComplete(rest: DataInputStream, already: ByteArray): Boolean {
        val s = DataInputStream(java.io.SequenceInputStream(already.inputStream(), rest))
        val buf = ByteArray(64 * 1024)
        return try {
            while (true) {
                val length = s.readInt().toLong() and 0xFFFFFFFFL
                if (length > Int.MAX_VALUE) return false // PNG chunk lengths are at most 2^31 - 1
                val type = ByteArray(4).also { s.readFully(it) }
                val critical = type[0].toInt() and 0x20 == 0 // upper-case first letter
                val crc = java.util.zip.CRC32().apply { update(type) }
                var left = length
                while (left > 0) {
                    val k = s.read(buf, 0, minOf(left, buf.size.toLong()).toInt())
                    if (k < 0) return false
                    if (critical) crc.update(buf, 0, k)
                    left -= k
                }
                val stored = s.readInt().toLong() and 0xFFFFFFFFL
                if (critical && stored != crc.value) return false
                if (String(type, Charsets.US_ASCII) == "IEND") return true
            }
            @Suppress("UNREACHABLE_CODE") false
        } catch (_: EOFException) {
            false
        }
    }

    private fun skipFully(s: InputStream, count: Long): Boolean {
        var left = count
        while (left > 0) {
            val k = s.skip(left)
            if (k <= 0) {
                if (s.read() == -1) return false
                left--
            } else {
                left -= k
            }
        }
        return true
    }

    private fun InputStream.readNBytesCompat(b: ByteArray): Int {
        var off = 0
        while (off < b.size) {
            val k = read(b, off, b.size - off)
            if (k < 0) break
            off += k
        }
        return off
    }
}
