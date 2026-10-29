package `in`.printsaathi.app.engine.render

import `in`.printsaathi.app.engine.isolated.Styles
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** PLAN §G1: the PrintPlan is validated again natively; §G2/F2: placement pixels at 300 dpi of the box. */
class RenderPlanTest {
    private val a4w = 595.2755905511812
    private val a4h = 841.8897637795275

    private fun placement(index: Int, x: Double, y: Double, w: Double, h: Double) = JSONObject()
        .put("itemIndex", index)
        .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
        .put("turns", 0)
        .put("style", "original")
        .put("box", JSONObject().put("x", x).put("y", y).put("w", w).put("h", h))

    private fun plan(
        pages: JSONArray = JSONArray().put(
            JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement(1, 17.0, 17.0, 561.0, 808.0))),
        ),
        copies: Int = 1,
        colour: String = "colour",
    ) = JSONObject()
        .put("v", 1).put("jobId", "job-1").put("rev", 3)
        .put("paper", JSONObject().put("id", "A4").put("wPt", a4w).put("hPt", a4h))
        .put("colour", colour).put("copies", copies).put("contentType", "photo")
        .put("pages", pages)

    private fun rejects(json: JSONObject, why: String) {
        try {
            RenderPlan.parse(json)
            fail("accepted a plan with $why")
        } catch (e: PlanInvalid) {
            // expected
        }
    }

    @Test fun parsesAPortraitPageUnchanged() {
        val p = RenderPlan.parse(plan(copies = 2))
        assertEquals(2, p.copies)
        assertEquals(1, p.pages.size)
        val pl = p.pages[0].single()
        assertEquals(1, pl.itemIndex)
        assertEquals(0, pl.quarterTurnsCcw)
        assertEquals(17.0, pl.box.x, 1e-9)
        assertEquals(808.0, pl.box.h, 1e-9)
    }

    /** A sideways page prints on a portrait sheet: its top edge goes to the sheet's left edge. */
    @Test fun mapsASidewaysPageOntoThePortraitSheet() {
        val pages = JSONArray().put(
            JSONObject().put("orientation", "landscape").put("placements", JSONArray().put(placement(2, 17.0, 40.0, 808.0, 515.0))),
        )
        val pl = RenderPlan.parse(plan(pages)).pages[0].single()
        assertEquals(1, pl.quarterTurnsCcw)
        assertEquals(40.0, pl.box.x, 1e-9)
        assertEquals(a4h - 17.0 - 808.0, pl.box.y, 1e-9)
        assertEquals(515.0, pl.box.w, 1e-9)
        assertEquals(808.0, pl.box.h, 1e-9)
        // The photo is still decoded upright (wide): its long side is the sideways page's width.
        assertEquals(3367, pl.longSidePx)
    }

    @Test fun pixelTargetIs300DpiOfTheBoxLongSideRoundedUp() {
        // 808 pt = 11.222 in -> 3366.67 px -> 3367 (never below 300 dpi).
        assertEquals(3367, RenderPlan.parse(plan()).pages[0].single().longSidePx)
    }

    @Test fun rejectsWhatThisVersionCannotPrintCorrectly() {
        rejects(plan().put("v", 2), "an unknown version")
        rejects(plan(copies = 0), "zero copies")
        rejects(plan(copies = 100), "100 copies")
        rejects(plan(pages = JSONArray()), "no pages")
        rejects(plan().put("paper", JSONObject().put("id", "A4").put("wPt", 600).put("hPt", a4h)), "a wrong A4 size")
        rejects(plan(colour = "sepia"), "an unknown colour")
        val outside = JSONArray().put(
            JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement(1, 500.0, 17.0, 561.0, 808.0))),
        )
        rejects(plan(outside), "a box outside the page")
        val outsidePhoto = placement(1, 17.0, 17.0, 100.0, 100.0).put("crop", JSONObject().put("x", 0.2).put("y", 0).put("w", 0.9).put("h", 1))
        rejects(plan(JSONArray().put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(outsidePhoto)))), "a crop past the photo")
        val emptyCrop = placement(1, 17.0, 17.0, 100.0, 100.0).put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 0).put("h", 1))
        rejects(plan(JSONArray().put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(emptyCrop)))), "an empty crop")
        val badTurn = placement(1, 17.0, 17.0, 100.0, 100.0).put("turns", 4)
        rejects(plan(JSONArray().put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(badTurn)))), "turns 4")
        val empty = JSONArray().put(JSONObject().put("orientation", "portrait").put("placements", JSONArray()))
        rejects(plan(empty), "an empty page")
        val tooMany = JSONArray().apply {
            repeat(RenderPlan.MAX_PAGES + 1) {
                put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement(1, 17.0, 17.0, 100.0, 100.0))))
            }
        }
        rejects(plan(tooMany), "too many pages")
    }

    /** Passport border (owner, 2026-10-23): a black line of that width inside the photo, on the sheet; 0.25–6 pt only. */
    @Test fun aBorderIsDrawnInsideItsPhotoOnTheSheetAndKeptInRange() {
        fun withBorder(orientation: String, border: Any) = plan(
            JSONArray().put(
                JSONObject().put("orientation", orientation)
                    .put("placements", JSONArray().put(placement(1, 17.0, 40.0, 100.0, 200.0).put("border", border))),
            ),
        )
        val upright = RenderPlan.parse(withBorder("portrait", 3.0))
        val r = upright.borders.single().single()
        assertEquals(3.0, r.lineWidthPt, 1e-9)
        assertEquals(18.5, r.box.x, 1e-9)
        assertEquals(41.5, r.box.y, 1e-9)
        assertEquals(97.0, r.box.w, 1e-9)
        assertEquals(197.0, r.box.h, 1e-9)
        // A sideways page: the border follows its photo onto the portrait sheet.
        val sideways = RenderPlan.parse(withBorder("landscape", 3.0))
        val photo = sideways.pages.single().single().box
        val s = sideways.borders.single().single()
        assertEquals(photo.x + 1.5, s.box.x, 1e-9)
        assertEquals(photo.w - 3.0, s.box.w, 1e-9)
        rejects(withBorder("portrait", 0.1), "a border too thin to print")
        rejects(withBorder("portrait", 7.0), "a border thicker than 6 pt")
        rejects(withBorder("portrait", "thick"), "a border that is not a number")
        assertTrue("no border: none drawn", RenderPlan.parse(plan()).borders.single().isEmpty())
    }

    @Test fun planHashMustBeSixteenHexDigits() {
        assertTrue(RenderPlan.isPlanHash("0123456789abcdef"))
        assertFalse(RenderPlan.isPlanHash("../../etc/passwd"))
        assertFalse(RenderPlan.isPlanHash("0123456789ABCDEF"))
        assertFalse(RenderPlan.isPlanHash("0123"))
    }

    /** Photo tools turns (clockwise) combine with a sideways page (anticlockwise onto the sheet). */
    @Test fun aTurnedPhotoIsTurnedOnTheSheetByTheNetQuarterTurns() {
        fun q(orientation: String, turns: Int) = RenderPlan.parse(
            plan(JSONArray().put(JSONObject().put("orientation", orientation).put("placements", JSONArray().put(placement(1, 17.0, 17.0, 100.0, 100.0).put("turns", turns))))),
        ).pages[0].single().quarterTurnsCcw
        assertEquals(3, q("portrait", 1)) // one turn clockwise = three anticlockwise
        assertEquals(2, q("portrait", 2))
        assertEquals(0, q("landscape", 1)) // sideways page + one clockwise turn = upright on the sheet
        assertEquals(1, q("landscape", 0))
        assertEquals(2, q("landscape", 3))
    }

    /** Round 10: pages in colour and in black & white, one print: a colour plan whose grey pages carry a grey style. */
    private fun styled(vararg styles: String) = JSONArray().also { pages ->
        styles.forEachIndexed { n, st ->
            pages.put(
                JSONObject().put("orientation", "portrait")
                    .put("placements", JSONArray().put(placement(1, 17.0, 17.0, 561.0, 808.0).put("style", st).put("pdfPage", n))),
            )
        }
    }

    @Test fun aColourPlanTakesGreyPagesBesideColourPages() {
        val p = RenderPlan.parse(plan(styled("original", "bw", "sharp", "ocv", "vibrant")))
        assertFalse("the print itself stays in colour", p.grey)
        assertEquals(
            listOf(Styles.ORIGINAL, Styles.BW, Styles.SHARP, Styles.OCV, Styles.VIBRANT),
            p.pages.map { it.single().style },
        )
    }

    @Test fun aBlackAndWhitePlanStillRefusesColourStyles() {
        rejects(plan(styled("original", "vibrant"), colour = "bw").also { it.put("colour", "bw") }.let { j ->
            // "original" on a grey plan is plain Black & white (plans before Phase 8); a colour style is not allowed.
            JSONObject(j.toString()).also { it.getJSONArray("pages").getJSONObject(1).getJSONArray("placements").getJSONObject(0).put("style", "clean") }
        }, "a colour style on a black & white plan")
    }

    @Test fun anUntouchedPlanRefusesAGreyPage() {
        val pages = styled("original", "bw")
        rejects(plan(pages).put("exact", JSONObject().put("itemIndex", 1)), "a grey page in the customer's own file")
    }

    /** Phase 4: Black & white plans are accepted and printed from grey data (PLAN §G2). */
    @Test fun blackAndWhitePlansAskForGreyData() {
        assertTrue(RenderPlan.parse(plan(colour = "bw")).grey)
        assertFalse(RenderPlan.parse(plan()).grey)
    }
}
