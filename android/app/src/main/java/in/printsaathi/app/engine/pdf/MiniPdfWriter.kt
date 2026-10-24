package `in`.printsaathi.app.engine.pdf

import java.io.OutputStream
import java.util.Locale
import java.util.zip.Deflater

/** Box in PDF points with a TOP-LEFT origin (the layout engine's convention). */
data class RectD(val x: Double, val y: Double, val w: Double, val h: Double)

/** GREY8_FLATE: already compressed with GreyFlate (PNG Up predictor + Flate), for lossless grey document pages. */
enum class ImageKind { JPEG_RGB, GREY8_RAW, GREY8_FLATE, GREY1_RAW }

/**
 * One image object. [load] gives JPEG file bytes for JPEG_RGB, or raw 8-bit grey rows (pxW*pxH) for GREY8_RAW
 * (Flate-compressed here). It is called once, when the image is first written; images with the same [key] are
 * written once and reused, so collated copies cost almost nothing and their bytes are never held in memory.
 */
class PdfImage(val key: Any, val kind: ImageKind, val pxW: Int, val pxH: Int, val load: () -> ByteArray)

/**
 * [image] drawn to fill [box] with [quarterTurnsCcw] quarter turns anticlockwise (0..3): 1 puts the photo's top along
 * the box's left edge (a sideways page on a portrait sheet), 3 along its right edge (a photo turned clockwise). [box]
 * is in the sheet's space and already has the turned shape.
 */
class PlacedImage(val image: PdfImage, val box: RectD, val quarterTurnsCcw: Int = 0) {
    constructor(bytes: ByteArray, kind: ImageKind, pxW: Int, pxH: Int, box: RectD) :
        this(PdfImage(bytes, kind, pxW, pxH) { bytes }, box)
}

/** Thin vector rectangle outline (ruler square, passport cut boxes). */
data class StrokeRect(val box: RectD, val lineWidthPt: Double = 0.5)

/** A straight line from (x1, y1) to (x2, y2), points, top-left origin (passport cut lines). */
data class LineD(val x1: Double, val y1: Double, val x2: Double, val y2: Double)

/**
 * Phase 0 spike (g) candidate (ADR-001): minimal, deterministic PDF 1.4 writer for images + outlines only — no fonts,
 * no text, no timestamps. Streams straight to [out] with xref offsets counted as it goes. Identical image instances are
 * written once and reused (copies cost almost nothing).
 */
class MiniPdfWriter(out: OutputStream) {
    private val o = CountingStream(out)
    private val offsets = sortedMapOf<Int, Long>()
    private val pageIds = mutableListOf<Int>()
    // Keys compare by equals (strings, file names); a ByteArray key compares by identity, as before.
    private val imageIds = HashMap<Any, Int>()
    private var nextId = 3 // 1 = Catalog, 2 = Pages

    init {
        o.write("%PDF-1.4\n%âãÏÓ\n".toByteArray(Charsets.ISO_8859_1))
        obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
    }

    fun addPage(
        widthPt: Double,
        heightPt: Double,
        images: List<PlacedImage>,
        rects: List<StrokeRect> = emptyList(),
        lines: List<LineD> = emptyList(),
    ) {
        val ids = images.map { p -> imageIds.getOrPut(p.image.key) { writeImage(p.image) } }
        val content = StringBuilder()
        images.forEachIndexed { i, p ->
            val b = p.box
            val y = heightPt - b.y - b.h
            // Unit square (u right, v up) -> box, turned anticlockwise by quarter turns; origin = where the photo's
            // bottom-left corner lands.
            val m = when (Math.floorMod(p.quarterTurnsCcw, 4)) {
                1 -> "0 ${f(b.h)} ${f(-b.w)} 0 ${f(b.x + b.w)} ${f(y)}"
                2 -> "${f(-b.w)} 0 0 ${f(-b.h)} ${f(b.x + b.w)} ${f(y + b.h)}"
                3 -> "0 ${f(-b.h)} ${f(b.w)} 0 ${f(b.x)} ${f(y + b.h)}"
                else -> "${f(b.w)} 0 0 ${f(b.h)} ${f(b.x)} ${f(y)}"
            }
            content.append("q $m cm /Im${ids[i]} Do Q\n")
        }
        rects.forEach { r ->
            val y = heightPt - r.box.y - r.box.h
            content.append("q ${f(r.lineWidthPt)} w 0 G ${f(r.box.x)} ${f(y)} ${f(r.box.w)} ${f(r.box.h)} re S Q\n")
        }
        // Cut lines: thin and light grey, so they guide the scissors without showing on a trimmed photo.
        lines.forEach { l ->
            content.append("q 0.3 w 0.6 G ${f(l.x1)} ${f(heightPt - l.y1)} m ${f(l.x2)} ${f(heightPt - l.y2)} l S Q\n")
        }
        val contentId = nextId++
        stream(contentId, "", content.toString().toByteArray(Charsets.ISO_8859_1))
        val xobjects = ids.distinct().joinToString(" ") { "/Im$it $it 0 R" }
        val pageId = nextId++
        obj(
            pageId,
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(widthPt)} ${f(heightPt)}] " +
                "/Resources << /XObject << $xobjects >> >> /Contents $contentId 0 R >>",
        )
        pageIds += pageId
    }

    /** Writes the page tree, xref and trailer. Returns the total byte count. */
    fun finish(): Long {
        obj(2, "<< /Type /Pages /Kids [${pageIds.joinToString(" ") { "$it 0 R" }}] /Count ${pageIds.size} >>")
        val xref = o.count
        val size = offsets.lastKey() + 1
        val sb = StringBuilder("xref\n0 $size\n0000000000 65535 f \n")
        for (id in 1 until size) sb.append(String.format(Locale.ROOT, "%010d 00000 n \n", offsets.getValue(id)))
        sb.append("trailer\n<< /Size $size /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
        o.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
        o.flush()
        return o.count
    }

    private fun writeImage(img: PdfImage): Int {
        val id = nextId++
        val bytes = img.load()
        when (img.kind) {
            ImageKind.JPEG_RGB -> stream(
                id,
                "/Type /XObject /Subtype /Image /Width ${img.pxW} /Height ${img.pxH} /ColorSpace /DeviceRGB " +
                    "/BitsPerComponent 8 /Filter /DCTDecode ",
                bytes,
            )
            ImageKind.GREY8_RAW -> stream(
                id,
                "/Type /XObject /Subtype /Image /Width ${img.pxW} /Height ${img.pxH} /ColorSpace /DeviceGray " +
                    "/BitsPerComponent 8 /Filter /FlateDecode ",
                deflate(bytes),
            )
            // OCV Black (PLAN §G2): 1-bit rows, MSB first, padded to whole bytes; 0 = black in DeviceGray.
            ImageKind.GREY1_RAW -> stream(
                id,
                "/Type /XObject /Subtype /Image /Width ${img.pxW} /Height ${img.pxH} /ColorSpace /DeviceGray " +
                    "/BitsPerComponent 1 /Filter /FlateDecode ",
                deflate(bytes),
            )
            ImageKind.GREY8_FLATE -> stream(
                id,
                "/Type /XObject /Subtype /Image /Width ${img.pxW} /Height ${img.pxH} /ColorSpace /DeviceGray " +
                    "/BitsPerComponent 8 /Filter /FlateDecode " +
                    "/DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${img.pxW} >> ",
                bytes,
            )
        }
        return id
    }

    private fun obj(id: Int, body: String) {
        offsets[id] = o.count
        o.write("$id 0 obj\n$body\nendobj\n".toByteArray(Charsets.ISO_8859_1))
    }

    private fun stream(id: Int, dictPrefix: String, data: ByteArray) {
        offsets[id] = o.count
        o.write("$id 0 obj\n<< ${dictPrefix}/Length ${data.size} >>\nstream\n".toByteArray(Charsets.ISO_8859_1))
        o.write(data)
        o.write("\nendstream\nendobj\n".toByteArray(Charsets.ISO_8859_1))
    }

    private fun deflate(raw: ByteArray): ByteArray {
        val d = Deflater(Deflater.DEFAULT_COMPRESSION)
        d.setInput(raw)
        d.finish()
        val buf = java.io.ByteArrayOutputStream()
        val chunk = ByteArray(64 * 1024)
        while (!d.finished()) buf.write(chunk, 0, d.deflate(chunk))
        d.end()
        return buf.toByteArray()
    }

    private fun f(v: Double) = String.format(Locale.ROOT, "%.4f", v)

    private class CountingStream(private val out: OutputStream) : OutputStream() {
        var count = 0L
            private set

        override fun write(b: Int) {
            out.write(b)
            count++
        }

        override fun write(b: ByteArray, off: Int, len: Int) {
            out.write(b, off, len)
            count += len
        }

        override fun flush() = out.flush()
    }
}
