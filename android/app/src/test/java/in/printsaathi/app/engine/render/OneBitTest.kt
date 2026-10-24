package `in`.printsaathi.app.engine.render

import org.junit.Assert.assertArrayEquals
import org.junit.Test

/** Phase 8 style samples: the engine's 1-bit rows (MSB first, padded, 0 = black) shown as black and white pixels. */
class OneBitTest {
    @Test fun rowsBecomeBlackAndWhitePixelsIgnoringThePadding() {
        val bits = byteArrayOf(0b10100000.toByte(), 0b01011111) // 3 × 2
        val b = 0xFF000000.toInt()
        val w = 0xFFFFFFFF.toInt()
        assertArrayEquals(intArrayOf(w, b, w, b, w, b), OneBit.toArgb(bits, 3, 2))
    }

    /** Gate M2: an OCV example is made at 3 × its size and averaged down, so it looks like the print, not like a tiny page thresholded. */
    @Test fun aBigOneBitImageIsAveragedDownToGrey() {
        // 6 × 3, factor 3 → 2 × 1: the left block all black, the right block 3 of 9 black.
        val rows = byteArrayOf(0b00011100.toByte(), 0b00011100.toByte(), 0b00000011.toByte())
        val grey = OneBit.toGreyScaled(rows, 6, 3, 3)
        assertArrayEquals(intArrayOf(0xFF000000.toInt(), argbGrey(255 * 6 / 9)), grey)
    }

    private fun argbGrey(v: Int) = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
}
