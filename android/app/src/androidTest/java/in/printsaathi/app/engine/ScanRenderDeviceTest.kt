package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.jobs.PoisonMarkers
import `in`.printsaathi.app.engine.render.CancelToken
import `in`.printsaathi.app.engine.render.EngineRenderer
import `in`.printsaathi.app.engine.render.PlanRenderer
import `in`.printsaathi.app.engine.render.RenderItem
import `in`.printsaathi.app.engine.render.RenderOutcome
import `in`.printsaathi.app.engine.render.RenderPlan
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Owner, round 8 (scan pages) through the real print path: a page photographed at a slant on a brown table (synthetic,
 * as the test sender's fake camera draws it: typed lines and a red stamp) prints straightened by its four corners —
 * page-white where the table was, the stamp where it sits on the page — and in Clean colour the paper prints white
 * while the stamp stays red.
 */
@RunWith(AndroidJUnit4::class)
class ScanRenderDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val root = File(ctx.noBackupFilesDir, "scan-render-test")
    private val client = EngineClient(ctx)
    private val a4w = 210.0 * 72 / 25.4
    private val a4h = 297.0 * 72 / 25.4
    /** The page's corners on the 1200 × 1600 photo (TL, TR, BR, BL) and the stamp's middle on the 700 × 990 page. */
    private val corners = floatArrayOf(230f, 200f, 1000f, 260f, 1060f, 1380f, 150f, 1330f)
    private val stamp = 520.0 / 700 to 860.0 / 990

    @Before fun setUp() {
        root.deleteRecursively()
        root.mkdirs()
    }

    @After fun tearDown() {
        client.reset()
        root.deleteRecursively()
    }

    private fun photographedPage(): File {
        val bmp = Bitmap.createBitmap(1200, 1600, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(120, 82, 52))
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
        p.color = Color.rgb(200, 50, 50)
        c.drawCircle(520f, 860f, 60f, p)
        c.restore()
        return File(root, "page.jpg").apply {
            outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
            bmp.recycle()
        }
    }

    /** The page straightened into an A4 box in [style]; the colours at the box's points, rendered back from the PDF. */
    private fun printed(style: String, points: List<Pair<Double, Double>>): List<Int> {
        File(root, "out").deleteRecursively()
        val box = JSONObject().put("x", 36.0).put("y", 36.0).put("w", a4w - 72).put("h", a4h - 72)
        val quad = JSONArray(corners.mapIndexed { i, v -> v / if (i % 2 == 0) 1200.0 else 1600.0 })
        val placement = JSONObject().put("itemIndex", 1).put("turns", 0).put("style", style).put("box", box).put("quad", quad)
            .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
        val plan = JSONObject().put("v", 1).put("jobId", "scan").put("rev", 1).put("colour", "colour").put("copies", 1)
            .put("contentType", "document").put("paper", JSONObject().put("id", "A4").put("wPt", a4w).put("hPt", a4h))
            .put("pages", JSONArray().put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement))))
        val steps = EngineRenderer(client, PoisonMarkers(root))
        val r = PlanRenderer(steps, steps, steps, cards = steps)
            .render(RenderPlan.parse(plan), mapOf(1 to RenderItem(1, photographedPage(), "sha-scan")), File(root, "work"), File(root, "out"), CancelToken())
        assertTrue("render outcome $r", r is RenderOutcome.Done)
        val pdf = (r as RenderOutcome.Done).pdf
        return ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { pr ->
                pr.openPage(0).use { page ->
                    val bmp = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    points.map { (fx, fy) ->
                        val x = (36.0 + fx * (a4w - 72)) * bmp.width / a4w
                        val y = (36.0 + fy * (a4h - 72)) * bmp.height / a4h
                        bmp.getPixel(x.toInt(), y.toInt())
                    }.also { bmp.recycle() }
                }
            }
        }
    }

    private fun light(c: Int) = Color.red(c) > 225 && Color.green(c) > 225 && Color.blue(c) > 220
    private fun red(c: Int) = Color.red(c) - Color.green(c) >= 80 && Color.red(c) - Color.blue(c) >= 80

    @Test fun aPhotographedPagePrintsStraightenedByItsCorners() {
        // Near each corner of the box: the page itself (the brown table is gone); the stamp where it is on the page.
        val near = listOf(0.03 to 0.03, 0.97 to 0.03, 0.97 to 0.97, 0.03 to 0.97)
        val got = printed("original", near + stamp)
        for ((k, c) in got.take(4).withIndex()) assertTrue("corner $k: ${Integer.toHexString(c)}", light(c))
        assertTrue("stamp: ${Integer.toHexString(got[4])}", red(got[4]))
    }

    @Test fun cleanColourPrintsThePaperWhiteAndKeepsTheStampRed() {
        val got = printed("clean", listOf(0.5 to 0.03, 0.97 to 0.5, stamp))
        for ((k, c) in got.take(2).withIndex()) {
            assertTrue("paper $k: ${Integer.toHexString(c)}", Color.red(c) >= 245 && Color.green(c) >= 245 && Color.blue(c) >= 245)
        }
        assertTrue("stamp: ${Integer.toHexString(got[2])}", red(got[2]))
    }
}
