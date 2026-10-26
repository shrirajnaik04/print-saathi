package `in`.printsaathi.app.engine.text

/**
 * WhatsApp's text marks (owner, round 8: a customer's message printed like Word): *bold*, _italic_, ~strike~ and
 * ```mono``` print in that style without the marks. As in WhatsApp, a mark counts only as a pair on one line, opening
 * at a word's start (not after a letter or digit, and followed by a non-space) and closing at a word's end (after a
 * non-space, and not followed by a letter or digit); anything else prints as typed (2*3*4, file_name, a lone *).
 * Pure code: runs inside the isolated engine, and on the JVM in tests.
 */
object WhatsAppMarks {
    data class Run(
        val text: String,
        val bold: Boolean = false,
        val italic: Boolean = false,
        val strike: Boolean = false,
        val mono: Boolean = false,
    )

    private data class Style(val bold: Boolean, val italic: Boolean, val strike: Boolean, val mono: Boolean)

    private const val MONO = "```"

    fun parse(text: String): List<Run> {
        val out = mutableListOf<Run>()
        val lines = text.split('\n')
        lines.forEachIndexed { n, line ->
            parseLine(line, Style(false, false, false, false), out)
            if (n < lines.size - 1) add(out, "\n", Style(false, false, false, false))
        }
        return out
    }

    private fun add(out: MutableList<Run>, s: String, st: Style) {
        if (s.isEmpty()) return
        val last = out.lastOrNull()
        if (last != null && last.bold == st.bold && last.italic == st.italic && last.strike == st.strike && last.mono == st.mono) {
            out[out.size - 1] = last.copy(text = last.text + s)
        } else {
            out += Run(s, st.bold, st.italic, st.strike, st.mono)
        }
    }

    private fun wordChar(c: Char?): Boolean = c != null && Character.isLetterOrDigit(c)

    private fun canOpen(s: String, i: Int, len: Int): Boolean =
        !wordChar(s.getOrNull(i - 1)) && s.getOrNull(i + len)?.isWhitespace() == false

    private fun canClose(s: String, j: Int, len: Int): Boolean =
        s.getOrNull(j - 1)?.isWhitespace() == false && !wordChar(s.getOrNull(j + len))

    private fun styled(st: Style, mark: Char): Style = when (mark) {
        '*' -> st.copy(bold = true)
        '_' -> st.copy(italic = true)
        else -> st.copy(strike = true)
    }

    private fun parseLine(s: String, st: Style, out: MutableList<Run>) {
        val plain = StringBuilder()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (!st.mono && s.startsWith(MONO, i) && canOpen(s, i, MONO.length)) {
                var j = s.indexOf(MONO, i + MONO.length + 1)
                while (j >= 0 && !canClose(s, j, MONO.length)) j = s.indexOf(MONO, j + 1)
                if (j > i + MONO.length) {
                    add(out, plain.toString(), st)
                    plain.clear()
                    add(out, s.substring(i + MONO.length, j), st.copy(mono = true))
                    i = j + MONO.length
                    continue
                }
            }
            if (!st.mono && (c == '*' || c == '_' || c == '~') && canOpen(s, i, 1)) {
                var j = s.indexOf(c, i + 2)
                while (j >= 0 && !canClose(s, j, 1)) j = s.indexOf(c, j + 1)
                if (j > i + 1) {
                    add(out, plain.toString(), st)
                    plain.clear()
                    parseLine(s.substring(i + 1, j), styled(st, c), out)
                    i = j + 1
                    continue
                }
            }
            plain.append(c)
            i++
        }
        add(out, plain.toString(), st)
    }
}
