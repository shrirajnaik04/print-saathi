package `in`.printsaathi.app.engine.card

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * The card panels printed on a page (Phase 14, spec "the e-Aadhaar PDF"): outlined, card-shaped boxes, square to the
 * page, with sharp printed borders. Pure code on grey bytes of a rendered page; the photo detector's checks (a card
 * against a table) don't fit printed outlines, so pages get this simpler finder.
 */
object Panels {
    private const val DARK = 150
    /** A printed border's side, as a share of the panel's side, that must be ink. */
    private const val COVER = 0.85
    /** The panel's shape, width / height, may differ from a card's by this much (its round corners shorten the lines). */
    private const val ASPECT_TOL = 0.08

    private class Run(val at: Int, val from: Int, val to: Int)

    /** A panel's width may differ from a card's 85.6 mm by this much (printed cut-outs are a little bigger). */
    private const val SIZE_TOL = 0.15

    /**
     * Up to [maxCards] panels, largest first, as corners in fractions of the page (TL, TR, BR, BL). With [pxPerMm] (the
     * page's scale), a panel must also be about a card's size: a ruled table of card shape is not one (review I2).
     */
    fun find(grey: ByteArray, w: Int, h: Int, maxCards: Int = 2, pxPerMm: Double? = null): List<CardQuad> {
        if (w < 64 || h < 64 || grey.size != w * h || maxCards < 1) return emptyList()
        fun dark(x: Int, y: Int) = (grey[y * w + x].toInt() and 0xff) < DARK
        // Straight printed lines across and down, at least 12 % of the page's width long.
        val across = runs(h, w, (0.12 * w).toInt()) { a, b -> dark(b, a) }
        val down = runs(w, h, (0.08 * h).toInt()) { a, b -> dark(a, b) }
        val found = mutableListOf<Pair<DoubleArray, Double>>()
        for (i in across.indices) for (j in i + 1 until across.size) {
            val top = across[i]
            val bottom = across[j]
            val height = bottom.at - top.at
            if (height < 0.04 * h) continue
            val tol = max(3, (0.015 * w).toInt())
            if (abs(top.from - bottom.from) > tol || abs(top.to - bottom.to) > tol) continue
            val from = min(top.from, bottom.from)
            val to = max(top.to, bottom.to)
            // The side lines: the down runs nearest the ends, covering the panel's height (round corners left out).
            val left = down.filter { it.at in from - tol * 3..from + tol && covers(it, top.at, bottom.at) }.minByOrNull { abs(it.at - from) } ?: continue
            val right = down.filter { it.at in to - tol..to + tol * 3 && covers(it, top.at, bottom.at) }.minByOrNull { abs(it.at - to) } ?: continue
            val width = (right.at - left.at).toDouble()
            val aspect = width / height
            if (abs(aspect / CardDetect.ASPECT - 1) > ASPECT_TOL) continue
            if (pxPerMm != null && abs(width / pxPerMm / 85.6 - 1) > SIZE_TOL) continue
            val q = doubleArrayOf(
                left.at.toDouble() / w, top.at.toDouble() / h, right.at.toDouble() / w, top.at.toDouble() / h,
                right.at.toDouble() / w, bottom.at.toDouble() / h, left.at.toDouble() / w, bottom.at.toDouble() / h,
            )
            found += q to width * height
        }
        val picked = mutableListOf<DoubleArray>()
        for ((q, _) in found.sortedByDescending { it.second }) {
            if (picked.size >= maxCards) break
            if (picked.any { overlaps(it, q) }) continue
            picked += q
        }
        // Reading order: left to right, then top to bottom.
        return picked.sortedWith(compareBy({ (it[1] * 4).toInt() }, { it[0] })).map { CardQuad(it, 0.95) }
    }

    private fun covers(r: Run, top: Int, bottom: Int): Boolean {
        val span = bottom - top
        val inner = min(r.to, bottom) - max(r.from, top)
        return inner >= COVER * span * 0.9
    }

    /** Runs of ink along each line [a] of [lines] (each [len] long), allowing 2-pixel breaks, merged across thick lines. */
    private fun runs(lines: Int, len: Int, minLen: Int, ink: (Int, Int) -> Boolean): List<Run> {
        val raw = mutableListOf<Run>()
        for (a in 0 until lines) {
            var start = -1
            var gap = 0
            for (b in 0..len) {
                val on = b < len && ink(a, b)
                if (on) {
                    if (start < 0) start = b
                    gap = 0
                } else if (start >= 0) {
                    gap++
                    if (gap > 2 || b == len) {
                        val end = b - gap
                        if (end - start + 1 >= minLen) raw += Run(a, start, end)
                        start = -1
                        gap = 0
                    }
                }
            }
        }
        // A printed line is a few pixels thick: neighbouring runs with the same extent are one line (its middle kept).
        val merged = mutableListOf<Run>()
        var group = mutableListOf<Run>()
        fun flush() {
            if (group.isNotEmpty()) merged += Run(group[group.size / 2].at, group.minOf { it.from }, group.maxOf { it.to })
            group = mutableListOf()
        }
        for (r in raw.sortedWith(compareBy({ it.from / 8 }, { it.at }))) {
            val last = group.lastOrNull()
            if (last != null && (r.at - last.at > 1 || abs(r.from - last.from) > 6 || abs(r.to - last.to) > 6)) flush()
            group += r
        }
        flush()
        return merged.sortedBy { it.at }
    }

    private fun overlaps(a: DoubleArray, b: DoubleArray): Boolean =
        !(a[2] <= b[0] || b[2] <= a[0] || a[5] <= b[1] || b[5] <= a[1])
}
