package `in`.printsaathi.app.engine.docs

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * PLAN §G5 / ADR-002 option (i): on phones with no built-in unlock, the WebView sends the unlocked PDF in chunks of at
 * most 256 KB, at most 20 MB in all, in order; only the last chunk makes it usable; nothing half-written is ever used.
 */
class UnlockedCopyTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun chunksInOrderMakeTheCopyOnlyAtTheEnd() {
        val c = UnlockedCopy(tmp.root)
        assertTrue(c.write(2, 0, byteArrayOf(1, 2, 3), last = false))
        assertNull("not usable before the last chunk", c.file(2))
        assertTrue(c.write(2, 3, byteArrayOf(4, 5), last = true))
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), c.file(2)!!.readBytes())
        assertFalse(tmp.root.resolve("unlocked-2.pdf.part").exists())
    }

    @Test fun aChunkOutOfOrderOrTooBigIsRefusedAndNothingIsKept() {
        val c = UnlockedCopy(tmp.root)
        assertTrue(c.write(2, 0, ByteArray(10), last = false))
        assertFalse("a gap", c.write(2, 20, ByteArray(10), last = false))
        assertFalse(tmp.root.resolve("unlocked-2.pdf.part").exists())
        assertFalse("bigger than a chunk", c.write(2, 0, ByteArray(UnlockedCopy.CHUNK + 1), last = true))
        assertNull(c.file(2))
    }

    @Test fun neverMoreThan20Mb() {
        val c = UnlockedCopy(tmp.root, maxBytes = 1000)
        assertTrue(c.write(2, 0, ByteArray(600), last = false))
        assertFalse(c.write(2, 600, ByteArray(600), last = true))
        assertNull(c.file(2))
        assertEquals(20L * 1024 * 1024, UnlockedCopy(tmp.root).maxBytes)
    }

    @Test fun startingAgainReplacesAHalfCopyAndDeleteAllRemovesThem() {
        val c = UnlockedCopy(tmp.root)
        c.write(2, 0, byteArrayOf(9, 9), last = false)
        assertTrue(c.write(2, 0, byteArrayOf(7), last = true))
        assertArrayEquals(byteArrayOf(7), c.file(2)!!.readBytes())
        c.deleteAll()
        assertNull(c.file(2))
    }
}
