package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.os.ParcelFileDescriptor
import androidx.heifwriter.HeifWriter
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineDiedException
import `in`.printsaathi.app.engine.isolated.EngineFileException
import `in`.printsaathi.app.engine.isolated.HeifEngineService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Gate 2 #4: iPhone photos "sent as document" are HEIC. The platform HEIF decoder (and HEIF EXIF/rotation)
 * may need system services an isolatedProcess cannot reach. Proves on each API level whether the engine can
 * open a rotated HEIC upright, on both decode paths.
 */
@RunWith(AndroidJUnit4::class)
class EngineHeifTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.filesDir, "heif").apply { mkdirs() }

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("heif", "$key=$value") })
    }

    private val quadrant = intArrayOf(Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW)

    /** 1200x800 quadrants, stored with a 90 degree clockwise rotation (HEIF 'irot'), like a portrait phone photo. */
    private fun heic(): File? {
        val f = File(dir, "rot90.heic").apply { delete() }
        val bmp = Bitmap.createBitmap(1200, 800, Bitmap.Config.ARGB_8888)
        Canvas(bmp).apply {
            val p = Paint()
            for (q in 0..3) {
                p.color = quadrant[q]
                drawRect((q % 2) * 600f, (q / 2) * 400f, (q % 2) * 600f + 600f, (q / 2) * 400f + 400f, p)
            }
        }
        return try {
            HeifWriter.Builder(f.absolutePath, 1200, 800, HeifWriter.INPUT_MODE_BITMAP).setRotation(90).setQuality(90).build().use { w ->
                w.start()
                w.addBitmap(bmp)
                w.stop(10_000)
            }
            f
        } catch (e: Exception) {
            report("writer", "unavailable: ${e.javaClass.simpleName}")
            null
        } finally {
            bmp.recycle()
        }
    }

    private fun close(a: Int, b: Int) = listOf(16, 8, 0).all { s -> kotlin.math.abs(((a shr s) and 0xFF) - ((b shr s) and 0xFF)) < 70 }

    private fun assertUpright(label: String, r: IntArray, raw: ByteArray) {
        // Rotated 90 clockwise: upright is 800x1200, scaled to 400x600. Upright (u, v) comes from stored (v, 1 - u).
        assertEquals("$label width", 400, r[0])
        assertEquals("$label height", 600, r[1])
        for ((u, v) in listOf(0.25 to 0.25, 0.75 to 0.25, 0.25 to 0.75, 0.75 to 0.75)) {
            val i = (((v * r[1]).toInt()) * r[0] + (u * r[0]).toInt()) * 4
            val got = Color.rgb(raw[i].toInt() and 0xFF, raw[i + 1].toInt() and 0xFF, raw[i + 2].toInt() and 0xFF)
            val sx = v
            val sy = 1 - u
            val want = quadrant[(if (sy < 0.5) 0 else 2) + (if (sx < 0.5) 0 else 1)]
            assertTrue("$label at ($u,$v): got ${Integer.toHexString(got)} want ${Integer.toHexString(want)}", close(got, want))
        }
    }

    @Test fun rotatedHeicInTheIsolatedEngineIsUprightOrAContainedFailure() {
        assumeTrue("platform HEIF decoding starts at API 28", Build.VERSION.SDK_INT >= 28)
        val src = heic()
        assumeTrue("this device has no HEVC encoder to make a HEIC fixture", src != null && src.length() > 0)
        report("fixtureBytes", src!!.length())
        val client = EngineClient(ctx)

        val a = File(dir, "strips.rgba")
        val strips = client.decodeToJpeg(src, a, 600, -1)
        report("defaultPath", strips.exceptionOrNull()?.javaClass?.simpleName ?: "ok path=${strips.getOrThrow()[2]} size=${strips.getOrThrow()[0]}x${strips.getOrThrow()[1]}")

        val b = File(dir, "whole.rgba")
        val whole = client.decodeWholeImage(src, b, 600, -1)
        report("wholeImagePath", whole.exceptionOrNull()?.javaClass?.simpleName ?: "ok path=${whole.getOrThrow()[2]} size=${whole.getOrThrow()[0]}x${whole.getOrThrow()[1]}")
        client.reset()

        // Characterisation (ADR-003): API 35 fails cleanly (SELinux denies media.player); API 36 aborts the engine
        // ("Hardware service manager is not running"). Acceptable here: an upright image, a file error, or a
        // CONTAINED engine death — never an app crash and never a wrong image. The engine must work afterwards.
        for ((label, r, f) in listOf(Triple("default path", strips, a), Triple("whole-image path", whole, b))) {
            if (r.isSuccess) assertUpright(label, r.getOrThrow(), f.readBytes())
            else assertTrue("$label: ${r.exceptionOrNull()}", r.exceptionOrNull() is EngineFileException || r.exceptionOrNull() is EngineDiedException)
        }
        val good = File(dir, "good.jpg")
        Bitmap.createBitmap(400, 300, Bitmap.Config.ARGB_8888).apply {
            eraseColor(Color.GRAY)
            good.outputStream().use { compress(Bitmap.CompressFormat.JPEG, 90, it) }
            recycle()
        }
        val after = EngineClient(ctx)
        assertEquals(200, after.decodeToJpeg(good, File(dir, "good-out.jpg"), 200).getOrThrow()[0])
        after.reset()
    }

    /** ADR-003 spike: the same decode in the non-isolated ":heif" process (debug manifest only). */
    @Test fun rotatedHeicDecodesUprightInTheNonIsolatedHeifProcess() {
        assumeTrue("platform HEIF decoding starts at API 28", Build.VERSION.SDK_INT >= 28)
        val src = heic()
        assumeTrue("this device has no HEVC encoder to make a HEIC fixture", src != null && src.length() > 0)
        val client = EngineClient(ctx, HeifEngineService::class.java)
        val a = File(dir, "heif-strips.rgba")
        val r = client.decodeToJpeg(src!!, a, 600, -1)
        report("heifProcess.defaultPath", r.exceptionOrNull()?.javaClass?.simpleName ?: "ok path=${r.getOrThrow()[2]} bindMs=${client.lastBindMs}")
        val b = File(dir, "heif-whole.rgba")
        val w = client.decodeWholeImage(src, b, 600, -1)
        report("heifProcess.wholeImagePath", w.exceptionOrNull()?.javaClass?.simpleName ?: "ok path=${w.getOrThrow()[2]}")
        // The security cost of this fallback, measured: can that process read the app's private files?
        val secret = File(ctx.filesDir, "heif/secret.txt").apply { writeText("customer data") }
        val canRead = client.call { it.canReadPath(secret.absolutePath) }.getOrThrow()
        report("heifProcess.canReadAppFiles", canRead)
        client.reset()
        assertUpright("heif process, default path", r.getOrThrow(), a.readBytes())
        assertUpright("heif process, whole-image path", w.getOrThrow(), b.readBytes())
    }
}
