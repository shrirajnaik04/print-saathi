package `in`.printsaathi.app.engine.office

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Round 9: a customer's .txt file prints like a WhatsApp text message. The engine reads UTF-8 (with or without its
 * mark) and UTF-16 with its mark; anything else, binary bytes, control characters, nothing at all or more than
 * 100,000 characters is refused ("This text file can't be read").
 */
class TextFileTest {
    @Test fun utf8WithAndWithoutBom() {
        assertEquals("नमस्ते\nHello", TextFile.decode("नमस्ते\nHello".toByteArray()))
        assertEquals("Hi", TextFile.decode(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "Hi".toByteArray()))
    }

    @Test fun utf16WithBom() {
        assertEquals("नमस्ते", TextFile.decode(byteArrayOf(0xFF.toByte(), 0xFE.toByte()) + "नमस्ते".toByteArray(Charsets.UTF_16LE)))
        assertEquals("Hi\tthere", TextFile.decode(byteArrayOf(0xFE.toByte(), 0xFF.toByte()) + "Hi\tthere".toByteArray(Charsets.UTF_16BE)))
    }

    @Test fun binaryIsRefused() {
        assertNull(TextFile.decode(OfficeFixtures.png(2, 2, 0xFF0000)))
        assertNull(TextFile.decode(byteArrayOf(0xC3.toByte(), 0x28)))
    }

    @Test fun nulOrControlCharsAreRefused() {
        assertNull(TextFile.decode("a\u0000b".toByteArray()))
        assertNull(TextFile.decode("a\u0007b".toByteArray()))
        assertEquals("a\r\nb\u000Cc", TextFile.decode("a\r\nb\u000Cc".toByteArray()))
    }

    @Test fun blankOrTooLongIsRefused() {
        assertNull(TextFile.decode("  \n\t ".toByteArray()))
        assertNull(TextFile.decode(ByteArray(0)))
        assertNull(TextFile.decode("a".repeat(100_001).toByteArray()))
        assertEquals(100_000, TextFile.decode("a".repeat(100_000).toByteArray())?.length)
    }
}
