package `in`.printsaathi.app.engine.render

import `in`.printsaathi.app.engine.isolated.QuadCheck
import `in`.printsaathi.app.engine.isolated.Styles
import `in`.printsaathi.app.engine.pdf.LineD
import `in`.printsaathi.app.engine.pdf.RectD
import `in`.printsaathi.app.engine.pdf.StrokeRect
import `in`.printsaathi.app.engine.print.isPhotoClass
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max

class PlanInvalid(reason: String) : Exception(reason)

/**
 * One photo on the portrait sheet. [box]: points, top-left origin, in the portrait sheet's space. [quarterTurnsCcw]:
 * how the upright decoded photo is turned onto the sheet: +1 for a sideways page, minus the photo's own clockwise
 * turns (Photo tools). [longSidePx]: the decode target, 300 dpi of the box's long side, rounded up so print
 * resolution is never lowered.
 */
/** [crop]: the part of the upright photo to print (whole by default), PLAN §F1. */
data class RenderPlacement(
    val itemIndex: Int,
    val box: RectD,
    val quarterTurnsCcw: Int,
    val longSidePx: Int,
    val crop: Crop = Crop.FULL,
    /** A page of a customer PDF (from 0); null for a photo. */
    val pdfPage: Int? = null,
    /** The print style (Styles.*), the same for the whole job (PLAN §F4). */
    val style: Int = Styles.ORIGINAL,
    /** Phase 14: an ID card's corners on the upright photo or page (8 fractions, TL TR BR BL): straightened to the box. */
    val quad: List<Double>? = null,
    /**
     * Owner, round 3: a photo turned to any angle, degrees clockwise beyond its quarter turns (−45…45). [box] is then
     * its turned outline and [inner] the photo's own size centred in it, before the tilt (on the portrait sheet).
     */
    val tiltCw: Double = 0.0,
    val inner: RectD? = null,
)

/**
 * The web app's PrintPlan v1 (PLAN §G1), checked again here and reduced to what the renderer draws. Every PDF page is
 * portrait; a sideways page is turned onto the portrait sheet. Unstyled photos (whole or cropped) in colour or black &
 * white, turned by quarter turns, on A4 or the shop printer's 4×6 photo paper, with optional cut lines; anything else
 * is refused instead of being printed unlike the preview.
 */
/** [grey]: Black & white — every photo printed from grey data only (PLAN §G2). */
class RenderPlan(
    val widthPt: Double,
    val heightPt: Double,
    val copies: Int,
    val pages: List<List<RenderPlacement>>,
    val grey: Boolean = false,
    /** Thin cut lines per page (passport sheets), on the portrait sheet. */
    val guides: List<List<LineD>> = pages.map { emptyList() },
    /** The untouched path (PLAN §G4): this item's own PDF prints as it is, byte for byte. */
    val exactItem: Int? = null,
    /** Black borders per page (passport photos, owner 2026-10-23): inside each photo's box, on the portrait sheet. */
    val borders: List<List<StrokeRect>> = pages.map { emptyList() },
) {
    companion object {
        const val DPI = 300
        const val MAX_PAGES = 500
        const val MAX_COPIES = 99
        private const val A4_W = 595.2755905511812
        private const val A4_H = 841.8897637795275
        private const val TOLERANCE_PT = 0.01
        private const val CROP_TOLERANCE = 1e-9
        private const val MAX_GUIDES = 64
        private const val MIN_BORDER_PT = 0.25
        private const val MAX_BORDER_PT = 6.0
        private const val MAX_TILT = 45.0

        /** How far a tilted photo's outline may be from its box (rounding slack only). */
        private const val OUTLINE_TOLERANCE_PT = 0.5

        /** Pages a customer PDF may have (far beyond anything a shop prints; refused, never truncated). */
        const val MAX_PDF_PAGES = 100_000
        private val HASH = Regex("^[0-9a-f]{16}$")

        fun isPlanHash(s: String) = HASH.matches(s)

        fun parse(json: JSONObject): RenderPlan {
            check(json.optInt("v") == 1, "unknown version")
            val paper = json.getJSONObject("paper")
            val w = paper.getDouble("wPt")
            val h = paper.getDouble("hPt")
            when (paper.optString("id")) {
                "A4" -> check(abs(w - A4_W) < TOLERANCE_PT && abs(h - A4_H) < TOLERANCE_PT, "wrong A4 size")
                // The shop printer's own 4×6-class photo paper (calibrated), always portrait (PLAN §D4, §G0).
                "PHOTO_4x6" -> check(
                    w < h && isPhotoClass(Math.round(w * 1000 / 72).toInt() to Math.round(h * 1000 / 72).toInt()),
                    "not 4x6 photo paper",
                )
                else -> throw PlanInvalid("unsupported paper")
            }
            val colour = json.optString("colour")
            check(colour == "colour" || colour == "bw", "unsupported colour")
            val copies = json.optInt("copies", 0)
            check(copies in 1..MAX_COPIES, "copies out of range")
            val pagesJson = json.getJSONArray("pages")
            check(pagesJson.length() in 1..MAX_PAGES, "page count out of range")
            val pages = (0 until pagesJson.length()).map { n ->
                val page = pagesJson.getJSONObject(n)
                val sideways = when (page.optString("orientation")) {
                    "portrait" -> false
                    "landscape" -> true
                    else -> throw PlanInvalid("unknown orientation")
                }
                val (pw, ph) = if (sideways) h to w else w to h
                val list = page.getJSONArray("placements")
                check(list.length() >= 1, "empty page")
                val placements = (0 until list.length()).map { i -> placement(list.getJSONObject(i), sideways, pw, ph, h, colour == "bw") }
                val lines = page.optJSONArray("guides")?.let { g -> (0 until g.length()).map { i -> guide(g.getJSONObject(i), sideways, pw, ph, h) } }
                check((lines?.size ?: 0) <= MAX_GUIDES, "too many cut lines")
                // A border is drawn inside its photo's box (already on the sheet), so the photo keeps its exact size.
                val borders = (0 until list.length()).mapNotNull { i ->
                    val p = list.getJSONObject(i)
                    if (!p.has("border")) return@mapNotNull null
                    val w = p.optDouble("border", Double.NaN)
                    check(w.isFinite() && w in MIN_BORDER_PT..MAX_BORDER_PT, "border out of range")
                    val b = placements[i].box
                    StrokeRect(RectD(b.x + w / 2, b.y + w / 2, b.w - w, b.h - w), w)
                }
                Triple(placements, lines.orEmpty(), borders)
            }
            // Passport sheets (the ones with cut lines or borders) are never styled (PLAN §U): Original or Black & White.
            check(
                pages.none { it.second.isNotEmpty() || it.third.isNotEmpty() } ||
                    pages.all { pg -> pg.first.all { it.style == Styles.ORIGINAL || it.style == Styles.BW } },
                "passport sheets are not styled",
            )
            val exact = json.optJSONObject("exact")?.let { e ->
                val item = e.optInt("itemIndex", -1)
                // Only a colour plan of that one PDF's pages, 1 copy, can be the customer's own file.
                // ...and every page in its own place, once, not turned.
                check(
                    item >= 0 && colour == "colour" && copies == 1 &&
                        pages.all { pg -> pg.first.all { it.style == Styles.ORIGINAL } } &&
                        pages.withIndex().all { (n, pg) -> pg.first.size == 1 && pg.first[0].itemIndex == item && pg.first[0].pdfPage == n } &&
                        (0 until pagesJson.length()).all { n ->
                            pagesJson.getJSONObject(n).getJSONArray("placements").getJSONObject(0).optInt("turns", 0) == 0
                        },
                    "not an untouched plan",
                )
                item
            }
            return RenderPlan(
                w, h, copies, pages.map { it.first }, grey = colour == "bw", guides = pages.map { it.second }, exactItem = exact,
                borders = pages.map { it.third },
            )
        }

        /** Style names of the plan (PLAN §F4); Black & white plans take the grey ones ("original" = Black & White). */
        private val COLOUR_STYLES = mapOf(
            "original" to Styles.ORIGINAL, "vibrant" to Styles.VIBRANT, "soft" to Styles.SOFT, "clean" to Styles.CLEAN,
        )
        private val GREY_STYLES = mapOf("original" to Styles.BW, "bw" to Styles.BW, "sharp" to Styles.SHARP, "ocv" to Styles.OCV)

        /**
         * Round 10: a colour plan may hold pages in black & white (some pages in colour, some not, one print): their
         * grey styles are named, and "original" there stays the colour original.
         */
        private val MIXED_STYLES = COLOUR_STYLES + mapOf("bw" to Styles.BW, "sharp" to Styles.SHARP, "ocv" to Styles.OCV)

        private fun placement(p: JSONObject, sideways: Boolean, pw: Double, ph: Double, sheetH: Double, grey: Boolean): RenderPlacement {
            val c = p.getJSONObject("crop")
            val shown = Crop(c.getDouble("x"), c.getDouble("y"), c.getDouble("w"), c.getDouble("h"))
            // Inside the photo and not empty (a crop is chosen on the photo as shown: upright, then turned).
            check(
                shown.x >= 0 && shown.y >= 0 && shown.w > 0 && shown.h > 0 &&
                    shown.x + shown.w <= 1 + CROP_TOLERANCE && shown.y + shown.h <= 1 + CROP_TOLERANCE,
                "crop outside the photo",
            )
            val turns = p.optInt("turns", -1)
            check(turns in 0..3, "turns out of range")
            val style = (if (grey) GREY_STYLES else MIXED_STYLES)[p.optString("style")] ?: throw PlanInvalid("style does not fit the colour")
            val b = p.getJSONObject("box")
            val box = RectD(b.getDouble("x"), b.getDouble("y"), b.getDouble("w"), b.getDouble("h"))
            check(box.w > 0 && box.h > 0, "empty box")
            check(
                box.x >= -TOLERANCE_PT && box.y >= -TOLERANCE_PT &&
                    box.x + box.w <= pw + TOLERANCE_PT && box.y + box.h <= ph + TOLERANCE_PT,
                "box outside the page",
            )
            // Turned to any angle (owner, round 3): the photo keeps its own size; the box is its turned outline.
            val tilt = p.optJSONObject("tilt")?.let { t ->
                val deg = t.optDouble("deg", Double.NaN)
                val ow = t.optDouble("w", Double.NaN)
                val oh = t.optDouble("h", Double.NaN)
                check(deg.isFinite() && abs(deg) <= MAX_TILT, "tilt out of range")
                check(ow.isFinite() && oh.isFinite() && ow > 0 && oh > 0, "empty own size")
                val r = Math.toRadians(deg)
                val c = abs(Math.cos(r))
                val s = abs(Math.sin(r))
                check(
                    abs(ow * c + oh * s - box.w) <= OUTLINE_TOLERANCE_PT && abs(ow * s + oh * c - box.h) <= OUTLINE_TOLERANCE_PT,
                    "own size does not fit its outline",
                )
                // Pages and passport photos keep the 90° Turn (spec 2026-10-24 Phase 28).
                check(!p.has("pdfPage"), "a tilted page")
                check(!p.has("border"), "a tilted passport photo")
                Triple(deg, ow, oh)
            }
            // 300 dpi of what is drawn: the photo's own long side when tilted, never its (bigger) outline's.
            val px = ceil((tilt?.let { max(it.second, it.third) } ?: max(box.w, box.h)) * DPI / 72.0 - 1e-9).toInt()
            // Sideways page (x along its long side) onto the portrait sheet, turned anticlockwise: its top edge
            // becomes the sheet's left edge.
            val onSheet = if (sideways) RectD(box.y, sheetH - box.x - box.w, box.h, box.w) else box
            // The own size turns with the page and stays centred in its outline; the tilt is the same on the sheet.
            val inner = tilt?.let { (_, ow, oh) ->
                val (iw, ih) = if (sideways) oh to ow else ow to oh
                RectD(onSheet.x + (onSheet.w - iw) / 2, onSheet.y + (onSheet.h - ih) / 2, iw, ih)
            }
            val pdfPage = if (p.has("pdfPage")) p.getInt("pdfPage").also { check(it in 0 until MAX_PDF_PAGES, "bad pdf page") } else null
            // An ID card (Phase 14) or a straightened photo (owner, 2026-10-24): its corners instead of a crop, never
            // both. Any style: OCV Black is straightened first, then made 1-bit.
            val quad = p.optJSONArray("quad")?.let { a ->
                check(a.length() == 8, "quad needs 8 values")
                val q = DoubleArray(8) { a.getDouble(it) }
                check(QuadCheck.ok(q), "quad not a card shape")
                check(shown == Crop.FULL, "quad with a crop")
                q.toList()
            }
            return RenderPlacement(
                p.getInt("itemIndex"), onSheet, Math.floorMod((if (sideways) 1 else 0) - turns, 4), px,
                if (shown == Crop.FULL) Crop.FULL else shown.uprightOf(turns),
                pdfPage,
                style,
                quad,
                tilt?.first ?: 0.0,
                inner,
            )
        }

        /** A cut line inside its page, turned onto the portrait sheet like the photos. */
        private fun guide(g: JSONObject, sideways: Boolean, pw: Double, ph: Double, sheetH: Double): LineD {
            val p = listOf(g.getDouble("x1"), g.getDouble("y1"), g.getDouble("x2"), g.getDouble("y2"))
            check(p.all { it.isFinite() } && p[0] in -TOLERANCE_PT..pw + TOLERANCE_PT && p[2] in -TOLERANCE_PT..pw + TOLERANCE_PT &&
                p[1] in -TOLERANCE_PT..ph + TOLERANCE_PT && p[3] in -TOLERANCE_PT..ph + TOLERANCE_PT, "cut line outside the page")
            // Same turn as a box: a sideways page's point (x, y) lands at (y, sheetH - x) on the portrait sheet.
            return if (sideways) LineD(p[1], sheetH - p[0], p[3], sheetH - p[2]) else LineD(p[0], p[1], p[2], p[3])
        }

        private fun check(ok: Boolean, reason: String) {
            if (!ok) throw PlanInvalid(reason)
        }
    }
}
