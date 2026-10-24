package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 6 Task 1: a crop of the upright photo is read from the stored pixels, before the EXIF orientation is applied
 * (mirror first, then a clockwise rotation), so only that region is decoded (memory, PLAN §F2).
 */
class CropRegionTest {
    private val c = doubleArrayOf(0.1, 0.2, 0.3, 0.4)

    private fun near(want: DoubleArray, got: DoubleArray) = assertArrayEquals(want, got, 1e-12)

    @Test fun anUprightStoredPhotoIsReadWhereTheCropIs() = near(c, storedCrop(c, 0, false))

    @Test fun aPhotoStoredSidewaysIsReadFromTheMatchingStoredArea() {
        // Stored pixels turned 90° clockwise make the upright photo: the upright top-left is the stored bottom-left.
        near(doubleArrayOf(0.2, 0.6, 0.4, 0.3), storedCrop(c, 90, false))
        near(doubleArrayOf(0.6, 0.4, 0.3, 0.4), storedCrop(c, 180, false))
        near(doubleArrayOf(0.4, 0.1, 0.4, 0.3), storedCrop(c, 270, false))
    }

    @Test fun aMirroredPhotoIsReadFromTheMirroredArea() {
        near(doubleArrayOf(0.6, 0.2, 0.3, 0.4), storedCrop(c, 0, true))
        // TRANSVERSE (mirror, then 90°): undo the turn, then the mirror.
        near(doubleArrayOf(0.4, 0.6, 0.4, 0.3), storedCrop(c, 90, true))
    }

    @Test fun pixelRectanglesCoverTheCropAndStayInsideThePhoto() {
        val r = cropPixels(doubleArrayOf(0.1, 0.2, 0.3, 0.4), 1000, 500)
        assertEquals(listOf(100, 100, 400, 300), r.toList())
        val edge = cropPixels(doubleArrayOf(0.999, 0.999, 0.001, 0.001), 1000, 500)
        assertEquals("never empty, never outside", listOf(999, 499, 1000, 500), edge.toList())
    }

    private val mb = 1024L * 1024

    @Test fun aWholeDecodeForAPassportCropOfAWhatsAppPhotoFits() {
        // 1600 x 1200 photo, frame half its width at 531 px: decoded at about 1064 px long.
        assertTrue(wholeDecodeFits(1064, 1600, 1200, 16_000_000, 256 * mb, 24))
    }

    @Test fun aHugeWholeDecodeIsRefusedOnASmallPhoneInsteadOfRunningOutOfMemory() {
        // A 108 MP GIF, 90 % crop at a full A4 page: the sampled decode alone is far over 16 MP.
        assertFalse(wholeDecodeFits(3898, 12000, 9000, 16_000_000, 512 * mb, 30))
    }

    @Test fun beforeAndroid8TheJavaHeapLimitsTheWholeDecode() {
        // 12 MP within a 40 MP phone's budget, but bitmaps live in a 128 MB heap on Android 7.
        assertTrue(wholeDecodeFits(3898, 4000, 3000, 40_000_000, 128 * mb, 26))
        assertFalse(wholeDecodeFits(3898, 4000, 3000, 40_000_000, 128 * mb, 24))
    }
}

