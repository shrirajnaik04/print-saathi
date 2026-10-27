package `in`.printsaathi.app.engine.office.docx

import `in`.printsaathi.app.engine.office.OfficeRefused
import `in`.printsaathi.app.engine.office.SafeXml
import `in`.printsaathi.app.engine.office.XNode
import `in`.printsaathi.app.engine.office.c
import `in`.printsaathi.app.engine.office.cs
import `in`.printsaathi.app.engine.office.deep
import `in`.printsaathi.app.engine.office.deepAll
import `in`.printsaathi.app.engine.office.ln

/**
 * Phase 45: reads a customer's Word file (its zip parts, already limited by SafeZip) into a [DocxDoc], inside the
 * isolated engine. Elements are matched by local name, so an unusual namespace prefix reads the same. Styles
 * (docDefaults, basedOn chains), numbering, sections, fields, tracked changes (accepted), default headers and footers,
 * footnotes and endnotes (at the end), text boxes (after their paragraph) and pictures are kept; charts, diagrams,
 * shapes and pictures it cannot draw become marked boxes and set [DocxDoc.missed].
 */
object DocxReader {
    const val MAX_PICTURES = 200

    fun read(parts: Map<String, ByteArray>): DocxDoc = Reading(parts).doc()

    private class Rel(val type: String, val target: String, val external: Boolean)
    private class Part(val path: String, val rels: Map<String, Rel>)

    /** Run properties; null: not set here (the style below decides). */
    private data class RP(
        val bold: Boolean? = null,
        val italic: Boolean? = null,
        val underline: Boolean? = null,
        val strike: Boolean? = null,
        val size: Float? = null,
        val color: Int? = null,
        val highlight: Int? = null,
        val family: Family? = null,
        val superSub: SuperSub? = null,
        val caps: Boolean? = null,
        val hidden: Boolean? = null,
        val legacy: Boolean? = null,
    ) {
        fun over(o: RP) = RP(
            o.bold ?: bold, o.italic ?: italic, o.underline ?: underline, o.strike ?: strike, o.size ?: size,
            o.color ?: color, o.highlight ?: highlight, o.family ?: family, o.superSub ?: superSub, o.caps ?: caps,
            o.hidden ?: hidden, o.legacy ?: legacy,
        )
    }

    /** Paragraph properties; null: not set here. [lineAuto] is a multiple, [lineAbs] points ([atLeast] or exact). */
    private data class PP(
        val style: String? = null,
        val align: Align? = null,
        val before: Float? = null,
        val after: Float? = null,
        val lineAuto: Float? = null,
        val lineAbs: Float? = null,
        val atLeast: Boolean? = null,
        val left: Float? = null,
        val right: Float? = null,
        val first: Float? = null,
        val numId: Int? = null,
        val ilvl: Int? = null,
        val pageBreakBefore: Boolean? = null,
        val contextual: Boolean? = null,
    ) {
        fun over(o: PP): PP {
            // A line rule set here replaces both kinds below.
            val line = o.lineAuto != null || o.lineAbs != null
            return PP(
                o.style ?: style, o.align ?: align, o.before ?: before, o.after ?: after,
                if (line) o.lineAuto else lineAuto, if (line) o.lineAbs else lineAbs, if (line) o.atLeast else atLeast,
                o.left ?: left, o.right ?: right, o.first ?: first, o.numId ?: numId, o.ilvl ?: ilvl,
                o.pageBreakBefore ?: pageBreakBefore, o.contextual ?: contextual,
            )
        }
    }

    private class Style(val type: String, val basedOn: String?, val pp: PP, val rp: RP, val tblBorders: XNode?)
    private class Lvl(val start: Int, val fmt: String, val text: String, val pp: PP)
    private class Num(val abstractId: String, val starts: Map<Int, Int>)

    /** A complex field being read: its instruction, whether its result has started, and whether it is drawn live. */
    private class Field(val instr: StringBuilder = StringBuilder(), var result: Boolean = false, var live: Boolean = false)

    /** What a paragraph's content gives: a run, a page break, or blocks that follow the paragraph (text boxes). */
    private sealed interface Item
    private class RunItem(val run: DRun) : Item
    private data object BreakItem : Item
    private class After(val blocks: List<DBlock>) : Item

    // ---- small helpers on the XML tree ----

    private fun XNode.a(l: String): String? =
        attrs["w:$l"] ?: attrs[l] ?: attrs.entries.firstOrNull { it.key.substringAfter(':') == l }?.value
    /** A toggle (w:b, w:i …): present means on unless its value says off. */
    private fun XNode.on() = a("val")?.lowercase()?.let { it !in setOf("0", "false", "off", "none") } ?: true

    /** A length in twentieths of a point (or with a unit, in strict files) as points. */
    private fun pt(v: String?): Float? {
        if (v == null) return null
        val m = Regex("^(-?[0-9.]+)(pt|in|cm|mm|pc|pi)?$").find(v.trim()) ?: return null
        val n = m.groupValues[1].toFloatOrNull() ?: return null
        return when (m.groupValues[2]) {
            "" -> n / 20f
            "pt" -> n
            "in" -> n * 72f
            "cm" -> n * 72f / 2.54f
            "mm" -> n * 72f / 25.4f
            else -> n * 12f
        }
    }
    private fun emu(v: String?): Float = (v?.toLongOrNull() ?: 0L) / 12700f
    private fun hex(v: String?): Int? {
        if (v == null || v.equals("auto", true) || v.length != 6) return null
        return v.toIntOrNull(16)?.let { 0xFF000000.toInt() or it }
    }

    private val HIGHLIGHT = mapOf(
        "yellow" to 0xFFFF00, "green" to 0x00FF00, "cyan" to 0x00FFFF, "magenta" to 0xFF00FF, "blue" to 0x0000FF,
        "red" to 0xFF0000, "darkBlue" to 0x000080, "darkCyan" to 0x008080, "darkGreen" to 0x008000,
        "darkMagenta" to 0x800080, "darkRed" to 0x800000, "darkYellow" to 0x808000, "darkGray" to 0x808080,
        "lightGray" to 0xC0C0C0, "black" to 0x000000, "white" to 0xFFFFFF,
    ).mapValues { 0xFF000000.toInt() or it.value }

    /**
     * Old Hindi fonts (Kruti Dev, DevLys, Chanakya …) type Hindi with Latin letters: the phone has none of them, so
     * their text would print as Latin gibberish (round 9 review).
     */
    fun legacyHindi(name: String): Boolean {
        val n = name.lowercase()
        return listOf("kruti", "devlys", "dev lys", "chanakya", "shivaji", "aps-dv", "aps dv", "shree-dev", "shree dev", "akruti", "kundli")
            .any { n.contains(it) }
    }

    /** Font names mapped to the phone's three families (theme fonts are Calibri/Aptos: sans). */
    fun familyOf(name: String?): Family? {
        val n = name?.lowercase() ?: return null
        return when {
            n.contains("courier") || n.contains("consolas") || n.contains("mono") || n.contains("lucida console") -> Family.MONO
            n.contains("sans") -> Family.SANS
            listOf("times", "cambria", "georgia", "garamond", "book antiqua", "palatino", "serif", "bookman", "century schoolbook", "kokila")
                .any { n.contains(it) } -> Family.SERIF
            else -> Family.SANS
        }
    }

    private fun rp(n: XNode?): RP {
        if (n == null) return RP()
        var r = RP()
        for (c in n.children) r = when (c.ln()) {
            "b" -> r.copy(bold = c.on())
            "i" -> r.copy(italic = c.on())
            "u" -> r.copy(underline = c.a("val")?.let { it != "none" } ?: true)
            "strike", "dstrike" -> r.copy(strike = c.on())
            "sz" -> r.copy(size = c.a("val")?.toFloatOrNull()?.takeIf { it.isFinite() && it > 0f }?.div(2f) ?: r.size)
            "color" -> r.copy(color = hex(c.a("val")) ?: r.color)
            "highlight" -> r.copy(highlight = HIGHLIGHT[c.a("val")] ?: r.highlight)
            "shd" -> if (r.highlight == null) r.copy(highlight = hex(c.a("fill"))) else r
            "rFonts" -> (c.a("ascii") ?: c.a("hAnsi") ?: c.a("cs")).let { name ->
                r.copy(
                    family = familyOf(name) ?: (if (c.a("asciiTheme") != null || c.a("hAnsiTheme") != null) Family.SANS else r.family),
                    legacy = name?.let { legacyHindi(it) } ?: r.legacy,
                )
            }
            "vertAlign" -> r.copy(
                superSub = when (c.a("val")) {
                    "superscript" -> SuperSub.SUPER
                    "subscript" -> SuperSub.SUB
                    else -> SuperSub.NONE
                },
            )
            "caps", "smallCaps" -> r.copy(caps = c.on())
            "vanish", "specVanish", "webHidden" -> r.copy(hidden = c.on())
            else -> r
        }
        return r
    }

    private fun pp(n: XNode?): PP {
        if (n == null) return PP()
        var p = PP()
        for (c in n.children) p = when (c.ln()) {
            "pStyle" -> p.copy(style = c.a("val"))
            "jc" -> p.copy(
                align = when (c.a("val")) {
                    "center" -> Align.CENTER
                    "right", "end" -> Align.RIGHT
                    "both", "distribute", "justify", "lowKashida", "mediumKashida", "highKashida" -> Align.JUSTIFY
                    else -> Align.LEFT
                },
            )
            "spacing" -> {
                val line = c.a("line")?.toFloatOrNull()
                val rule = c.a("lineRule") ?: "auto"
                p.copy(
                    before = pt(c.a("before")) ?: p.before,
                    after = pt(c.a("after")) ?: p.after,
                    lineAuto = if (line != null && rule == "auto") line / 240f else p.lineAuto,
                    lineAbs = if (line != null && rule != "auto") line / 20f else p.lineAbs,
                    atLeast = if (line != null && rule != "auto") rule == "atLeast" else p.atLeast,
                )
            }
            "ind" -> p.copy(
                left = pt(c.a("left") ?: c.a("start")) ?: p.left,
                right = pt(c.a("right") ?: c.a("end")) ?: p.right,
                first = pt(c.a("hanging"))?.let { -it } ?: pt(c.a("firstLine")) ?: p.first,
            )
            "numPr" -> p.copy(
                numId = c.c("numId")?.a("val")?.toIntOrNull() ?: p.numId,
                ilvl = c.c("ilvl")?.a("val")?.toIntOrNull() ?: p.ilvl,
            )
            "pageBreakBefore" -> p.copy(pageBreakBefore = c.on())
            "contextualSpacing" -> p.copy(contextual = c.on())
            else -> p
        }
        return p
    }

    private class Reading(val parts: Map<String, ByteArray>) {
        var missed = false
        val media = LinkedHashMap<String, ByteArray>()
        val styles = HashMap<String, Style>()
        var defaultPara: String? = null
        var baseRP = RP(size = 10f)
        var basePP = PP()
        val abstracts = HashMap<String, Map<Int, Lvl>>()
        val nums = HashMap<Int, Num>()
        val counters = HashMap<Int, IntArray>()
        val fields = ArrayList<Field>()
        val footnoteRefs = ArrayList<Pair<String, String>>()
        val endnoteRefs = ArrayList<Pair<String, String>>()
        var pictures = 0
        var legacyFont = false

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

        fun doc(): DocxDoc {
            val main = relsOf("").values.firstOrNull { it.type == "officeDocument" && !it.external }?.target
                ?.takeIf { parts.containsKey(it) } ?: "word/document.xml"
            val root = xml(main) ?: throw OfficeRefused("no document")
            val part = Part(main, relsOf(main))
            readStyles(part.rels.values.firstOrNull { it.type == "styles" }?.target ?: "word/styles.xml")
            readNumbering(part.rels.values.firstOrNull { it.type == "numbering" }?.target ?: "word/numbering.xml")
            val body = root.c("body") ?: throw OfficeRefused("no body")
            val sections = ArrayList<DSection>()
            var blocks = ArrayList<DBlock>()
            var last: DSection? = null
            val flow = Flow(blocks)
            for (c in body.children) {
                if (c.ln() == "sectPr") continue
                content(c, part, flow)
                val sect = if (c.ln() == "p") c.c("pPr")?.c("sectPr") else null
                if (sect != null) {
                    last = section(sect, part, blocks, last).also { sections += it }
                    blocks = ArrayList()
                    flow.reset(blocks)
                }
            }
            last = section(body.c("sectPr"), part, blocks, last)
            sections += last
            val notes = notes("footnotes", footnoteRefs, part) + notes("endnotes", endnoteRefs, part)
            if (notes.isNotEmpty()) sections[sections.size - 1] = last.copy(blocks = last.blocks + notes)
            return DocxDoc(sections, media, missed, legacyFont)
        }

        // ---- styles and numbering ----

        fun readStyles(path: String) {
            val root = xml(path) ?: return
            root.c("docDefaults")?.let { d ->
                baseRP = baseRP.over(rp(d.c("rPrDefault")?.c("rPr")))
                basePP = basePP.over(pp(d.c("pPrDefault")?.c("pPr")))
            }
            for (s in root.cs("style")) {
                val id = s.a("styleId") ?: continue
                val type = s.a("type") ?: "paragraph"
                styles[id] = Style(type, s.c("basedOn")?.a("val"), pp(s.c("pPr")), rp(s.c("rPr")), s.c("tblPr")?.c("tblBorders"))
                if (type == "paragraph" && s.a("default").let { it == "1" || it == "true" }) defaultPara = id
            }
        }

        /** A style and the ones it is based on, base first (a loop or a very long chain stops). */
        fun chain(id: String?): List<Style> {
            val out = ArrayList<Style>()
            var cur = id
            val seen = HashSet<String>()
            while (cur != null && seen.add(cur) && out.size < 20) {
                val s = styles[cur] ?: break
                out += s
                cur = s.basedOn
            }
            return out.asReversed()
        }

        fun readNumbering(path: String) {
            val root = xml(path) ?: return
            for (an in root.cs("abstractNum")) {
                val id = an.a("abstractNumId") ?: continue
                abstracts[id] = an.cs("lvl").associate { l ->
                    (l.a("ilvl")?.toIntOrNull() ?: 0) to Lvl(
                        l.c("start")?.a("val")?.toIntOrNull() ?: 1,
                        l.c("numFmt")?.a("val") ?: "decimal",
                        l.c("lvlText")?.a("val") ?: "",
                        pp(l.c("pPr")),
                    )
                }
            }
            for (n in root.cs("num")) {
                val id = n.a("numId")?.toIntOrNull() ?: continue
                val abs = n.c("abstractNumId")?.a("val") ?: continue
                val starts = n.cs("lvlOverride").mapNotNull { o ->
                    val s = o.c("startOverride")?.a("val")?.toIntOrNull() ?: return@mapNotNull null
                    (o.a("ilvl")?.toIntOrNull() ?: 0) to s
                }.toMap()
                nums[id] = Num(abs, starts)
            }
        }

        fun level(numId: Int?, ilvl: Int): Lvl? = numId?.let { nums[it] }?.let { abstracts[it.abstractId]?.get(ilvl) }

        /** The next label of list [numId] at level [ilvl] ("3.", "b.", "•"); deeper levels start again. */
        fun label(numId: Int, ilvl: Int): String? {
            val num = nums[numId] ?: return null
            val lvls = abstracts[num.abstractId] ?: return null
            val lvl = lvls[ilvl] ?: return null
            val start = { k: Int -> num.starts[k] ?: lvls[k]?.start ?: 1 }
            val c = counters.getOrPut(numId) { IntArray(9) { Int.MIN_VALUE } }
            if (ilvl !in 0..8) return null
            c[ilvl] = if (c[ilvl] == Int.MIN_VALUE) start(ilvl) else c[ilvl] + 1
            for (k in ilvl + 1 until 9) c[k] = Int.MIN_VALUE
            if (lvl.fmt == "none") return null
            if (lvl.fmt == "bullet") return bullet(lvl.text, ilvl)
            return Regex("%([1-9])").replace(lvl.text) { m ->
                val k = m.groupValues[1].toInt() - 1
                val v = if (c[k] == Int.MIN_VALUE) start(k) else c[k]
                format(v, lvls[k]?.fmt ?: "decimal")
            }
        }

        fun bullet(text: String, ilvl: Int): String {
            val t = text.trim()
            if (t.length == 1 && t[0].code < 0xE000 && t[0] !in "o§§") return t
            return when (if (t == "o") 1 else if (t == "§") 2 else ilvl % 3) {
                1 -> "◦"
                2 -> "▪"
                else -> "•"
            }
        }

        fun format(v: Int, fmt: String): String = when (fmt) {
            "lowerLetter" -> letters(v)
            "upperLetter" -> letters(v).uppercase()
            "lowerRoman" -> roman(v).lowercase()
            "upperRoman" -> roman(v)
            "decimalZero" -> if (v in 0..9) "0$v" else "$v"
            else -> "$v"
        }

        fun letters(v: Int): String {
            if (v < 1) return "$v"
            val ch = 'a' + (v - 1) % 26
            return ch.toString().repeat((v - 1) / 26 + 1)
        }

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

        // ---- sections, headers, footers, notes ----

        fun section(sect: XNode?, part: Part, blocks: List<DBlock>, prev: DSection?): DSection {
            val size = sect?.c("pgSz")
            var w = pt(size?.a("w")) ?: prev?.pageW ?: 595.3f
            var h = pt(size?.a("h")) ?: prev?.pageH ?: 841.9f
            if (size?.a("orient") == "landscape" && w < h) w = h.also { h = w }
            val m = sect?.c("pgMar")
            val pm = prev?.margins ?: Insets4(72f, 72f, 72f, 72f)
            val margins = Insets4(
                pt(m?.a("top"))?.let { Math.abs(it) } ?: pm.top,
                pt(m?.a("right") ?: m?.a("end")) ?: pm.right,
                pt(m?.a("bottom"))?.let { Math.abs(it) } ?: pm.bottom,
                pt(m?.a("left") ?: m?.a("start")) ?: pm.left,
            )
            // The default header and footer, and the first page's when it is different ("titlePg"); a section without
            // its own carries on the one before it. Even pages print the default (as without "different odd and even").
            val ref = { kind: String, type: String ->
                sect?.cs("${kind}Reference")?.firstOrNull { (it.a("type") ?: "default") == type }
                    ?.attrs?.entries?.firstOrNull { it.key.substringAfter(':') == "id" && it.key != "w:id" }?.value
            }
            val header = ref("header", "default")?.let { hf(it, part) } ?: prev?.header ?: emptyList()
            val footer = ref("footer", "default")?.let { hf(it, part) } ?: prev?.footer ?: emptyList()
            val titlePage = sect?.c("titlePg")?.on() == true
            val firstHeader = if (titlePage) ref("header", "first")?.let { hf(it, part) } ?: prev?.firstHeader ?: emptyList() else null
            val firstFooter = if (titlePage) ref("footer", "first")?.let { hf(it, part) } ?: prev?.firstFooter ?: emptyList() else null
            return DSection(
                w, h, margins, header, footer, blocks,
                pt(m?.a("header")) ?: prev?.headerFrom ?: 36f,
                pt(m?.a("footer")) ?: prev?.footerFrom ?: 36f,
                newPage = sect?.c("type")?.a("val") != "continuous",
                firstHeader = firstHeader,
                firstFooter = firstFooter,
            )
        }

        fun hf(rId: String, part: Part): List<DBlock>? {
            val rel = part.rels[rId]?.takeIf { !it.external } ?: return null
            val root = xml(rel.target) ?: return null
            val hp = Part(rel.target, relsOf(rel.target))
            fields.clear()
            val out = ArrayList<DBlock>()
            val flow = Flow(out)
            for (c in root.children) content(c, hp, flow)
            fields.clear()
            return out
        }

        /** Each referenced note's text, in the order referenced, its number as the first paragraph's label. */
        fun notes(kind: String, refs: List<Pair<String, String>>, part: Part): List<DBlock> {
            if (refs.isEmpty()) return emptyList()
            val rel = part.rels.values.firstOrNull { it.type == kind && !it.external } ?: return emptyList()
            val root = xml(rel.target) ?: return emptyList()
            val np = Part(rel.target, relsOf(rel.target))
            val byId = root.children.associateBy { it.a("id") }
            val out = ArrayList<DBlock>()
            for ((number, id) in refs) {
                val note = byId[id] ?: continue
                fields.clear()
                val blocks = ArrayList<DBlock>()
                val flow = Flow(blocks)
                for (c in note.children) content(c, np, flow)
                val first = blocks.indexOfFirst { it is DPara }
                if (first >= 0) blocks[first] = (blocks[first] as DPara).copy(label = number)
                out += blocks
            }
            fields.clear()
            return out
        }

        // ---- block content ----

        /** Paragraphs added in order; adjacent paragraphs of one style with contextual spacing lose the space between. */
        inner class Flow(var out: MutableList<DBlock>) {
            var lastStyle: String? = null
            var lastIndex = -1
            var lastContextual = false

            fun reset(to: MutableList<DBlock>) {
                out = to
                lastIndex = -1
            }

            fun para(p: DPara, style: String?, contextual: Boolean) {
                var cur = p
                if (lastIndex == out.size - 1 && lastIndex >= 0 && style == lastStyle && (contextual || lastContextual)) {
                    val prev = out[lastIndex] as DPara
                    if (lastContextual) out[lastIndex] = prev.copy(spaceAfter = 0f)
                    if (contextual) cur = cur.copy(spaceBefore = 0f)
                }
                out += cur
                lastIndex = out.size - 1
                lastStyle = style
                lastContextual = contextual
            }

            fun add(b: DBlock) {
                out += b
                lastIndex = -1
            }
        }

        fun content(c: XNode, part: Part, flow: Flow) {
            when (c.ln()) {
                "p" -> paragraph(c, part, flow)
                "tbl" -> flow.add(table(c, part))
                "sdt" -> c.c("sdtContent")?.children?.forEach { content(it, part, flow) }
                "customXml", "ins", "moveTo", "smartTag" -> c.children.forEach { content(it, part, flow) }
                "altChunk" -> missed = true
                else -> Unit // sectPr, bookmarks, del, moveFrom, proofErr …
            }
        }

        fun blocksOf(container: XNode, part: Part): List<DBlock> {
            val out = ArrayList<DBlock>()
            val flow = Flow(out)
            for (c in container.children) content(c, part, flow)
            return out
        }

        fun paragraph(p: XNode, part: Part, flow: Flow) {
            val pPr = p.c("pPr")
            val direct = pp(pPr)
            val styleId = direct.style ?: defaultPara
            val styleChain = chain(styleId).filter { it.type == "paragraph" }
            val sPP = styleChain.fold(PP()) { acc, s -> acc.over(s.pp) }
            val sRP = styleChain.fold(RP()) { acc, s -> acc.over(s.rp) }
            val numbered = basePP.over(sPP).over(direct)
            val ilvl = numbered.ilvl ?: 0
            val numId = numbered.numId?.takeIf { it != 0 }
            val lvl = level(numId, ilvl)
            val props = basePP.over(sPP).over(lvl?.pp ?: PP()).over(direct)
            val paraRP = baseRP.over(sRP)
            val markRP = paraRP.over(rp(pPr?.c("rPr")))
            val label = numId?.let { label(it, ilvl) }

            val items = ArrayList<Item>()
            inline(p, part, paraRP, items)

            // Split at page breaks; text boxes and floating pictures follow the paragraph.
            val segments = mutableListOf(mutableListOf<DRun>())
            val after = ArrayList<DBlock>()
            for (it in items) when (it) {
                is RunItem -> segments.last() += it.run
                BreakItem -> segments += mutableListOf<DRun>()
                is After -> after += it.blocks
            }
            segments.forEachIndexed { i, runs ->
                if (i > 0) flow.add(DBreak)
                // Text after a break with nothing in it leaves no empty line (a break at a paragraph's end).
                if (i > 0 && runs.isEmpty()) return@forEachIndexed
                val merged = merge(runs)
                val size = merged.filterIsInstance<DText>().maxOfOrNull { it.sizePt } ?: (markRP.size ?: 10f)
                val lineMul = when {
                    props.lineAbs != null -> {
                        val m = props.lineAbs / (size * 1.17f)
                        (if (props.atLeast == true) maxOf(1f, m) else m).coerceIn(0.5f, 5f)
                    }
                    else -> (props.lineAuto ?: 1f).coerceIn(0.5f, 5f)
                }
                flow.para(
                    DPara(
                        align = props.align ?: Align.LEFT,
                        spaceBefore = if (i == 0) props.before ?: 0f else 0f,
                        spaceAfter = props.after ?: 0f,
                        lineMul = lineMul,
                        indentLeft = props.left ?: 0f,
                        indentFirst = props.first ?: 0f,
                        label = if (i == 0) label else null,
                        runs = merged,
                        pageBreakBefore = i == 0 && props.pageBreakBefore == true,
                        indentRight = props.right ?: 0f,
                        markSizePt = markRP.size ?: 10f,
                    ),
                    styleId,
                    props.contextual == true,
                )
            }
            for (b in after) flow.add(b)
        }

        /** Adjacent text runs that look the same become one. */
        fun merge(runs: List<DRun>): List<DRun> {
            val out = ArrayList<DRun>()
            for (r in runs) {
                val prev = out.lastOrNull()
                if (r is DText && prev is DText && prev.copy(text = "") == r.copy(text = "")) {
                    out[out.size - 1] = prev.copy(text = prev.text + r.text)
                } else if (r !is DText || r.text.isNotEmpty()) {
                    out += r
                }
            }
            return out
        }

        /** The inline content of a paragraph (or of a hyperlink, inserted text, a content control …). */
        fun inline(n: XNode, part: Part, paraRP: RP, items: MutableList<Item>) {
            for (c in n.children) when (c.ln()) {
                "r" -> run(c, part, paraRP, items)
                "hyperlink", "smartTag", "customXml", "ins", "moveTo", "dir", "bdo" -> inline(c, part, paraRP, items)
                "sdt" -> c.c("sdtContent")?.let { inline(it, part, paraRP, items) }
                "fldSimple" -> {
                    if (isPage(c.a("instr") ?: "")) {
                        if (emitting()) items += RunItem(DField(FieldKind.PAGE))
                    } else {
                        inline(c, part, paraRP, items)
                    }
                }
                "oMath", "oMathPara" -> if (emitting()) {
                    val t = c.deepAll("t").joinToString("") { it.text }
                    items += RunItem(text(t, paraRP))
                }
                "AlternateContent" -> alternate(c)?.let { inline(it, part, paraRP, items) }
                else -> Unit // pPr, bookmarks, del, moveFrom, proofErr, comments …
            }
        }

        fun alternate(c: XNode): XNode? = c.c("Choice") ?: c.c("Fallback")

        fun emitting() = fields.all { it.result && !it.live }

        fun isPage(instr: String) = instr.trim().split(Regex("\\s+")).firstOrNull()?.uppercase() == "PAGE"

        fun text(t: String, r: RP): DText = run {
            if (r.legacy == true && t.any { it.isLetter() }) legacyFont = true
            textOf(t, r)
        }

        fun textOf(t: String, r: RP): DText = DText(
            text = if (r.caps == true) t.uppercase() else t,
            bold = r.bold == true,
            italic = r.italic == true,
            underline = r.underline == true,
            strike = r.strike == true,
            sizePt = r.size ?: 10f,
            color = r.color ?: 0xFF000000.toInt(),
            highlight = r.highlight,
            family = r.family ?: Family.SANS,
            superSub = r.superSub ?: SuperSub.NONE,
        )

        fun run(r: XNode, part: Part, paraRP: RP, items: MutableList<Item>) {
            val rPr = r.c("rPr")
            val charStyle = chain(rPr?.c("rStyle")?.a("val")).filter { it.type == "character" }.fold(RP()) { a, s -> a.over(s.rp) }
            val props = paraRP.over(charStyle).over(rp(rPr))
            val add = { t: String -> if (emitting() && props.hidden != true) items += RunItem(text(t, props)) }
            runContent(r, part, props, items, add)
        }

        fun runContent(r: XNode, part: Part, props: RP, items: MutableList<Item>, add: (String) -> Unit) {
            for (c in r.children) when (c.ln()) {
                "t" -> add(c.text)
                "tab", "ptab" -> add("\t")
                "br" -> when (c.a("type")) {
                    "page" -> if (emitting()) items += BreakItem
                    else -> add("\n")
                }
                "cr" -> add("\n")
                "noBreakHyphen" -> add("-")
                "sym" -> {
                    val code = c.a("char")?.toIntOrNull(16)
                    // A symbol-font mark (a tick box, an arrow) the phone cannot draw: say so.
                    if (code != null && code in 0x20 until 0xE000) add(String(Character.toChars(code))) else if (emitting()) missed = true
                }
                "fldChar" -> when (c.a("fldCharType")) {
                    "begin" -> fields += Field()
                    "separate" -> fields.lastOrNull()?.let { f ->
                        f.result = true
                        f.live = isPage(f.instr.toString())
                        if (f.live && fields.dropLast(1).all { it.result && !it.live }) items += RunItem(DField(FieldKind.PAGE))
                    }
                    "end" -> fields.removeLastOrNull()?.let { f ->
                        if (!f.result && isPage(f.instr.toString()) && emitting()) items += RunItem(DField(FieldKind.PAGE))
                    }
                }
                "instrText" -> fields.lastOrNull()?.takeIf { !it.result }?.instr?.append(c.text)
                "footnoteReference", "endnoteReference" -> if (emitting()) {
                    val id = c.a("id") ?: continue
                    val list = if (c.ln() == "footnoteReference") footnoteRefs else endnoteRefs
                    val number = if (list === footnoteRefs) "${list.size + 1}" else roman(list.size + 1).lowercase()
                    list += number to id
                    items += RunItem(text(number, props.copy(superSub = SuperSub.SUPER)))
                }
                "drawing" -> if (emitting()) drawing(c, part, items)
                "pict", "object" -> if (emitting()) vml(c, part, items)
                "AlternateContent" -> alternate(c)?.let { runContent(it, part, props, items, add) }
                else -> Unit // rPr, delText, footnoteRef, separators, lastRenderedPageBreak, softHyphen …
            }
        }

        // ---- pictures, charts, text boxes ----

        /** A picture's bytes if the phone can draw them (PNG, JPEG, GIF, BMP, WebP), kept in [media]. */
        fun picture(rId: String?, part: Part): String? {
            val rel = rId?.let { part.rels[it] } ?: return null
            if (rel.external) return null
            val bytes = parts[rel.target] ?: return null
            if (!drawable(bytes)) return null
            if (!media.containsKey(rel.target)) {
                if (++pictures > MAX_PICTURES) throw OfficeRefused("too many pictures")
                media[rel.target] = bytes
            }
            return rel.target
        }

        fun drawable(b: ByteArray): Boolean {
            fun at(i: Int) = if (i < b.size) b[i].toInt() and 0xFF else -1
            return (at(0) == 0x89 && at(1) == 0x50) || (at(0) == 0xFF && at(1) == 0xD8) ||
                (at(0) == 0x47 && at(1) == 0x49) || (at(0) == 0x42 && at(1) == 0x4D) ||
                (at(0) == 0x52 && at(1) == 0x49 && at(8) == 0x57 && at(9) == 0x45)
        }

        fun drawing(d: XNode, part: Part, items: MutableList<Item>) {
            val box = d.c("inline") ?: d.c("anchor") ?: return
            val floating = box.ln() == "anchor"
            val ext = box.c("extent")
            val w = emu(ext?.attrs?.get("cx"))
            val h = emu(ext?.attrs?.get("cy"))
            val data = box.deep("graphicData")
            val uri = data?.attrs?.get("uri") ?: ""
            val align = when (box.c("positionH")?.c("align")?.text?.trim()) {
                "center" -> Align.CENTER
                "right", "outside" -> Align.RIGHT
                else -> Align.LEFT
            }
            val place = { run: DRun ->
                if (floating) items += After(listOf(DPara(align = align, runs = listOf(run)))) else items += RunItem(run)
            }
            when {
                uri.endsWith("/picture") -> {
                    val key = picture(data?.deep("blip")?.let { b -> b.attrs.entries.firstOrNull { it.key.substringAfter(':') == "embed" }?.value }, part)
                    if (key != null) {
                        place(DImage(key, w, h))
                    } else {
                        missed = true
                        place(DPlaceholder("Picture", w, h))
                    }
                }
                uri.endsWith("/chart") || uri.contains("chartex") -> {
                    missed = true
                    place(DPlaceholder("Chart", w, h))
                }
                uri.endsWith("/diagram") -> {
                    missed = true
                    place(DPlaceholder("Diagram", w, h))
                }
                data != null && (uri.contains("wordprocessingShape") || uri.contains("wordprocessingGroup") || uri.contains("wordprocessingCanvas")) -> {
                    val boxes = data.deepAll("txbxContent")
                    if (boxes.isEmpty() || data.deep("prstTxWarp") != null || !uri.contains("wordprocessingShape")) missed = true
                    // Pictures inside a group or canvas, at their own size.
                    for (pic in data.deepAll("pic")) {
                        val e = pic.deep("ext")
                        val key = picture(pic.deep("blip")?.let { b -> b.attrs.entries.firstOrNull { it.key.substringAfter(':') == "embed" }?.value }, part)
                        if (key != null) items += After(listOf(DPara(runs = listOf(DImage(key, emu(e?.attrs?.get("cx")), emu(e?.attrs?.get("cy")))))))
                    }
                    for (tb in boxes) items += After(blocksOf(tb, part))
                }
                else -> {
                    missed = true
                    place(DPlaceholder("Picture", w, h))
                }
            }
        }

        /** Old-style (VML) pictures and text boxes, and embedded objects' preview pictures. */
        fun vml(v: XNode, part: Part, items: MutableList<Item>) {
            val shape = v.deepAll("shape").firstOrNull() ?: v.children.firstOrNull { it.ln() in setOf("rect", "roundrect", "oval", "line") }
            val style = shape?.attrs?.get("style") ?: ""
            val size = { key: String ->
                Regex("(?:^|;)\\s*$key\\s*:\\s*([0-9.]+)(pt|in|cm|mm|px)?").find(style)?.let { m ->
                    val n = m.groupValues[1].toFloatOrNull() ?: 0f
                    when (m.groupValues[2]) {
                        "in" -> n * 72f
                        "cm" -> n * 72f / 2.54f
                        "mm" -> n * 72f / 25.4f
                        "px" -> n * 0.75f
                        else -> n
                    }
                } ?: 0f
            }
            val img = v.deep("imagedata")
            val boxes = v.deepAll("txbxContent")
            if (img != null) {
                val rId = img.attrs.entries.firstOrNull { it.key.substringAfter(':') == "id" }?.value
                val key = picture(rId, part)
                if (key != null) {
                    items += RunItem(DImage(key, size("width"), size("height")))
                } else {
                    missed = true
                    items += RunItem(DPlaceholder("Picture", size("width"), size("height")))
                }
            } else if (boxes.isEmpty() && shape != null) {
                missed = true
            }
            for (tb in boxes) items += After(blocksOf(tb, part))
        }

        // ---- tables ----

        fun edge(n: XNode?): Boolean? = n?.a("val")?.let { it !in setOf("nil", "none") }

        fun table(t: XNode, part: Part): DTable {
            val tblPr = t.c("tblPr")
            val names = listOf("top", "left", "bottom", "right", "insideH", "insideV")
            val alias = mapOf("left" to "start", "right" to "end")
            val tb = BooleanArray(6)
            val sources = chain(tblPr?.c("tblStyle")?.a("val")).mapNotNull { it.tblBorders } + listOfNotNull(tblPr?.c("tblBorders"))
            for (src in sources) names.forEachIndexed { i, nm -> edge(src.c(nm) ?: alias[nm]?.let { src.c(it) })?.let { tb[i] = it } }
            val grid = t.c("tblGrid")?.cs("gridCol")?.map { pt(it.a("w")) ?: 0f } ?: emptyList()
            val trs = t.children.flatMap { if (it.ln() == "tr") listOf(it) else if (it.ln() == "sdt") it.c("sdtContent")?.cs("tr") ?: emptyList() else emptyList() }
            val ncol = maxOf(grid.size, trs.maxOfOrNull { tr -> cellsOf(tr).sumOf { span(it) } + gridSkip(tr) } ?: 0)
            val rows = trs.mapIndexed { r, tr ->
                var col = 0
                val cells = ArrayList<DCell>()
                tr.c("trPr")?.c("gridBefore")?.a("val")?.toIntOrNull()?.takeIf { it > 0 }?.coerceAtMost(64)?.let { n ->
                    cells += DCell(n, VMerge.NONE, null, Borders.NONE, emptyList())
                    col += n
                }
                for (tc in cellsOf(tr)) {
                    val tcPr = tc.c("tcPr")
                    val span = span(tc)
                    val vm = tcPr?.c("vMerge")?.let { if (it.a("val") == "restart") VMerge.RESTART else VMerge.CONTINUE } ?: VMerge.NONE
                    val own = tcPr?.c("tcBorders")
                    val b = { nm: String, dflt: Boolean -> edge(own?.c(nm) ?: alias[nm]?.let { own?.c(it) }) ?: dflt }
                    val borders = Borders(
                        top = b("top", if (r == 0) tb[0] else tb[4]),
                        left = b("left", if (col == 0) tb[1] else tb[5]),
                        bottom = b("bottom", if (r == trs.size - 1) tb[2] else tb[4]),
                        right = b("right", if (col + span >= ncol) tb[3] else tb[5]),
                    )
                    cells += DCell(span, vm, hex(tcPr?.c("shd")?.a("fill")), borders, blocksOf(tc, part))
                    col += span
                }
                DRow(cells, pt(tr.c("trPr")?.c("trHeight")?.a("val")) ?: 0f)
            }
            // Without a grid: the first row's cell widths, or equal shares (0: the drawer shares the page).
            val widths = when {
                grid.size >= ncol -> grid
                else -> {
                    val first = trs.firstOrNull()?.let { cellsOf(it) } ?: emptyList()
                    val w = first.flatMap { tc -> List(span(tc)) { (pt(tc.c("tcPr")?.c("tcW")?.takeIf { it.a("type") == "dxa" }?.a("w")) ?: 0f) / span(tc) } }
                    if (w.size == ncol && w.all { it > 0f }) w else List(ncol) { 0f }
                }
            }
            return DTable(widths, rows)
        }

        fun cellsOf(tr: XNode): List<XNode> =
            tr.children.flatMap { if (it.ln() == "tc") listOf(it) else if (it.ln() == "sdt") it.c("sdtContent")?.cs("tc") ?: emptyList() else emptyList() }

        fun span(tc: XNode) = tc.c("tcPr")?.c("gridSpan")?.a("val")?.toIntOrNull()?.coerceIn(1, 64) ?: 1

        fun gridSkip(tr: XNode) = tr.c("trPr")?.c("gridBefore")?.a("val")?.toIntOrNull()?.coerceIn(0, 64) ?: 0
    }
}
