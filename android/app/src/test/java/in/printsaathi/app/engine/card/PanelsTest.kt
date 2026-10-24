package `in`.printsaathi.app.engine.card

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

/** Phase 14 (spec "the e-Aadhaar PDF"): card panels printed on a page are found exactly; other boxes are not. */
class PanelsTest {
    private val w = 1131 // an A4 page rendered at 1600 px tall
    private val h = 1600

    /** A white page with lines of text, and outlined boxes ({x0, y0, x1, y1} in px) with round corners. */
    private fun page(boxes: List<IntArray>, text: Boolean = true): ByteArray {
        val g = ByteArray(w * h) { 250.toByte() }
        fun ink(x: Int, y: Int) { if (x in 0 until w && y in 0 until h) g[y * w + x] = 30 }
        if (text) for (line in 0 until 22) for (x in 120 until 1000) for (t in 0 until 6) if ((x / 7) % 5 != 0) ink(x, 140 + line * 28 + t)
        for (b in boxes) {
            val r = 14
            for (t in 0 until 3) {
                for (x in b[0] + r..b[2] - r) { ink(x, b[1] + t); ink(x, b[3] - t) }
                for (y in b[1] + r..b[3] - r) { ink(b[0] + t, y); ink(b[2] - t, y) }
            }
            // a photo and text inside, like a card
            for (y in b[1] + 40 until b[1] + 200) for (x in b[0] + 20 until b[0] + 140) ink(x, y)
        }
        return g
    }

    @Test fun findsTheTwoCardPanelsOfAnEAadhaarPage() {
        // 85.6 × 54 mm at this scale: 461 × 291 px, side by side in the bottom half.
        val front = intArrayOf(80, 1150, 541, 1441)
        val back = intArrayOf(590, 1150, 1051, 1441)
        val found = Panels.find(page(listOf(front, back)), w, h)
        assertEquals(2, found.size)
        for ((q, b) in found.zip(listOf(front, back))) {
            assertTrue("left ${q.corners[0] * w} vs ${b[0]}", abs(q.corners[0] * w - b[0]) <= 3)
            assertTrue("top", abs(q.corners[1] * h - b[1]) <= 3)
            assertTrue("right", abs(q.corners[4] * w - b[2]) <= 3)
            assertTrue("bottom", abs(q.corners[5] * h - b[3]) <= 3)
            assertTrue(q.confidence >= CardDetect.AUTO_ACCEPT)
        }
    }

    @Test fun aPageOfTextHasNoPanel() {
        assertEquals(0, Panels.find(page(emptyList()), w, h).size)
    }

    @Test fun aBoxThatIsNotCardShapedIsNoPanel() {
        // An A4-shaped frame and a wide banner.
        assertEquals(0, Panels.find(page(listOf(intArrayOf(100, 100, 600, 807), intArrayOf(100, 900, 1050, 1000)), text = false), w, h).size)
    }

    @Test fun hostileBytesNeverThrow() {
        val r = kotlin.random.Random(3)
        repeat(50) { Panels.find(ByteArray(200 * 200) { r.nextInt(256).toByte() }, 200, 200) }
        assertTrue(Panels.find(ByteArray(0), 0, 0).isEmpty())
    }

    /** Review I2: a ruled table or frame of card shape but not card size (here 173 mm wide) is no panel. */
    @Test fun aCardShapedBoxThatIsNotCardSizedIsNoPanel() {
        val pxPerMm = h / 297.0
        val table = intArrayOf(100, 300, 1031, 887) // 931 × 587 px = 173 × 109 mm, shaped 1.586
        assertEquals(0, Panels.find(page(listOf(table)), w, h, 2, pxPerMm).size)
        // Real card panels at this scale (461 px = 85.6 mm) are still found.
        assertEquals(2, Panels.find(page(listOf(intArrayOf(80, 1150, 541, 1441), intArrayOf(590, 1150, 1051, 1441))), w, h, 2, pxPerMm).size)
    }
}
