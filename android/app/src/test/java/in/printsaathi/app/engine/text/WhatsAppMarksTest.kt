package `in`.printsaathi.app.engine.text

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Owner, round 8: a customer's WhatsApp message printed like Word. WhatsApp's marks (*bold*, _italic_, ~strike~,
 * ```mono```) print as that style without the marks; a mark that is not a pair at word edges prints as typed.
 */
class WhatsAppMarksTest {
    private fun show(text: String) = WhatsAppMarks.parse(text).joinToString("|") { r ->
        buildString {
            if (r.bold) append("B")
            if (r.italic) append("I")
            if (r.strike) append("S")
            if (r.mono) append("M")
            append(':')
            append(r.text)
        }
    }

    @Test fun plainTextIsOneRun() = assertEquals(":Hello world", show("Hello world"))

    @Test fun boldItalicStrikeAndMonoLoseTheirMarks() {
        assertEquals(":A |B:Call to Action|: here", show("A *Call to Action* here"))
        assertEquals("I:slowly|: please", show("_slowly_ please"))
        assertEquals(":was |S:50|: now 40", show("was ~50~ now 40"))
        assertEquals(":run |M:print -a|: now", show("run ```print -a``` now"))
    }

    @Test fun marksInsideWordsOrAloneStayAsTyped() {
        assertEquals(":2*3*4 = 24", show("2*3*4 = 24"))
        assertEquals(":file_name_here", show("file_name_here"))
        assertEquals(":a lone * star", show("a lone * star"))
        assertEquals(":* not bold *", show("* not bold *"))
        assertEquals(":*open but never closed", show("*open but never closed"))
    }

    @Test fun nestedMarksCombine() = assertEquals("BI:both|: then plain", show("*_both_* then plain"))

    @Test fun marksAtPunctuationEdgesWork() {
        assertEquals(":(|B:yes|:), done.", show("(*yes*), done."))
        assertEquals("B:THANK YOU!", show("*THANK YOU!*"))
    }

    @Test fun linesAndBlankLinesAreKept() {
        assertEquals(":one\n\n|B:two|:\nthree", show("one\n\n*two*\nthree"))
    }

    @Test fun aMarkNeverSpansLines() = assertEquals(":*one\ntwo*", show("*one\ntwo*"))

    @Test fun devanagariAndEmojiPassThrough() {
        assertEquals(":नमस्कार |B:धन्यवाद|: 🙏", show("नमस्कार *धन्यवाद* 🙏"))
    }
}
