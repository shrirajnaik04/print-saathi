package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.Grey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** PLAN §G2/§U: a Black & white print carries grey data only — every decoded pixel R = G = B — at print size. */
@RunWith(AndroidJUnit4::class)
class EngineGreyTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "grey-test").apply { deleteRecursively(); mkdirs() }

    @Test fun aColourPhotoBecomesGreyDataOnlyAndKeepsItsSizeAndTones() {
        // Colour bands across the width, brightness down the height; odd size on purpose.
        val w = 1201
        val h = 801
        val src = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val colours = intArrayOf(Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW, Color.CYAN, Color.MAGENTA)
        val row = IntArray(w)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val c = colours[x * colours.size / w]
                val k = 255 - y * 200 / h
                row[x] = Color.rgb(Color.red(c) * k / 255, Color.green(c) * k / 255, Color.blue(c) * k / 255)
            }
            src.setPixels(row, 0, w, 0, y, w, 1)
        }
        val inFile = File(dir, "colour.png").apply { outputStream().use { src.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        val out = File(dir, "grey.jpg")
        val client = EngineClient(ctx)
        val r = client.decodeToJpeg(inFile, out, 2000, 92, grey = true).getOrThrow()
        client.reset()
        assertEquals("same size as a colour decode (odd sizes stay odd)", 1201, r[0])
        assertEquals(801, r[1])

        val back = BitmapFactory.decodeFile(out.absolutePath)
        var notGrey = 0
        var samples = ""
        var maxSpread = 0
        var worst = 0
        val got = IntArray(back.width)
        for (y in 0 until h) {
            back.getPixels(got, 0, back.width, 0, y, back.width, 1)
            src.getPixels(row, 0, w, 0, y, w, 1)
            for (x in 0 until w) {
                val p = got[x]
                if (Color.red(p) != Color.green(p) || Color.green(p) != Color.blue(p)) {
                    if (notGrey < 6) samples += "($x,$y)=${Color.red(p)},${Color.green(p)},${Color.blue(p)} "
                    maxSpread = maxOf(maxSpread, maxOf(Color.red(p), Color.green(p), Color.blue(p)) - minOf(Color.red(p), Color.green(p), Color.blue(p)))
                    notGrey++
                }
                // Tones are compared away from the band edges, where JPEG blurs the jump between colours.
                val band = w / colours.size
                if (x % band in 12 until band - 12) worst = maxOf(worst, kotlin.math.abs(Color.red(p) - Grey.luma(row[x])))
            }
        }
        assertEquals("pixels that are not exactly grey (max spread $maxSpread): $samples", 0, notGrey)
        // The grey keeps Rec.601 tones (JPEG q92 rounding only).
        assertTrue("worst tone error $worst", worst <= 3)
        back.recycle()
        src.recycle()
    }
}
