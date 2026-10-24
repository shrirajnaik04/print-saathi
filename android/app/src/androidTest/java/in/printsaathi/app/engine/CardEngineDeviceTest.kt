package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.Styles
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.abs
import kotlin.math.hypot

/** Phase 14 Task 3: the isolated engine finds cards in photos and on PDF pages, and straightens them exactly. */
@RunWith(AndroidJUnit4::class)
class CardEngineDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "cards-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    private val pw = 1600
    private val ph = 1200

    /** The card's true corners in the photo (pixels): turned and seen at a slant. */
    private val truth = floatArrayOf(420f, 300f, 1150f, 380f, 1110f, 860f, 360f, 760f)

    /** A light card (band, photo, text lines) on a dark table, drawn through the slant, as a phone JPEG. */
    private fun cardPhoto(name: String, solid: Int? = null): File {
        val bmp = Bitmap.createBitmap(pw, ph, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(45, 40, 38))
        val cw = 856f
        val ch = 540f
        val m = Matrix().apply { setPolyToPoly(floatArrayOf(0f, 0f, cw, 0f, cw, ch, 0f, ch), 0, truth, 0, 4) }
        c.save()
        c.concat(m)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = solid ?: Color.rgb(236, 236, 230)
        c.drawRoundRect(RectF(0f, 0f, cw, ch), 32f, 32f, p)
        if (solid == null) {
            p.color = Color.rgb(230, 120, 40)
            c.drawRect(0f, 0f, cw, 86f, p)
            p.color = Color.rgb(90, 80, 75)
            c.drawRect(43f, 130f, 240f, 430f, p)
            p.color = Color.rgb(40, 40, 40)
            for (k in 0 until 5) c.drawRect(290f, 150f + k * 60f, 790f, 170f + k * 60f, p)
        }
        c.restore()
        val f = File(dir, name)
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        bmp.recycle()
        return f
    }

    @Test fun findsTheCardInAPhotoWithin1Point5PercentOfTheDiagonal() {
        val found = client.detectCards(cardPhoto("card.jpg")).getOrThrow()
        assertEquals(1, found.size)
        val q = found[0].corners
        val diag = hypot(pw.toDouble(), ph.toDouble())
        // Either start corner (the detector puts the upper long edge first): the best match.
        val err = (0 until 4).minOf { s ->
            (0 until 4).maxOf { i ->
                val j = (s + i) % 4
                hypot(q[2 * j] * pw - truth[2 * i], q[2 * j + 1] * ph - truth[2 * i + 1])
            }
        }
        assertTrue("corner error ${err / diag}", err / diag <= 0.015)
        assertTrue("confidence ${found[0].confidence}", found[0].confidence >= 0.75)
    }

    @Test fun aStraightenedCardIsExactlyItsSizeAndKeepsItsColour() {
        val colour = Color.rgb(200, 60, 40)
        val src = cardPhoto("solid.jpg", solid = colour)
        val quad = DoubleArray(8) { truth[it].toDouble() / if (it % 2 == 0) pw else ph }
        val out = File(dir, "out.jpg")
        val r = client.decodeWarped(src, out, 1012, 638, 92, Styles.ORIGINAL, quad).getOrThrow()
        assertEquals(1012, r[0])
        assertEquals(638, r[1])
        val bmp = BitmapFactory.decodeFile(out.path)
        assertEquals(1012, bmp.width)
        assertEquals(638, bmp.height)
        val mid = bmp.getPixel(506, 319)
        assertTrue("colour ${Integer.toHexString(mid)}", abs(Color.red(mid) - 200) <= 4 && abs(Color.green(mid) - 60) <= 4 && abs(Color.blue(mid) - 40) <= 4)
        // The card's own width in the photo (~730 px) is under 1012: reported so Ready can say "may print blurry".
        assertTrue("source px ${r[6]}", r[6] in 600..800)
    }

    /** A letter-like page with two outlined card panels in its bottom half (synthetic e-Aadhaar layout). */
    private fun aadhaarPdf(): File {
        val doc = PdfDocument()
        val page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
        val c = page.canvas
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = Color.rgb(30, 30, 30)
        for (k in 0 until 14) c.drawRect(60f, 80f + k * 22f, 535f, 88f + k * 22f, p)
        val cw = 242.65f
        val chh = 153.07f
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.2f; color = Color.BLACK }
        for ((n, x) in listOf(40f, 312f).withIndex()) {
            c.drawRoundRect(RectF(x, 560f, x + cw, 560f + chh), 9f, 9f, stroke)
            if (n == 0) c.drawRect(x + 12f, 590f, x + 70f, 660f, p)
            for (k in 0 until 4) c.drawRect(x + 85f, 595f + k * 18f, x + 220f, 600f + k * 18f, p)
        }
        doc.finishPage(page)
        val f = File(dir, "eaadhaar.pdf")
        f.outputStream().use { doc.writeTo(it) }
        doc.close()
        return f
    }

    @Test fun findsBothCardPanelsOnAnEAadhaarLikePage() {
        val pdf = aadhaarPdf()
        val found = client.detectCardsInPage(pdf, "", 0).getOrThrow()
        assertEquals(2, found.size)
        // Left panel first, at x ≈ 40/595 of the page.
        assertTrue(abs(found[0].corners[0] - 40.0 / 595) < 0.01)
        assertTrue(abs(found[1].corners[0] - 312.0 / 595) < 0.01)
        val out = File(dir, "panel.jpg")
        val r = client.decodeWarped(pdf, out, 1012, 638, 92, Styles.ORIGINAL, found[0].corners, pdfPage = 0).getOrThrow()
        assertEquals(1012, r[0])
        val panel = BitmapFactory.decodeFile(out.path)
        assertEquals(638, panel.height)
        // The panel's own content, not a blank render (review I9): its dark photo block (12–70 pt across, 30–100 pt
        // down a 242.65 × 153.07 pt panel) and white paper on its right.
        val photo = panel.getPixel((41.0 / 242.65 * 1012).toInt(), (65.0 / 153.07 * 638).toInt())
        assertTrue("photo block ${Integer.toHexString(photo)}", Color.red(photo) < 90)
        val paper = panel.getPixel((230.0 / 242.65 * 1012).toInt(), (140.0 / 153.07 * 638).toInt())
        assertTrue("paper ${Integer.toHexString(paper)}", Color.red(paper) > 200)
    }

    @Test fun aBlankImageHasNoFace() {
        val bmp = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
        val f = File(dir, "blank.jpg")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        assertEquals(0, client.faceCount(f, 640).getOrThrow())
    }

    /** Phase 15: a photo with no face has none at any turn (nothing is turned for it); junk fails contained. */
    @Test fun aBlankPhotoHasNoFaceAtAnyTurnAndJunkFailsContained() {
        val bmp = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(200, 190, 170)) }
        val f = File(dir, "blank-turns.jpg")
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        assertEquals(listOf(0, 0, 0, 0), client.faceTurns(f).getOrThrow().toList())
        val junk = File(dir, "junk-turns.jpg").apply { writeBytes(byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + ByteArray(3000) { 7 }) }
        assertTrue(client.faceTurns(junk).isFailure)
        assertEquals(4, client.faceTurns(f).getOrThrow().size)
    }

    @Test fun hostileBytesFailContainedNeverCrashingTheApp() {
        val r = kotlin.random.Random(9)
        val junk = File(dir, "junk.jpg").apply { writeBytes(byteArrayOf(0xFF.toByte(), 0xD8.toByte()) + ByteArray(5000) { r.nextInt(256).toByte() }) }
        assertTrue(client.detectCards(junk).isFailure)
        val quad = doubleArrayOf(0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9)
        assertTrue(client.decodeWarped(junk, File(dir, "x.jpg"), 400, 252, 90, Styles.ORIGINAL, quad).isFailure)
        // A bad request (a crossed quad) is refused as such.
        assertTrue(client.decodeWarped(cardPhoto("ok.jpg"), File(dir, "y.jpg"), 400, 252, 90, Styles.ORIGINAL, doubleArrayOf(0.1, 0.1, 0.9, 0.9, 0.9, 0.1, 0.1, 0.9)).isFailure)
        // The engine still works afterwards.
        assertEquals(1, client.detectCards(cardPhoto("again.jpg")).getOrThrow().size)
    }
}
