package `in`.printsaathi.app.engine.card

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Phase 14 Task 2 (spec Part 2 acceptance) on the generated corpus (CardScenes): the corners of cards on clear
 * backgrounds within 1.5 % of the photo's diagonal in at least 95 % of photos, both cards of front+back photos, and
 * nothing taken for a card in card-free photos. The rates are printed for the evidence.
 */
class CardDetectTest {
    private val diag = sqrt((CardScenes.W * CardScenes.W + CardScenes.H * CardScenes.H).toDouble())
    private fun px(q: CardQuad) = DoubleArray(8) { i -> q.corners[i] * if (i % 2 == 0) CardScenes.W else CardScenes.H }
    private fun find(s: CardScenes.Scene, max: Int = 2) = CardDetect.find(s.grey, CardScenes.W, CardScenes.H, max)

    @Test fun findsTheCardOnClearBackgrounds() {
        var good = 0
        var total = 0
        var nanos = 0L
        val misses = mutableListOf<String>()
        val byBg = mutableListOf<String>()
        for (bg in listOf(CardScenes.Bg.PAPER, CardScenes.Bg.DARK, CardScenes.Bg.CLOTH, CardScenes.Bg.WOOD)) {
            var here = 0
            for (seed in 1..60) {
                val scene = CardScenes.cards(seed * 31 + bg.ordinal, bg)
                val t0 = System.nanoTime()
                val found = find(scene).firstOrNull { it.confidence >= CardDetect.AUTO_ACCEPT }
                nanos += System.nanoTime() - t0
                total++
                val err = found?.let { CardScenes.cornerError(px(it), scene.cards[0]) / diag }
                if (err != null && err <= 0.015) here++ else misses += "$bg/$seed:${err?.let { "%.3f".format(it) } ?: "none"}"
            }
            good += here
            byBg += "$bg $here/60"
        }
        val rate = good.toDouble() / total
        println("CARD-METRIC clear backgrounds: $good/$total = ${"%.3f".format(rate)} ($byBg); misses ${misses.take(20)}")
        println("CARD-METRIC detection time on this computer: ${nanos / total / 1_000_000} ms per 960 × 720 photo")
        assertTrue("corner error ≤ 1.5 % in ≥ 95 % (got $good/$total)", rate >= 0.95)
    }

    @Test fun findsBothCardsOfAFrontAndBackPhoto() {
        var both = 0
        for (seed in 1..40) {
            val scene = CardScenes.cards(5000 + seed, if (seed % 2 == 0) CardScenes.Bg.DARK else CardScenes.Bg.CLOTH, count = 2)
            assertEquals("the scene has its two cards", 2, scene.cards.size)
            val found = find(scene).filter { it.confidence >= CardDetect.AUTO_ACCEPT }
            val ok = found.size == 2 && scene.cards.all { truth -> found.any { CardScenes.cornerError(px(it), truth) / diag <= 0.015 } }
            if (ok) both++
        }
        println("CARD-METRIC two cards: $both/40")
        assertTrue("both cards found in ≥ 90 % (got $both/40)", both >= 36)
    }

    @Test fun nothingIsTakenForACardInCardFreePhotos() {
        val byKind = IntArray(5)
        for (seed in 1..100) if (find(CardScenes.cardFree(9000 + seed)).any { it.confidence >= CardDetect.AUTO_ACCEPT }) byKind[(9000 + seed) % 5]++
        val falses = byKind.sum()
        println("CARD-METRIC card-free false cards: $falses/100 (blobs, wood, page, page sideways, screenshot: ${byKind.toList()})")
        assertEquals("no false card at the auto-accept level", 0, falses)
    }

    @Test fun aTinyCardFarAwayIsNotAccepted() {
        val accepted = (1..20).count { seed ->
            find(CardScenes.cards(7000 + seed, CardScenes.Bg.DARK, areaFrac = 0.04)).any { it.confidence >= CardDetect.AUTO_ACCEPT }
        }
        assertEquals(0, accepted)
    }

    @Test fun hostileBytesNeverThrow() {
        val r = Random(42)
        for (i in 0 until 200) {
            val w = r.nextInt(1, 300)
            val h = r.nextInt(1, 300)
            val bytes = when (i % 3) {
                0 -> ByteArray(w * h)
                1 -> ByteArray(w * h) { 127 }
                else -> ByteArray(w * h) { r.nextInt(256).toByte() }
            }
            CardDetect.find(bytes, w, h)
        }
        assertTrue(CardDetect.find(ByteArray(0), 0, 0).isEmpty())
    }

    @Test fun cornersComeTopLeftFirstAndClockwise() {
        val scene = CardScenes.cards(77, CardScenes.Bg.DARK, maxTilt = 0.0)
        val q = find(scene).first().corners
        // Clockwise in image coordinates (y down): the signed area is positive.
        var a = 0.0
        for (i in 0 until 4) {
            val j = (i + 1) % 4
            a += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]
        }
        assertTrue("clockwise", a > 0)
        // The first edge (TL→TR) is a long edge of the card.
        fun len(i: Int, j: Int) = sqrt(((q[2 * i] - q[2 * j]) * CardScenes.W).let { it * it } + ((q[2 * i + 1] - q[2 * j + 1]) * CardScenes.H).let { it * it })
        assertTrue("TL→TR is a long edge", len(0, 1) > len(1, 2))
    }
}
