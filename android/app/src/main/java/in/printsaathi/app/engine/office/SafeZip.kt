package `in`.printsaathi.app.engine.office

import java.io.ByteArrayOutputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.util.zip.ZipInputStream

/** Round 9: a customer's Office file was refused (a limit reached, damaged, or not what it claims): its [reason]. */
class OfficeRefused(val reason: String) : Exception(reason)

/**
 * Round 9: reads a customer's zip (Word, PowerPoint, Excel, OpenDocument) in memory only, inside the isolated engine:
 * entry names never touch a file system. Refused ([OfficeRefused]) past [Limits]: too many entries, too much unpacked,
 * an entry over [Limits.ratioAboveBytes] packed more than [Limits.ratio] : 1 (a zip bomb's shape), more kept than
 * [Limits.keepBytes], or a damaged zip.
 */
object SafeZip {
    class Limits(
        val entries: Int = 2_000,
        val totalBytes: Long = 200L shl 20,
        val ratio: Int = 100,
        val ratioAboveBytes: Long = 1L shl 20,
        val keepBytes: Long = 64L shl 20,
    )

    /** Every entry's name in order, and the bytes of the [wanted] ones. */
    class Parts(val names: List<String>, val parts: Map<String, ByteArray>)

    private class Counting(input: InputStream) : FilterInputStream(input) {
        var count = 0L
        override fun read(): Int = super.read().also { if (it >= 0) count++ }
        override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) count += it }
        override fun skip(n: Long): Long = super.skip(n).also { count += it }
    }

    fun read(input: InputStream, wanted: (String) -> Boolean, limits: Limits = Limits()): Parts {
        val raw = Counting(input)
        val names = mutableListOf<String>()
        val parts = LinkedHashMap<String, ByteArray>()
        var total = 0L
        var kept = 0L
        try {
            ZipInputStream(raw).use { z ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val e = z.nextEntry ?: break
                    if (names.size >= limits.entries) throw OfficeRefused("too many entries")
                    names += e.name
                    val keep = !e.isDirectory && wanted(e.name)
                    val out = if (keep) ByteArrayOutputStream() else null
                    val packedAt = raw.count
                    var size = 0L
                    while (true) {
                        val r = z.read(buf)
                        if (r < 0) break
                        size += r
                        total += r
                        if (total > limits.totalBytes) throw OfficeRefused("too big unpacked")
                        if (size > limits.ratioAboveBytes && size > limits.ratio * maxOf(1L, raw.count - packedAt)) {
                            throw OfficeRefused("packed too tightly")
                        }
                        if (out != null) {
                            kept += r
                            if (kept > limits.keepBytes) throw OfficeRefused("too much to keep")
                            out.write(buf, 0, r)
                        }
                    }
                    if (out != null) parts[e.name] = out.toByteArray()
                }
            }
        } catch (e: OfficeRefused) {
            throw e
        } catch (e: Exception) {
            throw OfficeRefused("damaged zip")
        }
        if (names.isEmpty()) throw OfficeRefused("empty zip")
        return Parts(names, parts)
    }
}
