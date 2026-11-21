package `in`.printsaathi.app.engine.card

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 12 follow-up (owner's Aadhaar back, a photo that filled the picture): a real card has a thick rim, so a second
 * edge runs a few pixels inside its outline. The side check took that for grain beside the side and threw the true
 * outline away; the finder then framed the QR block and the card's right margin instead. A rim shows at one distance
 * inside the side; grain shows at every distance. Built on edge maps, so no real card photo is needed.
 */
class CardRimTest {
    private val w = 400
    private val h = 260
    private val x0 = 20
    private val x1 = 380
    private val y0 = 20
    private val y1 = 240
    private val quad = doubleArrayOf(x0.toDouble(), y0.toDouble(), x1.toDouble(), y0.toDouble(), x1.toDouble(), y1.toDouble(), x0.toDouble(), y1.toDouble())

    /** The card's outline, plus lines [inside] px inside its bottom and left sides (rim or grain). */
    private fun edges(inside: List<Int>): CardDetect.Edges {
        val on = BooleanArray(w * h)
        val gx = FloatArray(w * h)
        val gy = FloatArray(w * h)
        fun put(x: Int, y: Int, vx: Float, vy: Float) { on[y * w + x] = true; gx[y * w + x] = vx; gy[y * w + x] = vy }
        for (x in x0..x1) { put(x, y0, 0f, 40f); put(x, y1, 0f, -40f) }
        for (y in y0..y1) { put(x0, y, 40f, 0f); put(x1, y, -40f, 0f) }
        for (d in inside) {
            for (x in x0 + 12..x1 - 12) put(x, y1 - d, 0f, -40f)
            for (y in y0 + 12..y1 - 12) put(x0 + d, y, 40f, 0f)
        }
        return CardDetect.Edges(w, h, on, gx, gy)
    }

    @Test fun aPlainOutlineIsACard() {
        assertNotNull(CardDetect.measure(quad, edges(emptyList()))?.takeIf { it.fits })
    }

    @Test fun aThickRimInsideTheOutlineStillLeavesACard() {
        val s = CardDetect.measure(quad, edges(listOf(4)))
        assertNotNull(s)
        assertTrue("sides ${s!!.sides.toList()}", s.fits && s.minSide > 0.9)
    }

    @Test fun grainBesideTheOutlineStillCountsAgainstIt() {
        // Lines at several distances inside (a grained table's, or text's) keep the old penalty.
        val s = CardDetect.measure(quad, edges(listOf(4, 6)))
        assertTrue("sides ${s?.sides?.toList()}", s == null || !s.fits)
        assertEquals(0.0, s?.minSide ?: 0.0, 0.01)
        assertNull(null)
    }
}
