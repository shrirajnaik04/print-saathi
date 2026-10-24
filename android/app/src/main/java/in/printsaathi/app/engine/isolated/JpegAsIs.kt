package `in`.printsaathi.app.engine.isolated

/**
 * Original photos untouched (owner, 2026-10-23: "print quality must be as is"). Runs INSIDE the isolated engine: reads
 * a JPEG's header and says whether the file's own picture can go into the print file as it is (byte for byte, without
 * its notes: [pictureOnly]): a plain 8-bit colour JPEG (baseline or progressive, YCbCr), no colour profile or an sRGB one (its colours are
 * then what the PDF shows; Android's camera and encoder save sRGB), a camera turn that is a plain turn (never a
 * mirror), and no more pixels than the print needs.
 * Anything else is decoded and drawn as before.
 */
object JpegAsIs {
    /** What the header says. [orientation]: the EXIF "which way up" (1 = as stored). */
    data class Facts(
        val width: Int,
        val height: Int,
        val components: Int,
        val bits: Int,
        val progressive: Boolean,
        val plainFrame: Boolean,
        val adobeTransform: Int?,
        val icc: Boolean,
        val orientation: Int,
        /** The colour profile (if any) is one piece describing itself as sRGB. */
        val iccSrgb: Boolean = false,
        /** Three components named R, G, B: stored as RGB, which a PDF reader would read as YCbCr (wrong colours). */
        val rgbNames: Boolean = false,
    )

    /** How far a header is read (camera segments come before the picture). */
    const val HEAD_BYTES = 256 * 1024

    /** The header's facts, or null when [b] is not a JPEG header this can read (never throws). */
    fun facts(b: ByteArray): Facts? = try {
        read(b)
    } catch (e: IndexOutOfBoundsException) {
        null
    }

    private fun read(b: ByteArray): Facts? {
        if (b.size < 4 || u8(b, 0) != 0xFF || u8(b, 1) != 0xD8) return null
        var i = 2
        var orientation = 1
        var icc = false
        var iccSrgb = false
        var adobe: Int? = null
        while (i + 4 <= b.size) {
            if (u8(b, i) != 0xFF) return null
            val marker = u8(b, i + 1)
            if (marker == 0xFF) {
                i++ // fill byte
                continue
            }
            if (marker == 0x01 || marker in 0xD0..0xD8) {
                i += 2
                continue
            }
            if (marker == 0xD9 || marker == 0xDA) return null // the picture or its end before any frame header
            val len = u16(b, i + 2)
            if (len < 2 || i + 2 + len > b.size) return null
            val seg = i + 4
            when (marker) {
                0xE1 -> if (startsWith(b, seg, "Exif\u0000\u0000")) exifOrientation(b, seg + 6, i + 2 + len)?.let { orientation = it }
                0xE2 -> if (startsWith(b, seg, "ICC_PROFILE")) {
                    icc = true
                    iccSrgb = srgbProfile(b, seg, i + 2 + len)
                }
                0xEE -> if (startsWith(b, seg, "Adobe") && len - 2 >= 12) adobe = u8(b, seg + 11)
                0xC4, 0xC8, 0xCC -> Unit // tables, not a frame
                in 0xC0..0xCF -> return Facts(
                    width = u16(b, seg + 3),
                    height = u16(b, seg + 1),
                    components = u8(b, seg + 5),
                    bits = u8(b, seg),
                    progressive = marker == 0xC2,
                    plainFrame = marker == 0xC0 || marker == 0xC1 || marker == 0xC2, // Huffman, not lossless
                    adobeTransform = adobe,
                    icc = icc,
                    orientation = orientation,
                    iccSrgb = iccSrgb,
                    rgbNames = u8(b, seg + 5) == 3 && u8(b, seg + 6) == 'R'.code && u8(b, seg + 9) == 'G'.code &&
                        u8(b, seg + 12) == 'B'.code,
                )
            }
            i += 2 + len
        }
        return null
    }

    /** Whether the file can go into the print as it is, at [maxLongSide] pixels for its printed size. */
    fun qualifies(f: Facts, maxLongSide: Int): Boolean =
        f.plainFrame && f.bits == 8 && f.components == 3 && !f.rgbNames && (f.adobeTransform == null || f.adobeTransform == 1) &&
            (!f.icc || f.iccSrgb) && f.orientation in setOf(1, 3, 6, 8) && f.width > 0 && f.height > 0 &&
            maxOf(f.width, f.height) <= maxLongSide

    /**
     * The picture of the JPEG [b] without its notes (self-audit 2026-10-24): the tables, frame and scans byte for byte,
     * so it decodes to the very same pixels, but none of the EXIF (where and when it was taken, the phone), XMP, IPTC,
     * comments, colour profile (the print file reads the colours as sRGB anyway) or anything after the picture's end
     * (a second picture, a depth map). Only the Adobe note stays: it says how the colours are stored. Null when [b] is
     * not a whole JPEG (cut, broken): it is then decoded as before. Never throws.
     */
    fun pictureOnly(b: ByteArray): ByteArray? = try {
        picture(b)
    } catch (e: IndexOutOfBoundsException) {
        null
    }

    private fun picture(b: ByteArray): ByteArray? {
        if (b.size < 4 || u8(b, 0) != 0xFF || u8(b, 1) != 0xD8) return null
        val out = java.io.ByteArrayOutputStream(b.size)
        out.write(b, 0, 2)
        var i = 2
        while (i + 2 <= b.size) {
            if (u8(b, i) != 0xFF) return null
            val marker = u8(b, i + 1)
            when {
                marker == 0xFF -> i++ // fill byte
                marker == 0xD9 -> { // the picture's end: nothing after it goes in
                    out.write(b, i, 2)
                    return out.toByteArray()
                }
                marker == 0xD8 -> return null
                marker == 0x01 || marker in 0xD0..0xD7 -> { // marks without a length
                    out.write(b, i, 2)
                    i += 2
                }
                else -> {
                    val len = u16(b, i + 2)
                    if (len < 2 || i + 2 + len > b.size) return null
                    val note = (marker in 0xE1..0xEF && marker != 0xEE) || marker == 0xFE
                    if (!note) out.write(b, i, 2 + len)
                    i += 2 + len
                    if (marker == 0xDA) { // a scan: its coded data runs to the next mark (FF 00 and restarts are data)
                        val start = i
                        while (u8(b, i) != 0xFF || u8(b, i + 1) == 0x00 || u8(b, i + 1) in 0xD0..0xD7) i++
                        out.write(b, start, i - start)
                    }
                }
            }
        }
        return null
    }

    /** Quarter turns clockwise that make the stored picture upright (EXIF 6 = one, 3 = two, 8 = three). */
    fun turnsCw(f: Facts): Int = when (f.orientation) {
        6 -> 1
        3 -> 2
        8 -> 3
        else -> 0
    }

    /** The EXIF Orientation from a TIFF block at [start] (ending before [end]); null if there is none. */
    private fun exifOrientation(b: ByteArray, start: Int, end: Int): Int? {
        if (start + 8 > end) return null
        val little = when {
            u8(b, start) == 'I'.code && u8(b, start + 1) == 'I'.code -> true
            u8(b, start) == 'M'.code && u8(b, start + 1) == 'M'.code -> false
            else -> return null
        }
        fun s(at: Int) = if (little) u8(b, at) or (u8(b, at + 1) shl 8) else u16(b, at)
        fun l(at: Int) = if (little) s(at) or (s(at + 2) shl 16) else (s(at) shl 16) or s(at + 2)
        val ifd = start + l(start + 4)
        if (ifd < start || ifd + 2 > end) return null
        val n = s(ifd)
        for (k in 0 until n) {
            val e = ifd + 2 + 12 * k
            if (e + 12 > end) return null
            if (s(e) == 0x0112 && s(e + 2) == 3) return s(e + 8)
        }
        return null
    }

    /**
     * Whether the APP2 colour profile at [seg] (ending before [end]) is a whole profile whose description says sRGB
     * (ICC v2 'desc' or v4 'mluc' text). A profile in several pieces, or one that cannot be read, is not.
     */
    private fun srgbProfile(b: ByteArray, seg: Int, end: Int): Boolean {
        if (seg + 14 > end || u8(b, seg + 12) != 1 || u8(b, seg + 13) != 1) return false
        val p = seg + 14
        fun be32(at: Int) = (u16(b, at) shl 16) or u16(b, at + 2)
        if (p + 132 > end) return false
        val tags = be32(p + 128)
        if (tags < 0 || tags > 200) return false
        for (k in 0 until tags) {
            val t = p + 132 + 12 * k
            if (t + 12 > end) return false
            if (!startsWith(b, t, "desc")) continue
            val d = p + be32(t + 4)
            if (d < p || d + 12 > end) return false
            val text = when {
                startsWith(b, d, "desc") -> {
                    val n = be32(d + 8)
                    if (n < 0 || d + 12 + n > end) return false
                    String(b, d + 12, n, Charsets.ISO_8859_1)
                }
                startsWith(b, d, "mluc") -> {
                    if (d + 28 > end) return false
                    val len = be32(d + 20)
                    val at = d + be32(d + 24)
                    if (len < 0 || at < d || at + len > end) return false
                    String(b, at, len, Charsets.UTF_16BE)
                }
                else -> return false
            }
            return text.contains("sRGB")
        }
        return false
    }

    private fun startsWith(b: ByteArray, at: Int, s: String): Boolean =
        at + s.length <= b.size && s.indices.all { u8(b, at + it) == s[it].code }

    private fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xFF

    private fun u16(b: ByteArray, i: Int) = (u8(b, i) shl 8) or u8(b, i + 1)
}
