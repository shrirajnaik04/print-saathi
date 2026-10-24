package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Test

/** PLAN §F4 (Black & White = Rec.601) + §G2 (B&W pages carry grey data only: R = G = B). */
class GreyTest {
    private fun argb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b

    @Test fun lumaIsRec601Rounded() {
        assertEquals(255, Grey.luma(argb(255, 255, 255)))
        assertEquals(0, Grey.luma(argb(0, 0, 0)))
        assertEquals(76, Grey.luma(argb(255, 0, 0))) // 0.299 * 255 = 76.2
        assertEquals(150, Grey.luma(argb(0, 255, 0))) // 0.587 * 255 = 149.7
        assertEquals(29, Grey.luma(argb(0, 0, 255))) // 0.114 * 255 = 29.1
        assertEquals(128, Grey.luma(argb(128, 128, 128)))
    }

    @Test fun aRowBecomesOpaqueGreyOfItsLuma() {
        val row = intArrayOf(argb(255, 0, 0), argb(0, 255, 0), argb(10, 20, 30), 0x00FFFFFF)
        Grey.toGrey(row, 3)
        assertEquals(listOf(argb(76, 76, 76), argb(150, 150, 150), argb(18, 18, 18)), row.take(3))
        assertEquals("only the given length is changed", 0x00FFFFFF, row[3])
    }

    /**
     * Why grey RGB is enough: libjpeg's fixed-point RGB -> YCbCr chroma weights sum to exactly 0, so R = G = B gives
     * chroma 128 and every decoded pixel is R = G = B again (device test EngineGreyTest checks the real encoder).
     */
    @Test fun libjpegChromaWeightsCancelForGrey() {
        fun fix(x: Double) = (x * 65536 + 0.5).toInt()
        assertEquals(0, -fix(0.16874) - fix(0.33126) + fix(0.5))
        assertEquals(0, fix(0.5) - fix(0.41869) - fix(0.08131))
    }
}
