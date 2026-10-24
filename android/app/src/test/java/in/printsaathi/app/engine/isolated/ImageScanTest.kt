package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayOutputStream

/**
 * Phase 10 finding (EngineFuzzDeviceTest): a cut-off PNG or WebP decoded "successfully" with its missing rows blank;
 * only JPEGs were checked. PLAN §F2: truncated files are damaged, never printed half.
 */
class ImageScanTest {
    private fun chunk(type: String, data: ByteArray) = ByteArrayOutputStream().apply {
        val n = data.size
        write(byteArrayOf((n ushr 24).toByte(), (n ushr 16).toByte(), (n ushr 8).toByte(), n.toByte()))
        write(type.toByteArray())
        write(data)
        val crc = java.util.zip.CRC32().apply { update(type.toByteArray()); update(data) }.value
        write(byteArrayOf((crc ushr 24).toByte(), (crc ushr 16).toByte(), (crc ushr 8).toByte(), crc.toByte()))
    }.toByteArray()

    private val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) +
        chunk("IHDR", ByteArray(13)) + chunk("IDAT", ByteArray(500) { it.toByte() }) + chunk("IEND", ByteArray(0))

    private fun webp(declared: Int, actual: Int) = "RIFF".toByteArray() +
        byteArrayOf(declared.toByte(), (declared ushr 8).toByte(), (declared ushr 16).toByte(), (declared ushr 24).toByte()) +
        "WEBP".toByteArray() + ByteArray(actual - 4)

    @Test fun aWholePngIsWhole() {
        assertEquals(true, ImageScan.complete(png.inputStream()))
        assertEquals(true, ImageScan.complete((png + ByteArray(10)).inputStream())) // junk after the end is harmless
    }

    @Test fun aPngCutAnywhereBeforeItsEndIsNotWhole() {
        for (cut in listOf(9, 20, 40, 100, png.size - 12, png.size - 1)) {
            assertEquals("cut at $cut", false, ImageScan.complete(png.copyOf(cut).inputStream()))
        }
    }

    @Test fun aPngClaimingAHugeChunkIsNotWhole() {
        val bad = png.copyOf()
        bad[8] = 0x7F // IHDR length now about 2 GB
        assertEquals(false, ImageScan.complete(bad.inputStream()))
    }

    /** Android's PNG decoder stops at damaged image data and returns the rest blank; libpng refuses the CRC. */
    @Test fun aPngWithDamagedImageDataIsNotWhole() {
        val bad = png.copyOf()
        bad[8 + 25 + 8 + 100] = (bad[8 + 25 + 8 + 100] + 1).toByte() // a byte inside IDAT
        assertEquals(false, ImageScan.complete(bad.inputStream()))
    }

    @Test fun aDamagedOptionalChunkIsHarmless() {
        val withText = png.copyOfRange(0, 8 + 25) + chunk("tEXt", "a=b".toByteArray()).also { it[it.size - 1] = 1 } +
            png.copyOfRange(8 + 25, png.size)
        assertEquals(true, ImageScan.complete(withText.inputStream()))
    }

    @Test fun aWebpShorterThanItsHeaderSaysIsNotWhole() {
        assertEquals(true, ImageScan.complete(webp(declared = 400, actual = 400).inputStream()))
        assertEquals(false, ImageScan.complete(webp(declared = 400, actual = 250).inputStream()))
    }

    @Test fun otherKindsAreNotJudgedHere() {
        assertNull(ImageScan.complete(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0, 0).inputStream()))
        assertNull(ImageScan.complete(ByteArray(0).inputStream()))
    }
}
