package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Test

class DecodeMathTest {
    @Test fun scalesTheLongSideDownKeepingAspect() {
        assertEquals(Size(2048, 1536), targetSize(12000, 9000, 2048))
        assertEquals(Size(1536, 2048), targetSize(9000, 12000, 2048))
    }

    @Test fun neverUpscalesSmallImages() {
        assertEquals(Size(1000, 800), targetSize(1000, 800, 2048))
    }

    @Test fun sampleSizeIsTheLargestPowerOfTwoThatStillCoversTheTarget() {
        assertEquals(4, sampleSizeFor(12000, 9000, Size(2048, 1536)))
        assertEquals(1, sampleSizeFor(2048, 1536, Size(2048, 1536)))
        assertEquals(2, sampleSizeFor(4096, 3072, Size(2000, 1500)))
    }

    @Test fun stripHeightIsCappedByMemoryForWidePhotos() {
        assertEquals(512, stripRowsFor(6000)) // 6000 x 512 x 4 B = 12 MB, under the 16 MB cap
        assertEquals(279, stripRowsFor(15000)) // capped so a strip stays <= 16 MB
        assertEquals(64, stripRowsFor(200_000)) // never fewer than 64 rows
    }
}
