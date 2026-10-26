package `in`.printsaathi.app.engine.card

import `in`.printsaathi.app.engine.card.CardScenes.H
import `in`.printsaathi.app.engine.card.CardScenes.W
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Owner, round 8 (scan pages, "like the DocScanner app"): the page's four corners in a photo of a paper document, for
 * the shopkeeper to check. Synthetic photos with known corners (CardScenes), never real documents.
 */
class PageDetectTest {
    /** The largest corner miss (photo pixels) between a find (fractions, TL first) and the true corners, either start. */
    private fun miss(found: DoubleArray, truth: DoubleArray): Double {
        val f = DoubleArray(8) { found[it] * if (it % 2 == 0) W else H }
        var best = Double.MAX_VALUE
        for (k in 0 until 4) {
            var worst = 0.0
            for (i in 0 until 4) {
                val j = (i + k) % 4
                worst = max(worst, sqrt((f[2 * i] - truth[2 * j]).let { it * it } + (f[2 * i + 1] - truth[2 * j + 1]).let { it * it }))
            }
            best = min(best, worst)
        }
        return best
    }

    @Test fun aPagePhotographedOnATableIsFoundToWithinTwoPercent() {
        var found = 0
        for (seed in 1..40) {
            val s = CardScenes.page(seed)
            val q = PageDetect.find(s.grey, W, H) ?: continue
            val m = miss(q.corners, s.pages[0])
            assertTrue("seed $seed: a corner is $m px off", m <= 0.02 * W)
            found++
        }
        assertTrue("found $found of 40", found >= 38)
    }

    @Test fun aPageFillingNearlyThePhotoIsFound() {
        for (seed in 1..6) {
            // A page shaped like the photo (4:3), straight on, 95 % of it.
            val s = CardScenes.page(500 + seed, areaFrac = 0.95, wMm = 280.0, hMm = 210.0, maxTilt = 0.05)
            val q = PageDetect.find(s.grey, W, H)
            assertTrue("seed $seed: no page", q != null)
            assertTrue("seed $seed", miss(q!!.corners, s.pages[0]) <= 0.02 * W)
        }
    }

    @Test fun aPhotoWithNoPageFindsNone() {
        for (seed in 1..20) assertNull("seed $seed", PageDetect.find(CardScenes.noPage(seed).grey, W, H))
    }

    @Test fun cornersComeTopLeftFirstAndClockwise() {
        for (seed in 1..10) {
            val q = PageDetect.find(CardScenes.page(seed).grey, W, H) ?: continue
            val c = q.corners
            // TL is the corner nearest the photo's top left; going on clockwise (y down), the area is positive.
            val sums = (0 until 4).map { c[2 * it] + c[2 * it + 1] }
            assertEquals(0, sums.indexOf(sums.min()))
            var area = 0.0
            for (i in 0 until 4) area += c[2 * i] * c[2 * ((i + 1) % 4) + 1] - c[2 * ((i + 1) % 4)] * c[2 * i + 1]
            assertTrue(area > 0)
        }
    }

    @Test fun hostileBytesNeverThrow() {
        val r = Random(7)
        for ((w, h) in listOf(1 to 1, 31 to 31, 40 to 3000, 640 to 480)) {
            val bytes = ByteArray(w * h) { r.nextInt(256).toByte() }
            PageDetect.find(bytes, w, h)
        }
        assertNull(PageDetect.find(ByteArray(0), 0, 0))
        assertNull(PageDetect.find(ByteArray(10), 640, 480))
    }
}
