package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.util.Log
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.abs
import kotlin.math.sin

/**
 * Round 11 (owner, 2026-11-12): "make sure passport size photos taken as best quality" = "image as is", and "even with
 * best quality the print must aim for fast printing". On a real engine: a passport photo is made from the customer's own
 * pixels, up to 600 dpi of 35 × 45 mm (1063 px), never shrunk to the 300 dpi (532 px) every other photo gets, never
 * enlarged past what the photo has; a sheet of 12 stays one small image (stored once) and renders quickly. The numbers
 * are logged (tag PassportQuality) for the evidence.
 */
@RunWith(AndroidJUnit4::class)
class PassportQualityDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val root = File(ctx.noBackupFilesDir, "passport-quality-test")
    private val client = EngineClient(ctx)
    private val a4w = 210.0 * 72 / 25.4
    private val a4h = 297.0 * 72 / 25.4
    private val mm = 72 / 25.4

    @Before fun setUp() {
        root.deleteRecursively()
        root.mkdirs()
    }

    @After fun tearDown() {
        client.reset()
        root.deleteRecursively()
    }

    /** A photo with real detail (smooth light, fine lines, a little grain), [w] × [h], saved as a JPEG at quality 92. */
    private fun photo(name: String, w: Int, h: Int): File {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val row = IntArray(w)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val fx = x.toDouble() / w
                val fy = y.toDouble() / h
                val light = 0.55 + 0.35 * sin(fx * 3.1) * sin(fy * 2.3)
                val lines = 0.06 * sin(x * 0.9 + y * 0.35)
                val grain = ((x * 7919 + y * 104729) % 17) / 17.0 * 0.04
                val v = (light + lines + grain).coerceIn(0.0, 1.0)
                val r = (v * 255).toInt()
                val g = (v * 235).toInt()
                val b = (v * 205).toInt()
                row[x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
            bmp.setPixels(row, 0, w, 0, y, w, 1)
        }
        val f = File(root, name)
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        bmp.recycle()
        return f
    }

    /** A4 sheet of [count] 35 × 45 mm passport photos of item 1 (whole photo), asking for [dpi] (null: as every other photo). */
    private fun sheet(count: Int, dpi: Int?): JSONObject {
        val w = 35 * mm
        val h = 45 * mm
        val gap = 2 * mm
        val placements = JSONArray()
        for (i in 0 until count) {
            val col = i % 5
            val row = i / 5
            val box = JSONObject().put("x", 14 * mm + col * (w + gap)).put("y", 14 * mm + row * (h + gap)).put("w", w).put("h", h)
            val p = JSONObject().put("itemIndex", 1).put("turns", 0).put("style", "original").put("box", box)
                .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1)).put("border", 1.5)
            if (dpi != null) p.put("dpi", dpi)
            placements.put(p)
        }
        return JSONObject().put("v", 1).put("jobId", "t").put("rev", 1).put("colour", "colour").put("copies", 1)
            .put("contentType", "document").put("paper", JSONObject().put("id", "A4").put("wPt", a4w).put("hPt", a4h))
            .put("pages", JSONArray().put(JSONObject().put("orientation", "portrait").put("placements", placements)))
    }

    private class Made(val sizes: List<Pair<Int, Int>>, val images: Int, val bytes: Long, val ms: Long)

    private fun render(json: JSONObject, src: File, outName: String): Made {
        val steps = EngineRenderer(client, PoisonMarkers(root))
        val out = File(root, outName)
        val t0 = System.nanoTime()
        val r = PlanRenderer(steps, steps, steps, cards = steps).render(
            RenderPlan.parse(json), mapOf(1 to RenderItem(1, src, "sha-$outName")), File(root, "work-$outName"), out, CancelToken(),
        )
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertTrue("render outcome $r", r is RenderOutcome.Done)
        r as RenderOutcome.Done
        val s = String(r.pdf.readBytes(), Charsets.ISO_8859_1)
        val sizes = Regex("""/Width (\d+) /Height (\d+)""").findAll(s).map { it.groupValues[1].toInt() to it.groupValues[2].toInt() }.toList()
        val images = Regex("""/Subtype /Image""").findAll(s).count()
        return Made(sizes, images, r.pdf.length(), ms)
    }

    private fun near(expected: Int, actual: Int) = abs(expected - actual) <= 1

    @Test fun aPassportPhotoIsMadeAt600DpiFromTheOwnPixelsNotShrunkTo300() {
        val src = photo("big.jpg", 2400, 3200)
        val fine = render(sheet(12, 600), src, "fine")
        val usual = render(sheet(12, null), src, "usual")
        Log.i(
            "PassportQuality",
            "12 photos, source 2400x3200: 600 dpi ${fine.sizes} ${fine.bytes} bytes ${fine.ms} ms; 300 dpi ${usual.sizes} ${usual.bytes} bytes ${usual.ms} ms",
        )
        // 45 mm = 1.7717 in: 1063 px at 600 dpi, 532 px at 300 dpi; the photo's width follows its own shape (3:4).
        assertEquals(1, fine.sizes.size)
        assertTrue("long side ${fine.sizes}", near(1063, fine.sizes.single().second) && near(797, fine.sizes.single().first))
        assertTrue("long side ${usual.sizes}", near(532, usual.sizes.single().second) && near(399, usual.sizes.single().first))
        // Twelve photos on the sheet are one image, stored once (the file stays small and quick to send).
        assertEquals(1, fine.images)
        assertEquals(1, usual.images)
    }

    @Test fun aSmallPhotoKeepsItsOwnPixelsNeitherShrunkNorEnlarged() {
        // A WhatsApp-sized photo's face: only 600 x 800 px. At 300 dpi it would be shrunk to 399 x 532 (detail thrown
        // away); at 600 dpi it is kept as it is (it has less than 1063 px, so it is not enlarged either).
        val small = photo("small.jpg", 600, 800)
        val fine = render(sheet(12, 600), small, "small-fine")
        val usual = render(sheet(12, null), small, "small-usual")
        Log.i("PassportQuality", "source 600x800: 600 dpi ${fine.sizes} ${fine.bytes} bytes; 300 dpi ${usual.sizes} ${usual.bytes} bytes")
        assertEquals(listOf(600 to 800), fine.sizes)
        assertTrue("shrunk as before: ${usual.sizes}", near(532, usual.sizes.single().second))
    }

    @Test fun aSheetOfPassportPhotosStaysSmallAndQuick() {
        val src = photo("big2.jpg", 2400, 3200)
        val fine = render(sheet(30, 600), src, "thirty")
        Log.i("PassportQuality", "30 photos, source 2400x3200: ${fine.sizes} ${fine.bytes} bytes ${fine.ms} ms")
        // Thirty photos (a full A4 sheet) is one image of about 800 x 1060 px: well under a megabyte to send, and made
        // in a few seconds even on a slow emulator (the printer's own speed is not measured here).
        assertEquals(1, fine.images)
        assertTrue("file ${fine.bytes} bytes", fine.bytes < 1_000_000)
        assertTrue("time ${fine.ms} ms", fine.ms < 30_000)
    }
}
