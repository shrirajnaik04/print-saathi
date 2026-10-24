package `in`.printsaathi.app.engine.render

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Phase 6: a plan's crop reaches the renderer, already turned back onto the upright photo. */
class CropInPlanTest {
    private fun plan(turns: Int) = JSONObject()
        .put("v", 1).put("jobId", "j").put("rev", 1)
        .put("paper", JSONObject().put("id", "A4").put("wPt", 595.2755905511812).put("hPt", 841.8897637795275))
        .put("colour", "colour").put("copies", 1).put("contentType", "photo")
        .put(
            "pages",
            JSONArray().put(
                JSONObject().put("orientation", "portrait").put(
                    "placements",
                    JSONArray().put(
                        JSONObject().put("itemIndex", 1).put("turns", turns).put("style", "original")
                            .put("crop", JSONObject().put("x", 0.1).put("y", 0.2).put("w", 0.3).put("h", 0.4))
                            .put("box", JSONObject().put("x", 17).put("y", 17).put("w", 99.21).put("h", 127.56)),
                    ),
                ),
            ),
        )

    @Test fun theCropIsKeptInUprightTerms() {
        assertEquals(Crop(0.1, 0.2, 0.3, 0.4), RenderPlan.parse(plan(0)).pages[0].single().crop)
        val turned = RenderPlan.parse(plan(1)).pages[0].single().crop
        assertEquals(0.2, turned.x, 1e-12)
        assertEquals(0.6, turned.y, 1e-12)
    }

    @Test fun anUncroppedPlacementIsTheWholePhoto() {
        val p = plan(0)
        p.getJSONArray("pages").getJSONObject(0).getJSONArray("placements").getJSONObject(0)
            .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
        assertEquals(Crop.FULL, RenderPlan.parse(p).pages[0].single().crop)
    }
}
