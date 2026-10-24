package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Original photos untouched (owner, 2026-10-23: "print quality must be as is"): only a plain colour JPEG that the
 * print does not need smaller goes into the print file as its own bytes; anything else is drawn as before.
 */
class JpegAsIsTest {
    /** Synthetic 400 × 300 gradient photos (test resources): plain JFIF, no camera turn, no colour profile. */
    private fun jpeg(progressive: Boolean = false): ByteArray =
        javaClass.getResource(if (progressive) "/asis-progressive.jpg" else "/asis-baseline.jpg")!!.readBytes()

    /** [jpeg] with one more segment right after the start mark (EXIF, colour profile, Adobe). */
    private fun withSegment(j: ByteArray, marker: Int, body: ByteArray): ByteArray {
        val len = body.size + 2
        return byteArrayOf(j[0], j[1], 0xFF.toByte(), marker.toByte(), (len shr 8).toByte(), len.toByte()) + body + j.copyOfRange(2, j.size)
    }

    /** An EXIF segment saying which way up (big-endian TIFF, one entry: Orientation). */
    private fun exif(orientation: Int): ByteArray {
        val tiff = byteArrayOf(
            'M'.code.toByte(), 'M'.code.toByte(), 0, 42, 0, 0, 0, 8, // header, IFD0 at 8
            0, 1, // one entry
            0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation.toByte(), 0, 0, // Orientation, SHORT, 1, value
            0, 0, 0, 0, // no next IFD
        )
        return "Exif".toByteArray() + byteArrayOf(0, 0) + tiff
    }

    @Test fun aPlainColourPhotoQualifiesAndKeepsItsOwnSize() {
        val f = JpegAsIs.facts(jpeg())!!
        assertEquals(400, f.width)
        assertEquals(300, f.height)
        assertEquals(3, f.components)
        assertEquals(8, f.bits)
        assertEquals(1, f.orientation)
        assertTrue(JpegAsIs.qualifies(f, maxLongSide = 400))
        assertEquals(0, JpegAsIs.turnsCw(f))
    }

    @Test fun progressivePhotosQualifyToo() {
        val f = JpegAsIs.facts(jpeg(progressive = true))!!
        assertTrue(f.progressive)
        assertTrue(JpegAsIs.qualifies(f, maxLongSide = 1000))
    }

    @Test fun aPhotoWithMorePixelsThanThePrintNeedsIsMadeSmallerAsBefore() {
        assertFalse(JpegAsIs.qualifies(JpegAsIs.facts(jpeg())!!, maxLongSide = 399))
    }

    @Test fun theCamerasTurnIsReadAndAMirroredOneIsDrawnAsBefore() {
        val base = jpeg()
        for ((o, turns) in listOf(1 to 0, 6 to 1, 3 to 2, 8 to 3)) {
            val f = JpegAsIs.facts(withSegment(base, 0xE1, exif(o)))!!
            assertEquals(o, f.orientation)
            assertTrue("orientation $o", JpegAsIs.qualifies(f, 1000))
            assertEquals(turns, JpegAsIs.turnsCw(f))
        }
        for (mirrored in listOf(2, 4, 5, 7)) assertFalse(JpegAsIs.qualifies(JpegAsIs.facts(withSegment(base, 0xE1, exif(mirrored)))!!, 1000))
    }

    /** An APP2 colour profile whose description is [name] (ICC v2 'desc' tag), in one piece. */
    private fun icc(name: String): ByteArray {
        val desc = "desc".toByteArray() + ByteArray(4) + int(name.length + 1) + name.toByteArray() + byteArrayOf(0)
        val header = ByteArray(128)
        val table = int(1) + "desc".toByteArray() + int(128 + 4 + 12) + int(desc.size)
        return "ICC_PROFILE".toByteArray() + byteArrayOf(0, 1, 1) + header + table + desc
    }
    private fun int(v: Int) = byteArrayOf((v shr 24).toByte(), (v shr 16).toByte(), (v shr 8).toByte(), v.toByte())

    @Test fun anSrgbColourProfileQualifiesAnotherOneDoesNot() {
        // Android's own camera and encoder save an sRGB profile: the colours print the same as the PDF's.
        val srgb = JpegAsIs.facts(withSegment(jpeg(), 0xE2, icc("sRGB IEC61966-2.1")))!!
        assertTrue(srgb.icc)
        assertTrue(JpegAsIs.qualifies(srgb, 1000))
        // An iPhone's wider colours would print duller as they are: drawn as before (converted to sRGB).
        val p3 = JpegAsIs.facts(withSegment(jpeg(), 0xE2, icc("Display P3")))!!
        assertFalse(JpegAsIs.qualifies(p3, 1000))
    }

    @Test fun aColourProfileCmykOrOddJpegIsDrawnAsBefore() {
        val base = jpeg()
        val icc = JpegAsIs.facts(withSegment(base, 0xE2, "ICC_PROFILE".toByteArray() + ByteArray(20)))!!
        assertTrue(icc.icc)
        assertFalse("a colour profile that cannot be read as sRGB", JpegAsIs.qualifies(icc, 1000))
        val adobe = "Adobe".toByteArray() + byteArrayOf(0, 100, 0, 0, 0, 0, 2) // transform 2 = YCCK (CMYK)
        assertFalse("CMYK", JpegAsIs.qualifies(JpegAsIs.facts(withSegment(base, 0xEE, adobe))!!, 1000))
        // A frame header claiming 4 components, or 12 bits: never put in as it is.
        val sof = base.indices.first { base[it] == 0xFF.toByte() && base[it + 1] == 0xC0.toByte() }
        val four = base.copyOf().also { it[sof + 9] = 4 }
        assertFalse(JpegAsIs.qualifies(JpegAsIs.facts(four)!!, 1000))
        val twelve = base.copyOf().also { it[sof + 4] = 12 }
        assertFalse(JpegAsIs.qualifies(JpegAsIs.facts(twelve)!!, 1000))
    }

    /**
     * The notes a phone or an editor adds around the picture: place and time (EXIF), XMP, IPTC, a comment, a colour
     * profile, and a second picture after the end (phones keep a depth map or an HDR layer there).
     */
    private fun withNotes(j: ByteArray): ByteArray {
        var b = withSegment(j, 0xE1, exif(6))
        b = withSegment(b, 0xE1, "http://ns.adobe.com/xap/1.0/\u0000<x:xmpmeta/>".toByteArray())
        b = withSegment(b, 0xED, "Photoshop 3.0\u0000".toByteArray() + ByteArray(8))
        b = withSegment(b, 0xFE, "taken at 15.49 N 73.82 E".toByteArray())
        b = withSegment(b, 0xE2, "ICC_PROFILE".toByteArray() + ByteArray(20))
        return b + byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 1, 2, 3, 0xFF.toByte(), 0xD9.toByte())
    }

    // Self-audit 2026-10-24: the photo went into the print file with its EXIF (the place it was taken, the time, the
    // phone), which the print service and printer then received. Only the picture goes in now, still byte for byte.
    @Test fun thePictureGoesInByteForByteWithoutItsNotes() {
        for (progressive in listOf(false, true)) {
            val base = jpeg(progressive)
            assertArrayEquals("progressive=$progressive", base, JpegAsIs.pictureOnly(withNotes(base)))
        }
    }

    @Test fun theAdobeColourNoteStaysItSaysHowTheColoursAreStored() {
        val adobe = withSegment(jpeg(), 0xEE, "Adobe".toByteArray() + byteArrayOf(0, 100, 0, 0, 0, 0, 1))
        assertArrayEquals(adobe, JpegAsIs.pictureOnly(adobe))
    }

    @Test fun aCutOrBrokenPictureIsNeverCopied() {
        val base = jpeg()
        assertNull("cut inside the picture", JpegAsIs.pictureOnly(base.copyOf(base.size - 40)))
        assertNull("cut in the header", JpegAsIs.pictureOnly(base.copyOf(10)))
        assertNull(JpegAsIs.pictureOnly(ByteArray(0)))
        val rnd = java.util.Random(11)
        repeat(300) {
            val b = base.copyOf()
            repeat(1 + rnd.nextInt(6)) { b[rnd.nextInt(b.size)] = rnd.nextInt(256).toByte() }
            JpegAsIs.pictureOnly(b) // never throws
        }
    }

    // Review (2026-10-24): a JPEG stored as RGB (no JFIF or Adobe note, components named R, G, B) would be read as YCbCr
    // by a PDF reader: wrong colours. Such a file is drawn as before.
    @Test fun aJpegStoredAsRgbIsDrawnAsBefore() {
        val base = jpeg()
        val sof = base.indices.first { base[it] == 0xFF.toByte() && base[it + 1] == 0xC0.toByte() }
        val rgb = base.copyOf().also {
            it[sof + 10] = 'R'.code.toByte()
            it[sof + 13] = 'G'.code.toByte()
            it[sof + 16] = 'B'.code.toByte()
        }
        assertTrue("the usual 1, 2, 3 names qualify", JpegAsIs.qualifies(JpegAsIs.facts(base)!!, 1000))
        assertFalse(JpegAsIs.qualifies(JpegAsIs.facts(rgb)!!, 1000))
    }

    @Test fun junkAndCutFilesAreNeverJpegs() {
        assertNull(JpegAsIs.facts(ByteArray(0)))
        assertNull(JpegAsIs.facts(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte())))
        assertNull(JpegAsIs.facts(jpeg().copyOf(10)))
        val rnd = java.util.Random(7)
        repeat(200) {
            val b = ByteArray(rnd.nextInt(300)).also(rnd::nextBytes)
            if (b.size > 2) { b[0] = 0xFF.toByte(); b[1] = 0xD8.toByte() }
            JpegAsIs.facts(b) // never throws
        }
    }
}
