package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max
import kotlin.math.min

/**
 * Owner, round 8 (scan pages): Clean colour, the print style for a photographed paper page: the paper white and even
 * (a shadow across it gone), the writing dark, and colour kept (a red stamp stays red, blue ink stays blue).
 */
class CleanColourTest {
    private val w = 600
    private val h = 800

    private fun argb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    private fun r(p: Int) = (p shr 16) and 0xFF
    private fun g(p: Int) = (p shr 8) and 0xFF
    private fun b(p: Int) = p and 0xFF
    private fun luma(p: Int) = Grey.luma(p)

    /** What is where on the test page: 0 paper, 1 text, 2 stamp. */
    private fun kind(x: Int, y: Int): Int {
        val dx = x - 450
        val dy = y - 650
        if (dx * dx + dy * dy < 40 * 40) return 2
        return if (x in 60 until 540 && y in 80 until 560 && (y / 6) % 4 == 0 && (x / 5) % 7 != 0) 1 else 0
    }

    /** The page as the camera saw it: paper at [paper] (x → level, for a shadow), text 40 grey, a red stamp. */
    private fun page(paper: (Int) -> Int): IntArray = IntArray(w * h) { i ->
        val x = i % w
        val y = i / w
        when (kind(x, y)) {
            1 -> argb(40, 40, 40)
            2 -> argb(200, 60, 60)
            else -> paper(x).let { argb(it, it, it) }
        }
    }

    private fun clean(img: IntArray): IntArray {
        val paper = Styles.CleanPaper(w, h)
        val row = IntArray(w)
        for (y in 0 until h) {
            System.arraycopy(img, y * w, row, 0, w)
            paper.add(row)
        }
        val out = img.copyOf()
        for (y in 0 until h) {
            System.arraycopy(out, y * w, row, 0, w)
            paper.clean(y, row, w)
            System.arraycopy(row, 0, out, y * w, w)
        }
        return out
    }

    /** Pixels of [kind] well inside their area (away from soft edges). */
    private fun inside(kind: Int) = (0 until w * h).filter { i ->
        val x = i % w
        val y = i / w
        x in 3 until w - 3 && y in 3 until h - 3 && (-3..3).all { d -> kind(x + d, y) == kind && kind(x, y + d) == kind }
    }

    @Test fun greyPaperTurnsWhiteTextDarkAndTheStampStaysRed() {
        val out = clean(page { 180 })
        for (i in inside(0)) assertTrue("paper ${luma(out[i])}", luma(out[i]) >= 245)
        for (i in inside(1)) assertTrue("text ${luma(out[i])}", luma(out[i]) <= 90)
        for (i in inside(2)) assertTrue("stamp ${r(out[i])},${g(out[i])}", r(out[i]) - g(out[i]) >= 80 && r(out[i]) - b(out[i]) >= 80)
    }

    @Test fun aShadowAcrossThePageIsEvenedOut() {
        // Paper from 200 at the left edge to 120 at the right: a phone's shadow.
        val out = clean(page { x -> 200 - 80 * x / (w - 1) })
        var lo = 255
        var hi = 0
        for (i in inside(0)) {
            lo = min(lo, luma(out[i]))
            hi = max(hi, luma(out[i]))
        }
        assertTrue("paper from $lo to $hi", hi - lo <= 10)
        for (i in inside(1)) assertTrue("text ${luma(out[i])}", luma(out[i]) <= 90)
    }

    @Test fun aWhitePageStaysWhiteAndGreyStaysGrey() {
        val out = clean(IntArray(w * h) { argb(250, 250, 250) })
        assertTrue(out.all { luma(it) >= 250 })
        // Grey in, grey out: the style never tints black and white writing.
        val text = clean(page { 190 })
        for (i in inside(1)) assertEquals(r(text[i]), b(text[i]))
    }

    /**
     * Golden pixels, worked by hand from the rule (docs/print-styles.md): paper 180 everywhere but a small square of
     * writing, so the paper estimate is 180 throughout. Writing 40: t = 40/180, (t / 0.9) = 0.2469 → table step 252 of
     * 1023 → 255 × (252/1023)^1.4 = 35.9 → 36. A red stamp (200, 60, 60): red over the paper → 255; green and blue
     * 60/180 / 0.9 = 0.3704 → step 378 → 255 × (378/1023)^1.4 = 63.3 → 63.
     */
    @Test fun goldenPixels() {
        val size = 96
        val img = IntArray(size * size) { i ->
            val x = i % size
            val y = i / size
            when {
                x in 40 until 46 && y in 40 until 46 -> argb(40, 40, 40)
                x in 60 until 64 && y in 20 until 24 -> argb(200, 60, 60)
                else -> argb(180, 180, 180)
            }
        }
        val paper = Styles.CleanPaper(size, size)
        val row = IntArray(size)
        for (y in 0 until size) {
            System.arraycopy(img, y * size, row, 0, size)
            paper.add(row)
        }
        fun at(x: Int, y: Int): Int {
            System.arraycopy(img, y * size, row, 0, size)
            paper.clean(y, row, size)
            return row[x]
        }
        assertEquals(argb(255, 255, 255), at(10, 10))
        assertEquals(argb(36, 36, 36), at(42, 42))
        assertEquals(argb(255, 63, 63), at(61, 21))
    }

    @Test fun cleanIsAColourStyle() {
        assertEquals(6, Styles.CLEAN)
        assertFalse(Styles.isGrey(Styles.CLEAN))
        assertTrue(Styles.isGrey(Styles.BW) && Styles.isGrey(Styles.SHARP) && Styles.isGrey(Styles.OCV))
    }

    @Test fun tinyAndAllBlackPagesNeverThrow() {
        for ((pw, ph) in listOf(1 to 1, 7 to 3, 3 to 900)) {
            val p = Styles.CleanPaper(pw, ph)
            val row = IntArray(pw) { argb(0, 0, 0) }
            repeat(ph) { p.add(row) }
            repeat(ph) { y -> p.clean(y, row.copyOf(), pw) }
        }
    }
}
