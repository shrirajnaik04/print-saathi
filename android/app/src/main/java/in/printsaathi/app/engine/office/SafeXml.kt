package `in`.printsaathi.app.engine.office

import org.xml.sax.Attributes
import org.xml.sax.helpers.DefaultHandler
import java.io.ByteArrayInputStream
import javax.xml.parsers.SAXParserFactory

/**
 * Round 9: one XML element of a customer's Office file: its qualified [name] ("w:p"), [attrs] by qualified name,
 * [children] in order and its own [text] (character data directly inside it).
 */
class XNode(val name: String, val attrs: Map<String, String>, val children: List<XNode>, val text: String) {
    fun child(n: String): XNode? = children.firstOrNull { it.name == n }
    fun all(n: String): List<XNode> = children.filter { it.name == n }
    fun attr(n: String): String? = attrs[n]
    /** The first descendant (depth first) named [n]. */
    fun find(n: String): XNode? {
        for (c in children) {
            if (c.name == n) return c
            c.find(n)?.let { return it }
        }
        return null
    }
}

/**
 * Round 9: parses an XML part of a customer's Office file inside the isolated engine. A DOCTYPE (entity tricks) is
 * refused before parsing, external entities are off, and nesting deeper than [maxDepth], more than [maxNodes] elements
 * or more than 20 MB are refused. Every refusal is an [OfficeRefused].
 */
object SafeXml {
    const val MAX_BYTES = 20 shl 20
    /** Most text one part may hold once read (twice its largest size). */
    const val MAX_CHARS = 2L * MAX_BYTES

    fun parse(bytes: ByteArray, maxDepth: Int = 100, maxNodes: Int = 500_000, maxChars: Long = MAX_CHARS): XNode {
        if (bytes.size > MAX_BYTES) throw OfficeRefused("xml too big")
        if (hasDoctype(bytes)) throw OfficeRefused("doctype")
        val factory = SAXParserFactory.newInstance()
        factory.isNamespaceAware = false
        for ((f, on) in listOf(
            "http://xml.org/sax/features/external-general-entities" to false,
            "http://xml.org/sax/features/external-parameter-entities" to false,
            "http://apache.org/xml/features/disallow-doctype-decl" to true,
        )) runCatching { factory.setFeature(f, on) }
        val handler = Builder(maxDepth, maxNodes, maxChars)
        try {
            factory.newSAXParser().parse(ByteArrayInputStream(bytes), handler)
        } catch (e: OfficeRefused) {
            throw e
        } catch (e: Exception) {
            // A limit the builder hit comes back wrapped by some parsers: its own reason, not "bad xml".
            throw handler.refused ?: OfficeRefused("bad xml")
        }
        return handler.root ?: throw OfficeRefused("empty xml")
    }

    /**
     * "<!DOCTYPE" anywhere in the part, in any of XML's encodings (zero bytes of UTF-16 skipped). Round 9 review I1:
     * the phone's parser cannot be told to refuse one, and a comment or a long prolog must not hide it.
     */
    private fun hasDoctype(bytes: ByteArray): Boolean {
        val want = "<!DOCTYPE"
        var at = 0
        for (b in bytes) {
            if (b.toInt() == 0) continue
            val ch = (b.toInt() and 0xFF).toChar().uppercaseChar()
            at = when {
                ch == want[at] -> at + 1
                ch == '<' -> 1
                else -> 0
            }
            if (at == want.length) return true
        }
        return false
    }

    private class Open(val name: String, val attrs: Map<String, String>) {
        val children = ArrayList<XNode>()
        val text = StringBuilder()
    }

    private class Builder(val maxDepth: Int, val maxNodes: Int, val maxChars: Long) : DefaultHandler() {
        val stack = ArrayList<Open>()
        var root: XNode? = null
        var nodes = 0
        var chars = 0L
        var refused: OfficeRefused? = null

        private fun refuse(reason: String): Nothing = throw OfficeRefused(reason).also { refused = it }

        override fun startElement(uri: String?, localName: String?, qName: String, a: Attributes) {
            if (++nodes > maxNodes) refuse("too many nodes")
            if (stack.size >= maxDepth) refuse("too deep")
            val attrs = HashMap<String, String>(a.length)
            for (i in 0 until a.length) attrs[a.getQName(i)] = a.getValue(i)
            stack += Open(qName, attrs)
        }

        override fun characters(ch: CharArray, start: Int, length: Int) {
            chars += length
            if (chars > maxChars) refuse("too much text")
            stack.lastOrNull()?.text?.append(ch, start, length)
        }

        override fun endElement(uri: String?, localName: String?, qName: String) {
            val o = stack.removeAt(stack.size - 1)
            val node = XNode(o.name, o.attrs, o.children, o.text.toString())
            if (stack.isEmpty()) root = node else stack.last().children += node
        }
    }
}
