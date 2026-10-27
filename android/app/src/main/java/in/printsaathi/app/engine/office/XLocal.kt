package `in`.printsaathi.app.engine.office

/**
 * Round 9: reading a customer's Office XML by local name ("w:p", "a:p" and "p" all read as "p"), so a file written
 * with unusual namespace prefixes reads the same.
 */
internal fun XNode.ln() = name.substringAfter(':')

internal fun XNode.c(l: String) = children.firstOrNull { it.ln() == l }

internal fun XNode.cs(l: String) = children.filter { it.ln() == l }

/** An attribute by its local name ("r:embed" → "embed"). */
internal fun XNode.at(l: String): String? = attrs[l] ?: attrs.entries.firstOrNull { it.key.substringAfter(':') == l }?.value

/** The first descendant (depth first) with local name [l]. */
internal fun XNode.deep(l: String): XNode? {
    for (ch in children) {
        if (ch.ln() == l) return ch
        ch.deep(l)?.let { return it }
    }
    return null
}

/** Every descendant with local name [l] (not looking inside a match). */
internal fun XNode.deepAll(l: String, out: MutableList<XNode> = mutableListOf()): List<XNode> {
    for (ch in children) if (ch.ln() == l) out += ch else ch.deepAll(l, out)
    return out
}
