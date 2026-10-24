package `in`.printsaathi.app.engine

import android.os.Bundle
import android.os.Debug
import android.os.Process
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineDiedException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Spikes (e) + (f). Fixture pushed by scripts/device/push-fixtures.mjs into files/test-fixtures/. */
@RunWith(AndroidJUnit4::class)
class EngineSpikeTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val fixture = File(ctx.filesDir, "test-fixtures/108mp.jpg")
    private val outDir = File(ctx.filesDir, "test-out").apply { mkdirs() }

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("spike", "$key=$value") })
        android.util.Log.i("PrintSaathiSpike", "$key=$value")
    }

    @Test
    fun decodesLargeJpegWithinBudget() {
        assumeTrue("108 MP fixture not pushed", fixture.exists())
        val client = EngineClient(ctx)
        Runtime.getRuntime().gc()
        val appPssBefore = Debug.getPss()
        val out = File(outDir, "108mp-2048.jpg")
        val r = client.decodeToJpeg(fixture, out, 2048).getOrThrow()
        val appPssAfter = Debug.getPss()
        val enginePss = client.call { it.pssKb() }.getOrThrow()
        report("fixtureBytes", fixture.length())
        report("bindMs", client.lastBindMs)
        report("outSize", "${r[0]}x${r[1]}")
        report("decodePath", listOf("ImageDecoder", "BitmapFactory", "RegionStrips")[r[2]])
        report("decodeMs", r[3])
        report("enginePssKbAfterDecode", r[4])
        report("enginePeakRssKb", r[5])
        report("enginePssKbIdle", enginePss)
        report("appPssDeltaKb", appPssAfter - appPssBefore)
        report("outBytes", out.length())
        assertEquals(2048, r[0])
        assertEquals(1536, r[1])
        // Same decode, lossless raw output: isolates decode quality from JPEG encoding loss.
        val raw = client.decodeToJpeg(fixture, File(outDir, "108mp-2048.rgba"), 2048, -1).getOrThrow()
        report("rawDecodeMs", raw[3])
        assertEquals(2048 * 1536 * 4L, File(outDir, "108mp-2048.rgba").length())
        assertTrue("app PSS grew ${appPssAfter - appPssBefore} KB", appPssAfter - appPssBefore < 60 * 1024)
        // A full-resolution decode would need ~432 MB (12000x9000x4); the peak must prove it never happened.
        assertTrue("engine peak RSS ${r[5]} KB", r[5] in 1 until 200 * 1024)
        client.reset()
    }

    /** Quality/memory experiment: does a 2x intermediate (sample size 2) buy measurable quality? */
    @Test
    fun oversampledDecodeExperiment() {
        assumeTrue("108 MP fixture not pushed", fixture.exists())
        val client = EngineClient(ctx)
        val out = File(outDir, "108mp-2048-os2.rgba")
        val r = client.call { e ->
            android.os.ParcelFileDescriptor.open(fixture, android.os.ParcelFileDescriptor.MODE_READ_ONLY).use { s ->
                android.os.ParcelFileDescriptor.open(out, android.os.ParcelFileDescriptor.MODE_WRITE_ONLY or android.os.ParcelFileDescriptor.MODE_CREATE or android.os.ParcelFileDescriptor.MODE_TRUNCATE).use { d ->
                    e.decodeOversampled(s, d, 2048, -1, 2)
                }
            }
        }.getOrThrow()
        report("os2DecodeMs", r[3])
        report("os2EnginePeakRssKb", r[5])
        client.reset()
    }

    @Test
    fun engineCrashDoesNotKillApp() {
        val client = EngineClient(ctx)
        val small = File(outDir, "small.jpg")
        android.graphics.Bitmap.createBitmap(800, 600, android.graphics.Bitmap.Config.ARGB_8888).apply {
            eraseColor(0xFF3366CC.toInt())
            small.outputStream().use { compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, it) }
        }
        val myPid = Process.myPid()
        val crashed = client.call { it.crashForTest() }
        assertTrue("expected engine death, got $crashed", crashed.exceptionOrNull() is EngineDiedException)
        assertEquals(myPid, Process.myPid())
        val again = client.decodeToJpeg(small, File(outDir, "small-out.jpg"), 400).getOrThrow()
        assertEquals(400, again[0])
        report("rebindAfterCrashMs", client.lastBindMs)
        client.reset()
    }

    /** EXIF orientation 6 (rotate 90 clockwise) must be applied exactly once on the strip path. */
    @Test
    fun exifRotationAppliedExactlyOnce() {
        val src = File(outDir, "exif6.jpg")
        android.graphics.Bitmap.createBitmap(400, 200, android.graphics.Bitmap.Config.ARGB_8888).apply {
            android.graphics.Canvas(this).apply {
                drawRect(0f, 0f, 200f, 200f, android.graphics.Paint().apply { color = 0xFFFF0000.toInt() })
                drawRect(200f, 0f, 400f, 200f, android.graphics.Paint().apply { color = 0xFF0000FF.toInt() })
            }
            src.outputStream().use { compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, it) }
        }
        androidx.exifinterface.media.ExifInterface(src.absolutePath).apply {
            setAttribute(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, "6")
            saveAttributes()
        }
        val out = File(outDir, "exif6-out.rgba")
        val client = EngineClient(ctx)
        val r = client.decodeToJpeg(src, out, 400, -1).getOrThrow()
        client.reset()
        report("exifPath", listOf("ImageDecoder", "BitmapFactory", "RegionStrips")[r[2]])
        assertEquals("upright width", 200, r[0])
        assertEquals("upright height", 400, r[1])
        val px = out.readBytes()
        fun rgb(x: Int, y: Int) = (y * 200 + x) * 4
        val top = rgb(100, 50)
        val bottom = rgb(100, 350)
        assertTrue("top should be red", (px[top].toInt() and 0xFF) > 200 && (px[top + 2].toInt() and 0xFF) < 60)
        assertTrue("bottom should be blue", (px[bottom + 2].toInt() and 0xFF) > 200 && (px[bottom].toInt() and 0xFF) < 60)
    }

    @Test
    fun engineCannotOpenAppFiles() {
        val secret = File(ctx.filesDir, "test-out/secret.txt").apply { writeText("customer data") }
        assertTrue("control: the app itself can read it", secret.canRead())
        val client = EngineClient(ctx)
        assertFalse(client.call { it.canReadPath(secret.absolutePath) }.getOrThrow())
        client.reset()
    }
}
