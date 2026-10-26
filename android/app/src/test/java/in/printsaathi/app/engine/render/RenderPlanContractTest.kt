package `in`.printsaathi.app.engine.render

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The plan the web app's buildPlan makes today (src/core/plan/plan.test.ts keeps plan-v1-sample.json equal to it)
 * is accepted here and means the same pages: a change on either side of the bridge fails a test, not a print.
 */
class RenderPlanContractTest {
    private val sample = JSONObject(javaClass.getResource("/plan-v1-sample.json")!!.readText())

    @Test fun theWebAppsPlanIsAcceptedWithTheSameMeaning() {
        assertTrue(RenderPlan.isPlanHash(sample.getString("planHash")))
        val plan = RenderPlan.parse(sample.getJSONObject("plan"))
        assertEquals(2, plan.copies)
        assertEquals(listOf(1, 2), plan.pages.map { it.single().itemIndex })
        assertEquals("portrait photo on a portrait page", 0, plan.pages[0].single().quarterTurnsCcw)
        // Upright paper unless the shopkeeper chooses sideways (owner, 2026-10-23); sideways pages: the document plan below.
        assertEquals("wide photo on an upright page", 0, plan.pages[1].single().quarterTurnsCcw)
        // Every box lies on the portrait A4 sheet.
        plan.pages.flatten().forEach { p ->
            assertTrue(p.box.x >= 0 && p.box.y >= 0 && p.box.x + p.box.w <= plan.widthPt + 1e-6 && p.box.y + p.box.h <= plan.heightPt + 1e-6)
        }
    }

    /** Phase 3: several photos on one page, one of them turned in Photo tools (plan-v1-turned.json, same rule). */
    @Test fun theWebAppsAllOnOnePlanWithATurnedPhotoMeansTheSame() {
        val json = JSONObject(javaClass.getResource("/plan-v1-turned.json")!!.readText()).getJSONObject("plan")
        val plan = RenderPlan.parse(json)
        val page = json.getJSONArray("pages").getJSONObject(0)
        val sideways = page.getString("orientation") == "landscape"
        val placements = page.getJSONArray("placements")
        assertEquals(placements.length(), plan.pages.single().size)
        plan.pages.single().forEachIndexed { i, p ->
            val turns = placements.getJSONObject(i).getInt("turns")
            assertEquals(Math.floorMod((if (sideways) 1 else 0) - turns, 4), p.quarterTurnsCcw)
        }
        assertTrue("one photo is turned", (0 until placements.length()).any { placements.getJSONObject(it).getInt("turns") == 1 })
    }

    /** Phase 4: the web app's Black & white plan is read as grey (plan-v1-bw.json). */
    @Test fun theWebAppsBlackAndWhitePlanIsReadAsGrey() {
        val json = JSONObject(javaClass.getResource("/plan-v1-bw.json")!!.readText()).getJSONObject("plan")
        assertEquals("bw", json.getString("colour"))
        assertTrue(RenderPlan.parse(json).grey)
    }

    /** Phase 10c: the web app's photos on the shop printer's 4×6 photo paper (plan-v1-photo4x6.json, same rule). */
    @Test fun theWebAppsPhotosOn4x6MeanTheSame() {
        val json = JSONObject(javaClass.getResource("/plan-v1-photo4x6.json")!!.readText()).getJSONObject("plan")
        val plan = RenderPlan.parse(json)
        assertEquals("4 inches", 288.0, plan.widthPt, 1e-9)
        assertEquals("6 inches", 432.0, plan.heightPt, 1e-9)
        val photos = plan.pages.single()
        assertEquals(2, photos.size)
        photos.forEach { p -> assertTrue("inside the sheet", p.box.x >= 0 && p.box.y >= 0) }
    }

    /** Adjust (owner, 2026-10-23): photos at their own sizes flow onto a second page; every box is accepted as it is. */
    @Test fun theWebAppsArrangedPlanMeansTheSame() {
        val json = JSONObject(javaClass.getResource("/plan-v1-arranged.json")!!.readText()).getJSONObject("plan")
        val plan = RenderPlan.parse(json)
        assertEquals(2, plan.pages.size)
        val pages = json.getJSONArray("pages")
        for (n in 0 until pages.length()) {
            val placements = pages.getJSONObject(n).getJSONArray("placements")
            for (i in 0 until placements.length()) {
                val b = placements.getJSONObject(i).getJSONObject("box")
                val p = plan.pages[n][i]
                assertEquals(b.getDouble("w"), p.box.w, 1e-9)
                assertEquals(b.getDouble("h"), p.box.h, 1e-9)
            }
        }
    }

    /** Phase 6: the web app's passport sheet on 10×15 cm photo paper (plan-v1-passport.json, same rule). */
    @Test fun theWebAppsPassportSheetMeansTheSame() {
        val json = JSONObject(javaClass.getResource("/plan-v1-passport.json")!!.readText()).getJSONObject("plan")
        val plan = RenderPlan.parse(json)
        assertEquals("the printer's own photo paper", 283.464, plan.widthPt, 1e-9)
        assertEquals(425.232, plan.heightPt, 1e-9)
        val photos = plan.pages.single()
        assertEquals(5, photos.size)
        photos.forEach { p ->
            assertEquals(35.0, p.box.w * 25.4 / 72, 1e-6)
            assertEquals(45.0, p.box.h * 25.4 / 72, 1e-6)
            assertFalse("the passport frame, not the whole photo", p.crop.isFull)
        }
        // The 1½ pt border (owner, 2026-10-23) is drawn inside each photo, and replaces the grey cut lines.
        assertTrue("no cut lines beside a border", plan.guides.single().isEmpty())
        val borders = plan.borders.single()
        assertEquals(5, borders.size)
        borders.zip(photos).forEach { (r, p) ->
            assertEquals(1.5, r.lineWidthPt, 1e-9)
            assertEquals("inside the photo's edge", p.box.x + 0.75, r.box.x, 1e-9)
            assertEquals(p.box.y + 0.75, r.box.y, 1e-9)
            assertEquals(p.box.w - 1.5, r.box.w, 1e-9)
            assertEquals(p.box.h - 1.5, r.box.h, 1e-9)
        }
    }

    /** Phase 7: the web app's black & white document plan (pages 3, 2, 1; page 2 sideways; 2 copies). */
    @Test fun theWebAppsDocumentPlanMeansTheSame() {
        val plan = RenderPlan.parse(JSONObject(javaClass.getResource("/plan-v1-document.json")!!.readText()).getJSONObject("plan"))
        assertEquals(listOf(2, 1, 0), plan.pages.map { it.single().pdfPage })
        assertEquals(2, plan.copies)
        assertTrue(plan.grey)
        assertEquals("a sideways page turned onto the sheet", 1, plan.pages[1].single().quarterTurnsCcw)
        assertEquals(null, plan.exactItem)
    }

    /** Phase 7: the untouched path names the one PDF that prints as it is. */
    /** Review M4: "untouched" also means every page in its own place, once, and not turned. */
    @Test fun anUntouchedPlanWithPagesMovedOrTurnedIsRefused() {
        fun exact(change: (JSONObject) -> Unit): JSONObject =
            JSONObject(javaClass.getResource("/plan-v1-exact.json")!!.readText()).getJSONObject("plan").also(change)
        fun placement(p: JSONObject, n: Int) = p.getJSONArray("pages").getJSONObject(n).getJSONArray("placements").getJSONObject(0)
        val swapped = exact { p ->
            placement(p, 0).put("pdfPage", 1)
            placement(p, 1).put("pdfPage", 0)
        }
        val turned = exact { p -> placement(p, 2).put("turns", 2) }
        val twice = exact { p -> placement(p, 2).put("pdfPage", 1) }
        for ((why, json) in listOf("same count, other order" to swapped, "a page turned" to turned, "a page twice" to twice)) {
            assertTrue(why, runCatching { RenderPlan.parse(json) }.exceptionOrNull() is PlanInvalid)
        }
    }

    @Test fun theWebAppsUntouchedPlanNamesItsPdf() {
        val plan = RenderPlan.parse(JSONObject(javaClass.getResource("/plan-v1-exact.json")!!.readText()).getJSONObject("plan"))
        assertEquals(1, plan.exactItem)
        assertEquals(3, plan.pages.size)
    }

    /** Phase 8: each placement carries the job's style, checked against Colour / Black & white. */
    @Test fun stylesAreReadAndMustMatchColourOrBlackAndWhite() {
        fun with(colour: String, style: String): Result<RenderPlan> = runCatching {
            val p = JSONObject(javaClass.getResource("/plan-v1-document.json")!!.readText()).getJSONObject("plan")
            p.put("colour", colour)
            val pages = p.getJSONArray("pages")
            for (n in 0 until pages.length()) {
                val ps = pages.getJSONObject(n).getJSONArray("placements")
                for (k in 0 until ps.length()) ps.getJSONObject(k).put("style", style)
            }
            RenderPlan.parse(p)
        }
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.VIBRANT, with("colour", "vibrant").getOrThrow().pages[0][0].style)
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.SOFT, with("colour", "soft").getOrThrow().pages[0][0].style)
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.SHARP, with("bw", "sharp").getOrThrow().pages[0][0].style)
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.OCV, with("bw", "ocv").getOrThrow().pages[0][0].style)
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.BW, with("bw", "bw").getOrThrow().pages[0][0].style)
        assertEquals("Black & white + Original = Black & White", `in`.printsaathi.app.engine.isolated.Styles.BW, with("bw", "original").getOrThrow().pages[0][0].style)
        // Owner, round 8: Clean colour is a colour style.
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.CLEAN, with("colour", "clean").getOrThrow().pages[0][0].style)
        for ((colour, style) in listOf("colour" to "sharp", "colour" to "ocv", "colour" to "bw", "bw" to "vibrant", "bw" to "soft", "colour" to "sepia", "bw" to "clean")) {
            assertTrue("$colour + $style refused", with(colour, style).exceptionOrNull() is PlanInvalid)
        }
    }

    /** Phase 8: the web app's OCV Black plan reads as a Black & white plan whose every placement is OCV Black. */
    @Test fun theWebAppsStyledPlanCarriesItsStyle() {
        val plan = RenderPlan.parse(JSONObject(javaClass.getResource("/plan-v1-styles.json")!!.readText()).getJSONObject("plan"))
        assertTrue(plan.grey)
        assertTrue(plan.pages.flatten().all { it.style == `in`.printsaathi.app.engine.isolated.Styles.OCV })
    }

    /** Gate M1: the customer's untouched file and passport sheets are never styled, checked here too. */
    @Test fun untouchedAndPassportPlansRefuseAStyle() {
        fun styled(resource: String, colour: String, style: String) = runCatching {
            val p = JSONObject(javaClass.getResource(resource)!!.readText()).getJSONObject("plan")
            p.put("colour", colour)
            val pages = p.getJSONArray("pages")
            for (n in 0 until pages.length()) {
                val ps = pages.getJSONObject(n).getJSONArray("placements")
                for (k in 0 until ps.length()) ps.getJSONObject(k).put("style", style)
            }
            RenderPlan.parse(p)
        }
        assertTrue(styled("/plan-v1-exact.json", "colour", "original").isSuccess)
        assertTrue("untouched + Vibrant", styled("/plan-v1-exact.json", "colour", "vibrant").exceptionOrNull() is PlanInvalid)
        assertTrue(styled("/plan-v1-passport.json", "bw", "bw").isSuccess)
        assertTrue("passport + Soft Tone", styled("/plan-v1-passport.json", "colour", "soft").exceptionOrNull() is PlanInvalid)
        assertTrue("passport + Sharp Black", styled("/plan-v1-passport.json", "bw", "sharp").exceptionOrNull() is PlanInvalid)
    }

    /** Phase 14: a placement may carry a card's corners; a bad shape, a crop with it, or OCV Black with it is refused. */
    @Test fun aCardsCornersAreAcceptedAndBadOnesRefused() {
        fun withQuad(q: List<Double>, change: (JSONObject) -> Unit = {}): JSONObject {
            val plan = JSONObject(sample.getJSONObject("plan").toString())
            val p0 = plan.getJSONArray("pages").getJSONObject(0).getJSONArray("placements").getJSONObject(0)
            p0.put("quad", org.json.JSONArray(q))
            change(p0)
            return plan
        }
        val good = listOf(0.1, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43)
        val parsed = RenderPlan.parse(withQuad(good))
        assertEquals(good, parsed.pages[0][0].quad)
        fun refused(j: JSONObject) = try {
            RenderPlan.parse(j)
            false
        } catch (e: PlanInvalid) {
            true
        }
        // anticlockwise, crossed (concave/bow-tie), too few values, outside the photo
        assertTrue(refused(withQuad(listOf(0.1, 0.1, 0.12, 0.43, 0.58, 0.45, 0.6, 0.12))))
        assertTrue(refused(withQuad(listOf(0.1, 0.1, 0.58, 0.45, 0.6, 0.12, 0.12, 0.43))))
        assertTrue(refused(withQuad(listOf(0.1, 0.1, 0.6, 0.12))))
        assertTrue(refused(withQuad(listOf(0.1, 0.1, 1.6, 0.12, 0.58, 0.45, 0.12, 0.43))))
        assertTrue(refused(withQuad(good) { it.put("crop", JSONObject().put("x", 0.1).put("y", 0.1).put("w", 0.5).put("h", 0.5)) }))
    }

    /** Owner, 2026-10-24: a straightened photo prints in every style, OCV Black included (straightened, then 1-bit). */
    @Test fun aStraightenedPhotoInOcvBlackIsAccepted() {
        val plan = JSONObject(sample.getJSONObject("plan").toString()).put("colour", "bw")
        val pages = plan.getJSONArray("pages")
        for (i in 0 until pages.length()) {
            val ps = pages.getJSONObject(i).getJSONArray("placements")
            for (k in 0 until ps.length()) ps.getJSONObject(k).put("style", "ocv")
        }
        val quad = listOf(0.1, 0.12, 0.85, 0.05, 0.9, 0.8, 0.15, 0.92)
        pages.getJSONObject(0).getJSONArray("placements").getJSONObject(0).put("quad", org.json.JSONArray(quad))
        val parsed = RenderPlan.parse(plan)
        assertEquals(quad, parsed.pages[0][0].quad)
        assertEquals(`in`.printsaathi.app.engine.isolated.Styles.OCV, parsed.pages[0][0].style)
    }

    /** Phase 14: the web app's ID card plan (plan-v1-idcard.json): two cards of exactly 85.6 × 54 mm with corners. */
    @Test fun theWebAppsIdCardPlanMeansTheSame() {
        val plan = RenderPlan.parse(JSONObject(javaClass.getResource("/plan-v1-idcard.json")!!.readText()).getJSONObject("plan"))
        val ps = plan.pages.single()
        assertEquals(2, ps.size)
        for (p in ps) {
            assertEquals(85.6 * 72 / 25.4, p.box.w, 1e-6)
            assertEquals(54.0 * 72 / 25.4, p.box.h, 1e-6)
            assertEquals(8, p.quad?.size)
            assertEquals(Crop.FULL, p.crop)
        }
        assertEquals(8, plan.guides.single().size)
    }

    /**
     * Owner, round 3 (spec 2026-10-24 Phase 28): the web app's own hand-placed plan (tests/fixtures/plan-v1-free.json,
     * kept equal to buildPlan by plan.test.ts) turns photo 1 by 10°. Its box is the turned photo's outline; the photo
     * keeps its own size, centred in that outline, and is made at 300 dpi of its own long side (never the outline's).
     */
    @Test fun aTiltedPhotoIsAcceptedAndMadeAt300DpiOfItsOwnSize() {
        val json = JSONObject(java.io.File("../../tests/fixtures/plan-v1-free.json").readText()).getJSONObject("plan")
        val p = RenderPlan.parse(json).pages[0][0]
        val own = json.getJSONArray("pages").getJSONObject(0).getJSONArray("placements").getJSONObject(0).getJSONObject("tilt")
        assertEquals(10.0, p.tiltCw, 1e-9)
        val inner = p.inner!!
        assertEquals(own.getDouble("w"), inner.w, 1e-9)
        assertEquals(own.getDouble("h"), inner.h, 1e-9)
        assertEquals("centred in its outline (x)", p.box.x + p.box.w / 2, inner.x + inner.w / 2, 1e-9)
        assertEquals("centred in its outline (y)", p.box.y + p.box.h / 2, inner.y + inner.h / 2, 1e-9)
        assertEquals("300 dpi of its own long side", Math.ceil(own.getDouble("h") * 300 / 72).toInt(), p.longSidePx)
        // A photo that is not tilted has no own box: it fills its box as before.
        assertEquals(null, RenderPlan.parse(json).pages[1][0].inner)
    }

    /** A sideways page turns the photo's own box onto the portrait sheet with its outline; the tilt stays the same. */
    @Test fun aTiltedPhotoOnASidewaysPageKeepsItsTilt() {
        val (bw, bh) = 300.0 to 200.0
        val deg = -20.0
        val r = Math.toRadians(deg)
        val c = Math.abs(Math.cos(r))
        val s = Math.abs(Math.sin(r))
        // Own size 150 tall, aspect 1.5; its outline is the box.
        val oh = bw / (1.5 * c + s)
        val ow = 1.5 * oh
        val plan = JSONObject(sample.getJSONObject("plan").toString())
        val page = plan.getJSONArray("pages").getJSONObject(0).put("orientation", "landscape")
        val p0 = page.getJSONArray("placements").getJSONObject(0)
        p0.put("box", JSONObject().put("x", 40.0).put("y", 30.0).put("w", bw).put("h", ow * s + oh * c))
        p0.put("tilt", JSONObject().put("deg", deg).put("w", ow).put("h", oh))
        page.put("placements", org.json.JSONArray().put(p0))
        val p = RenderPlan.parse(plan).pages[0][0]
        assertEquals(1, p.quarterTurnsCcw)
        assertEquals(deg, p.tiltCw, 1e-9)
        val inner = p.inner!!
        assertEquals("the own box turns with the page", oh, inner.w, 1e-9)
        assertEquals(ow, inner.h, 1e-9)
        assertEquals(p.box.x + p.box.w / 2, inner.x + inner.w / 2, 1e-9)
        assertEquals(p.box.y + p.box.h / 2, inner.y + inner.h / 2, 1e-9)
    }

    /** A tilt past 45°, an own size whose outline is not the box, a tilted PDF page or passport photo are refused. */
    @Test fun aBadTiltIsRefused() {
        val json = JSONObject(java.io.File("../../tests/fixtures/plan-v1-free.json").readText()).getJSONObject("plan")
        fun with(change: (JSONObject) -> Unit): Throwable? {
            val plan = JSONObject(json.toString())
            change(plan.getJSONArray("pages").getJSONObject(0).getJSONArray("placements").getJSONObject(0))
            return runCatching { RenderPlan.parse(plan) }.exceptionOrNull()
        }
        val tilt = { p: JSONObject -> p.getJSONObject("tilt") }
        assertEquals(null, with {})
        assertTrue("over 45°", with { tilt(it).put("deg", 50) } is PlanInvalid)
        assertTrue("under -45°", with { tilt(it).put("deg", -46) } is PlanInvalid)
        assertTrue("own size too small for its outline", with { tilt(it).put("w", 150.0) } is PlanInvalid)
        assertTrue("own size too big for its outline", with { tilt(it).put("h", 300.0) } is PlanInvalid)
        assertTrue("an empty own size", with { tilt(it).put("w", 0.0) } is PlanInvalid)
        assertTrue("a tilted PDF page", with { it.put("pdfPage", 0) } is PlanInvalid)
        assertTrue("a tilted photo with a border", with { it.put("border", 1.0) } is PlanInvalid)
    }
}
