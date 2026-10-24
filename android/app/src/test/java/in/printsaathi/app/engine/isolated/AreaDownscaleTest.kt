package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AreaDownscaleTest {
    private fun argb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b

    private fun run(src: IntArray, sw: Int, sh: Int, dw: Int, dh: Int): IntArray {
        val out = IntArray(dw * dh)
        areaDownscaleRows(sw, sh, dw, dh, readRow = { y, buf -> System.arraycopy(src, y * sw, buf, 0, sw) }) { y, row ->
            System.arraycopy(row, 0, out, y * dw, dw)
        }
        return out
    }

    @Test fun averagesExactTwoByTwoBlocks() {
        val black = argb(0, 0, 0)
        val c = argb(200, 100, 50)
        val src = intArrayOf(black, black, c, c, black, black, c, c)
        assertArrayEquals(intArrayOf(black, c), run(src, 4, 2, 2, 1))
    }

    @Test fun weightsNonIntegerRatiosByArea() {
        val src = intArrayOf(argb(0, 0, 0), argb(255, 0, 0), argb(0, 0, 0))
        val out = run(src, 3, 1, 2, 1) // each output pixel covers 1.5 source pixels: (0*1 + 255*0.5)/1.5 = 85
        assertEquals(argb(85, 0, 0), out[0])
        assertEquals(argb(85, 0, 0), out[1])
    }

    @Test fun readsEachSourceRowOnlyOnceAndInOrder() {
        val reads = mutableListOf<Int>()
        val sw = 30
        val sh = 21
        areaDownscaleRows(sw, sh, 20, 14, readRow = { y, buf -> reads += y; buf.fill(argb(9, 9, 9)) }) { _, _ -> }
        assertEquals((0 until sh).toList(), reads)
    }

    /** PLAN §F2: transparent areas print as white paper, never black (Gate 2 minor 8). */
    @Test fun transparentPixelsCompositeOntoWhite() {
        val clear = 0x00000000
        val halfBlack = (0x80 shl 24)
        assertEquals(argb(255, 255, 255), run(intArrayOf(clear, clear, clear, clear), 2, 2, 1, 1)[0])
        val grey = run(intArrayOf(halfBlack, halfBlack, halfBlack, halfBlack), 2, 2, 1, 1)[0] and 0xFF
        assertTrue("half-transparent black should be mid grey, was $grey", grey in 126..128)
    }

    /** Property checks over random sizes: every output row is written once, in order, and flat images stay flat. */
    @Test fun randomSizesWriteEveryRowOnceAndPreserveFlatColour() {
        val rnd = java.util.Random(7)
        repeat(300) {
            val sw = 1 + rnd.nextInt(300)
            val sh = 1 + rnd.nextInt(300)
            val dw = 1 + rnd.nextInt(sw)
            val dh = 1 + rnd.nextInt(sh)
            val colour = argb(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256))
            val rows = mutableListOf<Int>()
            areaDownscaleRows(sw, sh, dw, dh, { _, buf -> buf.fill(colour) }) { y, row ->
                rows += y
                assertTrue("flat colour changed for ${sw}x$sh -> ${dw}x$dh", row.all { it == colour })
            }
            assertEquals("rows for ${sw}x$sh -> ${dw}x$dh", (0 until dh).toList(), rows)
        }
    }

    /**
     * A JPEG decoded at sample size 2 from an odd size (e.g. 5 px -> 3 sampled px) has a last sampled pixel that
     * stands for half a pixel's worth of source. The average must weight it by the true extent (2.5), or the
     * grid is squashed (measured on a progressive 11999x8999 fixture: 17 dB rows at the bottom).
     */
    @Test fun partialLastSampledPixelIsWeightedByTheTrueExtent() {
        val out = IntArray(1)
        areaDownscaleRows(3, 1, 1, 1, extentW = 2.5, extentH = 1.0, readRow = { _, buf ->
            buf[0] = argb(10, 10, 10); buf[1] = argb(10, 10, 10); buf[2] = argb(250, 250, 250)
        }) { _, row -> out[0] = row[0] }
        // (10 + 10 + 0.5 * 250) / 2.5 = 58
        assertEquals(58, out[0] and 0xFF)
    }

    @Test fun partialLastSampledRowIsWeightedByTheTrueExtent() {
        val rows = intArrayOf(argb(10, 10, 10), argb(10, 10, 10), argb(250, 250, 250))
        val out = IntArray(1)
        areaDownscaleRows(1, 3, 1, 1, extentW = 1.0, extentH = 2.5, readRow = { y, buf -> buf[0] = rows[y] }) { _, row -> out[0] = row[0] }
        assertEquals(58, out[0] and 0xFF)
    }

    /**
     * Android's region decoder rounds a sampled sub-region DOWN (807 rows at sample size 2 -> 403), so the decoded
     * pixels can cover slightly less than the true extent. The missing fraction repeats the edge pixel instead of
     * stretching the image (measured: a 1/8999 vertical scale error, 17 dB rows on a 11999x8999 JPEG).
     */
    @Test fun extentBeyondTheDecodedPixelsRepeatsTheEdge() {
        val out = IntArray(1)
        areaDownscaleRows(3, 1, 1, 1, extentW = 3.5, extentH = 1.0, readRow = { _, buf ->
            buf[0] = argb(10, 10, 10); buf[1] = argb(10, 10, 10); buf[2] = argb(250, 250, 250)
        }) { _, row -> out[0] = row[0] }
        // (10 + 10 + 250 + 0.5 * 250) / 3.5 = 112.86
        assertEquals(113, out[0] and 0xFF)
        val rows = intArrayOf(argb(10, 10, 10), argb(10, 10, 10), argb(250, 250, 250))
        val written = mutableListOf<Int>()
        areaDownscaleRows(1, 3, 1, 1, extentW = 1.0, extentH = 3.5, readRow = { y, buf -> buf[0] = rows[y] }) { y, row ->
            written += y
            out[0] = row[0]
        }
        assertEquals(113, out[0] and 0xFF)
        assertEquals(listOf(0), written)
    }
}
