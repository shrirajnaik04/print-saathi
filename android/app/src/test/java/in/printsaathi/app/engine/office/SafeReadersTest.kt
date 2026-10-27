package `in`.printsaathi.app.engine.office

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

/**
 * Round 9: a customer's Word / PowerPoint / Excel file is a zip of XML parts and pictures, and it is hostile input. The
 * engine reads it in memory only, within limits (entries, unpacked size, packing ratio, XML size and nesting), and an
 * XML part with a DOCTYPE is refused (no entity tricks). Each refusal is an [OfficeRefused], never a crash.
 */
class SafeReadersTest {
    private fun zip(vararg e: Pair<String, ByteArray>) = OfficeFixtures.zip(e.toList())
    private fun refused(block: () -> Unit): Boolean = runCatching(block).exceptionOrNull() is OfficeRefused

    // ---- SafeZip ----

    @Test fun readsOnlyWantedEntriesAndListsEveryName() {
        val z = zip("a.xml" to "<a/>".toByteArray(), "b.bin" to ByteArray(10), "c.xml" to "<c/>".toByteArray())
        val r = SafeZip.read(ByteArrayInputStream(z), { it.endsWith(".xml") })
        assertEquals(listOf("a.xml", "b.bin", "c.xml"), r.names)
        assertEquals(setOf("a.xml", "c.xml"), r.parts.keys)
        assertEquals("<c/>", String(r.parts.getValue("c.xml")))
    }

    @Test fun refusesTooManyEntries() {
        val z = OfficeFixtures.zip((1..30).map { "f$it" to ByteArray(1) })
        assertTrue(refused { SafeZip.read(ByteArrayInputStream(z), { true }, SafeZip.Limits(entries = 20)) })
        SafeZip.read(ByteArrayInputStream(z), { true }, SafeZip.Limits(entries = 30))
    }

    @Test fun refusesTooMuchUnpacked() {
        val z = zip("a" to ByteArray(600_000) { (it % 7).toByte() }, "b" to ByteArray(600_000) { (it % 5).toByte() })
        assertTrue(refused { SafeZip.read(ByteArrayInputStream(z), { false }, SafeZip.Limits(totalBytes = 1_000_000)) })
    }

    @Test fun refusesAHighlyPackedBigEntry() {
        // 2 MB of zeros packs to a few KB: a zip bomb's shape.
        val z = zip("bomb.xml" to ByteArray(2_000_000))
        assertTrue(refused { SafeZip.read(ByteArrayInputStream(z), { true }) })
    }

    @Test fun refusesKeepingTooMuch() {
        val z = zip("a.bin" to ByteArray(300_000) { (it * 31).toByte() })
        assertTrue(refused { SafeZip.read(ByteArrayInputStream(z), { true }, SafeZip.Limits(keepBytes = 100_000)) })
    }

    @Test fun aTruncatedZipIsRefused() {
        val z = zip("a.xml" to ByteArray(50_000) { (it % 251).toByte() })
        assertTrue(refused { SafeZip.read(ByteArrayInputStream(z.copyOf(z.size / 2)), { true }) })
        assertTrue(refused { SafeZip.read(ByteArrayInputStream(ByteArray(0)), { true }) })
    }

    // ---- SafeXml ----

    @Test fun parsesNamesAttributesAndText() {
        val n = SafeXml.parse("<?xml version=\"1.0\"?><w:p a=\"1\"><w:r><w:t xml:space=\"preserve\"> Hi </w:t></w:r><w:r/></w:p>".toByteArray())
        assertEquals("w:p", n.name)
        assertEquals("1", n.attrs["a"])
        assertEquals(" Hi ", n.children[0].children[0].text)
        assertEquals(2, n.children.size)
        assertEquals(" Hi ", n.child("w:r")?.child("w:t")?.text)
    }

    @Test fun refusesADoctype() {
        val evil = "<?xml version=\"1.0\"?><!DOCTYPE a [<!ENTITY x \"xxxxxxxxxx\"><!ENTITY y \"&x;&x;&x;&x;\">]><a>&y;</a>"
        assertTrue(refused { SafeXml.parse(evil.toByteArray()) })
        // In UTF-16 too.
        assertTrue(refused { SafeXml.parse(evil.toByteArray(Charsets.UTF_16)) })
    }

    @Test fun refusesNestingDeeperThanTheLimit() {
        val deep = "<a>".repeat(150) + "</a>".repeat(150)
        assertTrue(refused { SafeXml.parse(deep.toByteArray()) })
        SafeXml.parse(("<a>".repeat(50) + "</a>".repeat(50)).toByteArray())
    }

    @Test fun refusesTooManyNodes() {
        val many = "<r>" + "<p/>".repeat(2_000) + "</r>"
        assertTrue(refused { SafeXml.parse(many.toByteArray(), maxNodes = 1_000) })
    }

    // Round 9 review I1: on the phone the parser cannot be told to refuse a DOCTYPE, so the engine's own look must find
    // it wherever it is; and no part may grow past its limit through expanded text.
    private fun reason(block: () -> Unit) = (runCatching(block).exceptionOrNull() as? OfficeRefused)?.reason

    @Test fun aDoctypeAfterAMisleadingCommentIsRefused() {
        val evil = "<?xml version=\"1.0\"?><!-- <a --><!DOCTYPE r [<!ENTITY e \"x\">]><r>&e;</r>"
        assertEquals("doctype", reason { SafeXml.parse(evil.toByteArray()) })
    }

    @Test fun aDoctypeAfterALongPrologIsRefused() {
        val evil = "<?xml version=\"1.0\"?><!--" + "x".repeat(9000) + "--><!DOCTYPE r []><r/>"
        assertEquals("doctype", reason { SafeXml.parse(evil.toByteArray()) })
    }

    @Test fun tooMuchTextIsRefused() {
        val big = "<a>" + "y".repeat(2000) + "</a>"
        assertEquals("too much text", reason { SafeXml.parse(big.toByteArray(), maxChars = 1000) })
        SafeXml.parse(big.toByteArray(), maxChars = 5000)
    }

    @Test fun badXmlIsRefusedNotThrownRaw() {
        assertTrue(refused { SafeXml.parse("<a><b></a>".toByteArray()) })
    }
}
