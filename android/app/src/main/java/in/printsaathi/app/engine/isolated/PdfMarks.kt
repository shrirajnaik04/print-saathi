package `in`.printsaathi.app.engine.isolated

/**
 * Best-effort byte scan for form fields or stamps in a PDF (PLAN §G4): `/AcroForm`, or an `/Annots` entry that is not
 * an empty list. Compressed object streams can hide them; this only decides whether to show a "check the preview"
 * banner on phones whose built-in engine may not draw them. Runs inside the isolated engine.
 */
object PdfMarks {
    private val ACROFORM = "/AcroForm".toByteArray(Charsets.ISO_8859_1)
    private val ANNOTS = "/Annots".toByteArray(Charsets.ISO_8859_1)

    /** Bytes kept from the end of one chunk for the next, so a mark split across chunks is still found. */
    const val OVERLAP = 64

    fun formsOrStamps(b: ByteArray): Boolean {
        if (indexOf(b, ACROFORM, 0) >= 0) return true
        var i = indexOf(b, ANNOTS, 0)
        while (i >= 0) {
            var j = i + ANNOTS.size
            while (j < b.size && isSpace(b[j])) j++
            if (j >= b.size) return false // cut at the chunk end: the next chunk sees it whole
            if (b[j] != '['.code.toByte()) return true // a reference to a list
            j++
            while (j < b.size && isSpace(b[j])) j++
            if (j < b.size && b[j] != ']'.code.toByte()) return true // a list with entries
            i = indexOf(b, ANNOTS, i + 1)
        }
        return false
    }

    private fun isSpace(c: Byte) = c == ' '.code.toByte() || c == '\n'.code.toByte() || c == '\r'.code.toByte() ||
        c == '\t'.code.toByte() || c == 0x0c.toByte() || c == 0.toByte()

    private fun indexOf(hay: ByteArray, needle: ByteArray, from: Int): Int {
        outer@ for (i in from..hay.size - needle.size) {
            for (j in needle.indices) if (hay[i + j] != needle[j]) continue@outer
            return i
        }
        return -1
    }
}
