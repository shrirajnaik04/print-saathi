package `in`.printsaathi.app.engine.office

import java.io.File

/** Round 9: what kind of Office file, for the shopkeeper ("Word file"); codes cross the engine boundary. */
enum class OfficeKind(val code: Int) {
    OFFICE(0), WORD(1), POWERPOINT(2), EXCEL(3);

    companion object {
        fun of(code: Int) = entries.firstOrNull { it.code == code } ?: OFFICE

        /**
         * The kind and format of [file], by what is inside it (never its name): zip entry names (OOXML), the
         * OpenDocument `mimetype` entry, an OLE file's stream names (UTF-16 in its directory), or RTF's start.
         * A password-protected new file (an OLE file holding `EncryptedPackage`) and anything unknown is OFFICE.
         */
        fun detect(file: File): Pair<OfficeKind, OfficeFormat> = detect { file.inputStream() }

        /** As [detect] for a file, from a stream [open] gives afresh at the file's start each time (the engine's fd). */
        fun detect(open: () -> java.io.InputStream): Pair<OfficeKind, OfficeFormat> {
            val head = open().use { it.readUpTo(8) }
            if (head.size >= 8 && head.contentEquals(OLE)) return ole(open().use { it.readUpTo(256 * 1024) })
            if (head.size >= 5 && String(head, 0, 5, Charsets.ISO_8859_1) == "{\\rtf") return WORD to OfficeFormat.RTF
            if (head.size >= 4 && head[0] == 0x50.toByte() && head[1] == 0x4B.toByte()) {
                val z = runCatching { open().use { SafeZip.read(it, { n -> n == "mimetype" }) } }.getOrNull()
                    ?: return OFFICE to OfficeFormat.UNKNOWN
                return zipKind(z)
            }
            return OFFICE to OfficeFormat.UNKNOWN
        }

        /** The kind of an already read zip ([SafeZip.Parts] holding `mimetype` if present). */
        fun zipKind(z: SafeZip.Parts): Pair<OfficeKind, OfficeFormat> {
            val mime = z.parts["mimetype"]?.let { String(it, Charsets.US_ASCII) }
            if (mime != null) {
                return when {
                    mime.contains("opendocument.text") -> WORD to OfficeFormat.ODF
                    mime.contains("opendocument.presentation") -> POWERPOINT to OfficeFormat.ODF
                    mime.contains("opendocument.spreadsheet") -> EXCEL to OfficeFormat.ODF
                    else -> OFFICE to OfficeFormat.UNKNOWN
                }
            }
            if ("[Content_Types].xml" !in z.names) return OFFICE to OfficeFormat.UNKNOWN
            return when {
                z.names.any { it.startsWith("word/") } -> WORD to OfficeFormat.OOXML
                z.names.any { it.startsWith("ppt/") } -> POWERPOINT to OfficeFormat.OOXML
                z.names.any { it.startsWith("xl/") } -> EXCEL to OfficeFormat.OOXML
                else -> OFFICE to OfficeFormat.UNKNOWN
            }
        }

        private val OLE = byteArrayOf(0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(), 0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte())

        private fun ole(start: ByteArray): Pair<OfficeKind, OfficeFormat> {
            val text = String(start, Charsets.UTF_16LE)
            fun has(name: String) = text.contains(name + "\u0000")
            return when {
                has("EncryptedPackage") -> OFFICE to OfficeFormat.OLE
                has("WordDocument") -> WORD to OfficeFormat.OLE
                has("PowerPoint Document") -> POWERPOINT to OfficeFormat.OLE
                has("Workbook") || has("Book") -> EXCEL to OfficeFormat.OLE
                else -> OFFICE to OfficeFormat.OLE
            }
        }
    }
}

/** Round 9: how an Office file is stored; with [OfficeKind] it decides the MIME type a viewer is told. */
enum class OfficeFormat(val code: Int) {
    UNKNOWN(0), OOXML(1), OLE(2), ODF(3), RTF(4);

    companion object {
        fun of(code: Int) = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}

/** Up to [n] bytes from the start of this stream (InputStream.readNBytes needs Android 13). */
internal fun java.io.InputStream.readUpTo(n: Int): ByteArray {
    val buf = ByteArray(n)
    var got = 0
    while (got < n) {
        val r = read(buf, got, n - got)
        if (r < 0) break
        got += r
    }
    return if (got == n) buf else buf.copyOf(got)
}
