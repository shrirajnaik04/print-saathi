package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.os.ParcelFileDescriptor
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * All 8 EXIF orientations, decoded WITH downscaling, on both engine paths: the region-strip path and the
 * whole-image path (ImageDecoder on API 28+, BitmapFactory below). Each path must show the photo upright,
 * applied exactly once, including the four mirrored orientations (Gate 2 findings 5 and 9).
 */
@RunWith(AndroidJUnit4::class)
class EngineOrientationTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.filesDir, "orientation").apply { mkdirs() }

    // Stored image: 2000x1000, quadrants red (top-left), green (top-right), blue (bottom-left), yellow (bottom-right).
    private val quadrant = intArrayOf(Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW)
    private fun stored(x: Double, y: Double) = quadrant[(if (y < 0.5) 0 else 2) + (if (x < 0.5) 0 else 1)]

    /** Where upright point (u, v) comes from in the stored image, per EXIF orientation (normalised 0..1). */
    private fun source(orientation: Int, u: Double, v: Double): Pair<Double, Double> = when (orientation) {
        1 -> u to v
        2 -> 1 - u to v
        3 -> 1 - u to 1 - v
        4 -> u to 1 - v
        5 -> v to u
        6 -> v to 1 - u
        7 -> 1 - v to 1 - u
        8 -> 1 - v to u
        else -> error("bad orientation")
    }

    private fun fixture(orientation: Int): File {
        val f = File(dir, "o$orientation.jpg")
        val bmp = Bitmap.createBitmap(2000, 1000, Bitmap.Config.ARGB_8888)
        Canvas(bmp).apply {
            val p = Paint()
            for (q in 0..3) {
                p.color = quadrant[q]
                drawRect((q % 2) * 1000f, (q / 2) * 500f, (q % 2) * 1000f + 1000f, (q / 2) * 500f + 500f, p)
            }
        }
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        bmp.recycle()
        ExifInterface(f.absolutePath).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
            saveAttributes()
        }
        return f
    }

    private fun close(a: Int, b: Int) =
        listOf(16, 8, 0).all { s -> kotlin.math.abs(((a shr s) and 0xFF) - ((b shr s) and 0xFF)) < 60 }

    private fun check(orientation: Int, pathName: String, r: IntArray, raw: ByteArray) {
        val swap = orientation >= 5
        assertEquals("$pathName o$orientation width", if (swap) 250 else 500, r[0])
        assertEquals("$pathName o$orientation height", if (swap) 500 else 250, r[1])
        for ((u, v) in listOf(0.25 to 0.25, 0.75 to 0.25, 0.25 to 0.75, 0.75 to 0.75)) {
            val x = (u * r[0]).toInt()
            val y = (v * r[1]).toInt()
            val i = (y * r[0] + x) * 4
            val got = Color.rgb(raw[i].toInt() and 0xFF, raw[i + 1].toInt() and 0xFF, raw[i + 2].toInt() and 0xFF)
            val (sx, sy) = source(orientation, u, v)
            val want = stored(sx, sy)
            assertTrue("$pathName o$orientation at ($u,$v): got ${Integer.toHexString(got)} want ${Integer.toHexString(want)}", close(got, want))
        }
    }

    @Test fun allEightOrientationsAreUprightOnBothPaths() {
        val client = EngineClient(ctx)
        for (o in 1..8) {
            val src = fixture(o)
            val stripsOut = File(dir, "o$o-strips.rgba")
            val strips = client.decodeToJpeg(src, stripsOut, 500, -1).getOrThrow()
            InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("orientation", "o$o strips path=${strips[2]}") })
            check(o, "strips", strips, stripsOut.readBytes())

            val wholeOut = File(dir, "o$o-whole.rgba")
            val whole = client.decodeWholeImage(src, wholeOut, 500, -1).getOrThrow()
            InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("orientation", "o$o whole path=${whole[2]}") })
            check(o, "whole", whole, wholeOut.readBytes())
        }
        client.reset()
    }

    private fun decodeBoth(client: EngineClient, src: File, maxLongSide: Int): List<Pair<IntArray, ByteArray>> {
        val a = File(dir, "${src.name}-strips.rgba")
        val ra = client.decodeToJpeg(src, a, maxLongSide, -1).getOrThrow()
        val b = File(dir, "${src.name}-whole.rgba")
        val rb = client.decodeWholeImage(src, b, maxLongSide, -1).getOrThrow()
        return listOf(ra to a.readBytes(), rb to b.readBytes())
    }

    /** Gate 2 minor 10: PNG region decoding rounds odd widths down; that must not force the low-quality fallback. */
    @Test fun oddSizedPngStaysOnTheStripPath() {
        val f = File(dir, "odd.png")
        val bmp = Bitmap.createBitmap(1001, 777, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(10, 120, 200)) }
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bmp.recycle()
        val client = EngineClient(ctx)
        // 200 px target with 2x oversampling needs sample size 2, so the odd width 1001 must be rounded.
        val r = client.decodeToJpeg(f, File(dir, "odd-out.rgba"), 200, -1).getOrThrow()
        client.reset()
        assertEquals("decode path (2 = region strips)", 2, r[2])
        assertEquals(200, r[0])
        assertEquals(155, r[1])
    }

    /** PLAN §F2: transparent areas print white on every path, including when no resize is needed. */
    @Test fun transparentPngPrintsWhiteWithoutResizeOnBothPaths() {
        val f = File(dir, "clear.png")
        val bmp = Bitmap.createBitmap(300, 200, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.TRANSPARENT) }
        Canvas(bmp).drawRect(100f, 50f, 200f, 150f, Paint().apply { color = Color.BLACK })
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bmp.recycle()
        val client = EngineClient(ctx)
        for ((r, raw) in decodeBoth(client, f, 300)) {
            assertEquals(300, r[0])
            val corner = Color.rgb(raw[0].toInt() and 0xFF, raw[1].toInt() and 0xFF, raw[2].toInt() and 0xFF)
            val centre = ((100 * 300) + 150) * 4
            assertTrue("path ${r[2]}: transparent corner must be white, was ${Integer.toHexString(corner)}", close(corner, Color.WHITE))
            assertTrue("path ${r[2]}: black square must stay black", (raw[centre].toInt() and 0xFF) < 40)
        }
        client.reset()
    }
}
