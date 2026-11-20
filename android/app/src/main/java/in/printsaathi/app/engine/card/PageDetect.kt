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

    /**
     * Round 12: how much of what is inside the corners looks like paper, 0..1: the share of sampled points within 35 grey
     * levels of the inside's bright end (its 90th percentile, at least 100). A sheet of paper is mostly one pale tone with
     * some print on it; a photograph, a framed picture or a screen has a wide spread. Used to decide, without asking, that
     * a photo is a paper document ([corners]: 8 fractions of the photo).
     */
    fun paperShare(grey: ByteArray, w: Int, h: Int, corners: DoubleArray): Double {
        if (w <= 0 || h <= 0 || grey.size != w * h || corners.size != 8) return 0.0
        val n = 24
        val values = ArrayList<Int>(n * n)
        for (j in 0 until n) for (i in 0 until n) {
            val u = (i + 0.5) / n
            val v = (j + 0.5) / n
            // Bilinear point of the four corners (TL, TR, BR, BL).
            val x = ((1 - u) * (1 - v) * corners[0] + u * (1 - v) * corners[2] + u * v * corners[4] + (1 - u) * v * corners[6]) * w
            val y = ((1 - u) * (1 - v) * corners[1] + u * (1 - v) * corners[3] + u * v * corners[5] + (1 - u) * v * corners[7]) * h
            val px = x.toInt().coerceIn(0, w - 1)
            val py = y.toInt().coerceIn(0, h - 1)
            values += grey[py * w + px].toInt() and 0xFF
        }
        values.sort()
        val top = maxOf(100, values[(values.size * 9) / 10])
        return values.count { it >= top - 35 }.toDouble() / values.size
    }

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
