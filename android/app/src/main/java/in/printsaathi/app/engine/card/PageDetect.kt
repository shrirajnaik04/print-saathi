package `in`.printsaathi.app.engine.card

/**
 * Owner, round 8 (scan pages, "like the DocScanner app"): the page in a photo of a paper document, for the shopkeeper
 * to check on Corners. The card finder's steps ([CardDetect]) with a page's limits: any sheet from square to twice as
 * long as wide (A4 1.41, letter 1.29, legal 1.65, a long receipt up to 2), either way up, 12–98 % of the photo. Of the
 * shapes that fit, the biggest sure one (a box printed on the page is smaller than the page).
 */
object PageDetect {
    val LIMITS = CardDetect.Limits(
        minAspect = 1.0,
        maxAspect = 2.0,
        minArea = 0.12,
        maxArea = 0.98,
        slack = 0.15,
        eitherWay = true,
    ) { 1.0 }

    /** The page's corners (fractions of the photo, top left first, clockwise) and how sure; null when none is seen. */
    fun find(grey: ByteArray, w: Int, h: Int): CardQuad? {
        if (w <= 0 || h <= 0 || grey.size != w * h) return null
        val st = CardDetect.stages(grey, w, h, LIMITS) ?: return null
        val best = st.shapes.maxByOrNull { it.confidence * it.frac } ?: return null
        val c = DoubleArray(8) { i -> best.inPhoto[i] / if (i % 2 == 0) w else h }
        // As the photo is shown: the corner nearest its top left first, then clockwise.
        val start = (0 until 4).minBy { c[2 * it] + c[2 * it + 1] }
        return CardQuad(DoubleArray(8) { c[(2 * start + it) % 8] }, best.confidence)
    }
}
