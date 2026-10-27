package `in`.printsaathi.app.engine.office.pptx

import `in`.printsaathi.app.engine.office.OfficeRefused
import `in`.printsaathi.app.engine.office.SafeXml
import `in`.printsaathi.app.engine.office.XNode
import `in`.printsaathi.app.engine.office.at
import `in`.printsaathi.app.engine.office.c
import `in`.printsaathi.app.engine.office.cs
import `in`.printsaathi.app.engine.office.deep
import `in`.printsaathi.app.engine.office.docx.Align
import `in`.printsaathi.app.engine.office.docx.DPara
import `in`.printsaathi.app.engine.office.docx.DRun
import `in`.printsaathi.app.engine.office.docx.DText
import `in`.printsaathi.app.engine.office.docx.DocxReader
import `in`.printsaathi.app.engine.office.docx.Family
import `in`.printsaathi.app.engine.office.docx.Insets4
import `in`.printsaathi.app.engine.office.docx.SuperSub
import `in`.printsaathi.app.engine.office.ln

/**
 * Phase 46: reads a customer's PowerPoint file (its zip parts, already limited by SafeZip) into a [PptxDeck], inside
 * the isolated engine. Slides in presentation order (hidden ones left out); the master's and layout's own shapes
 * behind each slide's; placeholders take their place, text styles and text box settings from the layout, then the
 * master; colours through the master's colour map and the theme; backgrounds slide → layout → master; gradients as
 * their first colour; charts, diagrams and shapes it cannot draw as marked boxes ([PptxDeck.missed]).
 */
object PptxReader {
    const val MAX_PICTURES = 200
    private const val EMU = 12700f

    fun read(parts: Map<String, ByteArray>): PptxDeck = Reading(parts).deck()

    private class Rel(val type: String, val target: String, val external: Boolean)
    private class Part(val path: String, val root: XNode, val rels: Map<String, Rel>)

    /** Run properties; null: not set at this level. */
    private data class TR(
        val size: Float? = null,
        val bold: Boolean? = null,
        val italic: Boolean? = null,
        val underline: Boolean? = null,
        val strike: Boolean? = null,
        val color: Int? = null,
        val family: Family? = null,
        val superSub: SuperSub? = null,
        val caps: Boolean? = null,
        val legacy: Boolean? = null,
    ) {
        fun over(o: TR) = TR(
            o.size ?: size, o.bold ?: bold, o.italic ?: italic, o.underline ?: underline, o.strike ?: strike,
            o.color ?: color, o.family ?: family, o.superSub ?: superSub, o.caps ?: caps, o.legacy ?: legacy,
        )
    }

    private sealed interface Bullet
    private data object NoBullet : Bullet
    private data class CharBullet(val c: String) : Bullet
    private data class AutoBullet(val type: String, val start: Int) : Bullet

    /** Paragraph properties at one level; spacing in points ([beforePct]: a share of the font size). */
    private data class TP(
        val align: Align? = null,
        val marL: Float? = null,
        val indent: Float? = null,
        val bullet: Bullet? = null,
        val before: Float? = null,
        val beforePct: Float? = null,
        val after: Float? = null,
        val afterPct: Float? = null,
        val lineMul: Float? = null,
        val lineAbs: Float? = null,
        val run: TR = TR(),
    ) {
        fun over(o: TP) = TP(
            o.align ?: align, o.marL ?: marL, o.indent ?: indent, o.bullet ?: bullet,
            if (o.before != null || o.beforePct != null) o.before else before,
            if (o.before != null || o.beforePct != null) o.beforePct else beforePct,
            if (o.after != null || o.afterPct != null) o.after else after,
            if (o.after != null || o.afterPct != null) o.afterPct else afterPct,
            if (o.lineMul != null || o.lineAbs != null) o.lineMul else lineMul,
            if (o.lineMul != null || o.lineAbs != null) o.lineAbs else lineAbs,
            run.over(o.run),
        )
    }

    /** Maps child coordinates (EMU) into the slide: v → a·v + b, then points. */
    private data class Map2(val ax: Double = 1.0, val bx: Double = 0.0, val ay: Double = 1.0, val by: Double = 0.0) {
        fun x(v: Double) = ((ax * v + bx) / EMU).toFloat()
        fun y(v: Double) = ((ay * v + by) / EMU).toFloat()
        fun w(v: Double) = (ax * v / EMU).toFloat()
        fun h(v: Double) = (ay * v / EMU).toFloat()
    }

    private class Ph(val type: String?, val idx: String?) {
        /** The kind a placeholder belongs to: title, body or its own type (date, footer, slide number …). */
        val kind: String = when (type ?: "obj") {
            "title", "ctrTitle" -> "title"
            "body", "subTitle", "obj" -> "body"
            else -> type ?: "body"
        }
    }

    private val PRESET = mapOf(
        "black" to 0x000000, "white" to 0xFFFFFF, "red" to 0xFF0000, "green" to 0x008000, "blue" to 0x0000FF,
        "yellow" to 0xFFFF00, "gray" to 0x808080, "grey" to 0x808080, "orange" to 0xFFA500, "purple" to 0x800080,
        "darkBlue" to 0x00008B, "darkRed" to 0x8B0000, "darkGreen" to 0x006400, "lightGray" to 0xD3D3D3,
    )

    /** A length in EMU; a broken or absurd one (NaN, infinity, beyond 1,000 inches) is 0 or cut to that (review I3). */
    private fun emu(v: String?): Double = v?.toDoubleOrNull()?.takeIf { it.isFinite() }?.coerceIn(-914_400_000.0, 914_400_000.0) ?: 0.0
    private fun hex(v: String?): Int? = v?.takeIf { it.length == 6 }?.toIntOrNull(16)

    private class Reading(val parts: Map<String, ByteArray>) {
        var missed = false
        val media = LinkedHashMap<String, ByteArray>()
        var pictures = 0
        var legacyFont = false
        val cache = HashMap<String, Part?>()
        var defaultText: XNode? = null

        fun xml(path: String): XNode? = parts[path]?.let { SafeXml.parse(it) }

        fun relsOf(path: String): Map<String, Rel> {
            val dir = path.substringBeforeLast('/', "")
            val relsPath = (if (dir.isEmpty()) "" else "$dir/") + "_rels/" + path.substringAfterLast('/') + ".rels"
            val root = xml(relsPath) ?: return emptyMap()
            return root.children.filter { it.ln() == "Relationship" }.mapNotNull { r ->
                val id = r.attrs["Id"] ?: return@mapNotNull null
                val target = r.attrs["Target"] ?: return@mapNotNull null
                val external = r.attrs["TargetMode"] == "External"
                id to Rel(r.attrs["Type"]?.substringAfterLast('/') ?: "", if (external) target else resolve(dir, target), external)
            }.toMap()
        }

        fun resolve(dir: String, target: String): String {
            if (target.startsWith("/")) return target.removePrefix("/")
            val out = ArrayList<String>()
            for (s in ("$dir/$target").split('/')) when (s) {
                "", "." -> Unit
                ".." -> if (out.isNotEmpty()) out.removeAt(out.size - 1)
                else -> out += s
            }
            return out.joinToString("/")
        }

        fun part(path: String?): Part? = path?.let { p -> cache.getOrPut(p) { xml(p)?.let { Part(p, it, relsOf(p)) } } }
        fun related(p: Part?, type: String): Part? = p?.rels?.values?.firstOrNull { it.type == type && !it.external }?.let { part(it.target) }

        fun deck(): PptxDeck {
            val main = relsOf("").values.firstOrNull { it.type == "officeDocument" && !it.external }?.target
                ?.takeIf { parts.containsKey(it) } ?: "ppt/presentation.xml"
            val pres = part(main) ?: throw OfficeRefused("no presentation")
            val size = pres.root.c("sldSz")
            val slideW = (emu(size?.at("cx")).takeIf { it > 0 } ?: 9_144_000.0) / EMU
            val slideH = (emu(size?.at("cy")).takeIf { it > 0 } ?: 6_858_000.0) / EMU
            defaultText = pres.root.c("defaultTextStyle")
            val slides = ArrayList<PSlide>()
            for (id in pres.root.c("sldIdLst")?.cs("sldId") ?: emptyList()) {
                val rel = id.attrs.entries.firstOrNull { it.key.substringAfter(':') == "id" && it.key != "id" }?.value?.let { pres.rels[it] } ?: continue
                val slide = part(rel.target) ?: continue
                if (slide.root.at("show") == "0") continue
                slides += Slide(slide).read()
            }
            return PptxDeck(slideW.toFloat(), slideH.toFloat(), slides, media, missed, legacyFont)
        }

        // ---- one slide, with its layout, master and theme ----

        inner class Slide(val slide: Part) {
            val layout = related(slide, "slideLayout")
            val master = related(layout, "slideMaster")
            val theme = related(master, "theme")
            val scheme: Map<String, Int> = theme?.root?.deep("clrScheme")?.children?.mapNotNull { e ->
                val v = e.children.firstOrNull() ?: return@mapNotNull null
                val rgb = when (v.ln()) {
                    "srgbClr" -> hex(v.at("val"))
                    "sysClr" -> hex(v.at("lastClr")) ?: if (v.at("val") == "window") 0xFFFFFF else 0x000000
                    else -> null
                } ?: return@mapNotNull null
                e.ln() to rgb
            }?.toMap() ?: emptyMap()
            val clrMap: Map<String, String> = master?.root?.c("clrMap")?.attrs?.mapKeys { it.key.substringAfter(':') } ?: emptyMap()

            fun read(): PSlide {
                val (bg, bgImage) = background(slide) ?: background(layout) ?: background(master) ?: (null to null)
                val shapes = ArrayList<PShape>()
                val showMaster = slide.root.at("showMasterSp") != "0"
                if (showMaster && layout?.root?.at("showMasterSp") != "0") master?.let { tree(it, Map2(), shapes, false) }
                if (showMaster) layout?.let { tree(it, Map2(), shapes, false) }
                tree(slide, Map2(), shapes, true)
                return PSlide(bg ?: 0xFFFFFFFF.toInt(), shapes, bgImage)
            }

            // ---- colours ----

            /** The colour inside [n] (a solidFill, a gs, a bgRef …); null: none there. */
            fun color(n: XNode?): Int? {
                val e = n?.children?.firstOrNull { it.ln() in setOf("srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr", "hslClr") } ?: return null
                var rgb = when (e.ln()) {
                    "srgbClr" -> hex(e.at("val"))
                    "schemeClr" -> e.at("val")?.let { scheme[clrMap[it] ?: it] ?: scheme[it] }
                    "sysClr" -> hex(e.at("lastClr")) ?: if (e.at("val") == "window") 0xFFFFFF else 0x000000
                    "prstClr" -> PRESET[e.at("val")]
                    "scrgbClr" -> listOf("r", "g", "b").map { ((e.at(it)?.toFloatOrNull() ?: 0f) / 100000f * 255f).toInt().coerceIn(0, 255) }
                        .let { (r, g, b) -> (r shl 16) or (g shl 8) or b }
                    else -> hsl((e.at("hue")?.toFloatOrNull() ?: 0f) / 60000f, (e.at("sat")?.toFloatOrNull() ?: 0f) / 100000f, (e.at("lum")?.toFloatOrNull() ?: 0f) / 100000f)
                } ?: return null
                for (m in e.children) {
                    val v = (m.at("val")?.toFloatOrNull() ?: continue) / 100000f
                    rgb = when (m.ln()) {
                        "lumMod" -> lum(rgb) { it * v }
                        "lumOff" -> lum(rgb) { it + v }
                        "tint" -> channels(rgb) { 255f - (255f - it) * v }
                        "shade" -> channels(rgb) { it * v }
                        else -> rgb
                    }
                }
                return 0xFF000000.toInt() or rgb
            }

            fun channels(rgb: Int, f: (Float) -> Float): Int {
                val r = f(((rgb shr 16) and 0xFF).toFloat()).toInt().coerceIn(0, 255)
                val g = f(((rgb shr 8) and 0xFF).toFloat()).toInt().coerceIn(0, 255)
                val b = f((rgb and 0xFF).toFloat()).toInt().coerceIn(0, 255)
                return (r shl 16) or (g shl 8) or b
            }

            fun lum(rgb: Int, f: (Float) -> Float): Int {
                val r = ((rgb shr 16) and 0xFF) / 255f
                val g = ((rgb shr 8) and 0xFF) / 255f
                val b = (rgb and 0xFF) / 255f
                val max = maxOf(r, g, b)
                val min = minOf(r, g, b)
                val l = (max + min) / 2f
                val d = max - min
                val s = if (d == 0f) 0f else d / (1f - Math.abs(2f * l - 1f))
                val h = when {
                    d == 0f -> 0f
                    max == r -> 60f * (((g - b) / d) % 6f)
                    max == g -> 60f * ((b - r) / d + 2f)
                    else -> 60f * ((r - g) / d + 4f)
                }
                return hsl(if (h < 0) h + 360f else h, s, f(l).coerceIn(0f, 1f))
            }

            fun hsl(h: Float, s: Float, l: Float): Int {
                val c = (1f - Math.abs(2f * l - 1f)) * s
                val x = c * (1f - Math.abs((h / 60f) % 2f - 1f))
                val m = l - c / 2f
                val (r, g, b) = when ((h / 60f).toInt().coerceIn(0, 5)) {
                    0 -> Triple(c, x, 0f)
                    1 -> Triple(x, c, 0f)
                    2 -> Triple(0f, c, x)
                    3 -> Triple(0f, x, c)
                    4 -> Triple(x, 0f, c)
                    else -> Triple(c, 0f, x)
                }
                val to = { v: Float -> Math.round((v + m) * 255f).coerceIn(0, 255) }
                return (to(r) shl 16) or (to(g) shl 8) or to(b)
            }

            /** A fill: a colour, a gradient's first colour, or none. [style]: the shape's p:style (its fillRef). */
            fun fill(spPr: XNode?, style: XNode?): Int? {
                spPr?.children?.forEach { f ->
                    when (f.ln()) {
                        "noFill" -> return null
                        "solidFill" -> return color(f)
                        "gradFill" -> return f.c("gsLst")?.cs("gs")?.minByOrNull { it.at("pos")?.toIntOrNull() ?: 0 }?.let { color(it) }
                        "pattFill" -> return color(f.c("fgClr"))
                    }
                }
                val ref = style?.c("fillRef") ?: return null
                return if ((ref.at("idx")?.toIntOrNull() ?: 0) > 0) color(ref) else null
            }

            fun outline(spPr: XNode?, style: XNode?): Pair<Int?, Float> {
                val ln = spPr?.c("ln")
                val w = ln?.at("w")?.toDoubleOrNull()?.let { (it / EMU).toFloat() } ?: 0.75f
                if (ln != null) {
                    if (ln.c("noFill") != null) return null to w
                    ln.c("solidFill")?.let { return color(it) to w }
                    ln.c("gradFill")?.let { g -> return g.c("gsLst")?.cs("gs")?.firstOrNull()?.let { color(it) } to w }
                }
                val ref = style?.c("lnRef") ?: return null to w
                return (if ((ref.at("idx")?.toIntOrNull() ?: 0) > 0) color(ref) else null) to w
            }

            fun background(p: Part?): Pair<Int?, String?>? {
                val bg = p?.root?.c("cSld")?.c("bg") ?: return null
                bg.c("bgPr")?.let { pr ->
                    pr.c("blipFill")?.let { bf -> picture(bf.deep("blip"), p)?.let { return null to it } }
                    return fill(pr, null) to null
                }
                bg.c("bgRef")?.let { return color(it) to null }
                return null
            }

            // ---- shapes ----

            fun tree(p: Part, map: Map2, out: MutableList<PShape>, withPlaceholders: Boolean, node: XNode? = null) {
                val t = node ?: p.root.c("cSld")?.c("spTree") ?: return
                for (c in t.children) {
                    if (c.children.firstOrNull { it.ln().startsWith("nv") }?.deep("cNvPr")?.at("hidden").let { it == "1" || it == "true" }) continue
                    val ph = placeholderOf(c)
                    if (ph != null && !withPlaceholders) continue
                    when (c.ln()) {
                        "sp" -> sp(c, ph, p, map, out)
                        "pic" -> pic(c, ph, p, map, out)
                        "cxnSp" -> line(c, c.c("spPr"), map)?.let { out += it }
                        "grpSp" -> group(c, p, map, out, withPlaceholders)
                        "graphicFrame" -> frame(c, p, map, out)
                        "AlternateContent" -> (c.c("Choice") ?: c.c("Fallback"))?.let { tree(p, map, out, withPlaceholders, it) }
                        "contentPart" -> missed = true
                        else -> Unit
                    }
                }
            }

            fun placeholderOf(c: XNode): Ph? =
                c.children.firstOrNull { it.ln().startsWith("nv") }?.c("nvPr")?.c("ph")?.let { Ph(it.at("type"), it.at("idx")) }

            /** The shape in [p]'s tree standing for placeholder [ph]: the same idx, else the same kind. */
            fun findPh(p: Part?, ph: Ph, byIdx: Boolean): XNode? {
                val all = p?.root?.c("cSld")?.c("spTree")?.children?.filter { placeholderOf(it) != null } ?: return null
                if (byIdx && ph.idx != null) all.firstOrNull { placeholderOf(it)?.idx == ph.idx }?.let { return it }
                return all.firstOrNull { placeholderOf(it)?.kind == ph.kind }
            }

            /** The layout's and the master's shapes for placeholder [ph] (either may be missing). */
            fun inherited(ph: Ph?): Pair<XNode?, XNode?> {
                if (ph == null) return null to null
                val onLayout = findPh(layout, ph, true)
                val onMaster = findPh(master, onLayout?.let { placeholderOf(it) } ?: ph, false)
                return onLayout to onMaster
            }

            fun spPrOf(n: XNode?) = n?.c("spPr")

            /** The place of a shape: its own xfrm, else its layout's, else its master's placeholder's. */
            fun place(own: XNode?, ph: Ph?, map: Map2): FloatArray? {
                val (l, m) = inherited(ph)
                val xf = own ?: spPrOf(l)?.c("xfrm") ?: spPrOf(m)?.c("xfrm") ?: return null
                val off = xf.c("off")
                val ext = xf.c("ext")
                return floatArrayOf(
                    map.x(emu(off?.at("x"))), map.y(emu(off?.at("y"))), map.w(emu(ext?.at("cx"))), map.h(emu(ext?.at("cy"))),
                    (xf.at("rot")?.toFloatOrNull() ?: 0f) / 60000f,
                    if (xf.at("flipH") == "1") 1f else 0f, if (xf.at("flipV") == "1") 1f else 0f,
                )
            }

            fun sp(c: XNode, ph: Ph?, p: Part, map: Map2, out: MutableList<PShape>) {
                val spPr = c.c("spPr")
                val box = place(spPr?.c("xfrm"), ph, map) ?: run {
                    // A placeholder with no place on the slide, its layout or its master: its text is not drawn.
                    if (c.c("txBody")?.deep("t")?.text?.isNotBlank() == true) missed = true
                    return
                }
                val style = c.c("style")
                val prst = spPr?.c("prstGeom")?.at("prst") ?: if (spPr?.c("custGeom") != null) "custom" else "rect"
                if (prst in setOf("line", "straightConnector1")) {
                    line(c, spPr, map)?.let { out += it }
                    return
                }
                spPr?.c("blipFill")?.let { bf ->
                    val key = picture(bf.deep("blip"), p)
                    out += if (key != null) PPicture(box[0], box[1], box[2], box[3], box[4], key) else box(box, "Picture")
                }
                val geom = when (prst) {
                    "rect", "flowChartProcess", "snip1Rect", "frame" -> Geom.RECT
                    "roundRect", "round2SameRect", "round1Rect", "flowChartAlternateProcess" -> Geom.ROUND_RECT
                    "ellipse", "flowChartConnector", "circle" -> Geom.ELLIPSE
                    else -> Geom.OTHER
                }
                var fill = fill(spPr, style)
                var (lineColor, lineW) = outline(spPr, style)
                if (geom == Geom.OTHER && (fill != null || lineColor != null)) {
                    missed = true
                    fill = null
                    lineColor = null
                }
                val body = c.c("txBody")
                val (lPh, mPh) = inherited(ph)
                val bodyPrs = listOfNotNull(mPh?.c("txBody")?.c("bodyPr"), lPh?.c("txBody")?.c("bodyPr"), body?.c("bodyPr"))
                val inset = { name: String, dflt: Double -> bodyPrs.lastOrNull { it.at(name) != null }?.at(name)?.let { emu(it) } ?: dflt }
                val anchor = when (bodyPrs.lastOrNull { it.at("anchor") != null }?.at("anchor")) {
                    "ctr" -> Anchor.MIDDLE
                    "b" -> Anchor.BOTTOM
                    else -> Anchor.TOP
                }
                val autofit = body?.c("bodyPr")?.c("normAutofit")
                val fontScale = (autofit?.at("fontScale")?.toFloatOrNull() ?: 100000f) / 100000f
                val lineCut = (autofit?.at("lnSpcReduction")?.toFloatOrNull() ?: 0f) / 100000f
                val fontColor = style?.c("fontRef")?.let { color(it) }
                val paras = body?.let { paragraphs(it, ph, lPh, mPh, fontColor, lineCut) } ?: emptyList()
                if (fill == null && lineColor == null && paras.isEmpty()) return
                out += PText(
                    box[0], box[1], box[2], box[3], box[4], fill, lineColor, lineW, geom,
                    Insets4(
                        (inset("tIns", 45720.0) / EMU).toFloat(), (inset("rIns", 91440.0) / EMU).toFloat(),
                        (inset("bIns", 45720.0) / EMU).toFloat(), (inset("lIns", 91440.0) / EMU).toFloat(),
                    ),
                    anchor, fontScale.coerceIn(0.1f, 1f), paras,
                )
            }

            fun line(c: XNode, spPr: XNode?, map: Map2): PLine? {
                val box = place(spPr?.c("xfrm"), null, map) ?: return null
                val (color, w) = outline(spPr, c.c("style"))
                return PLine(box[0], box[1], box[2], box[3], box[4], color ?: return null, w, box[5] == 1f, box[6] == 1f)
            }

            fun pic(c: XNode, ph: Ph?, p: Part, map: Map2, out: MutableList<PShape>) {
                val box = place(c.c("spPr")?.c("xfrm"), ph, map) ?: run {
                    missed = true
                    return
                }
                val bf = c.c("blipFill")
                val key = picture(bf?.deep("blip"), p)
                if (key == null) {
                    out += box(box, "Picture")
                    return
                }
                val src = bf?.c("srcRect")
                val f = { n: String -> (src?.at(n)?.toFloatOrNull() ?: 0f) / 100000f }
                out += PPicture(box[0], box[1], box[2], box[3], box[4], key, Insets4(f("t"), f("r"), f("b"), f("l")))
            }

            fun box(b: FloatArray, label: String): PPlaceholderBox {
                missed = true
                return PPlaceholderBox(b[0], b[1], b[2], b[3], b[4], label)
            }

            fun group(g: XNode, p: Part, map: Map2, out: MutableList<PShape>, withPlaceholders: Boolean) {
                val xf = g.c("grpSpPr")?.c("xfrm")
                val inner = if (xf == null) {
                    map
                } else {
                    val off = xf.c("off")
                    val ext = xf.c("ext")
                    val chOff = xf.c("chOff")
                    val chExt = xf.c("chExt")
                    val kx = emu(ext?.at("cx")) / emu(chExt?.at("cx")).takeIf { it > 0 }.let { it ?: emu(ext?.at("cx")).takeIf { e -> e > 0 } ?: 1.0 }
                    val ky = emu(ext?.at("cy")) / emu(chExt?.at("cy")).takeIf { it > 0 }.let { it ?: emu(ext?.at("cy")).takeIf { e -> e > 0 } ?: 1.0 }
                    val ox = emu(off?.at("x")) - emu(chOff?.at("x")) * kx
                    val oy = emu(off?.at("y")) - emu(chOff?.at("y")) * ky
                    Map2(map.ax * kx, map.ax * ox + map.bx, map.ay * ky, map.ay * oy + map.by)
                }
                tree(p, inner, out, withPlaceholders, g)
            }

            fun frame(f: XNode, p: Part, map: Map2, out: MutableList<PShape>) {
                val box = place(f.c("xfrm"), placeholderOf(f), map) ?: return
                val data = f.deep("graphicData") ?: return
                val uri = data.at("uri") ?: ""
                when {
                    uri.endsWith("/table") -> data.c("tbl")?.let { out += table(it, box, map) }
                    uri.endsWith("/chart") || uri.contains("chartex") -> out += box(box, "Chart")
                    uri.endsWith("/diagram") -> out += box(box, "Diagram")
                    else -> {
                        // An embedded object: its preview picture if it has one.
                        val pic = data.deep("pic")
                        val key = pic?.c("blipFill")?.deep("blip")?.let { picture(it, p) }
                        out += if (key != null) PPicture(box[0], box[1], box[2], box[3], box[4], key) else box(box, "Picture")
                    }
                }
            }

            fun table(t: XNode, box: FloatArray, map: Map2): PTable {
                val cols = t.c("tblGrid")?.cs("gridCol")?.map { map.w(emu(it.at("w"))) } ?: emptyList()
                val trs = t.cs("tr")
                val rows = trs.map { tr ->
                    tr.cs("tc").map { tc ->
                        val paras = tc.c("txBody")?.let { paragraphs(it, null, null, null, null, 0f) } ?: emptyList()
                        PCell(
                            paras, fill(tc.c("tcPr"), null), tc.at("gridSpan")?.toIntOrNull()?.coerceIn(1, 64) ?: 1,
                            hMerge = tc.at("hMerge") == "1", vMerge = tc.at("vMerge") == "1",
                            rowSpan = tc.at("rowSpan")?.toIntOrNull()?.coerceIn(1, 1000) ?: 1,
                        )
                    }
                }
                return PTable(box[0], box[1], box[2], box[3], box[4], cols, trs.map { map.h(emu(it.at("h"))) }, rows)
            }

            /** The master's text style for a placeholder of [kind], or the presentation's default for other text. */
            fun baseStyle(ph: Ph?): XNode? {
                val styles = master?.root?.c("txStyles")
                return when (ph?.kind) {
                    null -> defaultText ?: styles?.c("otherStyle")
                    "title" -> styles?.c("titleStyle")
                    "body" -> styles?.c("bodyStyle")
                    else -> styles?.c("otherStyle")
                }
            }

            fun level(list: XNode?, lvl: Int): TP = tp(list?.c("lvl${lvl + 1}pPr"))

            fun tp(n: XNode?): TP {
                if (n == null) return TP()
                var t = TP(
                    align = when (n.at("algn")) {
                        "ctr" -> Align.CENTER
                        "r" -> Align.RIGHT
                        "just", "dist", "justLow", "thaiDist" -> Align.JUSTIFY
                        "l" -> Align.LEFT
                        else -> null
                    },
                    marL = n.at("marL")?.let { (emu(it) / EMU).toFloat() },
                    indent = n.at("indent")?.let { (emu(it) / EMU).toFloat() },
                )
                for (c in n.children) t = when (c.ln()) {
                    "buNone" -> t.copy(bullet = NoBullet)
                    "buChar" -> t.copy(bullet = CharBullet(c.at("char")?.let { bulletChar(it) } ?: "•"))
                    "buAutoNum" -> t.copy(bullet = AutoBullet(c.at("type") ?: "arabicPeriod", c.at("startAt")?.toIntOrNull() ?: 1))
                    "spcBef" -> c.c("spcPts")?.let { t.copy(before = (it.at("val")?.toFloatOrNull() ?: 0f) / 100f, beforePct = null) }
                        ?: c.c("spcPct")?.let { t.copy(before = null, beforePct = (it.at("val")?.toFloatOrNull() ?: 0f) / 100000f) } ?: t
                    "spcAft" -> c.c("spcPts")?.let { t.copy(after = (it.at("val")?.toFloatOrNull() ?: 0f) / 100f, afterPct = null) }
                        ?: c.c("spcPct")?.let { t.copy(after = null, afterPct = (it.at("val")?.toFloatOrNull() ?: 0f) / 100000f) } ?: t
                    "lnSpc" -> c.c("spcPct")?.let { t.copy(lineMul = (it.at("val")?.toFloatOrNull() ?: 100000f) / 100000f, lineAbs = null) }
                        ?: c.c("spcPts")?.let { t.copy(lineMul = null, lineAbs = (it.at("val")?.toFloatOrNull() ?: 0f) / 100f) } ?: t
                    "defRPr" -> t.copy(run = t.run.over(tr(c)))
                    else -> t
                }
                return t
            }

            /** Symbol-font bullets ("§", private-use letters) as the plain marks the phone has. */
            fun bulletChar(s: String): String {
                val ch = s.firstOrNull() ?: return "•"
                return when {
                    ch.code >= 0xE000 || ch == '§' || ch == 'Ø' || ch == 'ü' || ch == 'Ÿ' -> "•"
                    ch == 'o' -> "◦"
                    else -> ch.toString()
                }
            }

            fun tr(n: XNode?): TR {
                if (n == null) return TR()
                val on = { v: String? -> v?.let { it == "1" || it == "true" } }
                val baseline = n.at("baseline")?.toIntOrNull()
                return TR(
                    size = n.at("sz")?.toFloatOrNull()?.takeIf { it.isFinite() && it > 0f }?.div(100f),
                    bold = on(n.at("b")),
                    italic = on(n.at("i")),
                    underline = n.at("u")?.let { it != "none" },
                    strike = n.at("strike")?.let { it != "noStrike" },
                    color = n.c("solidFill")?.let { color(it) } ?: n.c("gradFill")?.c("gsLst")?.cs("gs")?.firstOrNull()?.let { color(it) },
                    family = n.c("latin")?.at("typeface")?.let { if (it.startsWith("+")) Family.SANS else DocxReader.familyOf(it) },
                    legacy = n.c("latin")?.at("typeface")?.let { DocxReader.legacyHindi(it) },
                    superSub = baseline?.let { if (it > 0) SuperSub.SUPER else if (it < 0) SuperSub.SUB else SuperSub.NONE },
                    caps = n.at("cap")?.let { it != "none" },
                )
            }

            fun paragraphs(body: XNode, ph: Ph?, lPh: XNode?, mPh: XNode?, fontColor: Int?, lineCut: Float): List<DPara> {
                val base = baseStyle(ph)
                val lists = listOfNotNull(mPh?.c("txBody")?.c("lstStyle"), lPh?.c("txBody")?.c("lstStyle"), body.c("lstStyle"))
                val counters = IntArray(9)
                val out = ArrayList<DPara>()
                for (p in body.cs("p")) {
                    val pPr = p.c("pPr")
                    val lvl = pPr?.at("lvl")?.toIntOrNull()?.coerceIn(0, 8) ?: 0
                    var props = TP(run = TR(size = 18f, color = 0xFF000000.toInt())).over(level(base, lvl))
                    if (fontColor != null) props = props.copy(run = props.run.copy(color = fontColor))
                    for (l in lists) props = props.over(level(l, lvl))
                    props = props.over(tp(pPr))
                    val runs = ArrayList<DRun>()
                    for (r in p.children) when (r.ln()) {
                        "r", "fld" -> r.c("t")?.text?.let { runs += text(it, props.run.over(tr(r.c("rPr")))) }
                        "br" -> runs += text("\n", props.run.over(tr(r.c("rPr"))))
                        else -> Unit
                    }
                    val mark = props.run.over(tr(p.c("endParaRPr")))
                    val size = runs.filterIsInstance<DText>().maxOfOrNull { it.sizePt } ?: mark.size ?: 18f
                    val hasText = runs.any { it is DText && it.text.isNotBlank() }
                    for (k in lvl + 1 until 9) counters[k] = 0
                    val label = when (val b = props.bullet) {
                        is CharBullet -> if (hasText) b.c else null
                        is AutoBullet -> if (hasText) autoNumber(b, if (counters[lvl] == 0) b.start else counters[lvl] + 1).also { counters[lvl] = if (counters[lvl] == 0) b.start else counters[lvl] + 1 } else null
                        else -> null
                    }
                    if (props.bullet !is AutoBullet) counters[lvl] = 0
                    val lineMul = (
                        props.lineAbs?.let { it / (size * 1.17f) } ?: props.lineMul ?: 1f
                        ) * (1f - lineCut)
                    out += DPara(
                        align = props.align ?: Align.LEFT,
                        spaceBefore = props.before ?: (props.beforePct?.let { it * size * 1.2f } ?: 0f),
                        spaceAfter = props.after ?: (props.afterPct?.let { it * size * 1.2f } ?: 0f),
                        lineMul = lineMul.coerceIn(0.5f, 5f),
                        indentLeft = props.marL ?: 0f,
                        indentFirst = props.indent ?: 0f,
                        label = label,
                        runs = runs,
                        markSizePt = mark.size ?: 18f,
                    )
                }
                // A text box with nothing written in it draws no text.
                return if (out.all { p -> p.runs.none { it is DText && it.text.isNotBlank() } }) emptyList() else out
            }

            fun autoNumber(b: AutoBullet, n: Int): String {
                val t = b.type
                val v = when {
                    t.startsWith("alphaLc") -> letters(n)
                    t.startsWith("alphaUc") -> letters(n).uppercase()
                    t.startsWith("romanLc") -> roman(n).lowercase()
                    t.startsWith("romanUc") -> roman(n)
                    else -> "$n"
                }
                return when {
                    t.endsWith("ParenBoth") -> "($v)"
                    t.endsWith("ParenR") -> "$v)"
                    t.endsWith("Plain") -> v
                    else -> "$v."
                }
            }

            fun letters(v: Int) = if (v < 1) "$v" else ('a' + (v - 1) % 26).toString().repeat((v - 1) / 26 + 1)

            fun roman(v: Int): String {
                if (v !in 1..3999) return "$v"
                var n = v
                val sb = StringBuilder()
                for ((value, sym) in listOf(1000 to "M", 900 to "CM", 500 to "D", 400 to "CD", 100 to "C", 90 to "XC", 50 to "L", 40 to "XL", 10 to "X", 9 to "IX", 5 to "V", 4 to "IV", 1 to "I")) {
                    while (n >= value) {
                        sb.append(sym)
                        n -= value
                    }
                }
                return sb.toString()
            }

            fun text(t: String, r: TR): DText {
                if (r.legacy == true && t.any { it.isLetter() }) legacyFont = true
                return textOf(t, r)
            }

            fun textOf(t: String, r: TR) = DText(
                text = if (r.caps == true) t.uppercase() else t,
                bold = r.bold == true,
                italic = r.italic == true,
                underline = r.underline == true,
                strike = r.strike == true,
                sizePt = r.size ?: 18f,
                color = r.color ?: 0xFF000000.toInt(),
                family = r.family ?: Family.SANS,
                superSub = r.superSub ?: SuperSub.NONE,
            )
        }

        /** A picture's part name if the phone can draw it (PNG, JPEG, GIF, BMP, WebP), kept in [media]. */
        fun picture(blip: XNode?, p: Part): String? {
            val rId = blip?.attrs?.entries?.firstOrNull { it.key.substringAfter(':') == "embed" }?.value ?: return null
            val rel = p.rels[rId]?.takeIf { !it.external } ?: return null
            val bytes = parts[rel.target] ?: return null
            fun at(i: Int) = if (i < bytes.size) bytes[i].toInt() and 0xFF else -1
            val drawable = (at(0) == 0x89 && at(1) == 0x50) || (at(0) == 0xFF && at(1) == 0xD8) ||
                (at(0) == 0x47 && at(1) == 0x49) || (at(0) == 0x42 && at(1) == 0x4D) ||
                (at(0) == 0x52 && at(1) == 0x49 && at(8) == 0x57 && at(9) == 0x45)
            if (!drawable) return null
            if (!media.containsKey(rel.target)) {
                if (++pictures > MAX_PICTURES) throw OfficeRefused("too many pictures")
                media[rel.target] = bytes
            }
            return rel.target
        }
    }
}
