package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/**
 * Phase 0 carry-over (spikes.md (e)): a truncated photo must be reported as damaged instead of printing half grey,
 * and a progressive JPEG too large for this phone's memory must be refused before decoding (PLAN §F2).
 */
class JpegScanTest {
    private val real = javaClass.getResource("/2x2.jpg")!!.readBytes()

    private fun seg(marker: Int, payload: ByteArray) = ByteArrayOutputStream().apply {
        write(0xFF); write(marker)
        val len = payload.size + 2
        write(len shr 8); write(len and 0xFF)
        write(payload)
    }.toByteArray()

    /** A synthetic JPEG: SOI, [pre] segments, SOFn (w x h), SOS, entropy bytes, EOI (if [complete]). */
    private fun jpeg(sof: Int, w: Int, h: Int, complete: Boolean = true, pre: ByteArray = ByteArray(0), entropy: ByteArray = byteArrayOf(1, 2, 0xFF.toByte(), 0, 3)): ByteArray =
        ByteArrayOutputStream().apply {
            write(0xFF); write(0xD8)
            write(pre)
            write(seg(sof, byteArrayOf(8, (h shr 8).toByte(), h.toByte(), (w shr 8).toByte(), w.toByte(), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1)))
            write(seg(0xDA, byteArrayOf(3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0)))
            write(entropy)
            if (complete) { write(0xFF); write(0xD9) }
        }.toByteArray()

    private fun scan(b: ByteArray) = JpegScan.scan(ByteArrayInputStream(b))

    @Test fun aRealJpegIsCompleteBaselineWithItsSize() {
        val f = scan(real)!!
        assertTrue(f.complete)
        assertFalse(f.progressive)
        assertEquals(2, f.width)
        assertEquals(2, f.height)
    }

    @Test fun aCutOffJpegIsNotComplete() {
        assertFalse(scan(real.copyOf(real.size - 2))!!.complete)
        assertFalse(scan(jpeg(0xC0, 4000, 3000, complete = false))!!.complete)
    }

    @Test fun progressiveIsRecognisedWithItsSize() {
        val f = scan(jpeg(0xC2, 12000, 9000))!!
        assertTrue(f.progressive)
        assertTrue(f.complete)
        assertEquals(12000, f.width)
        assertEquals(9000, f.height)
    }

    /** The EXIF thumbnail (its own SOF and EOI inside APP1) must not be mistaken for the photo. */
    @Test fun anExifThumbnailDoesNotCountAsThePhoto() {
        val thumb = jpeg(0xC0, 160, 120)
        val app1 = seg(0xE1, "Exif\u0000\u0000".toByteArray() + thumb)
        val f = scan(jpeg(0xC2, 8000, 6000, complete = false, pre = app1))!!
        assertTrue(f.progressive)
        assertEquals(8000, f.width)
        assertFalse("the thumbnail's end marker is not the photo's", f.complete)
    }

    /** Restart markers and stuffed bytes inside the image data are not the end. */
    @Test fun markersInsideTheImageDataAreSkipped() {
        val entropy = byteArrayOf(1, 0xFF.toByte(), 0, 0xFF.toByte(), 0xD0.toByte(), 2, 0xFF.toByte(), 0xFF.toByte(), 0xD7.toByte(), 3)
        assertFalse(scan(jpeg(0xC0, 10, 10, complete = false, entropy = entropy))!!.complete)
        assertTrue(scan(jpeg(0xC0, 10, 10, complete = true, entropy = entropy))!!.complete)
    }

    @Test fun notAJpegGivesNothing() {
        assertNull(scan(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte())))
        assertNull(scan(ByteArray(0)))
    }

    /** PLAN §F2 budgets by RAM: 2 GB -> 16 MP, 3 GB -> 24 MP, 4 GB or more -> 40 MP. */
    @Test fun theProgressiveBudgetFollowsThePhonesMemory() {
        val gb = 1024L * 1024 * 1024
        assertEquals(16_000_000L, JpegScan.progressiveBudgetPixels(2 * gb - 200L * 1024 * 1024))
        assertEquals(24_000_000L, JpegScan.progressiveBudgetPixels(3 * gb - 100L * 1024 * 1024))
        assertEquals(40_000_000L, JpegScan.progressiveBudgetPixels(6 * gb))
        assertEquals("unknown memory: the smallest budget", 16_000_000L, JpegScan.progressiveBudgetPixels(-1))
    }
}
