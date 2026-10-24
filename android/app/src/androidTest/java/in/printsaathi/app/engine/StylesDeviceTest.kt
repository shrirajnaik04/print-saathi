package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.CustomerPdf
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.Styles
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Phase 8 (PLAN §F4, §G2): the print styles through the isolated engine, for a photo and for a PDF page. */
@RunWith(AndroidJUnit4::class)
class StylesDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val assets = InstrumentationRegistry.getInstrumentation().context.assets
    private val dir = File(ctx.noBackupFilesDir, "styles-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    /** Colour bands across, darker downwards (a photo-like test image). */
    private val photo: File by lazy {
        val w = 601
        val h = 401
        val src = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val colours = intArrayOf(Color.rgb(200, 60, 60), Color.rgb(60, 170, 80), Color.rgb(50, 80, 210), Color.rgb(230, 200, 90))
        val row = IntArray(w)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val c = colours[x * colours.size / w]
                val k = 255 - y * 150 / h
                row[x] = Color.rgb(Color.red(c) * k / 255, Color.green(c) * k / 255, Color.blue(c) * k / 255)
            }
            src.setPixels(row, 0, w, 0, y, w, 1)
        }
        File(dir, "photo.png").apply { outputStream().use { src.compress(Bitmap.CompressFormat.PNG, 100, it) } }
    }

    private fun styled(style: Int): Pair<IntArray, File> {
        val out = File(dir, "out-$style")
        return client.decodeStyled(photo, out, 601, 92, style).getOrThrow() to out
    }

    /** Average of (max channel − min channel): how colourful a picture is. */
    private fun colourfulness(f: File): Double {
        val b = BitmapFactory.decodeFile(f.absolutePath)
        var sum = 0L
        var n = 0
        for (y in 0 until b.height step 7) for (x in 0 until b.width step 7) {
            val p = b.getPixel(x, y)
            sum += maxOf(Color.red(p), Color.green(p), Color.blue(p)) - minOf(Color.red(p), Color.green(p), Color.blue(p))
            n++
        }
        return sum.toDouble() / n
    }

    private fun greyOnly(f: File): Boolean {
        val b = BitmapFactory.decodeFile(f.absolutePath)
        val row = IntArray(b.width)
        for (y in 0 until b.height) {
            b.getPixels(row, 0, b.width, 0, y, b.width, 1)
            for (p in row) if (Color.red(p) != Color.green(p) || Color.green(p) != Color.blue(p)) return false
        }
        return true
    }

    @Test fun colourStylesChangeColourfulnessTheWayTheyShould() {
        val original = colourfulness(styled(Styles.ORIGINAL).second)
        val vibrant = colourfulness(styled(Styles.VIBRANT).second)
        val soft = colourfulness(styled(Styles.SOFT).second)
        assertTrue("vibrant $vibrant > original $original", vibrant > original * 1.15)
        assertTrue("soft $soft < original $original", soft < original * 0.95)
    }

    @Test fun blackAndWhiteStylesAreGreyOnly() {
        assertTrue("Black & White", greyOnly(styled(Styles.BW).second))
        assertTrue("Sharp Black", greyOnly(styled(Styles.SHARP).second))
    }

    @Test fun ocvBlackPhotosAreOneBitRows() {
        val (r, f) = styled(Styles.OCV)
        assertEquals(601, r[0])
        assertEquals(401, r[1])
        assertEquals((601 + 7) / 8 * 401L, f.length())
    }

    private fun doc(name: String) = File(dir, name.substringAfterLast('/')).apply {
        assets.open("pdf/$name").use { i -> outputStream().use { i.copyTo(it) } }
    }

    @Test fun pdfPagesTakeTheStyleToo() {
        val text = doc("docs/text.pdf")
        // OCV Black: 1-bit rows; text black, most of the page white.
        val ocv = File(dir, "ocv.bits")
        val r = client.renderCustomerPage(text, "", 0, ocv, 1200, 92, CustomerPdf.MODE_ONE_BIT, Styles.OCV).getOrThrow()
        val bytes = ocv.readBytes()
        assertEquals((r[0] + 7) / 8 * r[1], bytes.size)
        val black = bytes.sumOf { 8 - Integer.bitCount(it.toInt() and 0xFF) }
        val share = black.toDouble() / (r[0].toLong() * r[1])
        assertTrue("black share $share", share in 0.005..0.30)
        // Sharp Black: raw grey rows of the page size.
        val sharp = File(dir, "sharp.raw")
        val s = client.renderCustomerPage(text, "", 0, sharp, 1200, 92, CustomerPdf.MODE_GREY_RAW, Styles.SHARP).getOrThrow()
        assertEquals(s[0].toLong() * s[1], sharp.length())
        // A colour style on a grey output (or the other way round) is refused, never mixed.
        assertTrue(client.renderCustomerPage(text, "", 0, sharp, 1200, 92, CustomerPdf.MODE_GREY_RAW, Styles.VIBRANT).isFailure)
    }

    /** Review focus 5: a 360 px sample looks like the print-size image of the same style, scaled down. */
    @Test fun samplesMatchThePrintSizeImage() {
        for (style in listOf(Styles.ORIGINAL, Styles.VIBRANT, Styles.SOFT, Styles.BW, Styles.SHARP)) {
            val small = File(dir, "small-$style")
            val big = File(dir, "big-$style")
            client.decodeStyled(photo, small, 360, 85, style).getOrThrow()
            client.decodeStyled(photo, big, 601, 92, style).getOrThrow()
            val a = BitmapFactory.decodeFile(small.absolutePath)
            val b = Bitmap.createScaledBitmap(BitmapFactory.decodeFile(big.absolutePath), a.width, a.height, true)
            var diff = 0L
            for (y in 0 until a.height) for (x in 0 until a.width) {
                val p = a.getPixel(x, y)
                val q = b.getPixel(x, y)
                diff += Math.abs(Color.red(p) - Color.red(q)) + Math.abs(Color.green(p) - Color.green(q)) + Math.abs(Color.blue(p) - Color.blue(q))
            }
            val mean = diff.toDouble() / (a.width * a.height * 3)
            assertTrue("style $style: mean difference $mean", mean < 6.0)
        }
    }

    /** Gate I1: OCV Black on whole A4 pages at 300 dpi inside the engine (on a 2 GB Android 7 phone in the regression). */
    @Test fun ocvBlackHandlesWholeA4PagesAtPrintSize() {
        for (name in listOf("docs/text.pdf", "docs/photo.pdf")) {
            val out = File(dir, "a4.bits")
            val t0 = System.currentTimeMillis()
            val r = client.renderCustomerPage(doc(name), "", 0, out, 3508, 92, CustomerPdf.MODE_ONE_BIT, Styles.OCV)
            assertTrue("$name: ${r.exceptionOrNull()}", r.isSuccess)
            val (w, h) = r.getOrThrow().let { it[0] to it[1] }
            assertEquals(3508, maxOf(w, h))
            assertEquals((w + 7) / 8 * h.toLong(), out.length())
            InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply {
                putString("ocvA4", "$name: ${w}x$h in ${System.currentTimeMillis() - t0} ms, engine PSS after ${client.call { it.pssKb() }.getOrNull()} KB")
            })
        }
    }
}
