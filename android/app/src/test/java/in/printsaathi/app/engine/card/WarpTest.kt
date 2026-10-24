package `in`.printsaathi.app.engine.card

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Phase 14 Task 1: the straightening maths (spec Part 2: a homography from the card's 4 corners, bilinear). */
class WarpTest {
    private val quad = doubleArrayOf(120.0, 80.0, 610.0, 140.0, 560.0, 470.0, 90.0, 400.0) // TL, TR, BR, BL

    @Test fun theRectanglesCornersLandExactlyOnTheQuadsCorners() {
        val h = Homography.fromRectToQuad(1011.0, 638.0, quad)
        val corners = listOf(0.0 to 0.0, 1011.0 to 0.0, 1011.0 to 638.0, 0.0 to 638.0)
        corners.forEachIndexed { i, (x, y) ->
            val (mx, my) = h.map(x, y)
            assertEquals(quad[2 * i], mx, 1e-9)
            assertEquals(quad[2 * i + 1], my, 1e-9)
        }
    }

    @Test fun theCentreMapsOntoTheCrossingOfTheQuadsDiagonals() {
        val h = Homography.fromRectToQuad(100.0, 60.0, quad)
        val (cx, cy) = h.map(50.0, 30.0)
        // Diagonals TL–BR and TR–BL cross where the rectangle's centre lands under any projective map.
        val (x1, y1, x2, y2) = listOf(quad[0], quad[1], quad[4], quad[5])
        val (x3, y3, x4, y4) = listOf(quad[2], quad[3], quad[6], quad[7])
        val d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        val px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d
        val py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d
        assertEquals(px, cx, 1e-6)
        assertEquals(py, cy, 1e-6)
    }

    @Test fun anAxisAlignedQuadIsAPlainScale() {
        // A 40×40 checker of 10 px squares, warped from its full area into 20×20: every 5×5 output block is one square.
        val sw = 40
        val src = IntArray(sw * sw) { i -> if (((i % sw) / 10 + (i / sw) / 10) % 2 == 0) BLACK else WHITE }
        val out = Warp.warp(src, sw, sw, doubleArrayOf(0.0, 0.0, 40.0, 0.0, 40.0, 40.0, 0.0, 40.0), 20, 20)
        assertEquals(400, out.size)
        // Away from square borders the colour is exact.
        assertEquals(BLACK, out[2 * 20 + 2])
        assertEquals(WHITE, out[2 * 20 + 7])
        assertEquals(WHITE, out[7 * 20 + 2])
        assertEquals(BLACK, out[7 * 20 + 7])
    }

    @Test fun outsideTheSourceIsWhitePaper() {
        val src = IntArray(10 * 10) { BLACK }
        val out = Warp.warp(src, 10, 10, doubleArrayOf(-10.0, -10.0, 20.0, -10.0, 20.0, 20.0, -10.0, 20.0), 30, 30)
        assertEquals(WHITE, out[0]) // top-left of the output is outside the photo
        assertTrue(red(out[15 * 30 + 15]) < 8) // the middle is the photo
    }

    @Test fun aDegenerateQuadIsRefused() {
        assertThrows(IllegalArgumentException::class.java) {
            Homography.fromRectToQuad(100.0, 60.0, doubleArrayOf(0.0, 0.0, 50.0, 0.0, 100.0, 0.0, 0.0, 50.0))
        }
    }

    private fun red(c: Int) = (c shr 16) and 0xff

    private companion object {
        const val BLACK = 0xff000000.toInt()
        const val WHITE = 0xffffffff.toInt()
    }
}

