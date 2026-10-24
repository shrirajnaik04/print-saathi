package `in`.printsaathi.app.engine.render

/**
 * The part of a photo to print, as fractions (0..1, top-left origin) of the photo (PLAN §F1, §G1). A plan's crop is
 * chosen on the photo as the shopkeeper sees it (upright, then turned); [uprightOf] turns it back onto the upright photo, which
 * is what the engine decodes.
 */
data class Crop(val x: Double, val y: Double, val w: Double, val h: Double) {
    /** The same area on the upright photo, for a photo shown turned [turnsCw] quarter turns clockwise. */
    fun uprightOf(turnsCw: Int): Crop = when (Math.floorMod(turnsCw, 4)) {
        // Shown = upright turned clockwise: a shown point (u, v) is the upright point (v, 1 - u).
        1 -> Crop(y, 1 - x - w, h, w)
        2 -> Crop(1 - x - w, 1 - y - h, w, h)
        3 -> Crop(1 - y - h, x, h, w)
        else -> this
    }.insidePhoto()

    /**
     * Rounding can put a frame that touches an edge a hair outside the photo (1 − x − w = −5.6e-17); the engine would
     * refuse it. Kept inside, a sub-pixel change at most (Phase 8 re-review; latent since Phase 6).
     */
    private fun insidePhoto(): Crop {
        val cx = x.coerceIn(0.0, 1.0)
        val cy = y.coerceIn(0.0, 1.0)
        return Crop(cx, cy, minOf(w, 1 - cx), minOf(h, 1 - cy))
    }

    val isFull get() = this == FULL

    /** Names the cut in work-file and image names (6 decimals: far below a pixel of any photo we accept). */
    val key: String get() = if (isFull) "full" else listOf(x, y, w, h).joinToString("_") { "%.6f".format(java.util.Locale.ROOT, it) }

    companion object {
        val FULL = Crop(0.0, 0.0, 1.0, 1.0)
    }
}
