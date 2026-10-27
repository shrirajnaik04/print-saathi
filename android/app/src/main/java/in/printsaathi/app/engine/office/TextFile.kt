package `in`.printsaathi.app.engine.office

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

/**
 * Round 9: a customer's .txt file as text, or null when it can't be read as one: UTF-8 (with or without its byte-order
 * mark) or UTF-16 with its mark; no NUL or control characters but tab, line ends and form feed; not blank; at most
 * 100,000 characters (as a WhatsApp text message).
 */
object TextFile {
    const val MAX_CHARS = 100_000
    const val MAX_BYTES = MAX_CHARS * 4 + 4

    fun decode(bytes: ByteArray): String? {
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) return null
        fun b(i: Int) = bytes[i].toInt() and 0xFF
        val (charset, skip) = when {
            bytes.size >= 3 && b(0) == 0xEF && b(1) == 0xBB && b(2) == 0xBF -> Charsets.UTF_8 to 3
            bytes.size >= 2 && b(0) == 0xFF && b(1) == 0xFE -> Charsets.UTF_16LE to 2
            bytes.size >= 2 && b(0) == 0xFE && b(1) == 0xFF -> Charsets.UTF_16BE to 2
            else -> Charsets.UTF_8 to 0
        }
        val text = strict(charset, bytes, skip) ?: return null
        if (text.isBlank() || text.length > MAX_CHARS) return null
        if (text.any { it.code < 0x20 && it != '\t' && it != '\n' && it != '\r' && it != '\u000C' }) return null
        return text
    }

    private fun strict(cs: Charset, bytes: ByteArray, skip: Int): String? = try {
        cs.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes, skip, bytes.size - skip))
            .toString()
    } catch (e: CharacterCodingException) {
        null
    }
}
