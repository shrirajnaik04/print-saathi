package `in`.printsaathi.app.engine.render

import org.junit.Assert.assertEquals
import org.junit.Test

/** PLAN §F1: a crop is chosen on the photo as shown (upright, then turned); the engine cuts the upright photo. */
class CropTest {
    private val shown = Crop(0.1, 0.2, 0.3, 0.4)

    private fun near(want: Crop, got: Crop) {
        assertEquals(want.x, got.x, 1e-12)
        assertEquals(want.y, got.y, 1e-12)
        assertEquals(want.w, got.w, 1e-12)
        assertEquals(want.h, got.h, 1e-12)
    }

    @Test fun anUnturnedPhotoIsCutWhereTheFrameIs() = near(shown, shown.uprightOf(0))

    @Test fun aPhotoTurnedAQuarterClockwiseIsCutFromItsUprightLeftSide() {
        // Shown turned clockwise: the shown top-left corner is the upright bottom-left corner.
        near(Crop(0.2, 0.6, 0.4, 0.3), shown.uprightOf(1))
    }

    @Test fun anUpsideDownPhotoIsCutFromTheOppositeCorner() = near(Crop(0.6, 0.4, 0.3, 0.4), shown.uprightOf(2))

    @Test fun aPhotoTurnedThreeQuartersIsCutFromItsUprightRightSide() = near(Crop(0.4, 0.1, 0.4, 0.3), shown.uprightOf(3))

    @Test fun theWholePhotoStaysWholeAtEveryTurn() {
        for (t in 0..3) near(Crop.FULL, Crop.FULL.uprightOf(t))
    }

    @Test fun aKeyNamesTheCutSoDifferentCropsAreDifferentImages() {
        assertEquals(Crop.FULL.key, Crop(0.0, 0.0, 1.0, 1.0).key)
        assert(Crop.FULL.key != shown.key)
    }

    /**
     * Phase 8 re-review (also latent since Phase 6): a frame pushed against an edge of a turned photo (x = 1 - w, as
     * the passport frame clamps it) must stay inside the photo after the mapping: never x or y a hair below 0.
     */
    @Test fun aFrameAgainstAnEdgeStaysInsideThePhotoAtEveryTurn() {
        for (w in generateSequence(0.05) { it + 0.0173 }.takeWhile { it < 1.0 }) {
            for (turns in 0..3) {
                for (frame in listOf(Crop(1 - w, 1 - w, w, w), Crop(0.0, 1 - w, w, w), Crop(1 - w, 0.0, w, w))) {
                    val c = frame.uprightOf(turns)
                    assertEquals("x >= 0 for $frame turns $turns", true, c.x >= 0 && c.y >= 0)
                    assertEquals("inside for $frame turns $turns", true, c.x + c.w <= 1.0 && c.y + c.h <= 1.0)
                }
            }
        }
    }
}
