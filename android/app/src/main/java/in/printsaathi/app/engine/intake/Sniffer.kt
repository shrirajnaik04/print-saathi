package `in`.printsaathi.app.engine.intake

/** Real file type from the first bytes; names, extensions and declared MIME types are never trusted. */
enum class SniffedType(val extension: String) {
    JPEG("jpg"), PNG("png"), WEBP("webp"), HEIF("heic"), GIF("gif"), BMP("bmp"), PDF("pdf"), OFFICE("office"), VIDEO("video"), OTHER("bin")
}

private fun ByteArray.startsWith(vararg sig: Int): Boolean =
    size >= sig.size && sig.indices.all { this[it] == sig[it].toByte() }

private fun ByteArray.asciiAt(offset: Int, text: String): Boolean =
    size >= offset + text.length && text.indices.all { this[offset + it] == text[it].code.toByte() }

private fun ByteArray.containsAscii(text: String, limit: Int): Boolean {
    val n = minOf(size, limit) - text.length
    for (i in 0..n) if (asciiAt(i, text)) return true
    return false
}

// HEIF/HEVC stills and sequences, plus AVIF: all decoded through the platform HEIF path (ADR-003).
private val HEIF_BRANDS = listOf("heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1", "avif", "avis")
private val VIDEO_BRANDS = listOf("isom", "iso2", "mp41", "mp42", "3gp4", "3gp5", "qt  ", "M4V ", "avc1", "dash")

// OOXML (Word/Excel/PowerPoint) and OpenDocument names that appear in the first ZIP entries.
private val OFFICE_ZIP_MARKERS = listOf("[Content_Types].xml", "word/", "xl/", "ppt/", "docProps/", "mimetypeapplication/vnd.oasis.opendocument")

/** [head] = the first bytes of the file (the importer passes up to 4 KB). */
fun sniff(head: ByteArray): SniffedType = when {
    head.startsWith(0xFF, 0xD8, 0xFF) -> SniffedType.JPEG
    head.startsWith(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) -> SniffedType.PNG
    head.asciiAt(0, "RIFF") && head.asciiAt(8, "WEBP") -> SniffedType.WEBP
    head.asciiAt(0, "GIF87a") || head.asciiAt(0, "GIF89a") -> SniffedType.GIF
    head.asciiAt(0, "BM") && head.size >= 26 -> SniffedType.BMP
    head.asciiAt(4, "ftyp") && HEIF_BRANDS.any { head.asciiAt(8, it) } -> SniffedType.HEIF
    head.asciiAt(4, "ftyp") && VIDEO_BRANDS.any { head.asciiAt(8, it) } -> SniffedType.VIDEO
    head.containsAscii("%PDF-", 1024) -> SniffedType.PDF
    head.startsWith(0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1) -> SniffedType.OFFICE
    head.startsWith(0x50, 0x4B, 0x03, 0x04) && OFFICE_ZIP_MARKERS.any { head.containsAscii(it, 4096) } -> SniffedType.OFFICE
    else -> SniffedType.OTHER
}
