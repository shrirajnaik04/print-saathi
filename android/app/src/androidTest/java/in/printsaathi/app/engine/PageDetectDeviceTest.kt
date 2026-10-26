package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import org.junit.After
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.hypot
import kotlin.math.max

/**
 * Owner, round 8 (scan pages): the isolated engine finds a paper page photographed at a slant on a table (synthetic:
 * typed lines on an A4 page, never a real document), from the JPEG the camera wrote, within 3 % of its corners; a photo
 * with no page in it finds none.
 */
@RunWith(AndroidJUnit4::class)
class PageDetectDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "page-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    /** Corners on a 1200 × 1600 photo (TL, TR, BR, BL), as the test sender's fake camera draws them. */
    private val corners = floatArrayOf(230f, 200f, 1000f, 260f, 1060f, 1380f, 150f, 1330f)

    private fun photo(withPage: Boolean): File {
        val bmp = Bitmap.createBitmap(1200, 1600, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(120, 82, 52))
        if (withPage) {
            c.save()
            c.concat(Matrix().apply { setPolyToPoly(floatArrayOf(0f, 0f, 700f, 0f, 700f, 990f, 0f, 990f), 0, corners, 0, 4) })
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(242, 240, 235) }
            c.drawRect(0f, 0f, 700f, 990f, p)
            p.color = Color.rgb(40, 40, 40)
            var y = 90f
            while (y < 900f) {
                c.drawRect(70f, y, if ((y.toInt() / 30) % 5 == 4) 380f else 630f, y + 9f, p)
                y += 30f
            }
            c.restore()
        }
        return File(dir, if (withPage) "page.jpg" else "table.jpg").apply {
            outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            bmp.recycle()
        }
    }

    @Test fun aPagePhotographedAtASlantIsFoundWithinThreePercent() {
        val found = EngineClient.turn { client.detectPage(photo(true)) }.getOrThrow()
        assertNotNull("no page found", found)
        val q = found!!.corners
        var worst = 0.0
        for (k in 0 until 4) {
            worst = max(worst, hypot(q[2 * k] * 1200 - corners[2 * k], q[2 * k + 1] * 1600 - corners[2 * k + 1]))
        }
        assertTrue("a corner is $worst px off", worst <= 0.03 * 1600)
    }

    @Test fun aPhotoWithNoPageFindsNone() {
        assertNull(EngineClient.turn { client.detectPage(photo(false)) }.getOrThrow())
    }
}
