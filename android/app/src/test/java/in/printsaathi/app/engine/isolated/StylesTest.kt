package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 8 (PLAN §F4): the print styles as pure functions. Golden values for Vibrant, Soft Tone and Sharp Black come
 * from a separate Python reference of the same formulas (scratch styles_ref.py, recorded in docs/print-styles.md).
 */
class StylesTest {
    private fun argb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    private fun rgb(p: Int) = Triple((p shr 16) and 0xFF, (p shr 8) and 0xFF, p and 0xFF)

    private val reference = listOf(
        Triple(0, 0, 0), Triple(255, 255, 255), Triple(128, 128, 128), Triple(200, 40, 40),
        Triple(40, 160, 60), Triple(30, 60, 220), Triple(250, 220, 120), Triple(90, 70, 50),
    )

    private fun run(f: (IntArray, Int) -> Unit) =
        reference.map { (r, g, b) -> argb(r, g, b) }.toIntArray().also { f(it, it.size) }.map(::rgb)

    @Test fun vibrantMatchesTheReference() {
        assertEquals(
            listOf(
                Triple(0, 0, 0), Triple(255, 255, 255), Triple(128, 128, 128), Triple(236, 20, 20),
                Triple(13, 175, 40), Triple(12, 52, 255), Triple(255, 228, 93), Triple(91, 64, 37),
            ),
            run(Styles::vibrant),
        )
    }

    @Test fun softToneMatchesTheReference() {
        assertEquals(
            listOf(
                Triple(19, 19, 19), Triple(248, 248, 248), Triple(134, 134, 134), Triple(191, 58, 58),
                Triple(60, 159, 77), Triple(49, 73, 206), Triple(241, 217, 134), Triple(99, 82, 66),
            ),
            run(Styles::soft),
        )
    }

    @Test fun sharpBlackLevelsFollowThePercentilesWithinTheirLimits() {
        // 0..99 once each: 5th percentile 4, 90th 89 -> white held at 160.
        val ramp = IntArray(256).also { h -> for (v in 0 until 100) h[v] = 1 }
        assertEquals(Styles.Levels(4, 160), Styles.levels(ramp))
        // A white page: black held at 90, white 255 -> white stays white, nothing turns black.
        val white = IntArray(256).also { it[255] = 1000 }
        assertEquals(Styles.Levels(90, 255), Styles.levels(white))
        // Text on paper: 10 % ink at 20, the rest paper at 230.
        val text = IntArray(256).also { it[20] = 100; it[230] = 900 }
        assertEquals(Styles.Levels(20, 230), Styles.levels(text))
    }

    @Test fun sharpBlackStretchesAndDarkensMidGreys() {
        fun out(levels: Styles.Levels, vs: List<Int>) =
            vs.map { v -> argb(v, v, v) }.toIntArray().also { Styles.sharp(it, it.size, levels) }.map { it and 0xFF }
        assertEquals(listOf(0, 0, 26, 113, 124, 213, 255, 255, 255), out(Styles.Levels(90, 160), listOf(0, 90, 100, 125, 128, 150, 160, 200, 255)))
        assertEquals(listOf(0, 0, 41, 117, 213, 255, 255), out(Styles.Levels(20, 230), listOf(0, 20, 64, 128, 200, 230, 255)))
        // Grey only, from colour input (Rec.601 first).
        val c = intArrayOf(argb(200, 40, 40)).also { Styles.sharp(it, 1, Styles.Levels(20, 230)) }
        val (r, g, b) = rgb(c[0])
        assertTrue(r == g && g == b)
    }

    /** A page: paper getting darker to the right (uneven light), dark text strokes, one dark photo block. */
    private fun page(w: Int, h: Int): ByteArray {
        val g = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val paper = 235 - 90 * x / w // 235 on the left down to 145 on the right
            val text = (y / 30) % 2 == 0 && (y % 30) in 10..14 && (x / 20) % 3 != 2 // strokes 5 px thick
            g[y * w + x] = (if (text) paper - 110 else paper).coerceIn(0, 255).toByte()
        }
        return g
    }

    private fun bit(out: ByteArray, w: Int, x: Int, y: Int): Int {
        val stride = (w + 7) / 8
        return (out[y * stride + x / 8].toInt() shr (7 - x % 8)) and 1
    }

    @Test fun ocvBlackMakesTextBlackAndUnevenPaperWhite() {
        val w = 1200
        val h = 900
        val out = Styles.ocv(page(w, h), w, h, stripRows = 128)
        assertEquals(((w + 7) / 8) * h, out.size)
        var paperBlack = 0
        var paperAll = 0
        var textBlack = 0
        var textAll = 0
        for (y in 0 until h) for (x in 0 until w) {
            val isText = (y / 30) % 2 == 0 && (y % 30) in 11..13 && (x / 20) % 3 != 2 && x % 20 in 2..17
            val isPaper = (y % 30) !in 6..18
            val black = bit(out, w, x, y) == 0 // 1-bit DeviceGray: 0 = black
            if (isText) { textAll++; if (black) textBlack++ }
            if (isPaper) { paperAll++; if (black) paperBlack++ }
        }
        assertTrue("text black: $textBlack / $textAll", textBlack >= textAll * 98 / 100)
        assertTrue("paper white even where it is darker: $paperBlack / $paperAll", paperBlack <= paperAll / 100)
    }

    @Test fun ocvBlackIsTheSameWhateverTheStripHeight() {
        val w = 640
        val h = 480
        val g = page(w, h)
        val a = Styles.ocv(g, w, h, stripRows = 37)
        assertArrayEquals(a, Styles.ocv(g, w, h, stripRows = 256))
        assertArrayEquals(a, Styles.ocv(g, w, h, stripRows = h))
    }

    @Test fun ocvBlackLeavesAWhitePageWhiteAndPadsRowsWithWhite() {
        val w = 13
        val h = 20
        val out = Styles.ocv(ByteArray(w * h) { 250.toByte() }, w, h, stripRows = 8)
        assertTrue(out.all { it == 0xFF.toByte() })
    }

    @Test fun ocvBlackKeepsAPhotoOnThePageFromBecomingASolidBlock() {
        val w = 800
        val h = 800
        // White paper with a 400 × 400 photo: a smooth dark-to-mid gradient (60..140), like a face in shadow.
        val g = ByteArray(w * h) { 245.toByte() }
        for (y in 200 until 600) for (x in 200 until 600) g[y * w + x] = (60 + 80 * (x - 200) / 400).toByte()
        val out = Styles.ocv(g, w, h)
        var black = 0
        for (y in 200 until 600) for (x in 200 until 600) if (bit(out, w, x, y) == 0) black++
        assertTrue("black share of the photo: $black / 160000", black < 160000 / 2)
    }

    @Test fun ocvBlackHandlesAWholeA4PageAt300Dpi() {
        val w = 2480
        val h = 3508
        val t0 = System.nanoTime()
        val out = Styles.ocv(page(w, h), w, h)
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertEquals(((w + 7) / 8) * h, out.size)
        assertTrue("took $ms ms", ms < 15_000)
    }

    /** The same page as tests/generate/styles-reference.py golden_page: darkening paper, text, a dark photo block. */
    private fun goldenPage(w: Int, h: Int) = ByteArray(w * h) { i ->
        val x = i % w
        val y = i / w
        val paper = 235 - 90 * x / w
        val text = (y / 30) % 2 == 0 && (y % 30) in 10..14 && (x / 20) % 3 != 2
        var v = if (text) paper - 110 else paper
        if (x in 40 until 120 && y in 60 until 140) v = 60 + 80 * (x - 40) / 80
        v.coerceIn(0, 255).toByte()
    }

    /** Gate I2: OCV Black bit for bit as the independent Python reference (no strips there; strips of 64 here). */
    @Test fun ocvBlackMatchesTheReferenceBitForBit() {
        val golden = javaClass.getResource("/ocv-golden-300x200.bin")!!.readBytes()
        assertArrayEquals(golden, Styles.ocv(goldenPage(300, 200), 300, 200, stripRows = 64))
    }

    @Test fun ocvBlackHandlesTinyAndAllBlackPages() {
        assertArrayEquals("1 × 1 white", byteArrayOf(0xFF.toByte()), Styles.ocv(byteArrayOf(250.toByte()), 1, 1))
        assertArrayEquals("1 × 1 black", byteArrayOf(0x7F), Styles.ocv(byteArrayOf(0), 1, 1))
        // All black: stays black (the background floor of 1 keeps the division finite), padding stays white.
        val black = Styles.ocv(ByteArray(10 * 3), 10, 3, stripRows = 2)
        assertArrayEquals(ByteArray(3) { 0 }.flatMapIndexed { _, _ -> listOf(0.toByte(), 0x3F.toByte()) }.toByteArray(), black)
        // Shorter than the window (15): one strip, the window clipped at every edge.
        assertEquals(((40 + 7) / 8) * 5, Styles.ocv(ByteArray(40 * 5) { 200.toByte() }, 40, 5).size)
    }
}
