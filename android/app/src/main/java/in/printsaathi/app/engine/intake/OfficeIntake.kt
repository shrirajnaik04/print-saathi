package `in`.printsaathi.app.engine.intake

import `in`.printsaathi.app.engine.isolated.EngineClient
import java.io.File
import java.security.MessageDigest
import java.util.Locale

/** Round 9: the engine's two converters, as the importer calls them (the plugin passes the engine's own). */
class Converters(
    val office: (src: File, pdf: File) -> Result<EngineClient.OfficeResult>,
    val text: (src: File, txt: File, pdf: File) -> Result<Int>,
)

/**
 * Round 9: what a received file becomes once copied. An Office file (kept as NNNN.office) is made into pages
 * (NNNN.pdf) by the engine, its original kept beside them for Print with WPS Office; one that is not made stays an
 * Office file named by its kind. A file of no known type that is readable text becomes a text message (NNNN.txt and
 * its pages), like a shared WhatsApp text. Photos and PDFs are left alone (null). Paths only inside the job's folder.
 */
object OfficeIntake {
    private val KINDS = mapOf(1 to "word", 2 to "powerpoint", 3 to "excel")
    private val FORMATS = mapOf(1 to "ooxml", 2 to "ole", 3 to "odf", 4 to "rtf")

    /** [hint]: the kind the file's start suggests ([officeHint]), kept when the engine cannot say (review I3). */
    fun place(src: File, n: Int, sniffed: SniffedType, conv: Converters, hint: String? = null): Importer.Imported? {
        val dir = src.parentFile ?: return null
        return when (sniffed) {
            SniffedType.OFFICE -> office(src, dir, n, conv, hint)
            SniffedType.OTHER -> text(src, dir, n, conv)
            else -> null
        }
    }

    private fun office(src: File, dir: File, n: Int, conv: Converters, hint: String?): Importer.Imported {
        val pdf = File(dir, name(n, "pdf"))
        val r = runCatching { conv.office(src, pdf).getOrThrow() }.getOrNull()
        // The engine's answer when it has one; else (it failed, or could not tell) what the file's start suggested.
        val kind = r?.let { KINDS[it.kind] } ?: hint ?: "office"
        val format = r?.let { FORMATS[it.format] } ?: hint?.let { if (isRtf(src)) "rtf" else "ooxml" }
        if (r != null && r.pages > 0 && pdf.length() > 0) {
            return Importer.Imported(n, pdf.absolutePath, SniffedType.PDF, pdf.length(), sha256(pdf), kind, format, r.missed)
        }
        pdf.delete()
        return Importer.Imported(n, src.absolutePath, SniffedType.OFFICE, src.length(), sha256(src), kind, format)
    }

    private fun text(src: File, dir: File, n: Int, conv: Converters): Importer.Imported? {
        if (src.length() > `in`.printsaathi.app.engine.office.TextFile.MAX_BYTES) return null
        val txt = File(dir, name(n, "txt"))
        val pdf = File(dir, name(n, "pdf"))
        val ok = runCatching { conv.text(src, txt, pdf).getOrThrow() > 0 }.getOrDefault(false) && pdf.length() > 0 && txt.length() > 0
        if (!ok) {
            txt.delete()
            pdf.delete()
            return null
        }
        src.delete()
        return Importer.Imported(n, pdf.absolutePath, SniffedType.PDF, pdf.length(), sha256(pdf), text = true)
    }

    private fun isRtf(f: File) = runCatching { f.inputStream().use { it.readNBytesCompat(5) } }.getOrNull()?.let { String(it, Charsets.US_ASCII) == "{\\rtf" } == true

    private fun java.io.InputStream.readNBytesCompat(n: Int): ByteArray {
        val b = ByteArray(n)
        var got = 0
        while (got < n) {
            val r = read(b, got, n - got)
            if (r < 0) break
            got += r
        }
        return b.copyOf(got)
    }

    private fun name(n: Int, ext: String) = String.format(Locale.ROOT, "%04d.%s", n, ext)

    private fun sha256(f: File): String {
        val d = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val r = input.read(buf)
                if (r < 0) break
                d.update(buf, 0, r)
            }
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }
}
