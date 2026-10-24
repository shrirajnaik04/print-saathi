package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Phase 9 (PLAN §F3): analysis bytes — the photo at ≤ 512 px as exact Rec.601 grey rows, from the isolated engine. */
@RunWith(AndroidJUnit4::class)
class AnalysisDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "analysis-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    @Test fun aWidePhotoWithBlackBarsBecomesGreyRowsAtAnalysisSize() {
        // 1600 × 800: black bars of 100 px top and bottom, a mid-grey picture between.
        val w = 1600
        val h = 800
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val row = IntArray(w)
        for (y in 0 until h) {
            row.fill(if (y < 100 || y >= 700) Color.BLACK else Color.rgb(120, 140, 160))
            bmp.setPixels(row, 0, w, 0, y, w, 1)
        }
        val src = File(dir, "bars.png").apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        val out = File(dir, "bars.grey")
        val r = client.analysisGrey(src, out, 512).getOrThrow()
        assertEquals(512, r[0])
        assertEquals(256, r[1])
        val g = out.readBytes()
        assertEquals(512 * 256, g.size)
        assertEquals("top bar black", 0, g[5 * 512 + 256].toInt() and 0xFF)
        val mid = g[128 * 512 + 256].toInt() and 0xFF
        // Rec.601 of (120, 140, 160) = 136.
        assertTrue("middle grey $mid", mid in 134..138)
    }

    /** Gate M-7: an EXIF-turned photo is analysed upright (the same space as its thumbnail and its crop). */
    @Test fun anExifTurnedPhotoIsAnalysedUpright() {
        // Stored 1600 × 800 with bars top and bottom; EXIF 6 = shown turned a quarter clockwise (800 × 1600).
        val w = 1600
        val h = 800
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val row = IntArray(w)
        for (y in 0 until h) {
            row.fill(if (y < 100 || y >= 700) Color.BLACK else Color.rgb(120, 140, 160))
            bmp.setPixels(row, 0, w, 0, y, w, 1)
        }
        val src = File(dir, "turned.jpg").apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) } }
        androidx.exifinterface.media.ExifInterface(src.absolutePath).apply {
            setAttribute(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, "6")
            saveAttributes()
        }
        val out = File(dir, "turned.grey")
        val r = client.analysisGrey(src, out, 512).getOrThrow()
        assertEquals("upright width", 256, r[0])
        assertEquals("upright height", 512, r[1])
        val g = out.readBytes()
        // The bars are now at the left and right.
        assertTrue("left bar", (g[256 * 256 + 5].toInt() and 0xFF) < 20)
        assertTrue("right bar", (g[256 * 256 + 250].toInt() and 0xFF) < 20)
        assertTrue("middle", (g[256 * 256 + 128].toInt() and 0xFF) in 125..145)
    }
}
