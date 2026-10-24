package `in`.printsaathi.app.engine.card

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** A card found in a photo: its corners (fractions of the photo: TL, TR, BR, BL, clockwise) and how sure the find is. */
class CardQuad(val corners: DoubleArray, val confidence: Double)

/**
 * Finds ID cards (85.6 × 54 mm) in a photo (Phase 14, spec Part 2). Pure code on grey bytes, run inside the isolated
 * engine on a ≤ 1024 px copy:
 * 1. a ≤ 640 px working copy (fine table and cloth textures fade; a card's outline stays), blur, gradients, thin
 *    sharp edges (Canny, keeping only steps: a table's bands and grain change as much a few pixels away);
 * 2. straight lines (Hough, voting near each edge's own direction), each refined by a least-squares fit;
 * 3. two pairs of near-parallel lines crossing make a four-sided shape; its sides are then snapped to the edge in the
 *    photo itself (sub-pixel, so its true shape can be judged: that needs exact corners);
 * 4. a shape is a card when it is convex, big enough, its true shape (recovered from the camera's perspective, Zhang
 *    and He's rectangle method) is a card's 1.585, its outline is backed by edges that face the right way with plain
 *    card just inside them (a grain line on a table has more grain beside it), and its sides stop at its corners (a
 *    band of text on a page is not a card).
 */
object CardDetect {
    const val AUTO_ACCEPT = 0.75
    const val ASPECT = 85.6 / 54.0
    /** An A4 page (1.414) and a letter (1.29) fall outside; a card seen at any tilt stays inside (true shape). */
    private const val ASPECT_TOL = 0.09
    private const val MIN_AREA = 0.06
    private const val MAX_AREA = 0.95
    private const val WORK_SIZE = 640
    /** Edge levels on the working copy: a card 22 grey levels away from the table gives about 40. */
    private const val HIGH = 24f
    private const val LOW = 12f
    private const val THETA_BINS = 180
    private const val MAX_LINES = 40
    private const val SIDE_SAMPLES = 60
    private const val END_SAMPLES = 12
    /** Snapping a side to the photo: places along it, and how far across it to look (photo pixels). */
    private const val SNAP_N = 40
    private const val SNAP_R = 6.0
    /** The least brightness step across a card's side (grey levels; a card on a clear background has 20 or more). */
    private const val MIN_STEP = 10.0
    /** How far to either side of a line its surroundings are sampled (working-copy pixels). */
    private const val SHIFT = 4.0
    /** A step: on one side, its gradient falls under half at each of these distances (px). */
    private val SHARP_D = doubleArrayOf(4.0, 7.0)

    internal class Line(val nx: Double, val ny: Double, val c: Double) {
        val theta: Double get() = atan2(ny, nx).let { if (it < 0) it + PI else it }.let { if (it >= PI) it - PI else it }
    }

    /** The working copy's edges: where they are and which way each one faces. */
    internal class Edges(val w: Int, val h: Int, val on: BooleanArray, val gx: FloatArray, val gy: FloatArray) {
        /** An edge within [r] px of ([x], [y]) whose gradient lies along the normal ([nx], [ny]) (either way, ≤ 25°). */
        fun along(x: Double, y: Double, nx: Double, ny: Double, r: Int): Boolean {
            val cx = x.roundToInt()
            val cy = y.roundToInt()
            for (dy in -r..r) for (dx in -r..r) {
                val xx = cx + dx
                val yy = cy + dy
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
                val i = yy * w + xx
                if (!on[i]) continue
                val g = sqrt((gx[i] * gx[i] + gy[i] * gy[i]).toDouble())
                if (g > 0 && abs(gx[i] * nx + gy[i] * ny) / g >= 0.9) return true
            }
            return false
        }
    }

    /** The photo itself (for snapping sides) and how many of its pixels make one working pixel. */
    internal class Photo(val grey: ByteArray, val w: Int, val h: Int, val k: Int) {
        fun at(x: Double, y: Double): Double {
            val x0 = x.toInt().coerceIn(0, w - 2)
            val y0 = y.toInt().coerceIn(0, h - 2)
            val fx = (x - x0).coerceIn(0.0, 1.0)
            val fy = (y - y0).coerceIn(0.0, 1.0)
            fun g(xx: Int, yy: Int) = (grey[yy * w + xx].toInt() and 0xff).toDouble()
            return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy
        }
        fun toPhoto(c: DoubleArray) = DoubleArray(8) { (c[it] + 0.5) * k - 0.5 }
        fun toWork(c: DoubleArray) = DoubleArray(8) { (c[it] + 0.5) / k - 0.5 }
    }

    /**
     * A four-sided shape's measurements (working-copy pixels; corners TL first, clockwise). [inPhoto]: its corners in
     * the photo, snapped to the photo's own edges when that worked.
     */
    internal class Shape(val corners: DoubleArray, val inPhoto: DoubleArray, val frac: Double, val aspect: Double, val sides: DoubleArray, val beyond: Double) {
        val avg: Double get() = sides.average()
        val minSide: Double get() = sides.min()
        val aspectFit: Double get() = 1 - 0.3 * (abs(ln(aspect / ASPECT)) / ln(1 + ASPECT_TOL)).let { it * it }
        val confidence: Double get() = ((0.7 * avg + 0.3 * minSide) * aspectFit).coerceIn(0.0, 1.0)
        val isCard: Boolean
            get() = frac in MIN_AREA..MAX_AREA && aspect in ASPECT * (1 - ASPECT_TOL)..ASPECT * (1 + ASPECT_TOL) &&
                minSide >= 0.35 && beyond < 0.5 && confidence >= 0.5
    }

    /** Each stage's output, for tests that check a stage on its own. [scale]: photo pixels per working pixel. */
    internal class Stages(val scale: Int, val edges: Edges, val lines: List<Line>, val shapes: List<Shape>)

    internal fun stages(grey: ByteArray, w: Int, h: Int): Stages? {
        if (w < 32 || h < 32 || grey.size != w * h) return null
        val k = max(1, ceil(max(w, h).toDouble() / WORK_SIZE).toInt())
        val sw = w / k
        val sh = h / k
        if (sw < 32 || sh < 32) return null
        val small = if (k == 1) FloatArray(w * h) { (grey[it].toInt() and 0xff).toFloat() } else shrink(grey, w, k, sw, sh)
        val g = blur(small, sw, sh)
        val gx = FloatArray(sw * sh)
        val gy = FloatArray(sw * sh)
        val mag = FloatArray(sw * sh)
        sobel(g, sw, sh, gx, gy, mag)
        val edges = Edges(sw, sh, canny(mag, gx, gy, sw, sh), gx, gy)
        val lines = lines(edges)
        return Stages(k, edges, lines, if (lines.size < 4) emptyList() else shapes(lines, edges, Photo(grey, w, h, k)))
    }

    fun find(grey: ByteArray, w: Int, h: Int, maxCards: Int = 2): List<CardQuad> {
        if (maxCards < 1) return emptyList()
        val st = stages(grey, w, h) ?: return emptyList()
        val e = st.edges
        val picked = mutableListOf<Shape>()
        for (s in st.shapes) {
            if (picked.size >= maxCards) break
            if (picked.any { overlap(it.corners, s.corners, e.w, e.h) > 0.05 }) continue
            picked += s
        }
        return picked.map { s -> CardQuad(DoubleArray(8) { i -> s.inPhoto[i] / if (i % 2 == 0) w else h }, s.confidence) }
    }

    // ---- 1. edges ----

    private fun shrink(src: ByteArray, w: Int, k: Int, sw: Int, sh: Int): FloatArray {
        val out = FloatArray(sw * sh)
        val n = (k * k).toFloat()
        for (y in 0 until sh) for (x in 0 until sw) {
            var s = 0
            for (dy in 0 until k) {
                val row = (y * k + dy) * w + x * k
                for (dx in 0 until k) s += src[row + dx].toInt() and 0xff
            }
            out[y * sw + x] = s / n
        }
        return out
    }

    private fun blur(src: FloatArray, w: Int, h: Int): FloatArray {
        val sigma = 1.4
        val r = 4
        val k = DoubleArray(2 * r + 1) { exp(-((it - r) * (it - r)) / (2 * sigma * sigma)) }.let { a -> val s = a.sum(); a.map { it / s } }
        val tmp = FloatArray(w * h)
        val out = FloatArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            var s = 0.0
            for (i in -r..r) s += k[i + r] * src[y * w + (x + i).coerceIn(0, w - 1)]
            tmp[y * w + x] = s.toFloat()
        }
        for (y in 0 until h) for (x in 0 until w) {
            var s = 0.0
            for (i in -r..r) s += k[i + r] * tmp[(y + i).coerceIn(0, h - 1) * w + x]
            out[y * w + x] = s.toFloat()
        }
        return out
    }

    private fun sobel(g: FloatArray, w: Int, h: Int, gx: FloatArray, gy: FloatArray, mag: FloatArray) {
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val a = g[i - w - 1]
            val b = g[i - w]
            val c = g[i - w + 1]
            val d = g[i - 1]
            val f = g[i + 1]
            val p = g[i + w - 1]
            val q = g[i + w]
            val r = g[i + w + 1]
            val sx = (c + 2 * f + r) - (a + 2 * d + p)
            val sy = (p + 2 * q + r) - (a + 2 * b + c)
            gx[i] = sx
            gy[i] = sy
            mag[i] = sqrt(sx * sx + sy * sy)
        }
    }

    private fun magAt(mag: FloatArray, w: Int, h: Int, x: Double, y: Double): Float {
        val xi = x.roundToInt().coerceIn(0, w - 1)
        val yi = y.roundToInt().coerceIn(0, h - 1)
        return mag[yi * w + xi]
    }

    /** Thin, connected, sharp edges: non-maximum suppression, then hysteresis between [HIGH] and [LOW]. */
    private fun canny(mag: FloatArray, gx: FloatArray, gy: FloatArray, w: Int, h: Int): BooleanArray {
        val thin = FloatArray(w * h)
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val m = mag[i]
            if (m < LOW) continue
            val ang = atan2(gy[i], gx[i]).toDouble()
            val sector = (((ang + PI) / (PI / 4)).roundToInt()) % 4
            val (n1, n2) = when (sector) {
                0 -> mag[i - 1] to mag[i + 1]
                1 -> mag[i - w - 1] to mag[i + w + 1]
                2 -> mag[i - w] to mag[i + w]
                else -> mag[i - w + 1] to mag[i + w - 1]
            }
            if (m < n1 || m < n2) continue
            val ux = gx[i] / m
            val uy = gy[i] / m
            // A step has plain surface on at least one side, out to a few pixels (a card's rim: the table, or the
            // card when its photo is close on the other side). A table's bands and grain change on both sides.
            fun flat(dir: Int) = SHARP_D.all { d -> magAt(mag, w, h, x + dir * ux * d, y + dir * uy * d) < 0.5f * m }
            if (flat(1) || flat(-1)) thin[i] = m
        }
        val edge = BooleanArray(w * h)
        val stack = IntArray(w * h)
        var sp = 0
        for (i in thin.indices) if (thin[i] >= HIGH && !edge[i]) {
            edge[i] = true
            stack[sp++] = i
            while (sp > 0) {
                val j = stack[--sp]
                val jx = j % w
                val jy = j / w
                for (dy in -1..1) for (dx in -1..1) {
                    val nx = jx + dx
                    val ny = jy + dy
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
                    val k = ny * w + nx
                    if (!edge[k] && thin[k] >= LOW) {
                        edge[k] = true
                        stack[sp++] = k
                    }
                }
            }
        }
        return edge
    }

    // ---- 2. lines ----

    private fun lines(e: Edges): List<Line> {
        val w = e.w
        val h = e.h
        val diag = sqrt((w * w + h * h).toDouble()).toInt() + 1
        val rhoBins = 2 * diag + 1
        val acc = IntArray(THETA_BINS * rhoBins)
        val cosT = DoubleArray(THETA_BINS) { cos(it * PI / THETA_BINS) }
        val sinT = DoubleArray(THETA_BINS) { sin(it * PI / THETA_BINS) }
        for (y in 0 until h) for (x in 0 until w) {
            val i = y * w + x
            if (!e.on[i]) continue
            // A line's normal is the gradient: vote only near the edge's own direction.
            var t = atan2(e.gy[i], e.gx[i]).toDouble()
            if (t < 0) t += PI
            val center = (t / PI * THETA_BINS).roundToInt()
            for (d in -8..8) {
                val tb = Math.floorMod(center + d, THETA_BINS)
                val rho = (x * cosT[tb] + y * sinT[tb]).roundToInt() + diag
                acc[tb * rhoBins + rho]++
            }
        }
        val minVotes = max(16, (0.06 * min(w, h)).toInt())
        val out = mutableListOf<Line>()
        var peaks = 0
        while (out.size < MAX_LINES && peaks++ < 3 * MAX_LINES) {
            var best = -1
            var bestV = minVotes - 1
            for (k in acc.indices) if (acc[k] > bestV) {
                bestV = acc[k]
                best = k
            }
            if (best < 0) break
            val tb = best / rhoBins
            val rho = best % rhoBins - diag
            // Suppress this line's neighbourhood (and its twin across θ = 0/180°, where ρ changes sign).
            for (dt in -5..5) for (dr in -6..6) {
                val t2 = tb + dt
                val (tt, rr) = when {
                    t2 < 0 -> (t2 + THETA_BINS) to (-rho + dr)
                    t2 >= THETA_BINS -> (t2 - THETA_BINS) to (-rho + dr)
                    else -> t2 to (rho + dr)
                }
                val idx = rr + diag
                if (idx in 0 until rhoBins) acc[tt * rhoBins + idx] = 0
            }
            // Several peaks can settle on the same edge: keep it once.
            val line = refine(e, cosT[tb], sinT[tb], rho.toDouble(), minVotes / 2) ?: continue
            if (out.none { same(it, line) }) out += line
        }
        return out
    }

    /** A total-least-squares fit of the edge pixels within 2 px of the line whose direction agrees with it. */
    private fun refine(e: Edges, ct: Double, st: Double, rho: Double, minPts: Int): Line? {
        val w = e.w
        val h = e.h
        var n = 0
        var sx = 0.0
        var sy = 0.0
        var sxx = 0.0
        var syy = 0.0
        var sxy = 0.0
        // Walk along the line instead of scanning the whole photo.
        val dx = -st
        val dy = ct
        val px = ct * rho
        val py = st * rho
        val reach = sqrt((w * w + h * h).toDouble())
        var t = -reach
        val seen = HashSet<Int>()
        while (t <= reach) {
            for (off in -2..2) {
                val x = (px + dx * t + ct * off).roundToInt()
                val y = (py + dy * t + st * off).roundToInt()
                if (x < 0 || y < 0 || x >= w || y >= h) continue
                val i = y * w + x
                if (!e.on[i] || !seen.add(i)) continue
                val gm = sqrt((e.gx[i] * e.gx[i] + e.gy[i] * e.gy[i]).toDouble())
                if (gm == 0.0 || abs((e.gx[i] * ct + e.gy[i] * st) / gm) < 0.96) continue // within ~15°
                n++
                sx += x
                sy += y
                sxx += x.toDouble() * x
                syy += y.toDouble() * y
                sxy += x.toDouble() * y
            }
            t += 1.0
        }
        if (n < minPts) return null
        val mx = sx / n
        val my = sy / n
        val cxx = sxx / n - mx * mx
        val cyy = syy / n - my * my
        val cxy = sxy / n - mx * my
        // The line's direction is the covariance's main axis; its normal the other one.
        val ang = 0.5 * atan2(2 * cxy, cxx - cyy)
        val nx = -sin(ang)
        val ny = cos(ang)
        return Line(nx, ny, nx * mx + ny * my)
    }

    // ---- 3. four-sided shapes ----

    private fun shapes(lines: List<Line>, e: Edges, photo: Photo): List<Shape> {
        val w = e.w
        val h = e.h
        val minSep = 0.08 * min(w, h)
        val cx = w / 2.0
        val cy = h / 2.0
        val pairs = mutableListOf<Pair<Line, Line>>()
        for (i in lines.indices) for (j in i + 1 until lines.size) {
            val a = lines[i]
            val b = lines[j]
            // A card's opposite sides meet at up to about 25° when it is tilted 35° towards a phone's wide lens.
            if (angleBetween(a, b) > 30 * PI / 180) continue
            // Distance between them, measured through the photo's centre along a's normal.
            val da = a.nx * cx + a.ny * cy - a.c
            val sign = if (a.nx * b.nx + a.ny * b.ny >= 0) 1.0 else -1.0
            val db = sign * (b.nx * cx + b.ny * cy - b.c)
            if (abs(da - db) < minSep) continue
            pairs += a to b
        }
        val out = mutableListOf<Shape>()
        for (p in pairs.indices) for (q in p + 1 until pairs.size) {
            val (a1, a2) = pairs[p]
            val (b1, b2) = pairs[q]
            if (angleBetween(a1, b1) < 45 * PI / 180) continue
            val c0 = cross(a1, b1) ?: continue
            val c1 = cross(a1, b2) ?: continue
            val c2 = cross(a2, b2) ?: continue
            val c3 = cross(a2, b1) ?: continue
            val quad = doubleArrayOf(c0.first, c0.second, c1.first, c1.second, c2.first, c2.second, c3.first, c3.second)
            if (!inside(quad, w, h)) continue
            val s = measure(quad, e, photo) ?: continue
            if (s.isCard) out += s
        }
        return out.sortedByDescending { it.confidence * sqrt(it.frac) }
    }

    /**
     * Measures a four-sided shape given by its corners in order (either direction) on the working copy; null when it
     * is not convex, or far from a card's size and shape (nothing else is worth measuring). With [photo], a shape
     * whose outline is backed by edges has its sides snapped to the photo's edges and its true shape judged from those;
     * a side that won't snap (no single straight edge there) makes it no card.
     */
    internal fun measure(corners: DoubleArray, e: Edges, photo: Photo? = null): Shape? {
        var quad = corners
        val area = signedArea(quad)
        if (area < 0) quad = doubleArrayOf(quad[0], quad[1], quad[6], quad[7], quad[4], quad[5], quad[2], quad[3])
        if (!convex(quad)) return null
        val frac = abs(area) / (e.w.toDouble() * e.h)
        if (frac < MIN_AREA || frac > MAX_AREA) return null
        val oriented = orient(quad)
        val aspect = trueAspect(oriented, e.w, e.h)
        if (aspect < ASPECT * (1 - 2 * ASPECT_TOL) || aspect > ASPECT * (1 + 2 * ASPECT_TOL)) return null
        val sides = DoubleArray(4)
        var beyond = 0.0
        for (s in 0 until 4) {
            val ax = oriented[2 * s]
            val ay = oriented[2 * s + 1]
            val bx = oriented[2 * ((s + 1) % 4)]
            val by = oriented[2 * ((s + 1) % 4) + 1]
            val len = hypot(bx - ax, by - ay)
            val nx = -(by - ay) / len
            val ny = (bx - ax) / len
            // Along the side (its round corners skipped), less what runs alongside it just inside: a card's rim is
            // plain, a grain line on a table has more grain beside it. (Corners run clockwise: the normal points in.)
            var hits = 0
            var inner = 0
            for (k in 0 until SIDE_SAMPLES) {
                val t = 0.06 + 0.88 * k / (SIDE_SAMPLES - 1)
                val x = ax + (bx - ax) * t
                val y = ay + (by - ay) * t
                if (e.along(x, y, nx, ny, 2)) hits++
                if (e.along(x + nx * SHIFT, y + ny * SHIFT, nx, ny, 1)) inner++
            }
            sides[s] = max(0, hits - inner).toDouble() / SIDE_SAMPLES
            // Past each end: a card's side stops at its corner; a line of text or a page's edge carries on. Measured
            // against the same stretch a little to either side, so a grained table's own lines don't count.
            for (end in 0..1) {
                val past = IntArray(3)
                for (k in 0 until END_SAMPLES) {
                    val t = 0.03 + 0.07 * k / (END_SAMPLES - 1)
                    val x = if (end == 0) ax - (bx - ax) * t else bx + (bx - ax) * t
                    val y = if (end == 0) ay - (by - ay) * t else by + (by - ay) * t
                    for ((j, off) in listOf(0.0, -SHIFT, SHIFT).withIndex()) if (e.along(x + nx * off, y + ny * off, nx, ny, 1)) past[j]++
                }
                beyond = max(beyond, (past[0] - max(past[1], past[2])).toDouble() / END_SAMPLES)
            }
        }
        val loose = Shape(oriented, photo?.toPhoto(oriented) ?: oriented, frac, aspect, sides, beyond)
        if (photo == null || !(loose.minSide >= 0.35 && loose.beyond < 0.5)) return loose
        val snapped = snap(photo, photo.toPhoto(oriented)) ?: return Shape(oriented, photo.toPhoto(oriented), frac, 0.0, sides, beyond)
        return Shape(photo.toWork(snapped), snapped, frac, trueAspect(snapped, photo.w, photo.h), sides, beyond)
    }

    /** The four sides snapped to the photo's edges, crossed again; null when a side has no single straight edge. */
    private fun snap(p: Photo, q: DoubleArray): DoubleArray? {
        val sides = Array(4) { s -> snapSide(p, q[2 * s], q[2 * s + 1], q[2 * ((s + 1) % 4)], q[2 * ((s + 1) % 4) + 1]) ?: return null }
        val out = DoubleArray(8)
        for (i in 0 until 4) {
            val c = cross(sides[(i + 3) % 4], sides[i]) ?: return null
            // A corner may move a little, never far: that would be another shape.
            if (hypot(c.first - q[2 * i], c.second - q[2 * i + 1]) > SNAP_R * 1.5) return null
            out[2 * i] = c.first
            out[2 * i + 1] = c.second
        }
        return out
    }

    /**
     * One side, snapped: across the side at [SNAP_N] places, the brightness step nearest to it (within [SNAP_R] px, the
     * side's own direction of step) to a tenth of a pixel; then a straight line through them, stray points dropped.
     */
    private fun snapSide(p: Photo, ax: Double, ay: Double, bx: Double, by: Double): Line? {
        val len = hypot(bx - ax, by - ay)
        if (len < 8) return null
        val dx = (bx - ax) / len
        val dy = (by - ay) / len
        val nx = -dy
        val ny = dx
        val count = (2 * SNAP_R / 0.5).toInt() + 1
        val profiles = Array(SNAP_N) { j ->
            val t = 0.1 + 0.8 * j / (SNAP_N - 1)
            val cx = ax + (bx - ax) * t
            val cy = ay + (by - ay) * t
            // Brightness across the side, averaged along it over 5 px; then its change per pixel.
            val bright = DoubleArray(count + 2) { i ->
                val o = -SNAP_R - 0.5 + 0.5 * i
                var sum = 0.0
                for (u in -2..2) sum += p.at(cx + nx * o + dx * u, cy + ny * o + dy * u)
                sum / 5
            }
            DoubleArray(count) { i -> bright[i + 2] - bright[i] }
        }
        // The whole step across the side at each place: outside to inside.
        val steps = DoubleArray(SNAP_N) { j ->
            val t = 0.1 + 0.8 * j / (SNAP_N - 1)
            val cx = ax + (bx - ax) * t
            val cy = ay + (by - ay) * t
            var sum = 0.0
            for (u in -2..2) sum += p.at(cx + nx * SNAP_R + dx * u, cy + ny * SNAP_R + dy * u) - p.at(cx - nx * SNAP_R + dx * u, cy - ny * SNAP_R + dy * u)
            sum / 5
        }
        // Which way the side steps (darker to lighter, or back): the way most places agree on.
        var vote = 0
        for (d in profiles) {
            val i = d.indices.maxByOrNull { abs(d[it]) } ?: continue
            vote += if (d[i] > 0) 1 else -1
        }
        val sign = if (vote >= 0) 1.0 else -1.0
        // A card's side is a brightness step along most of it, up to both its ends (card on one side, table on the
        // other; a table's grain can hide some of it); a line in the grain is not, nor a page's edge run on past the
        // page's corner.
        val stepped = steps.count { it * sign >= MIN_STEP }
        if (stepped < 0.5 * SNAP_N) return null
        val end = SNAP_N / 4
        if ((0 until end).count { steps[it] * sign >= MIN_STEP } * 5 < end) return null
        if ((SNAP_N - end until SNAP_N).count { steps[it] * sign >= MIN_STEP } * 5 < end) return null
        val xs = DoubleArray(SNAP_N)
        val ys = DoubleArray(SNAP_N)
        var n = 0
        for ((j, d) in profiles.withIndex()) {
            val best = d.indices.maxOf { sign * d[it] }
            if (best < 4) continue
            // The nearest clear step to the side (a stronger one further off is something else: the card's photo).
            var pick = -1
            for (i in 1 until count - 1) {
                val v = sign * d[i]
                if (v >= 0.5 * best && v >= sign * d[i - 1] && v >= sign * d[i + 1] && (pick < 0 || abs(i - count / 2) < abs(pick - count / 2))) pick = i
            }
            if (pick < 0) continue
            val l = sign * d[pick - 1]
            val c = sign * d[pick]
            val r = sign * d[pick + 1]
            val den = l - 2 * c + r
            val frac = if (den < 0) (0.5 * (l - r) / den).coerceIn(-0.5, 0.5) else 0.0
            val off = -SNAP_R + 0.5 * (pick + frac)
            val t = 0.1 + 0.8 * j / (SNAP_N - 1)
            xs[n] = ax + (bx - ax) * t + nx * off
            ys[n] = ay + (by - ay) * t + ny * off
            n++
        }
        if (n < SNAP_N / 2) return null
        var line = fit(xs, ys, BooleanArray(n) { true }, n) ?: return null
        // Drop points more than a pixel off, fit again: a straight edge keeps most of them.
        val keep = BooleanArray(n) { abs(line.nx * xs[it] + line.ny * ys[it] - line.c) <= 1.0 }
        if (keep.count { it } < SNAP_N / 2) return null
        line = fit(xs, ys, keep, n) ?: return null
        return line
    }

    private fun fit(xs: DoubleArray, ys: DoubleArray, keep: BooleanArray, n: Int): Line? {
        var m = 0
        var sx = 0.0
        var sy = 0.0
        for (i in 0 until n) if (keep[i]) {
            m++
            sx += xs[i]
            sy += ys[i]
        }
        if (m < 2) return null
        val mx = sx / m
        val my = sy / m
        var cxx = 0.0
        var cyy = 0.0
        var cxy = 0.0
        for (i in 0 until n) if (keep[i]) {
            cxx += (xs[i] - mx) * (xs[i] - mx)
            cyy += (ys[i] - my) * (ys[i] - my)
            cxy += (xs[i] - mx) * (ys[i] - my)
        }
        val ang = 0.5 * atan2(2 * cxy, cxx - cyy)
        val nx = -sin(ang)
        val ny = cos(ang)
        return Line(nx, ny, nx * mx + ny * my)
    }

    private fun same(a: Line, b: Line): Boolean {
        if (angleBetween(a, b) > 2 * PI / 180) return false
        val sign = if (a.nx * b.nx + a.ny * b.ny >= 0) 1.0 else -1.0
        return abs(a.c - sign * b.c) < 2.5
    }

    private fun angleBetween(a: Line, b: Line): Double {
        val d = abs(a.theta - b.theta)
        return min(d, PI - d)
    }

    private fun cross(a: Line, b: Line): Pair<Double, Double>? {
        val det = a.nx * b.ny - a.ny * b.nx
        if (abs(det) < 1e-9) return null
        return ((a.c * b.ny - a.ny * b.c) / det) to ((a.nx * b.c - a.c * b.nx) / det)
    }

    private fun inside(q: DoubleArray, w: Int, h: Int): Boolean {
        val mx = 0.02 * w
        val my = 0.02 * h
        for (i in 0 until 4) if (q[2 * i] < -mx || q[2 * i] > w + mx || q[2 * i + 1] < -my || q[2 * i + 1] > h + my) return false
        return true
    }

    /** Shoelace; positive = clockwise on screen (y down). */
    private fun signedArea(q: DoubleArray): Double {
        var a = 0.0
        for (i in 0 until 4) {
            val j = (i + 1) % 4
            a += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]
        }
        return a / 2
    }

    private fun convex(q: DoubleArray): Boolean {
        for (i in 0 until 4) {
            val a = i
            val b = (i + 1) % 4
            val c = (i + 2) % 4
            val cr = (q[2 * b] - q[2 * a]) * (q[2 * c + 1] - q[2 * b + 1]) - (q[2 * b + 1] - q[2 * a + 1]) * (q[2 * c] - q[2 * b])
            if (cr <= 0) return false
        }
        return true
    }

    /** TL first: the first edge is the card's upper long edge (the left one when the card stands up), clockwise. */
    private fun orient(q: DoubleArray): DoubleArray {
        fun len(i: Int) = hypot(q[2 * ((i + 1) % 4)] - q[2 * i], q[2 * ((i + 1) % 4) + 1] - q[2 * i + 1])
        val longFirst = len(0) + len(2) >= len(1) + len(3)
        val candidates = if (longFirst) listOf(0, 2) else listOf(1, 3)
        // Upper long edge: smaller mid-y; when the two are level within 10 % of the card, the left one (smaller mid-x).
        fun mid(i: Int) = ((q[2 * i] + q[2 * ((i + 1) % 4)]) / 2) to ((q[2 * i + 1] + q[2 * ((i + 1) % 4) + 1]) / 2)
        val (e1, e2) = candidates
        val (x1, y1) = mid(e1)
        val (x2, y2) = mid(e2)
        val level = abs(y1 - y2) < 0.1 * max(len(e1), len(e2))
        val start = if (level) (if (x1 <= x2) e1 else e2) else (if (y1 <= y2) e1 else e2)
        return DoubleArray(8) { k -> q[(2 * start + k) % 8] }
    }

    /**
     * The rectangle's true width/height from its four corners in a photo whose centre is the camera's axis (Zhang
     * and He 2006). The camera's focal length comes from the corners when both pairs of sides visibly converge;
     * otherwise (seen straight-on, or tilted about one axis only, when the corners can't tell it) a phone's usual,
     * 0.8 × the photo's long side.
     */
    fun trueAspect(q: DoubleArray, w: Int, h: Int): Double {
        val u0 = w / 2.0
        val v0 = h / 2.0
        val m1 = doubleArrayOf(q[0] - u0, q[1] - v0, 1.0) // TL
        val m2 = doubleArrayOf(q[2] - u0, q[3] - v0, 1.0) // TR
        val m4 = doubleArrayOf(q[4] - u0, q[5] - v0, 1.0) // BR
        val m3 = doubleArrayOf(q[6] - u0, q[7] - v0, 1.0) // BL
        val k2 = dot(crossV(m1, m4), m3) / dot(crossV(m2, m4), m3)
        val k3 = dot(crossV(m1, m4), m2) / dot(crossV(m3, m4), m2)
        val n2 = DoubleArray(3) { k2 * m2[it] - m1[it] }
        val n3 = DoubleArray(3) { k3 * m3[it] - m1[it] }
        val plain = sqrt((n2[0] * n2[0] + n2[1] * n2[1]) / (n3[0] * n3[0] + n3[1] * n3[1]))
        val scale = max(w, h).toDouble()
        val solved = if (abs(n2[2]) < 1e-9 || abs(n3[2]) < 1e-9) Double.NaN else -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2])
        // Phone cameras: from wide (0.5 × the long side) to a 2.5 × zoom; a value outside that is noise.
        val converge = min(abs(k2 - 1), abs(k3 - 1))
        val f2 = when {
            converge >= 0.04 && solved > (0.5 * scale).let { it * it } && solved < (2.5 * scale).let { it * it } -> solved
            else -> (0.8 * scale).let { it * it }
        }
        val num = (n2[0] * n2[0] + n2[1] * n2[1]) / f2 + n2[2] * n2[2]
        val den = (n3[0] * n3[0] + n3[1] * n3[1]) / f2 + n3[2] * n3[2]
        return if (den > 0 && num > 0) sqrt(num / den) else plain
    }

    /** How much two shapes overlap, as a share of the smaller one (sampled on a grid). */
    private fun overlap(a: DoubleArray, b: DoubleArray, w: Int, h: Int): Double {
        var both = 0
        var inA = 0
        var inB = 0
        val n = 64
        for (j in 0 until n) for (i in 0 until n) {
            val x = (i + 0.5) * w / n
            val y = (j + 0.5) * h / n
            val pa = contains(a, x, y)
            val pb = contains(b, x, y)
            if (pa) inA++
            if (pb) inB++
            if (pa && pb) both++
        }
        val small = min(inA, inB)
        return if (small == 0) 0.0 else both.toDouble() / small
    }

    private fun contains(q: DoubleArray, x: Double, y: Double): Boolean {
        for (i in 0 until 4) {
            val j = (i + 1) % 4
            val cr = (q[2 * j] - q[2 * i]) * (y - q[2 * i + 1]) - (q[2 * j + 1] - q[2 * i + 1]) * (x - q[2 * i])
            if (cr < 0) return false
        }
        return true
    }

    private fun hypot(a: Double, b: Double) = sqrt(a * a + b * b)

    private fun dot(a: DoubleArray, b: DoubleArray) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    private fun crossV(a: DoubleArray, b: DoubleArray) =
        doubleArrayOf(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
}
