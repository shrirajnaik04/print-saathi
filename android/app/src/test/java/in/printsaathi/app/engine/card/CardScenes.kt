package `in`.printsaathi.app.engine.card

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * Phase 14 test corpus (spec Part 2 acceptance): synthetic phone photos of ID cards with known corners. Generated
 * with fixed seeds, never real cards. Grey, [W]×[H].
 */
object CardScenes {
    const val W = 960
    const val H = 720
    const val CARD_ASPECT = 85.6 / 54.0

    enum class Bg { PAPER, DARK, CLOTH, WOOD, BLOBS }

    /** [cards]: each card's true corners in pixels, TL TR BR BL of the card itself. */
    class Scene(val grey: ByteArray, val cards: List<DoubleArray>, val pages: List<DoubleArray> = emptyList())

    /** One or two cards on [bg]; [areaFrac] of the photo per card; tilt as a fraction of the card size per corner. */
    /** [maxTilt]: the card tilted away from the camera by up to this many radians, in any direction (35° = 0.61). */
    fun cards(seed: Int, bg: Bg, count: Int = 1, areaFrac: Double? = null, maxTilt: Double = 0.61): Scene {
        val r = rng(seed)
        val img = background(r, bg)
        val f = focal(r)
        // Front and back: side by side or one above the other, each in its own half of the photo.
        val sideBySide = r.nextBoolean()
        val quads = mutableListOf<DoubleArray>()
        var tries = 0
        while (quads.size < count && tries++ < 2000) {
            val frac = areaFrac ?: (if (count == 1) r.nextDouble(0.10, 0.40) else r.nextDouble(0.08, 0.18))
            val cardW = sqrt(frac * W * H * CARD_ASPECT)
            val (x0, x1, y0, y1) = when {
                count == 1 -> listOf(0.0, W.toDouble(), 0.0, H.toDouble())
                sideBySide -> listOf(quads.size * W / 2.0, (quads.size + 1) * W / 2.0, 0.0, H.toDouble())
                else -> listOf(0.0, W.toDouble(), quads.size * H / 2.0, (quads.size + 1) * H / 2.0)
            }
            val cx = between(r, x0 + cardW * 0.3, x1 - cardW * 0.3)
            val cy = between(r, y0 + cardW * 0.3, y1 - cardW * 0.3)
            val tilt = between(r, 0.0, maxTilt)
            val towards = r.nextDouble(0.0, 2 * PI)
            val q = project(85.6, 54.0, cardW, cx, cy, r.nextDouble(0.0, 2 * PI), tilt * cos(towards), tilt * sin(towards), f)
            if (q.indices.any { (it % 2 == 0 && (q[it] < 4 || q[it] > W - 4)) || (it % 2 == 1 && (q[it] < 4 || q[it] > H - 4)) }) continue
            if (count > 1 && q.indices.any { (it % 2 == 0 && (q[it] < x0 + 10 || q[it] > x1 - 10)) || (it % 2 == 1 && (q[it] < y0 + 10 || q[it] > y1 - 10)) }) continue
            if (quads.any { overlaps(it, q) }) continue
            quads += q
        }
        val darkBg = bg == Bg.DARK
        for (q in quads) drawCard(img, q, r, light = !darkBg || r.nextBoolean(), bgLevel = meanAround(img, q))
        finish(img, r)
        return Scene(toBytes(img), quads)
    }

    /**
     * No card (spec: people, documents, screenshots): blobs (people and things, roughly), a grained table, document
     * pages (A4 shape, upright or sideways), and phone screenshots of a chat list. Kind = seed % 5.
     */
    fun cardFree(seed: Int): Scene {
        val r = rng(seed)
        val kind = seed % 5
        if (kind == 4) return screenshot(r)
        // Pages lie on cloth or on a grained table (whose lines run along the page's edges half the time).
        val img = background(r, if (kind == 0) Bg.BLOBS else if (kind == 1) Bg.WOOD else if (r.nextBoolean()) Bg.WOOD else Bg.CLOTH)
        val pages = mutableListOf<DoubleArray>()
        if (kind >= 2) {
            // A document page (A4: aspect 1.414) photographed on the table, text lines on it.
            val pw = r.nextDouble(260.0, 420.0)
            val q = project(
                210.0, 297.0, pw, W / 2.0 + r.nextDouble(-60.0, 60.0), H / 2.0 + r.nextDouble(-40.0, 40.0),
                r.nextDouble(-0.3, 0.3) + if (kind == 3) PI / 2 else 0.0, r.nextDouble(-0.5, 0.5), r.nextDouble(-0.5, 0.5), focal(r),
            )
            pages += q
            fillQuad(img, q) { u, v -> if (v > 0.08 && v < 0.92 && u > 0.1 && u < 0.9 && ((v * 40).toInt() % 2 == 0) && r.nextDouble() < 0.9) 70.0 else 238.0 }
        }
        finish(img, r)
        return Scene(toBytes(img), emptyList(), pages)
    }

    /**
     * Owner, round 8 (scan pages): one document page photographed on a table (wood, cloth or dark), text lines on it,
     * seen at a slant. [areaFrac]: its share of the photo; [wMm]×[hMm]: the page (A4 by default, upright or sideways);
     * [maxTilt]: how far it leans away from the camera (radians). Corners in [Scene.pages].
     */
    fun page(seed: Int, areaFrac: Double? = null, wMm: Double = 210.0, hMm: Double = 297.0, maxTilt: Double = 0.45): Scene {
        val r = rng(seed)
        val img = background(r, listOf(Bg.WOOD, Bg.CLOTH, Bg.DARK)[seed % 3])
        var q = DoubleArray(8)
        var tries = 0
        while (tries++ < 4000) {
            val frac = areaFrac ?: r.nextDouble(0.20, 0.60)
            val sideways = areaFrac == null && r.nextBoolean()
            val aspect = wMm / hMm
            // Width on the photo for that area (before the slant): area = w × w / aspect.
            val pw = sqrt(frac * W * H * aspect)
            val tilt = between(r, 0.0, maxTilt)
            val towards = r.nextDouble(0.0, 2 * PI)
            q = project(
                wMm, hMm, pw, W / 2.0 + r.nextDouble(-0.08, 0.08) * W * (1 - frac), H / 2.0 + r.nextDouble(-0.08, 0.08) * H * (1 - frac),
                r.nextDouble(-0.25, 0.25) * (1 - frac) + if (sideways) PI / 2 else 0.0, tilt * cos(towards), tilt * sin(towards), focal(r),
            )
            if (q.indices.none { (it % 2 == 0 && (q[it] < 3 || q[it] > W - 3)) || (it % 2 == 1 && (q[it] < 3 || q[it] > H - 3)) }) break
        }
        fillQuad(img, q) { u, v -> if (v > 0.08 && v < 0.92 && u > 0.1 && u < 0.9 && ((v * 40).toInt() % 2 == 0) && r.nextDouble() < 0.9) 70.0 else 238.0 }
        finish(img, r)
        return Scene(toBytes(img), emptyList(), listOf(q))
    }

    /** A photo with no page in it: a bare table, cloth, paper, a dark surface or things lying about. */
    fun noPage(seed: Int): Scene {
        val r = rng(seed)
        val img = background(r, Bg.entries[seed % Bg.entries.size])
        finish(img, r)
        return Scene(toBytes(img), emptyList())
    }

    /** A chat list as a phone shows it, straight (no camera): a top bar, rows with a round picture, name and message
     * lines, thin dividers. */
    private fun screenshot(r: Random): Scene {
        val img = DoubleArray(W * H) { 250.0 }
        val bar = r.nextDouble(40.0, 120.0)
        val barH = r.nextInt(50, 80)
        for (y in 0 until barH) for (x in 0 until W) img[y * W + x] = bar
        val rowH = r.nextInt(70, 110)
        var top = barH
        while (top + rowH < H) {
            val cx = 20 + rowH / 2
            val cy = top + rowH / 2
            val rad = rowH * 0.36
            val face = r.nextDouble(60.0, 200.0)
            val nameLen = r.nextInt(150, 420)
            val msgLen = r.nextInt(250, 700)
            for (y in top until top + rowH) for (x in 0 until W) {
                val d = (x - cx).toDouble() * (x - cx) + (y - cy).toDouble() * (y - cy)
                img[y * W + x] = when {
                    d < rad * rad -> face
                    x in (rowH + 30) until (rowH + 30 + nameLen) && y in (top + rowH / 4) until (top + rowH / 4 + 12) -> 40.0
                    x in (rowH + 30) until (rowH + 30 + msgLen) && y in (top + rowH / 2 + 6) until (top + rowH / 2 + 16) -> 130.0
                    x > W - 90 && x < W - 30 && y in (top + rowH / 4) until (top + rowH / 4 + 10) -> 150.0
                    y == top + rowH - 1 && x > rowH + 20 -> 215.0
                    else -> 250.0
                }
            }
            top += rowH
        }
        jpeg(img, 85)
        return Scene(toBytes(img), emptyList())
    }

    /** A camera's focal length in pixels: phones' main cameras (about 0.7–0.8 × the photo's width) up to a slight zoom. */
    private fun focal(r: Random) = r.nextDouble(0.7, 1.1) * W

    /**
     * A flat [wMm]×[hMm] rectangle seen by a pinhole camera of focal length [f] px (principal point at the photo's
     * centre): turned [spin] in its plane, tilted [tx]/[ty] radians away from the camera, its centre at ([cx], [cy]) in
     * the photo, about [widthPx] wide. Corners TL, TR, BR, BL of the rectangle itself.
     */
    fun project(wMm: Double, hMm: Double, widthPx: Double, cx: Double, cy: Double, spin: Double, tx: Double, ty: Double, f: Double = 0.9 * W): DoubleArray {
        val dist = f * wMm / widthPx
        val x0 = (cx - W / 2.0) * dist / f
        val y0 = (cy - H / 2.0) * dist / f
        return listOf(-1.0 to -1.0, 1.0 to -1.0, 1.0 to 1.0, -1.0 to 1.0).flatMap { (sx, sy) ->
            var x = sx * wMm / 2
            var y = sy * hMm / 2
            var z = 0.0
            // spin in the plane, then tilt about x and y
            val xs = x * cos(spin) - y * sin(spin)
            val ys = x * sin(spin) + y * cos(spin)
            x = xs
            y = ys
            val y1 = y * cos(tx) - z * sin(tx)
            val z1 = y * sin(tx) + z * cos(tx)
            y = y1
            z = z1
            val x2 = x * cos(ty) + z * sin(ty)
            val z2 = -x * sin(ty) + z * cos(ty)
            x = x2
            z = z2
            val zz = dist + z
            listOf(W / 2.0 + f * (x0 + x) / zz, H / 2.0 + f * (y0 + y) / zz)
        }.toDoubleArray()
    }

    /** Seeds mixed first (SplitMix64): Kotlin's generator gives alike first values for neighbouring seeds. */
    private fun rng(seed: Int): Random {
        var z = seed.toLong() * -7046029254386353131L
        z = (z xor (z ushr 30)) * -4658895280553007687L
        z = (z xor (z ushr 27)) * -7723592293110705685L
        return Random(z xor (z ushr 31))
    }

    /** A random value in [lo, hi), or the middle when the range is empty. */
    private fun between(r: Random, lo: Double, hi: Double) = if (hi > lo) r.nextDouble(lo, hi) else (lo + hi) / 2

    private fun background(r: Random, bg: Bg): DoubleArray {
        val img = DoubleArray(W * H)
        val phase = r.nextDouble(0.0, 6.0)
        for (y in 0 until H) for (x in 0 until W) {
            img[y * W + x] = when (bg) {
                Bg.PAPER -> 232.0
                Bg.DARK -> 38.0
                Bg.CLOTH -> 150.0 + 22 * sin(x * 0.9 + phase) * sin(y * 0.8)
                Bg.WOOD -> 120.0 + 35 * sin(y * 0.045 + 3 * sin(x * 0.004 + phase)) + 12 * sin(y * 0.7 + x * 0.01)
                Bg.BLOBS -> 140.0
            }
        }
        if (bg == Bg.BLOBS) repeat(14) {
            val bx = r.nextDouble(0.0, W.toDouble())
            val by = r.nextDouble(0.0, H.toDouble())
            val rx = r.nextDouble(30.0, 160.0)
            val ry = r.nextDouble(30.0, 160.0)
            val level = r.nextDouble(30.0, 230.0)
            for (y in max(0, (by - ry).toInt()) until min(H, (by + ry).toInt())) for (x in max(0, (bx - rx).toInt()) until min(W, (bx + rx).toInt())) {
                val d = ((x - bx) / rx).let { it * it } + ((y - by) / ry).let { it * it }
                if (d < 1) img[y * W + x] = level
            }
        }
        return img
    }

    /** A card like an Aadhaar: a coloured band on top, a photo on the left, lines of text, rounded corners. */
    private fun drawCard(img: DoubleArray, q: DoubleArray, r: Random, light: Boolean, bgLevel: Double) {
        // Clear background: the card's whole outline (its base and the band along its top) stands at least 22 levels
        // away from what is around it.
        var base = if (light) r.nextDouble(200.0, 250.0) else r.nextDouble(90.0, 130.0)
        if (abs(base - bgLevel) < 22) base = if (bgLevel > 128) bgLevel - 30 else bgLevel + 40
        var band = base - r.nextDouble(40.0, 80.0)
        var tries = 0
        while (abs(band - bgLevel) < 22 && tries++ < 20) band = base - r.nextDouble(40.0, 80.0)
        if (abs(band - bgLevel) < 22) band = base
        val radius = 0.037
        fillQuad(img, q) { u, v ->
            val ru = radius
            val rv = radius * CARD_ASPECT
            val cu = if (u < ru) ru else if (u > 1 - ru) 1 - ru else u
            val cv = if (v < rv) rv else if (v > 1 - rv) 1 - rv else v
            val du = (u - cu) / ru
            val dv = (v - cv) / rv
            if (du * du + dv * dv > 1) Double.NaN // the rounded corner: background shows
            else when {
                v < 0.16 -> band
                u in 0.05..0.28 && v in 0.24..0.80 -> 80.0 // the photo
                u in 0.33..0.92 && v > 0.28 && v < 0.85 && ((v * 22).toInt() % 3 == 0) -> 60.0 // text lines
                else -> base
            }
        }
    }

    private fun fillQuad(img: DoubleArray, q: DoubleArray, tex: (Double, Double) -> Double) {
        // The inverse map: photo pixel → card (u, v) through the homography of the unit square onto the quad.
        val minX = max(0, q.filterIndexed { i, _ -> i % 2 == 0 }.min().toInt() - 1)
        val maxX = min(W - 1, q.filterIndexed { i, _ -> i % 2 == 0 }.max().toInt() + 1)
        val minY = max(0, q.filterIndexed { i, _ -> i % 2 == 1 }.min().toInt() - 1)
        val maxY = min(H - 1, q.filterIndexed { i, _ -> i % 2 == 1 }.max().toInt() + 1)
        val inv = inverse(q)
        for (y in minY..maxY) for (x in minX..maxX) {
            var sum = 0.0
            var n = 0
            // 2×2 supersampling: soft, true edges (like a camera's).
            for (sy in 0..1) for (sx in 0..1) {
                val px = x + 0.25 + sx * 0.5
                val py = y + 0.25 + sy * 0.5
                val (u, v) = inv(px, py)
                if (u in 0.0..1.0 && v in 0.0..1.0) {
                    val t = tex(u, v)
                    if (!t.isNaN()) {
                        sum += t
                        n++
                        continue
                    }
                }
                sum += img[y * W + x]
                n++
            }
            img[y * W + x] = sum / n
        }
    }

    /** Photo pixel → (u, v) on the unit square, for a quad (TL, TR, BR, BL). */
    private fun inverse(q: DoubleArray): (Double, Double) -> Pair<Double, Double> {
        val h = Homography.fromRectToQuad(1.0, 1.0, q)
        // Invert numerically with a few Newton steps from the bilinear guess (accurate to 1e-9 for card shapes).
        return { px, py ->
            var u = 0.5
            var v = 0.5
            repeat(30) {
                val (x, y) = h.map(u, v)
                val e = 1e-6
                val (xu, yu) = h.map(u + e, v)
                val (xv, yv) = h.map(u, v + e)
                val a = (xu - x) / e
                val b = (xv - x) / e
                val c = (yu - y) / e
                val d = (yv - y) / e
                val det = a * d - b * c
                if (abs(det) < 1e-12) return@repeat
                val dx = px - x
                val dy = py - y
                u += (d * dx - b * dy) / det
                v += (-c * dx + a * dy) / det
            }
            u to v
        }
    }

    /** Shadow across the photo, a little camera blur, sensor noise. */
    private fun finish(img: DoubleArray, r: Random) {
        val gx = r.nextDouble(-0.18, 0.18)
        val gy = r.nextDouble(-0.18, 0.18)
        for (y in 0 until H) for (x in 0 until W) img[y * W + x] *= 1 - abs(gx) * x / W - abs(gy) * y / H + (abs(gx) + abs(gy)) * 0.5
        val k = doubleArrayOf(1.0, 4.0, 6.0, 4.0, 1.0).map { it / 16 }
        val tmp = DoubleArray(W * H)
        for (y in 0 until H) for (x in 0 until W) tmp[y * W + x] = (-2..2).sumOf { k[it + 2] * img[y * W + (x + it).coerceIn(0, W - 1)] }
        for (y in 0 until H) for (x in 0 until W) img[y * W + x] = (-2..2).sumOf { k[it + 2] * tmp[(y + it).coerceIn(0, H - 1) * W + x] }
        for (i in img.indices) img[i] += gaussian(r) * 6
        jpeg(img, 75)
    }

    /** The standard JPEG luminance table (quality 50). */
    private val Q50 = intArrayOf(
        16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
        14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
        49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
    )

    /** JPEG's loss, as a phone's camera and WhatsApp leave it: 8 × 8 blocks, DCT, rounded to [quality]'s table. */
    private fun jpeg(img: DoubleArray, quality: Int) {
        val scale = if (quality < 50) 5000.0 / quality else 200.0 - 2 * quality
        val q = DoubleArray(64) { kotlin.math.floor((Q50[it] * scale + 50) / 100).coerceAtLeast(1.0) }
        val c = Array(8) { u -> DoubleArray(8) { x -> (if (u == 0) sqrt(1.0 / 8) else sqrt(2.0 / 8)) * cos((2 * x + 1) * u * PI / 16) } }
        val blk = DoubleArray(64)
        val tmp = DoubleArray(64)
        for (by in 0 until H step 8) for (bx in 0 until W step 8) {
            for (y in 0..7) for (x in 0..7) blk[y * 8 + x] = img[(by + y) * W + bx + x].coerceIn(0.0, 255.0) - 128
            for (u in 0..7) for (x in 0..7) tmp[u * 8 + x] = (0..7).sumOf { y -> c[u][y] * blk[y * 8 + x] }
            for (u in 0..7) for (v in 0..7) {
                val f = (0..7).sumOf { x -> tmp[u * 8 + x] * c[v][x] }
                blk[u * 8 + v] = Math.round(f / q[u * 8 + v]) * q[u * 8 + v]
            }
            for (y in 0..7) for (v in 0..7) tmp[y * 8 + v] = (0..7).sumOf { u -> c[u][y] * blk[u * 8 + v] }
            for (y in 0..7) for (x in 0..7) img[(by + y) * W + bx + x] = (0..7).sumOf { v -> tmp[y * 8 + v] * c[v][x] } + 128
        }
    }

    private fun gaussian(r: Random): Double {
        val u = r.nextDouble(1e-12, 1.0)
        val v = r.nextDouble()
        return sqrt(-2 * kotlin.math.ln(u)) * cos(2 * PI * v)
    }

    private fun meanAround(img: DoubleArray, q: DoubleArray): Double {
        var s = 0.0
        var n = 0
        for (i in 0 until 4) {
            val x = q[2 * i].toInt().coerceIn(0, W - 1)
            val y = q[2 * i + 1].toInt().coerceIn(0, H - 1)
            s += img[y * W + x]
            n++
        }
        return s / n
    }

    private fun overlaps(a: DoubleArray, b: DoubleArray): Boolean {
        fun box(q: DoubleArray) = doubleArrayOf(
            q.filterIndexed { i, _ -> i % 2 == 0 }.min(), q.filterIndexed { i, _ -> i % 2 == 1 }.min(),
            q.filterIndexed { i, _ -> i % 2 == 0 }.max(), q.filterIndexed { i, _ -> i % 2 == 1 }.max(),
        )
        val p = box(a)
        val s = box(b)
        return !(p[2] + 20 < s[0] || s[2] + 20 < p[0] || p[3] + 20 < s[1] || s[3] + 20 < p[1])
    }

    private fun toBytes(img: DoubleArray) = ByteArray(img.size) { img[it].coerceIn(0.0, 255.0).toInt().toByte() }

    /** Largest distance between a found card's corners and the true ones (any start corner, either direction). */
    fun cornerError(found: DoubleArray, truth: DoubleArray): Double {
        var best = Double.MAX_VALUE
        for (start in 0 until 4) for (dir in listOf(1, -1)) {
            var worst = 0.0
            for (i in 0 until 4) {
                val j = Math.floorMod(start + dir * i, 4)
                val dx = found[2 * j] - truth[2 * i]
                val dy = found[2 * j + 1] - truth[2 * i + 1]
                worst = max(worst, sqrt(dx * dx + dy * dy))
            }
            best = min(best, worst)
        }
        return best
    }

}
