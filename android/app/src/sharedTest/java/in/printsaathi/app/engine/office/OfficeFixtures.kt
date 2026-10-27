package `in`.printsaathi.app.engine.office

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Round 9: synthetic Word / PowerPoint / Excel files built in code (never real documents), for the JVM tests, the
 * device tests and the test sender. Each builder takes the XML of the parts that matter and wraps it in a valid file.
 */
object OfficeFixtures {
    const val W = "xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" " +
        "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" " +
        "xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" " +
        "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" " +
        "xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\""
    const val P = "xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" " +
        "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" " +
        "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\""
    const val S = "xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" " +
        "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\""

    /** A zip of [entries] in order; [stored]: no compression. */
    fun zip(entries: List<Pair<String, ByteArray>>, stored: Boolean = false): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            for ((name, data) in entries) {
                val e = ZipEntry(name)
                if (stored) {
                    e.method = ZipEntry.STORED
                    e.size = data.size.toLong()
                    e.compressedSize = data.size.toLong()
                    e.crc = java.util.zip.CRC32().apply { update(data) }.value
                }
                z.putNextEntry(e)
                z.write(data)
                z.closeEntry()
            }
        }
        return out.toByteArray()
    }

    private fun s(x: String) = x.toByteArray(Charsets.UTF_8)

    private const val TYPES = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"/>"

    /**
     * A Word file: [body] is the inside of `<w:body>` (paragraphs, tables, a final `<w:sectPr>` if wanted). [rels] are
     * `<Relationship …/>` elements of document.xml.rels; [media] files go under word/.
     */
    fun docx(
        body: String,
        styles: String? = null,
        numbering: String? = null,
        rels: String = "",
        parts: List<Pair<String, ByteArray>> = emptyList(),
    ): ByteArray = zip(
        buildList {
            add("[Content_Types].xml" to s(TYPES))
            add("word/document.xml" to s("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document $W><w:body>$body</w:body></w:document>"))
            add("word/_rels/document.xml.rels" to s("<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">$rels</Relationships>"))
            if (styles != null) add("word/styles.xml" to s("<?xml version=\"1.0\"?><w:styles $W>$styles</w:styles>"))
            if (numbering != null) add("word/numbering.xml" to s("<?xml version=\"1.0\"?><w:numbering $W>$numbering</w:numbering>"))
            addAll(parts)
        },
    )

    /** A PowerPoint file from its parts (each a full XML string or bytes), plus [Content_Types].xml. */
    fun pptx(parts: List<Pair<String, String>>, media: List<Pair<String, ByteArray>> = emptyList()): ByteArray =
        zip(listOf("[Content_Types].xml" to s(TYPES)) + parts.map { (n, x) -> n to s(x) } + media)

    // ---- Phase 46: whole PowerPoint decks (presentation, slides, layouts, one master, a theme) ----

    private const val REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    private fun rels(vararg r: Triple<String, String, String>) =
        "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
            r.joinToString("") { (id, type, target) -> "<Relationship Id=\"$id\" Type=\"$REL/$type\" Target=\"$target\"/>" } + "</Relationships>"

    /** The theme's colours: dk1 black, lt1 white, dk2 44546A, lt2 E7E6E6, accent1 4472C4 … accent6 70AD47. */
    val THEME = "<?xml version=\"1.0\"?><a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"t\"><a:themeElements>" +
        "<a:clrScheme name=\"c\"><a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1><a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>" +
        "<a:dk2><a:srgbClr val=\"44546A\"/></a:dk2><a:lt2><a:srgbClr val=\"E7E6E6\"/></a:lt2>" +
        listOf("4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47").mapIndexed { i, c -> "<a:accent${i + 1}><a:srgbClr val=\"$c\"/></a:accent${i + 1}>" }.joinToString("") +
        "<a:hlink><a:srgbClr val=\"0563C1\"/></a:hlink><a:folHlink><a:srgbClr val=\"954F72\"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>"

    private fun tree(shapes: String) =
        "<p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>$shapes</p:spTree>"

    /** A slide with [shapes] (p:sp, p:pic … XML) and a background [bg] (see [bg]); [show] false: a hidden slide. */
    fun slide(shapes: String, bg: String = "", show: Boolean = true) =
        "<?xml version=\"1.0\"?><p:sld $P${if (show) "" else " show=\"0\""}><p:cSld>$bg${tree(shapes)}</p:cSld></p:sld>"

    fun layout(shapes: String = "", bg: String = "") = "<?xml version=\"1.0\"?><p:sldLayout $P><p:cSld>$bg${tree(shapes)}</p:cSld></p:sldLayout>"

    fun bg(hex: String) = "<p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"$hex\"/></a:solidFill></p:bgPr></p:bg>"

    fun xfrm(x: Long, y: Long, w: Long, h: Long) = "<a:xfrm><a:off x=\"$x\" y=\"$y\"/><a:ext cx=\"$w\" cy=\"$h\"/></a:xfrm>"

    /** A shape: [ph] (e.g. `<p:ph type="title"/>`) inside nvPr, [spPr] its properties, [txBody] the inside of p:txBody. */
    fun sp(ph: String = "", spPr: String = "", txBody: String? = null, id: Int = 2) =
        "<p:sp><p:nvSpPr><p:cNvPr id=\"$id\" name=\"s$id\"/><p:cNvSpPr/><p:nvPr>$ph</p:nvPr></p:nvSpPr><p:spPr>$spPr</p:spPr>" +
            (txBody?.let { "<p:txBody>$it</p:txBody>" } ?: "") + "</p:sp>"

    /**
     * A whole deck: [slides] (see [slide]) in [order] (indexes into [slides]); slide i uses layout [uses][i] of
     * [layouts]; one master with [masterShapes], [masterBg] and [txStyles] (the inside of p:txStyles); [slideRels]
     * adds relationships (r:id → ../media/…) to each slide; [media] goes under ppt/.
     */
    fun deck(
        slides: List<String>,
        layouts: List<String> = listOf(layout()),
        uses: List<Int> = List(slides.size) { 0 },
        masterShapes: String = "",
        masterBg: String = "",
        txStyles: String = "",
        size: Pair<Long, Long> = 9_144_000L to 6_858_000L,
        order: List<Int> = slides.indices.toList(),
        slideRels: List<List<Triple<String, String, String>>> = List(slides.size) { emptyList() },
        media: List<Pair<String, ByteArray>> = emptyList(),
    ): ByteArray {
        val parts = ArrayList<Pair<String, ByteArray>>()
        val add = { n: String, x: String -> parts += n to s(x) }
        add("[Content_Types].xml", TYPES)
        add("_rels/.rels", rels(Triple("rId1", "officeDocument", "ppt/presentation.xml")))
        add(
            "ppt/presentation.xml",
            "<?xml version=\"1.0\"?><p:presentation $P><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rIdM\"/></p:sldMasterIdLst>" +
                "<p:sldIdLst>" + order.mapIndexed { k, i -> "<p:sldId id=\"${256 + k}\" r:id=\"rIdS${i + 1}\"/>" }.joinToString("") + "</p:sldIdLst>" +
                "<p:sldSz cx=\"${size.first}\" cy=\"${size.second}\"/></p:presentation>",
        )
        add(
            "ppt/_rels/presentation.xml.rels",
            rels(Triple("rIdM", "slideMaster", "slideMasters/slideMaster1.xml"), *slides.indices.map { Triple("rIdS${it + 1}", "slide", "slides/slide${it + 1}.xml") }.toTypedArray()),
        )
        slides.forEachIndexed { i, x ->
            add("ppt/slides/slide${i + 1}.xml", x)
            add("ppt/slides/_rels/slide${i + 1}.xml.rels", rels(Triple("rIdL", "slideLayout", "../slideLayouts/slideLayout${uses[i] + 1}.xml"), *slideRels[i].toTypedArray()))
        }
        layouts.forEachIndexed { i, x ->
            add("ppt/slideLayouts/slideLayout${i + 1}.xml", x)
            add("ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels", rels(Triple("rIdM", "slideMaster", "../slideMasters/slideMaster1.xml")))
        }
        add(
            "ppt/slideMasters/slideMaster1.xml",
            "<?xml version=\"1.0\"?><p:sldMaster $P><p:cSld>$masterBg${tree(masterShapes)}</p:cSld>" +
                "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>" +
                "<p:txStyles>$txStyles</p:txStyles></p:sldMaster>",
        )
        add(
            "ppt/slideMasters/_rels/slideMaster1.xml.rels",
            rels(Triple("rIdT", "theme", "../theme/theme1.xml"), *layouts.indices.map { Triple("rIdL${it + 1}", "slideLayout", "../slideLayouts/slideLayout${it + 1}.xml") }.toTypedArray()),
        )
        add("ppt/theme/theme1.xml", THEME)
        return zip(parts + media.map { (n, b) -> "ppt/$n" to b })
    }

    /** An Excel file from its parts. */
    fun xlsx(parts: List<Pair<String, String>>): ByteArray = zip(listOf("[Content_Types].xml" to s(TYPES)) + parts.map { (n, x) -> n to s(x) })

    /** An OpenDocument file: its first entry is `mimetype`, stored. */
    fun odf(mimetype: String): ByteArray = zip(listOf("mimetype" to s(mimetype), "content.xml" to s("<office:document-content/>")), stored = true)

    /** The start of an old binary Office file (OLE compound file): its signature and a directory naming [streams]. */
    fun ole(vararg streams: String): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0xD0.toByte(), 0xCF.toByte(), 0x11, 0xE0.toByte(), 0xA1.toByte(), 0xB1.toByte(), 0x1A, 0xE1.toByte()))
        out.write(ByteArray(504))
        for (name in listOf("Root Entry") + streams) {
            val entry = ByteArray(128)
            val utf16 = (name + "\u0000").toByteArray(Charsets.UTF_16LE)
            System.arraycopy(utf16, 0, entry, 0, minOf(64, utf16.size))
            entry[64] = minOf(64, utf16.size).toByte()
            out.write(entry)
        }
        out.write(ByteArray(512))
        return out.toByteArray()
    }

    /** A tiny solid-colour PNG ([w] × [h]), for pictures in documents. */
    fun png(w: Int, h: Int, rgb: Int): ByteArray {
        val raw = ByteArrayOutputStream()
        for (y in 0 until h) {
            raw.write(0)
            repeat(w) {
                raw.write((rgb shr 16) and 0xFF)
                raw.write((rgb shr 8) and 0xFF)
                raw.write(rgb and 0xFF)
            }
        }
        fun chunk(o: ByteArrayOutputStream, type: String, data: ByteArray) {
            val len = data.size
            o.write(byteArrayOf((len ushr 24).toByte(), (len ushr 16).toByte(), (len ushr 8).toByte(), len.toByte()))
            val td = type.toByteArray(Charsets.US_ASCII) + data
            o.write(td)
            val crc = java.util.zip.CRC32().apply { update(td) }.value
            o.write(byteArrayOf((crc ushr 24).toByte(), (crc ushr 16).toByte(), (crc ushr 8).toByte(), crc.toByte()))
        }
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))
        val ihdr = java.nio.ByteBuffer.allocate(13).putInt(w).putInt(h).put(8).put(2).put(0).put(0).put(0).array()
        chunk(out, "IHDR", ihdr)
        val z = ByteArrayOutputStream()
        java.util.zip.DeflaterOutputStream(z).use { it.write(raw.toByteArray()) }
        chunk(out, "IDAT", z.toByteArray())
        chunk(out, "IEND", ByteArray(0))
        return out.toByteArray()
    }
}
