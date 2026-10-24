package `in`.printsaathi.app.engine.pdf

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.zip.Inflater

/** PLAN §G2: grey text-like pages as 8-bit DeviceGray Flate with PNG predictors (lossless, small). */
class GreyFlateTest {
    private fun inflate(b: ByteArray, size: Int): ByteArray {
        val inf = Inflater()
        inf.setInput(b)
        val out = ByteArray(size)
        var n = 0
        while (n < size && !inf.finished()) n += inf.inflate(out, n, size - n)
        return out
    }

    @Test fun pngUpRowsDecodeBackToTheSamePixels() {
        val w = 7
        val h = 5
        val raw = ByteArray(w * h) { ((it * 37) % 256).toByte() }
        val enc = GreyFlate.encode(raw, w, h)
        val rows = inflate(enc, (w + 1) * h)
        val back = ByteArray(w * h)
        for (y in 0 until h) {
            assertTrue("filter type Up", rows[y * (w + 1)] == 2.toByte())
            for (x in 0 until w) {
                val above = if (y == 0) 0 else back[(y - 1) * w + x].toInt() and 0xFF
                back[y * w + x] = ((rows[y * (w + 1) + 1 + x].toInt() + above) and 0xFF).toByte()
            }
        }
        assertArrayEquals(raw, back)
    }

    @Test fun aWhitePageWithTextIsSmall() {
        val w = 2480
        val h = 3508
        val raw = ByteArray(w * h) { 0xFF.toByte() }
        for (y in 300 until 3200 step 60) for (x in 200 until 2200) raw[y * w + x] = 0 // lines of "text"
        assertTrue(GreyFlate.encode(raw, w, h).size < 200_000)
    }
}
