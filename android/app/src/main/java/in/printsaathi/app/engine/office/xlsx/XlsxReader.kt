package `in`.printsaathi.app.engine.office.xlsx

import `in`.printsaathi.app.engine.office.OfficeRefused
import `in`.printsaathi.app.engine.office.SafeXml
import `in`.printsaathi.app.engine.office.XNode
import `in`.printsaathi.app.engine.office.at
import `in`.printsaathi.app.engine.office.c
import `in`.printsaathi.app.engine.office.cs
import `in`.printsaathi.app.engine.office.ln
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Phase 47: reads a customer's Excel file (its zip parts, already limited by SafeZip) into an [XlsxBook], inside the
 * isolated engine. Each visible sheet's cells as Excel shows them: shared and typed-in text, cached results of
 * formulas (none is worked out), numbers in their format (general, fixed decimals, thousands, percent, currency,
 * dates and times), bold, alignment, column widths, hidden rows and columns, merged cells and the print area.
 */
object XlsxReader {
    /** Points per character of column width (Calibri 11's digit, as Excel counts it). */
    const val CHAR_PT = 5.25f
    const val DEFAULT_COL_PT = 48f
    const val DEFAULT_ROW_PT = 15f
    const val MAX_ROWS = 100_000
    const val MAX_COLS = 1_000
    const val MAX_CELLS = 2_000_000

    fun read(parts: Map<String, ByteArray>): XlsxBook = Reading(parts).book()

    private class Rel(val type: String, val target: String)
    private class Xf(val numFmt: Int, val bold: Boolean, val align: XAlign?)

    /** "B12" → (row 11, column 1); null: not a cell reference. */
    fun ref(s: String): Pair<Int, Int>? {
        val m = Regex("^\\$?([A-Za-z]{1,3})\\$?([0-9]{1,7})$").find(s.trim()) ?: return null
        var col = 0
        for (ch in m.groupValues[1].uppercase()) col = col * 26 + (ch - 'A' + 1)
        return m.groupValues[2].toInt() - 1 to col - 1
    }

    /** "A1:C3" (or one cell) as a range; null when not one. */
    fun range(s: String): XRange? {
        val ends = s.split(':')
        val a = ref(ends[0]) ?: return null
        val b = ends.getOrNull(1)?.let { ref(it) ?: return null } ?: a
        return XRange(minOf(a.first, b.first), minOf(a.second, b.second), maxOf(a.first, b.first), maxOf(a.second, b.second))
    }

    // ---- number formats ----

    fun builtin(id: Int): String = when (id) {
        1 -> "0"
        2 -> "0.00"
        3 -> "#,##0"
        4 -> "#,##0.00"
        9 -> "0%"
        10 -> "0.00%"
        11 -> "0.00E+00"
        14 -> "dd/mm/yyyy"
        15 -> "d-mmm-yy"
        16 -> "d-mmm"
        17 -> "mmm-yy"
        18 -> "h:mm AM/PM"
        19 -> "h:mm:ss AM/PM"
        20 -> "h:mm"
        21 -> "h:mm:ss"
        22 -> "dd/mm/yyyy h:mm"
        37 -> "#,##0 ;(#,##0)"
        38 -> "#,##0 ;[Red](#,##0)"
        39 -> "#,##0.00;(#,##0.00)"
        40 -> "#,##0.00;[Red](#,##0.00)"
        45 -> "mm:ss"
        46 -> "[h]:mm:ss"
        47 -> "mm:ss.0"
        48 -> "##0.0E+0"
        49 -> "@"
        else -> "General"
    }

    /** [code]'s sections, split at ';' outside quotes. */
    private fun sections(code: String): List<String> {
        val out = ArrayList<String>()
        val sb = StringBuilder()
        var quoted = false
        var i = 0
        while (i < code.length) {
            val ch = code[i]
            when {
                ch == '"' -> { quoted = !quoted; sb.append(ch) }
                ch == '\\' && i + 1 < code.length -> { sb.append(ch).append(code[i + 1]); i++ }
                ch == ';' && !quoted -> { out += sb.toString(); sb.clear() }
                else -> sb.append(ch)
            }
            i++
        }
        out += sb.toString()
        return out
    }

    /** "[>=100000]" at the start of a format section: the test it puts on the value; null when it has none. */
    private fun condition(sec: String): ((Double) -> Boolean)? {
        val m = Regex("\\[(<=|>=|<>|<|>|=)\\s*(-?[0-9.]+)\\s*]").find(sec) ?: return null
        val n = m.groupValues[2].toDoubleOrNull() ?: return null
        return when (m.groupValues[1]) {
            "<=" -> { v -> v <= n }
            ">=" -> { v -> v >= n }
            "<>" -> { v -> v != n }
            "<" -> { v -> v < n }
            ">" -> { v -> v > n }
            else -> { v -> v == n }
        }
    }

    /**
     * [v] as Excel shows it in number format [code]: the section for its sign (or the first whose [>=…] test it
     * passes), then General, a date, or digits with the format's literal text in place. [date1904]: the workbook
     * counts days from 1904 (old Mac files).
     */
    fun format(v: Double, code: String, date1904: Boolean = false): String {
        if (v.isNaN() || v.isInfinite()) return "#NUM!"
        val secs = sections(code)
        val tests = secs.map { condition(it) }
        val (sec, value, sign) = if (tests.any { it != null }) {
            val i = secs.indices.firstOrNull { tests[it]?.invoke(v) == true } ?: secs.indices.firstOrNull { tests[it] == null } ?: 0
            Triple(secs[i], Math.abs(v), v < 0)
        } else {
            when {
                v < 0 && secs.size >= 2 -> Triple(secs[1], -v, false)
                v == 0.0 && secs.size >= 3 -> Triple(secs[2], v, false)
                else -> Triple(secs[0], Math.abs(v), v < 0)
            }
        }
        // [Red], [>=100] … dropped; [$₹-4009] keeps its symbol; [h] (hours past 24) kept.
        val clean = Regex("\\[([^\\]]*)]").replace(sec) { m ->
            val inner = m.groupValues[1]
            when {
                inner.startsWith("$") -> "\"" + inner.removePrefix("$").substringBefore('-') + "\""
                inner.matches(Regex("[hHmMsS]+")) -> inner
                else -> ""
            }
        }
        if (clean.isBlank() || clean.equals("General", true) || clean.trim() == "@") return general(v)
        if (isDate(clean)) return date(value, clean, date1904)
        return number(value, clean, sign)
    }

    private fun unquoted(code: String): String {
        val sb = StringBuilder()
        var quoted = false
        var i = 0
        while (i < code.length) {
            val ch = code[i]
            when {
                ch == '"' -> quoted = !quoted
                quoted -> Unit
                ch == '\\' || ch == '_' || ch == '*' -> i++
                else -> sb.append(ch)
            }
            i++
        }
        return sb.toString()
    }

    private fun isDate(code: String): Boolean {
        val u = unquoted(code).lowercase()
        return u.any { it in "ydhs" } || (u.contains('m') && !u.any { it in "0#?" })
    }

    fun general(v: Double): String {
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return v.toLong().toString()
        val a = Math.abs(v)
        if (a >= 1e11 || a < 1e-9) return String.format(Locale.ENGLISH, "%.5E", v).replace(Regex("\\.?0+E"), "E").replace("E+0", "E+").replace("E-0", "E-")
        return BigDecimal(v).round(MathContext(11, RoundingMode.HALF_UP)).stripTrailingZeros().toPlainString()
    }

    /** One piece of a number format: a digit place ('0', '#', '?'), a comma, the point, or literal text. */
    private sealed interface Tok
    private data class Digit(val c: Char) : Tok
    private data object Comma : Tok
    private data object Point : Tok
    private data class Lit(val s: String) : Tok

    private fun tokens(code: String): List<Tok> {
        val out = ArrayList<Tok>()
        var i = 0
        var point = false
        while (i < code.length) {
            val ch = code[i]
            when {
                ch == '"' -> {
                    val end = code.indexOf('"', i + 1).let { if (it < 0) code.length else it }
                    out += Lit(code.substring(i + 1, end))
                    i = end
                }
                ch == '\\' && i + 1 < code.length -> out += Lit(code[++i].toString())
                ch == '_' -> { out += Lit(" "); i++ }
                ch == '*' -> i++
                ch == '0' || ch == '#' || ch == '?' -> out += Digit(ch)
                ch == ',' -> out += Comma
                ch == '.' && !point -> { out += Point; point = true }
                else -> out += Lit(ch.toString())
            }
            i++
        }
        return out
    }

    /**
     * [v] (not negative) in a digits format: digits fill the places from the right, literal text between them stays
     * where it is ("0000 0000 0000", "##\,##\,##0"), plain commas between places group in thousands, commas after
     * the last place divide by 1000, '%' multiplies by 100, '0' places keep their zeros.
     */
    private fun number(v0: Double, code: String, negative: Boolean): String {
        val u = unquoted(code)
        if (Regex("[0#?]\\.?[0#?]*[Ee][+-]").containsMatchIn(u)) {
            val decimals = u.substringAfter('.', "").takeWhile { it in "0#?" }.length
            return (if (negative) "-" else "") + String.format(Locale.ENGLISH, "%.${decimals}E", v0).replace("E+0", "E+").replace("E-0", "E-")
        }
        val toks = tokens(code)
        val first = toks.indexOfFirst { it is Digit }
        if (first < 0) return (if (negative) "-" else "") + toks.joinToString("") { lit(it) }
        val last = toks.indexOfLast { it is Digit }
        val pointAt = toks.indexOf(Point).takeIf { it in first..last + 1 } ?: -1
        val intEnd = if (pointAt >= 0) pointAt else last + 1
        // Commas right after the last whole-number place (before the point or the end) divide by 1000.
        var scaleCommas = 0
        var k = (if (pointAt >= 0) pointAt else last + 1) - 1
        while (k >= first && toks[k] == Comma) {
            scaleCommas++
            k--
        }
        val intToks = toks.subList(first, intEnd - scaleCommas)
        val fracToks = if (pointAt >= 0) toks.subList(pointAt + 1, last + 1) else emptyList()
        val trailing = if (pointAt < 0 && scaleCommas > 0) emptyList() else toks.subList(last + 1, toks.size)
        var v = v0
        if (u.contains('%')) v *= 100
        repeat(scaleCommas) { v /= 1000 }
        val fracPlaces = fracToks.filterIsInstance<Digit>()
        val rounded = BigDecimal(v).setScale(fracPlaces.size, RoundingMode.HALF_UP)
        val intDigits = rounded.toBigInteger().abs().toString().let { if (it == "0") "" else it }
        // The fraction: its '0' places always, its '#' places only when not zero at the end.
        var frac = rounded.toPlainString().substringAfter('.', "")
        val minFrac = fracPlaces.indexOfLast { it.c == '0' } + 1
        while (frac.length > minFrac && frac.endsWith('0')) frac = frac.dropLast(1)

        val grouped = intToks.any { it == Comma } && intToks.none { it is Lit }
        val whole = if (grouped) {
            val places = intToks.filterIsInstance<Digit>()
            val minInt = places.size - places.indexOfFirst { it.c == '0' }.let { if (it < 0) places.size else it }
            thousands(intDigits.padStart(minInt, '0'))
        } else {
            fill(intToks, intDigits)
        }
        val body = whole + (if (fracPlaces.isNotEmpty() && frac.isNotEmpty()) ".$frac" else "")
        val prefix = toks.subList(0, first).joinToString("") { lit(it) }
        val suffix = trailing.joinToString("") { lit(it) }
        return (if (negative && rounded.signum() != 0) "-" else "") + prefix + body + suffix
    }

    private fun lit(t: Tok) = when (t) {
        is Lit -> t.s
        Comma -> ","
        Point -> "."
        is Digit -> ""
    }

    /** [digits] into the whole-number places of [toks], from the right; literal text stays between them. */
    private fun fill(toks: List<Tok>, digits: String): String {
        val out = StringBuilder()
        var d = digits.length
        // Places with a '0' or '?' to the left still print, so literal text before them does too.
        val keepFrom = toks.indexOfFirst { it is Digit && it.c != '#' }.let { if (it < 0) toks.size else it }
        for (i in toks.indices.reversed()) {
            when (val t = toks[i]) {
                is Digit -> when {
                    d > 0 -> out.insert(0, digits[--d])
                    t.c == '0' -> out.insert(0, '0')
                    t.c == '?' -> out.insert(0, ' ')
                }
                else -> if (d > 0 || i > keepFrom) out.insert(0, lit(t))
            }
        }
        if (d > 0) out.insert(0, digits.substring(0, d))
        return out.toString()
    }

    private fun thousands(digits: String): String {
        if (digits.length <= 3) return digits
        val sb = StringBuilder()
        digits.forEachIndexed { i, c ->
            if (i > 0 && (digits.length - i) % 3 == 0) sb.append(',')
            sb.append(c)
        }
        return sb.toString()
    }

    /** Excel's day number [v] (days from 30 Dec 1899, or 1 Jan 1904) in date format [code], in English month names. */
    private fun date(v: Double, code: String, date1904: Boolean = false): String {
        val ampm = unquoted(code).contains(Regex("AM/PM|A/P", RegexOption.IGNORE_CASE))
        val tokens = ArrayList<Pair<Char, Int>>() // letter and run length; '\'' runs are literal text
        val literal = StringBuilder()
        val sb = StringBuilder()
        fun flush() {
            if (literal.isNotEmpty()) {
                sb.append('\'').append(literal.toString().replace("'", "''")).append('\'')
                literal.clear()
            }
        }
        var i = 0
        var lastWasHour = false
        var quoted = false
        val c = code
        while (i < c.length) {
            val ch = c[i]
            when {
                ch == '"' -> quoted = !quoted
                quoted -> literal.append(ch)
                ch == '\\' && i + 1 < c.length -> { literal.append(c[i + 1]); i++ }
                c.regionMatches(i, "AM/PM", 0, 5, true) -> { flush(); sb.append("a"); i += 4 }
                c.regionMatches(i, "A/P", 0, 3, true) -> { flush(); sb.append("a"); i += 2 }
                ch.lowercaseChar() in "ydhms" -> {
                    var n = 1
                    while (i + n < c.length && c[i + n].lowercaseChar() == ch.lowercaseChar()) n++
                    flush()
                    val l = ch.lowercaseChar()
                    // m after an hour, or before seconds, is minutes.
                    val nextIsSecond = c.substring(i + n).trimStart(':', ' ', '.', '0').firstOrNull()?.lowercaseChar() == 's'
                    sb.append(
                        when (l) {
                            'y' -> if (n >= 3) "yyyy" else "yy"
                            'd' -> when (n) { 1 -> "d"; 2 -> "dd"; 3 -> "EEE"; else -> "EEEE" }
                            'h' -> (if (ampm) "h" else "H").repeat(minOf(n, 2))
                            's' -> "s".repeat(minOf(n, 2))
                            else -> if ((lastWasHour || nextIsSecond) && n <= 2) "m".repeat(n) else when (n) { 1 -> "M"; 2 -> "MM"; 3 -> "MMM"; else -> "MMMM" }
                        },
                    )
                    lastWasHour = l == 'h' || (l == 'm' && lastWasHour)
                    tokens += ch to n
                    i += n - 1
                }
                ch == '.' && i + 1 < c.length && c[i + 1] == '0' -> { while (i + 1 < c.length && c[i + 1] == '0') i++ }
                else -> literal.append(ch)
            }
            i++
        }
        flush()
        // 1 Jan 1900 is day 1; Excel's made-up 29 Feb 1900 (day 60) shifts the days before it by one.
        val millis = if (date1904) {
            -2_082_844_800_000L + Math.round(v * 86_400_000.0)
        } else {
            -2_209_161_600_000L + Math.round((if (v < 60) v + 1 else v) * 86_400_000.0)
        }
        return runCatching {
            SimpleDateFormat(sb.toString(), Locale.ENGLISH).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(millis))
        }.getOrElse { general(v) }
    }

    // ---- the workbook ----

    private class Reading(val parts: Map<String, ByteArray>) {
        var missed = false

        fun xml(path: String): XNode? = parts[path]?.let { SafeXml.parse(it) }

        fun relsOf(path: String): Map<String, Rel> {
            val dir = path.substringBeforeLast('/', "")
            val relsPath = (if (dir.isEmpty()) "" else "$dir/") + "_rels/" + path.substringAfterLast('/') + ".rels"
            val root = xml(relsPath) ?: return emptyMap()
            return root.children.filter { it.ln() == "Relationship" && it.attrs["TargetMode"] != "External" }.mapNotNull { r ->
                val id = r.attrs["Id"] ?: return@mapNotNull null
                val target = r.attrs["Target"] ?: return@mapNotNull null
                id to Rel(r.attrs["Type"]?.substringAfterLast('/') ?: "", resolve(dir, target))
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

        fun book(): XlsxBook {
            val main = relsOf("").values.firstOrNull { it.type == "officeDocument" }?.target?.takeIf { parts.containsKey(it) } ?: "xl/workbook.xml"
            val wb = xml(main) ?: throw OfficeRefused("no workbook")
            val rels = relsOf(main)
            val shared = rels.values.firstOrNull { it.type == "sharedStrings" }?.let { xml(it.target) }?.cs("si")?.map { si ->
                si.c("t")?.text ?: si.cs("r").joinToString("") { it.c("t")?.text ?: "" }
            } ?: emptyList()
            val styles = rels.values.firstOrNull { it.type == "styles" }?.let { xml(it.target) }
            val fmts = styles?.c("numFmts")?.cs("numFmt")?.associate { (it.at("numFmtId")?.toIntOrNull() ?: -1) to (it.at("formatCode") ?: "General") } ?: emptyMap()
            val bold = styles?.c("fonts")?.cs("font")?.map { f -> f.c("b")?.let { it.at("val") != "0" && it.at("val") != "false" } ?: false } ?: emptyList()
            val xfs = styles?.c("cellXfs")?.cs("xf")?.map { xf ->
                Xf(
                    xf.at("numFmtId")?.toIntOrNull() ?: 0,
                    bold.getOrNull(xf.at("fontId")?.toIntOrNull() ?: 0) ?: false,
                    when (xf.c("alignment")?.at("horizontal")) {
                        "center", "centerContinuous" -> XAlign.CENTER
                        "right" -> XAlign.RIGHT
                        "left", "fill", "justify", "distributed" -> XAlign.LEFT
                        else -> null
                    },
                )
            } ?: emptyList()
            val printAreas = wb.c("definedNames")?.cs("definedName")?.filter { it.at("name") == "_xlnm.Print_Area" }
                ?.associate { (it.at("localSheetId")?.toIntOrNull() ?: -1) to it.text } ?: emptyMap()
            val date1904 = wb.c("workbookPr")?.at("date1904").let { it == "1" || it == "true" }
            val sheets = ArrayList<XSheet>()
            wb.c("sheets")?.cs("sheet")?.forEachIndexed { i, s ->
                if (s.at("state") == "hidden" || s.at("state") == "veryHidden") return@forEachIndexed
                val rId = s.attrs.entries.firstOrNull { it.key.substringAfter(':') == "id" && it.key != "sheetId" }?.value
                val rel = rels[rId] ?: return@forEachIndexed
                if (rel.type != "worksheet") {
                    missed = true // a chart sheet
                    return@forEachIndexed
                }
                val root = xml(rel.target) ?: return@forEachIndexed
                if (relsOf(rel.target).values.any { it.type == "drawing" }) missed = true
                val area = printAreas[i]?.split(',')?.firstOrNull()?.substringAfterLast('!')?.let { range(it) }
                sheets += sheet(s.at("name") ?: "Sheet${i + 1}", root, shared, xfs, fmts, area, date1904)
            }
            return XlsxBook(sheets, missed)
        }

        fun sheet(name: String, root: XNode, shared: List<String>, xfs: List<Xf>, fmts: Map<Int, String>, area: XRange?, date1904: Boolean): XSheet {
            val fmt = root.c("sheetFormatPr")
            val defaultCol = fmt?.at("defaultColWidth")?.toFloatOrNull()?.times(CHAR_PT)
                ?: fmt?.at("baseColWidth")?.toFloatOrNull()?.let { (it + 0.71f) * CHAR_PT + 3f } ?: DEFAULT_COL_PT
            val defaultRow = fmt?.at("defaultRowHeight")?.toFloatOrNull() ?: DEFAULT_ROW_PT
            val widths = HashMap<Int, Float>()
            for (col in root.c("cols")?.cs("col") ?: emptyList()) {
                val lo = (col.at("min")?.toIntOrNull() ?: continue) - 1
                val hi = minOf((col.at("max")?.toIntOrNull() ?: lo + 1) - 1, MAX_COLS)
                val w = if (col.at("hidden") == "1" || col.at("hidden") == "true") 0f else (col.at("width")?.toFloatOrNull()?.takeIf { it.isFinite() && it >= 0f }?.coerceAtMost(255f)?.times(CHAR_PT) ?: defaultCol)
                for (k in lo..hi) widths[k] = w
            }
            val cells = HashMap<Int, HashMap<Int, XCell>>()
            val heights = HashMap<Int, Float>()
            var maxRow = -1
            var maxCol = -1
            var count = 0
            var nextRow = 0
            for (row in root.c("sheetData")?.cs("row") ?: emptyList()) {
                val r = (row.at("r")?.toIntOrNull()?.minus(1)) ?: nextRow
                nextRow = r + 1
                if (r >= MAX_ROWS) throw OfficeRefused("too many rows")
                heights[r] = if (row.at("hidden") == "1" || row.at("hidden") == "true") 0f else row.at("ht")?.toFloatOrNull()?.takeIf { it.isFinite() && it >= 0f }?.coerceAtMost(409f) ?: defaultRow
                var nextCol = 0
                for (c in row.cs("c")) {
                    val col = c.at("r")?.let { ref(it)?.second } ?: nextCol
                    nextCol = col + 1
                    if (col >= MAX_COLS) throw OfficeRefused("too many columns")
                    val xf = xfs.getOrNull(c.at("s")?.toIntOrNull() ?: 0)
                    val v = c.c("v")?.text
                    // A formula whose result was never saved (files made by programs) prints empty: say so.
                    if (c.c("f") != null && v == null) missed = true
                    val isNumber = when (c.at("t")) { null, "n" -> v != null; else -> false }
                    val code = xf?.numFmt?.let { fmts[it] ?: builtin(it) } ?: "General"
                    val text = when (c.at("t")) {
                        "s" -> v?.trim()?.toIntOrNull()?.let { shared.getOrNull(it) }
                        "inlineStr" -> c.c("is")?.let { i -> i.c("t")?.text ?: i.cs("r").joinToString("") { it.c("t")?.text ?: "" } }
                        "str", "e", "d" -> v
                        "b" -> v?.let { if (it.trim() == "1") "TRUE" else "FALSE" }
                        else -> v?.trim()?.toDoubleOrNull()?.let { d -> format(d, code, date1904) }
                    } ?: ""
                    if (text.isEmpty()) continue
                    if (++count > MAX_CELLS) throw OfficeRefused("too many cells")
                    val number = if (isNumber) v?.trim()?.toDoubleOrNull()?.takeIf { it.isFinite() } else null
                    cells.getOrPut(r) { HashMap() }[col] = XCell(
                        // Line breaks typed in a cell (Alt+Enter) print as spaces on its one line.
                        text.replace("\r\n", " ").replace('\n', ' ').replace('\r', ' '),
                        xf?.bold ?: false,
                        xf?.align ?: if (isNumber) XAlign.RIGHT else XAlign.LEFT,
                        number = number,
                        general = number != null && code.trim().equals("General", true),
                    )
                    maxRow = maxOf(maxRow, r)
                    maxCol = maxOf(maxCol, col)
                }
            }
            val merges = root.c("mergeCells")?.cs("mergeCell")?.mapNotNull { m -> m.at("ref")?.let { range(it) } } ?: emptyList()
            for (m in merges + listOfNotNull(area)) {
                maxRow = maxOf(maxRow, minOf(m.r1, MAX_ROWS - 1))
                maxCol = maxOf(maxCol, minOf(m.c1, MAX_COLS - 1))
            }
            if (maxRow.toLong() * maxOf(maxCol, 0) > MAX_CELLS * 4L) throw OfficeRefused("sheet too big")
            val rows = (0..maxRow).map { r -> XRow((0..maxCol).map { cells[r]?.get(it) }, heights[r] ?: defaultRow) }
            return XSheet(name, (0..maxCol).map { widths[it] ?: defaultCol }, rows, merges, area)
        }
    }
}
