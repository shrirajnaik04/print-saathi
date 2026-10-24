package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.Decode
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.JpegAsIs
import `in`.printsaathi.app.engine.isolated.Styles
import `in`.printsaathi.app.engine.render.Crop
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Phase 19 (owner, 2026-10-23: "print quality must be as is"): in the isolated engine, a plain JPEG that the print does
 * not need smaller goes into the print as its own picture, byte for byte and with its camera turn, but without its notes
 * (EXIF place and time, colour profile; self-audit 2026-10-24); anything else is decoded as before.
 */
@RunWith(AndroidJUnit4::class)
class JpegAsIsDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "asis-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    /** A synthetic 800 × 600 photo as the phone's camera app would save it (JFIF, YCbCr). */
    private fun photo(name: String): File {
        val bmp = Bitmap.createBitmap(800, 600, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(120, 170, 210))
        c.drawCircle(400f, 300f, 200f, Paint().apply { color = Color.rgb(230, 120, 40) })
        return File(dir, name).also { f -> f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) } }
    }

    private fun decode(
        src: File,
        maxLongSide: Int,
        style: Int = Styles.ORIGINAL,
        crop: Crop = Crop.FULL,
        quality: Int = 92,
    ): Pair<IntArray, File> {
        val dst = File(dir, "out-${src.name}-$maxLongSide-$style-$quality.jpg")
        return client.decodeStyled(src, dst, maxLongSide, quality, style, crop).getOrThrow() to dst
    }

    /** The same picture: every pixel of [a] equals [b]'s (the copy is the original, not a re-saved look-alike). */
    private fun assertSamePixels(a: File, b: File) {
        val x = BitmapFactory.decodeFile(a.path)
        val y = BitmapFactory.decodeFile(b.path)
        assertEquals(x.width, y.width)
        assertEquals(x.height, y.height)
        val px = IntArray(x.width * x.height).also { x.getPixels(it, 0, x.width, 0, 0, x.width, x.height) }
        val py = IntArray(y.width * y.height).also { y.getPixels(it, 0, y.width, 0, 0, y.width, y.height) }
        assertArrayEquals(px, py)
    }

    /** The print file's picture carries none of the photo's notes (self-audit 2026-10-24: EXIF place and time). */
    private fun assertNoNotes(dst: File) {
        val text = String(dst.readBytes(), Charsets.ISO_8859_1)
        assertFalse("EXIF", text.contains("Exif\u0000\u0000"))
        assertFalse("colour profile", text.contains("ICC_PROFILE"))
    }

    @Test fun aPlainPhotoGoesInByteForByte() {
        val src = photo("plain.jpg")
        val (r, dst) = decode(src, 1000)
        assertEquals("header: ${JpegAsIs.facts(src.readBytes())}", Decode.PATH_AS_IS, r[2])
        assertEquals(800, r[0])
        assertEquals(600, r[1])
        assertEquals(0, r[6])
        assertArrayEquals(JpegAsIs.pictureOnly(src.readBytes()), dst.readBytes())
        assertSamePixels(src, dst)
        assertNoNotes(dst)
    }

    @Test fun theCamerasTurnComesWithItTheNotesDoNot() {
        val src = photo("turned.jpg")
        ExifInterface(src.path).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
            setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2026:10:24 09:30:00")
            setLatLong(15.49, 73.82)
            saveAttributes()
        }
        val (r, dst) = decode(src, 1000)
        assertEquals(Decode.PATH_AS_IS, r[2])
        assertEquals("one quarter turn clockwise to stand upright", 1, r[6])
        assertArrayEquals(JpegAsIs.pictureOnly(src.readBytes()), dst.readBytes())
        assertNoNotes(dst)
    }

    /** An EXIF segment: Orientation [value] as [type] (3 SHORT, 4 LONG), big- or little-endian. */
    private fun exifSegment(value: Int, type: Int = 3, little: Boolean = false): ByteArray {
        fun two(v: Int) = if (little) byteArrayOf(v.toByte(), (v shr 8).toByte()) else byteArrayOf((v shr 8).toByte(), v.toByte())
        fun four(v: Int) = if (little) two(v) + two(v shr 16) else two(v shr 16) + two(v)
        val valueField = if (type == 3) two(value) + two(0) else four(value)
        val tiff = (if (little) "II" else "MM").toByteArray() + two(42) + four(8) + two(1) + two(0x0112) + two(type) + four(1) +
            valueField + four(0)
        val body = "Exif\u0000\u0000".toByteArray(Charsets.ISO_8859_1) + tiff
        return byteArrayOf(0xFF.toByte(), 0xE1.toByte(), ((body.size + 2) shr 8).toByte(), (body.size + 2).toByte()) + body
    }

    // Review (2026-10-24): the as-is path read the camera turn with its own small parser while every other path uses
    // AndroidX ExifInterface. It now uses ExifInterface too: on every variant the turn put into the print file is the one
    // the rest of the app reads, and a mirrored photo never goes in as it is.
    @Test fun theCameraTurnIsReadAsTheRestOfTheAppReadsIt() {
        val plain = photo("variants.jpg").readBytes()
        val variants = listOf(
            "6" to exifSegment(6), "3" to exifSegment(3), "8" to exifSegment(8), "1" to exifSegment(1),
            "6 little-endian" to exifSegment(6, little = true), "6 as LONG" to exifSegment(6, type = 4),
            "two notes, 6 then 3" to exifSegment(6) + exifSegment(3), "mirrored 2" to exifSegment(2), "mirrored 5" to exifSegment(5),
        )
        for ((name, seg) in variants) {
            val src = File(dir, "v-${name.replace(' ', '-')}.jpg").apply { writeBytes(plain.copyOfRange(0, 2) + seg + plain.copyOfRange(2, plain.size)) }
            val exif = ExifInterface(src.path)
            val (r, _) = decode(src, 1000)
            if (exif.isFlipped) {
                assertNotEquals("$name: a mirror is never put in as it is", Decode.PATH_AS_IS, r[2])
            } else {
                assertEquals("$name: as it is", Decode.PATH_AS_IS, r[2])
                assertEquals("$name: the same turn as the rest of the app", exif.rotationDegrees / 90, r[6])
            }
        }
    }

    // Review (2026-10-24): the Print style examples (JPEG 85) got the original's own picture, which has no turn note
    // any more, so a tiny camera-turned photo's "Original" example showed sideways. Only print files take it as is.
    @Test fun previewsAndExamplesAreAlwaysDrawnNeverTakenAsIs() {
        val src = photo("example.jpg")
        val (r, _) = decode(src, 1000, quality = 85)
        assertNotEquals(Decode.PATH_AS_IS, r[2])
        assertEquals(800, maxOf(r[0], r[1]))
    }

    @Test fun biggerThanThePrintNeedsBlackAndWhiteOrCroppedIsDecodedAsBefore() {
        val src = photo("other.jpg")
        val (small, smallDst) = decode(src, 500)
        assertNotEquals(Decode.PATH_AS_IS, small[2])
        assertEquals(500, maxOf(small[0], small[1]))
        assertFalse(src.readBytes().contentEquals(smallDst.readBytes()))
        val (grey, _) = decode(src, 1000, style = Styles.BW)
        assertNotEquals(Decode.PATH_AS_IS, grey[2])
        val (cropped, _) = decode(src, 1000, crop = Crop(0.1, 0.1, 0.5, 0.5))
        assertNotEquals(Decode.PATH_AS_IS, cropped[2])
    }
}
