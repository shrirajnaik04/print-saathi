package `in`.printsaathi.app.engine.isolated

import kotlin.math.abs

/**
 * A card's corners as the app sends them (Phase 14): 8 fractions of the upright photo or page (TL, TR, BR, BL), each
 * finite and within the image (a little slack for corners the user dragged to the edge), making a convex, clockwise,
 * non-empty shape. Shared by the engine and the plan check, so both refuse the same things.
 */
object QuadCheck {
    private const val SLACK = 0.02
    private const val MIN_AREA = 1e-4

    fun ok(q: DoubleArray?): Boolean {
        if (q == null || q.size != 8 || q.any { !it.isFinite() || it < -SLACK || it > 1 + SLACK }) return false
        var area = 0.0
        for (i in 0 until 4) {
            val a = i
            val b = (i + 1) % 4
            val c = (i + 2) % 4
            val cr = (q[2 * b] - q[2 * a]) * (q[2 * c + 1] - q[2 * b + 1]) - (q[2 * b + 1] - q[2 * a + 1]) * (q[2 * c] - q[2 * b])
            if (cr <= 0) return false // clockwise on screen (y down) and convex: every turn the same way
            area += q[2 * a] * q[2 * b + 1] - q[2 * b] * q[2 * a + 1]
        }
        return abs(area) / 2 >= MIN_AREA
    }
}
