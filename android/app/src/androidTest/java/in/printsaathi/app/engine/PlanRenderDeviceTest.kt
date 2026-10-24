package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.exifinterface.media.ExifInterface
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.jobs.PoisonMarkers
import `in`.printsaathi.app.engine.render.CancelToken
import `in`.printsaathi.app.engine.render.EngineRenderer
import `in`.printsaathi.app.engine.render.PlanRenderer
import `in`.printsaathi.app.engine.render.RenderItem
import `in`.printsaathi.app.engine.render.RenderOutcome
import `in`.printsaathi.app.engine.render.RenderPlacement
import `in`.printsaathi.app.engine.render.RenderPlan
import `in`.printsaathi.app.engine.render.Crop
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Phase 2 Task 6 on a real engine: photos -> print.pdf. Proves each photo is drawn upright (portrait, sideways page,
 * EXIF-rotated), at 300 dpi of its box without upscaling, copies collated, and a damaged photo names itself. Leaves
 * files/render-check/{print.pdf, expected.json} for the independent pdf.js check (scripts/device/render-check.mjs).
 */
@RunWith(AndroidJUnit4::class)
class PlanRenderDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val root = File(ctx.noBackupFilesDir, "render-device-test")
    private val client = EngineClient(ctx)
    private val a4w = 210.0 * 72 / 25.4
    private val a4h = 297.0 * 72 / 25.4
    private val edge = 6.0 * 72 / 25.4

    @Before fun setUp() {
        root.deleteRecursively()
        root.mkdirs()
    }

    @After fun tearDown() {
        client.reset()
        root.deleteRecursively()
    }

    /** Upright: top half red, bottom half blue. [exif6]: stored turned (red on the left) with EXIF orientation 6. */
    private fun photo(name: String, w: Int, h: Int, exif6: Boolean = false): File {
        val (rw, rh) = if (exif6) h to w else w to h
        val bmp = Bitmap.createBitmap(rw, rh, Bitmap.Config.ARGB_8888)
        val red = IntArray(rw) { Color.RED }
        val blue = IntArray(rw) { Color.BLUE }
        for (y in 0 until rh) {
            val row = if (exif6) IntArray(rw) { x -> if (x < rw / 2) Color.RED else Color.BLUE } else if (y < rh / 2) red else blue
            bmp.setPixels(row, 0, rw, 0, y, rw, 1)
        }
        val f = File(root, name)
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        bmp.recycle()
        if (exif6) ExifInterface(f.absolutePath).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
            saveAttributes()
        }
        return f
    }

    /** Same rule as src/core/layout/onePerPage.ts: largest uncut fit inside 6 mm edges, sideways page if wide. */
    private fun onePerPage(index: Int, aspect: Double): JSONObject {
        val landscape = aspect > 1
        val (pw, ph) = if (landscape) a4h to a4w else a4w to a4h
        val aw = pw - 2 * edge
        val ah = ph - 2 * edge
        val w = if (aspect >= aw / ah) aw else ah * aspect
        val h = w / aspect
        val box = JSONObject().put("x", (pw - w) / 2).put("y", (ph - h) / 2).put("w", w).put("h", h)
        val placement = JSONObject().put("itemIndex", index).put("turns", 0).put("style", "original").put("box", box)
            .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
        return JSONObject().put("orientation", if (landscape) "landscape" else "portrait").put("placements", JSONArray().put(placement))
    }

    private fun planJson(copies: Int, vararg pages: JSONObject, colour: String = "colour") = JSONObject()
        .put("v", 1).put("jobId", "t").put("rev", 1).put("colour", colour).put("copies", copies).put("contentType", "photo")
        .put("paper", JSONObject().put("id", "A4").put("wPt", a4w).put("hPt", a4h))
        .put("pages", JSONArray().apply { pages.forEach { put(it) } })

    private fun render(plan: RenderPlan, items: Map<Int, RenderItem>): RenderOutcome {
        val steps = EngineRenderer(client, PoisonMarkers(root))
        // As the app builds it (PrintEnginePlugin): pages and straightened parts (cards, straightened photos) too.
        return PlanRenderer(steps, steps, steps, cards = steps).render(plan, items, File(root, "work"), File(root, "out"), CancelToken())
    }

    /** Colour at a point given in points (top-left origin) on page [n], rendered by the platform's PDF engine. */
    private fun colourAt(pdf: File, n: Int, xPt: Double, yPt: Double): Int =
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { r ->
                r.openPage(n).use { page ->
                    val bmp = Bitmap.createBitmap(page.width, page.height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp.getPixel((xPt * page.width / a4w).toInt(), (yPt * page.height / a4h).toInt()).also { bmp.recycle() }
                }
            }
        }

    private fun isRed(c: Int) = Color.red(c) > 200 && Color.blue(c) < 60
    private fun isBlue(c: Int) = Color.blue(c) > 200 && Color.red(c) < 60
    private fun isWhite(c: Int) = Color.red(c) > 230 && Color.green(c) > 230 && Color.blue(c) > 230

    /**
     * Where the point ([ux], [uy]) of the upright photo (fractions, top-left origin) lands on the sheet for [p]: its
     * quarter turns onto its own box, then its tilt clockwise about the box's centre (owner, round 3).
     */
    private fun onSheet(p: RenderPlacement, ux: Double, uy: Double): Pair<Double, Double> {
        val (fx, fy) = when (p.quarterTurnsCcw) {
            1 -> uy to 1 - ux
            2 -> 1 - ux to 1 - uy
            3 -> 1 - uy to ux
            else -> ux to uy
        }
        val b = p.inner ?: p.box
        val dx = (fx - 0.5) * b.w
        val dy = (fy - 0.5) * b.h
        val r = Math.toRadians(p.tiltCw)
        return b.x + b.w / 2 + dx * Math.cos(r) - dy * Math.sin(r) to b.y + b.h / 2 + dx * Math.sin(r) + dy * Math.cos(r)
    }

    /** What pdf.js must read back for [p]: its box (a tilted photo's outline) and its quarter turns or exact angle. */
    private fun expectedBox(p: RenderPlacement, turns: Int = p.quarterTurnsCcw): JSONObject =
        JSONObject().put("x", p.box.x).put("y", p.box.y).put("w", p.box.w).put("h", p.box.h).put("turns", turns).apply {
            if (p.tiltCw != 0.0) put("angle", ((turns * 90 - p.tiltCw) % 360 + 360) % 360)
        }

    @Test fun photosPrintUprightAt300DpiWithCollatedCopies() {
        val items = mapOf(
            1 to RenderItem(1, photo("p.jpg", 1200, 1600), "sha-p"),
            2 to RenderItem(2, photo("l.jpg", 1600, 1200), "sha-l"),
            3 to RenderItem(3, photo("e.jpg", 1200, 1600, exif6 = true), "sha-e"),
            4 to RenderItem(4, photo("big.jpg", 3600, 2700), "sha-big"),
        )
        // Page 5 (Phase 3): photos on one portrait page, one turned clockwise and one upside down in Photo tools.
        fun placed(index: Int, x: Double, y: Double, w: Double, h: Double, turns: Int) = JSONObject()
            .put("itemIndex", index).put("turns", turns).put("style", "original")
            .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
            .put("box", JSONObject().put("x", x).put("y", y).put("w", w).put("h", h))
        val twoOnOne = JSONObject().put("orientation", "portrait").put(
            "placements",
            JSONArray().put(placed(2, 40.0, 40.0, 400.0, 300.0, 0)).put(placed(1, 40.0, 400.0, 400.0, 300.0, 1))
                // ... and photo 2 again, small and upside down (two turns), so every quarter turn is drawn.
                .put(placed(2, 450.0, 40.0, 120.0, 90.0, 2)),
        )
        val json = planJson(2, onePerPage(1, 0.75), onePerPage(2, 4.0 / 3), onePerPage(3, 0.75), onePerPage(4, 4.0 / 3), twoOnOne)
        val plan = RenderPlan.parse(json)
        val r = render(plan, items)
        assertTrue("render outcome $r", r is RenderOutcome.Done)
        r as RenderOutcome.Done
        assertEquals(10, r.pages)

        // Pixels: small photos are never enlarged; the big one comes down to 300 dpi of its box: a 4:3 photo on a
        // sideways A4 page is held by the page height, box 748.3 pt long -> 3119 px. Page 5's photos are decoded
        // again for their smaller boxes (400 pt -> 1667 px), still never enlarged beyond the original.
        // Phase 19 (owner, 2026-10-23: originals untouched): the camera-turned photo (stored 1600 × 1200, "turn once")
        // goes in as it is stored and the page draws it turned; the colour checks below prove it prints upright.
        val s = String(r.pdf.readBytes(), Charsets.ISO_8859_1)
        val sizes = Regex("""/Width (\d+) /Height (\d+)""").findAll(s).map { it.groupValues[1] + "x" + it.groupValues[2] }.toList()
        assertEquals(listOf("1200x1600", "1600x1200", "1600x1200", "3119x2339", "1600x1200", "1200x1600", "500x375"), sizes)

        // Each photo's top (red) is where its quarter turns put it: 0 top, 1 left (sideways page), 2 bottom,
        // 3 right (turned clockwise in Photo tools); its bottom (blue) is on the opposite side.
        val sheet = plan.pages
        for ((page, placements) in sheet.withIndex()) {
            for (p in placements) {
                val b = p.box
                val (top, bottom) = when (p.quarterTurnsCcw) {
                    1 -> (b.x + b.w * 0.25 to b.y + b.h / 2) to (b.x + b.w * 0.75 to b.y + b.h / 2)
                    2 -> (b.x + b.w / 2 to b.y + b.h * 0.75) to (b.x + b.w / 2 to b.y + b.h * 0.25)
                    3 -> (b.x + b.w * 0.75 to b.y + b.h / 2) to (b.x + b.w * 0.25 to b.y + b.h / 2)
                    else -> (b.x + b.w / 2 to b.y + b.h * 0.25) to (b.x + b.w / 2 to b.y + b.h * 0.75)
                }
                val label = "page ${page + 1} photo ${p.itemIndex} (turns ${p.quarterTurnsCcw})"
                assertTrue("$label: top", isRed(colourAt(r.pdf, page, top.first, top.second)))
                assertTrue("$label: bottom", isBlue(colourAt(r.pdf, page, bottom.first, bottom.second)))
            }
        }
        assertEquals("the turned photo on page 5", 3, sheet[4][1].quarterTurnsCcw)
        assertEquals("the upside-down photo on page 5", 2, sheet[4][2].quarterTurnsCcw)

        // The real-file preview (PLAN §G7.3): the engine renders pages of this file; the photo colours sit where the
        // print puts them (page 1 upright: red above; page 2 sideways: red on the left, which the screen then turns up).
        for ((page, redLeft) in listOf(0 to false, 1 to true)) {
            val img = File(root, "preview-$page.jpg")
            client.renderPdfPage(r.pdf, page, img, 1280).getOrThrow()
            val bmp = android.graphics.BitmapFactory.decodeFile(img.absolutePath)
            val k = bmp.width / a4w
            val b = sheet[page].single().box
            val (top, bottom) = if (redLeft) {
                (b.x + b.w * 0.25 to b.y + b.h / 2) to (b.x + b.w * 0.75 to b.y + b.h / 2)
            } else {
                (b.x + b.w / 2 to b.y + b.h * 0.25) to (b.x + b.w / 2 to b.y + b.h * 0.75)
            }
            assertTrue("preview page ${page + 1}: photo top", isRed(bmp.getPixel((top.first * k).toInt(), (top.second * k).toInt())))
            assertTrue("preview page ${page + 1}: photo bottom", isBlue(bmp.getPixel((bottom.first * k).toInt(), (bottom.second * k).toInt())))
            assertEquals("preview long side", 1280, maxOf(bmp.width, bmp.height))
            bmp.recycle()
        }

        // Hand the file and what it must contain to the PC-side pdf.js check.
        val check = File(ctx.filesDir, "render-check").apply { deleteRecursively(); mkdirs() }
        r.pdf.copyTo(File(check, "print.pdf"))
        // The turns the file draws each picture with: the placement's turns, less the photo's own camera turn when the
        // photo went in as it is stored (owner decision 8: photo 3 is stored sideways with "turn once clockwise").
        val cameraTurnCw = mapOf(3 to 1)
        val pages = JSONArray()
        repeat(plan.copies) {
            sheet.forEach { pl ->
                val boxes = JSONArray()
                pl.forEach { p ->
                    val drawn = Math.floorMod(p.quarterTurnsCcw - (cameraTurnCw[p.itemIndex] ?: 0), 4)
                    boxes.put(JSONObject().put("x", p.box.x).put("y", p.box.y).put("w", p.box.w).put("h", p.box.h).put("turns", drawn))
                }
                pages.put(JSONObject().put("widthPt", a4w).put("heightPt", a4h).put("boxes", boxes))
            }
        }
        File(check, "expected.json").writeText(JSONObject().put("pages", pages).toString())
    }

    @Test fun aDamagedPhotoNamesItselfAndNoPrintFileIsMade() {
        val bad = File(root, "bad.jpg").apply { writeBytes(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()) + ByteArray(500) { 7 }) }
        val items = mapOf(
            1 to RenderItem(1, photo("p.jpg", 1200, 1600), "sha-ok"),
            2 to RenderItem(2, bad, "sha-bad"),
        )
        val r = render(RenderPlan.parse(planJson(1, onePerPage(1, 0.75), onePerPage(2, 0.75))), items)
        assertEquals(RenderOutcome.Damaged(2), r)
        assertFalse(File(root, "out/print.pdf").exists())
        assertFalse(File(root, "work").exists())
    }

    /** Every JPEG image stream in a PDF written by MiniPdfWriter ("/Length n >>
stream
" + n bytes). */
    private fun jpegStreams(pdf: ByteArray): List<ByteArray> {
        val text = String(pdf, Charsets.ISO_8859_1)
        return Regex("""/Filter /DCTDecode /Length (\d+) >>
stream
""").findAll(text).map { m ->
            val start = m.range.last + 1
            pdf.copyOfRange(start, start + m.groupValues[1].toInt())
        }.toList()
    }

    private fun box(x: Double, y: Double, w: Double, h: Double) = JSONObject().put("x", x).put("y", y).put("w", w).put("h", h)
    private val whole = JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1)

    /**
     * Owner, 2026-10-24 (the scanner app's crop with free corners): a straightened photo prints exactly the part inside
     * its frame, at every turn, at 300 dpi of its box. The frame is slanted inside the red top-left quarter.
     */
    @Test fun aStraightenedPhotoPrintsThePartInsideItsFrameAt300Dpi() {
        val quad = JSONArray(listOf(0.05, 0.02, 0.45, 0.06, 0.48, 0.45, 0.02, 0.48))
        val pages = JSONArray()
        for (t in 0..3) {
            val placement = JSONObject().put("itemIndex", 1).put("turns", t).put("style", "original").put("crop", whole)
                .put("quad", quad).put("box", box(100.0, 100.0, 216.0, 216.0))
            pages.put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement)))
        }
        val r = render(RenderPlan.parse(planJson(1).put("pages", pages)), mapOf(1 to RenderItem(1, quadrants("s.jpg", 1), "sha-s")))
        val pdf = (r as RenderOutcome.Done).pdf
        for (n in 0..3) for ((fx, fy) in listOf(0.5 to 0.5, 0.1 to 0.1, 0.9 to 0.1, 0.1 to 0.9, 0.9 to 0.9))
            assertEquals("page $n at ($fx, $fy)", "red", colourName(colourAt(pdf, n, 100 + 216 * fx, 100 + 216 * fy)))
        // 300 dpi of a 3-inch box: 900 × 900 px, made from the original photo.
        val sizes = jpegStreams(pdf.readBytes()).map { j ->
            val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            android.graphics.BitmapFactory.decodeByteArray(j, 0, j.size, o)
            o.outWidth to o.outHeight
        }
        assertTrue("an image", sizes.isNotEmpty())
        for ((w, h) in sizes) {
            assertEquals(900.0, w.toDouble(), 1.0)
            assertEquals(900.0, h.toDouble(), 1.0)
        }
    }

    /** Owner, 2026-10-24: OCV Black on a straightened photo: straightened first, then printed 1-bit (never a JPEG). */
    @Test fun ocvBlackOnAStraightenedPhotoIsOneBit() {
        val quad = JSONArray(listOf(0.05, 0.02, 0.95, 0.06, 0.98, 0.95, 0.02, 0.98))
        val placement = JSONObject().put("itemIndex", 1).put("turns", 0).put("style", "ocv").put("crop", whole)
            .put("quad", quad).put("box", box(100.0, 100.0, 216.0, 288.0))
        val plan = planJson(1, JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement)), colour = "bw")
        val r = render(RenderPlan.parse(plan), mapOf(1 to RenderItem(1, quadrants("o.jpg", 1), "sha-o")))
        val bytes = (r as RenderOutcome.Done).pdf.readBytes()
        assertTrue("a 1-bit image", String(bytes, Charsets.ISO_8859_1).contains("/BitsPerComponent 1 /Filter /FlateDecode"))
        assertTrue("no JPEG image", jpegStreams(bytes).isEmpty())
    }

    /**
     * Phases 21–24 (spec 2026-10-24): the web app's own plan (tests/fixtures/plan-v1-free.json, kept equal to buildPlan
     * by plan.test.ts). On page 1 two photos placed by hand overlap; the second, straightened and turned, is drawn on
     * top. Page 2 has a third photo that flowed on from Word's Narrow margin (12.7 mm). Leaves
     * files/render-check-free/{print.pdf, expected.json} for the pdf.js check of every picture's box.
     */
    @Test fun theWebAppsHandPlacedPlanPrintsEveryPhotoAtItsBox() {
        val text = InstrumentationRegistry.getInstrumentation().context.assets.open("plan-v1-free.json").bufferedReader().readText()
        val plan = RenderPlan.parse(JSONObject(text).getJSONObject("plan"))
        val items = mapOf(
            1 to RenderItem(1, quadrants("f1.jpg", 1), "sha-f1"),
            2 to RenderItem(2, quadrants("f2.jpg", 1), "sha-f2"),
            3 to RenderItem(3, photo("f3.jpg", 1500, 1000), "sha-f3"),
        )
        val r = render(plan, items)
        assertTrue("render outcome $r", r is RenderOutcome.Done)
        val pdf = (r as RenderOutcome.Done).pdf
        val (b1, b2) = plan.pages[0].map { it.box }
        // Photo 1 is turned 10° (owner, round 3): its own top-left (red), clear of photo 2; its outline's corner is
        // paper, not photo.
        assertEquals(10.0, plan.pages[0][0].tiltCw, 1e-9)
        val (ax, ay) = onSheet(plan.pages[0][0], 0.1, 0.1)
        assertFalse("the point is clear of photo 2", ax in b2.x..(b2.x + b2.w) && ay in b2.y..(b2.y + b2.h))
        assertEquals("photo 1", "red", colourName(colourAt(pdf, 0, ax, ay)))
        assertTrue("photo 1's outline corner", isWhite(colourAt(pdf, 0, b1.x + 2, b1.y + 2)))
        // Where they overlap, photo 2 (the straightened red quarter) is on top, not photo 1's yellow quarter.
        val ox = (maxOf(b1.x, b2.x) + minOf(b1.x + b1.w, b2.x + b2.w)) / 2
        val oy = (maxOf(b1.y, b2.y) + minOf(b1.y + b1.h, b2.y + b2.h)) / 2
        assertEquals("the overlap", "red", colourName(colourAt(pdf, 0, ox, oy)))
        val b3 = plan.pages[1].single().box
        assertEquals("photo 3 at the Narrow margin (x)", 12.7 * 72 / 25.4, b3.x, 1e-6)
        assertEquals("photo 3 at the Narrow margin (y)", 12.7 * 72 / 25.4, b3.y, 1e-6)
        assertTrue("photo 3 top", isRed(colourAt(pdf, 1, b3.x + b3.w / 2, b3.y + b3.h * 0.25)))
        assertTrue("photo 3 bottom", isBlue(colourAt(pdf, 1, b3.x + b3.w / 2, b3.y + b3.h * 0.75)))
        // For the PC-side pdf.js check: every picture's box and turns, in drawing order.
        val check = File(ctx.filesDir, "render-check-free").apply { deleteRecursively(); mkdirs() }
        pdf.copyTo(File(check, "print.pdf"))
        val pages = JSONArray()
        plan.pages.forEach { pl ->
            val boxes = JSONArray()
            pl.forEach { p -> boxes.put(expectedBox(p)) }
            pages.put(JSONObject().put("widthPt", a4w).put("heightPt", a4h).put("boxes", boxes))
        }
        File(check, "expected.json").writeText(JSONObject().put("pages", pages).toString())
    }

    /**
     * Owner, round 3 (spec 2026-10-24 Phase 28): a photo turned to any angle prints at that angle, at 300 dpi of its own
     * size (never its outline's), on an upright page and on a sideways one; its outline's corners stay paper. Leaves
     * files/render-check-tilt/{print.pdf, expected.json} for the pdf.js check of each outline and angle.
     */
    @Test fun aTiltedPhotoPrintsAtItsAngleAt300DpiOfItsOwnSize() {
        // Own size 300 × 400 pt (3:4, like the photo); the box is its turned outline, as the web app makes it.
        fun tilted(deg: Double, x: Double, y: Double): JSONObject {
            val r = Math.toRadians(deg)
            val c = Math.abs(Math.cos(r))
            val s = Math.abs(Math.sin(r))
            return JSONObject().put("itemIndex", 1).put("turns", 0).put("style", "original")
                .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
                .put("box", box(x, y, 300 * c + 400 * s, 300 * s + 400 * c))
                .put("tilt", JSONObject().put("deg", deg).put("w", 300.0).put("h", 400.0))
        }
        val upright = JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(tilted(20.0, 80.0, 120.0)))
        val sideways = JSONObject().put("orientation", "landscape").put("placements", JSONArray().put(tilted(-15.0, 200.0, 60.0)))
        val plan = RenderPlan.parse(planJson(1, upright, sideways))
        val r = render(plan, mapOf(1 to RenderItem(1, photo("t.jpg", 2400, 3200), "sha-t")))
        assertTrue("render outcome $r", r is RenderOutcome.Done)
        val pdf = (r as RenderOutcome.Done).pdf
        // One image for both (same photo, same own size): 300 dpi of the own long side, 400 pt -> 1667 px.
        val s = String(pdf.readBytes(), Charsets.ISO_8859_1)
        val sizes = Regex("/Width (\\d+) /Height (\\d+)").findAll(s).map { it.groupValues[1].toInt() to it.groupValues[2].toInt() }.toList()
        assertEquals(1, sizes.size)
        assertEquals(1667, maxOf(sizes[0].first, sizes[0].second))
        for ((n, p) in plan.pages.map { it.single() }.withIndex()) {
            val label = "page ${n + 1} (turns ${p.quarterTurnsCcw}, tilt ${p.tiltCw})"
            // Red top, blue bottom along the photo's own turned axis; also near its own corners.
            for ((ux, uy) in listOf(0.5 to 0.25, 0.1 to 0.1, 0.9 to 0.1)) {
                val (x, y) = onSheet(p, ux, uy)
                assertTrue("$label: top at $ux,$uy", isRed(colourAt(pdf, n, x, y)))
            }
            for ((ux, uy) in listOf(0.5 to 0.75, 0.1 to 0.9, 0.9 to 0.9)) {
                val (x, y) = onSheet(p, ux, uy)
                assertTrue("$label: bottom at $ux,$uy", isBlue(colourAt(pdf, n, x, y)))
            }
            val b = p.box
            for ((x, y) in listOf(b.x + 3 to b.y + 3, b.x + b.w - 3 to b.y + 3, b.x + 3 to b.y + b.h - 3, b.x + b.w - 3 to b.y + b.h - 3)) {
                assertTrue("$label: outline corner at $x,$y is paper", isWhite(colourAt(pdf, n, x, y)))
            }
        }
        val check = File(ctx.filesDir, "render-check-tilt").apply { deleteRecursively(); mkdirs() }
        pdf.copyTo(File(check, "print.pdf"))
        val pages = JSONArray()
        plan.pages.forEach { pl ->
            pages.put(JSONObject().put("widthPt", a4w).put("heightPt", a4h).put("boxes", JSONArray().apply { pl.forEach { put(expectedBox(it)) } }))
        }
        File(check, "expected.json").writeText(JSONObject().put("pages", pages).toString())
    }

    /**
     * Review, 2026-10-24: a whole A4 page straightened from a 12 MP photo, in colour and in OCV Black, renders within
     * the engine's memory (a 2 GB Android 7 phone keeps pictures in the app's small memory) at 300 dpi of its box.
     */
    @Test fun aWholeA4PageStraightenedFromABigPhotoRendersInColourAndOcvBlack() {
        val quad = JSONArray(listOf(0.03, 0.02, 0.97, 0.04, 0.98, 0.97, 0.01, 0.99))
        val src = photo("big.jpg", 3000, 4000)
        // Narrow margins: 12.7 mm (36 pt) each side.
        val a4Box = box(36.0, 36.0, a4w - 72.0, a4h - 72.0)
        for (style in listOf("original", "ocv")) {
            // The output folder is one plan's (the app names it by the plan's hash): a new plan, a new folder.
            File(root, "out").deleteRecursively()
            val placement = JSONObject().put("itemIndex", 1).put("turns", 0).put("style", style).put("crop", whole)
                .put("quad", quad).put("box", a4Box)
            val plan = planJson(1, JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement)),
                colour = if (style == "ocv") "bw" else "colour")
            val r = render(RenderPlan.parse(plan), mapOf(1 to RenderItem(1, src, "sha-big")))
            assertTrue("render outcome $r ($style)", r is RenderOutcome.Done)
            val bytes = (r as RenderOutcome.Done).pdf.readBytes()
            if (style == "ocv") {
                val heads = Regex("/Subtype /Image[^>]*").findAll(String(bytes, Charsets.ISO_8859_1)).map { it.value }.toList()
                assertTrue("a 1-bit image: $heads", heads.any { it.contains("/BitsPerComponent 1 /Filter /FlateDecode") })
            } else {
                val sizes = jpegStreams(bytes).map { j ->
                    val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    android.graphics.BitmapFactory.decodeByteArray(j, 0, j.size, o)
                    o.outWidth to o.outHeight
                }
                assertEquals(1, sizes.size)
                assertEquals((a4w - 72.0) / 72 * 300, sizes[0].first.toDouble(), 2.0)
                assertEquals((a4h - 72.0) / 72 * 300, sizes[0].second.toDouble(), 2.0)
            }
        }
    }

    /** Phase 4 (PLAN §G2/§U): a Black & white print carries grey data only — every pixel of every image R = G = B. */
    @Test fun aBlackAndWhitePrintHoldsOnlyGreyPixels() {
        val items = mapOf(
            1 to RenderItem(1, photo("p.jpg", 1200, 1600), "sha-p"),
            2 to RenderItem(2, photo("l.jpg", 1600, 1200), "sha-l"),
        )
        val r = render(RenderPlan.parse(planJson(1, onePerPage(1, 0.75), onePerPage(2, 4.0 / 3), colour = "bw")), items)
        assertTrue("render outcome $r", r is RenderOutcome.Done)
        val images = jpegStreams((r as RenderOutcome.Done).pdf.readBytes())
        assertEquals(2, images.size)
        for (jpeg in images) {
            val bmp = android.graphics.BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
            val row = IntArray(bmp.width)
            var notGrey = 0
            for (y in 0 until bmp.height) {
                bmp.getPixels(row, 0, bmp.width, 0, y, bmp.width, 1)
                notGrey += row.count { Color.red(it) != Color.green(it) || Color.green(it) != Color.blue(it) }
            }
            assertEquals("non-grey pixels in a B&W print image", 0, notGrey)
            bmp.recycle()
        }
    }

    /**
     * PLAN §P per-page budget for photos: <= 3 MB; the grey photo is also held to the stricter 1.5 MB grey-text budget. Content
     * is SYNTHETIC (no real camera photos here; real ones: USER-CHECKLIST §H4): a 12 MP gradient with fine
     * noise, plus a much busier texture whose size is reported, not asserted. One per A4 page, 300 dpi, q92.
     */
    @Test fun aSyntheticFullPagePhotoStaysWithinThePhotoBudget() {
        val w = 4000
        val h = 3000
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val rnd = java.util.Random(7)
        val row = IntArray(w)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val n = rnd.nextInt(17) - 8
                row[x] = Color.rgb((x * 255 / w + n).coerceIn(0, 255), (y * 255 / h + n).coerceIn(0, 255), ((x + y) * 255 / (w + h) - n).coerceIn(0, 255))
            }
            bmp.setPixels(row, 0, w, 0, y, w, 1)
        }
        val src = File(root, "12mp.jpg").apply { outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) } }
        bmp.recycle()
        val items = mapOf(1 to RenderItem(1, src, "sha-12mp"))
        for ((colour, budget) in listOf("colour" to 3_000_000, "bw" to 1_500_000)) {
            File(root, "out").deleteRecursively()
            val r = render(RenderPlan.parse(planJson(1, onePerPage(1, 4.0 / 3), colour = colour)), items) as RenderOutcome.Done
            val image = jpegStreams(r.pdf.readBytes()).single()
            InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply {
                putString("budget", "$colour page image ${image.size} bytes (budget $budget)")
            })
            assertTrue("$colour page image ${image.size} bytes > $budget", image.size <= budget)
        }
        // A much busier synthetic texture (strong noise at several scales): reported for the record.
        val busy = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        for (y in 0 until h) {
            for (x in 0 until w) {
                val n = rnd.nextInt(81) - 40 + ((x / 7 + y / 5) % 3) * 20
                row[x] = Color.rgb((128 + n).coerceIn(0, 255), (128 + n / 2 + (x % 31)).coerceIn(0, 255), (128 - n).coerceIn(0, 255))
            }
            busy.setPixels(row, 0, w, 0, y, w, 1)
        }
        val busySrc = File(root, "busy.jpg").apply { outputStream().use { busy.compress(Bitmap.CompressFormat.JPEG, 95, it) } }
        busy.recycle()
        File(root, "out").deleteRecursively()
        val busyPdf = render(RenderPlan.parse(planJson(1, onePerPage(1, 4.0 / 3))), mapOf(1 to RenderItem(1, busySrc, "sha-busy"))) as RenderOutcome.Done
        InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply {
            putString("budget", "busy colour page image ${jpegStreams(busyPdf.pdf.readBytes()).single().size} bytes (reported)")
        })
    }

    /** Mean SSIM of two equal-size images (luma, 8 x 8 windows): 1 = identical. */
    private fun ssim(a: Bitmap, b: Bitmap): Double {
        fun lum(bmp: Bitmap) = IntArray(bmp.width * bmp.height).also { px -> bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height) }
            .map { (Color.red(it) * 299 + Color.green(it) * 587 + Color.blue(it) * 114) / 1000.0 }
        val la = lum(a)
        val lb = lum(b)
        val c1 = 6.5025
        val c2 = 58.5225
        var sum = 0.0
        var n = 0
        for (by in 0 until a.height - 7 step 8) for (bx in 0 until a.width - 7 step 8) {
            var ma = 0.0; var mb = 0.0
            for (y in by until by + 8) for (x in bx until bx + 8) { ma += la[y * a.width + x]; mb += lb[y * a.width + x] }
            ma /= 64; mb /= 64
            var va = 0.0; var vb = 0.0; var cov = 0.0
            for (y in by until by + 8) for (x in bx until bx + 8) {
                val da = la[y * a.width + x] - ma
                val db = lb[y * a.width + x] - mb
                va += da * da; vb += db * db; cov += da * db
            }
            va /= 63; vb /= 63; cov /= 63
            sum += ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2))
            n++
        }
        return sum / n
    }

    /**
     * Gate review F3 (PLAN §U "preview-vs-file SSIM >= 0.98"): the real-file preview agrees with an independent drawing
     * of the same photos at the plan's boxes, for an upright page and a sideways page (drawn turned, as on the sheet).
     */
    @Test fun thePreviewAgreesWithTheSamePhotosDrawnAtThePlansBoxes() {
        val p = photo("p.jpg", 1200, 1600)
        val l = photo("l.jpg", 1600, 1200)
        val plan = RenderPlan.parse(planJson(1, onePerPage(1, 0.75), onePerPage(2, 4.0 / 3)))
        val r = render(plan, mapOf(1 to RenderItem(1, p, "sha-p"), 2 to RenderItem(2, l, "sha-l"))) as RenderOutcome.Done
        for ((page, src) in listOf(0 to p, 1 to l)) {
            val img = File(root, "pv-$page.jpg")
            client.renderPdfPage(r.pdf, page, img, 1280).getOrThrow()
            val preview = android.graphics.BitmapFactory.decodeFile(img.absolutePath)
            val k = preview.width / a4w
            val expected = Bitmap.createBitmap(preview.width, preview.height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
            val canvas = android.graphics.Canvas(expected)
            val photo = android.graphics.BitmapFactory.decodeFile(src.absolutePath)
            val pl = plan.pages[page].single()
            val box = android.graphics.RectF((pl.box.x * k).toFloat(), (pl.box.y * k).toFloat(), ((pl.box.x + pl.box.w) * k).toFloat(), ((pl.box.y + pl.box.h) * k).toFloat())
            canvas.save()
            canvas.rotate(-90f * pl.quarterTurnsCcw, box.centerX(), box.centerY())
            val drawn = if (pl.quarterTurnsCcw % 2 == 1) {
                android.graphics.RectF(box.centerX() - box.height() / 2, box.centerY() - box.width() / 2, box.centerX() + box.height() / 2, box.centerY() + box.width() / 2)
            } else box
            canvas.drawBitmap(photo, null, drawn, android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
            canvas.restore()
            val score = ssim(preview, expected)
            InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply { putString("ssim", "page ${page + 1}: $score") })
            assertTrue("page ${page + 1} SSIM $score", score >= 0.98)
            preview.recycle(); expected.recycle(); photo.recycle()
        }
    }

    /** Gate review F3: the preview of a black & white file is grey too (what the shopkeeper sees matches the grey print). */
    @Test fun theBlackAndWhitePreviewIsGrey() {
        val r = render(RenderPlan.parse(planJson(1, onePerPage(1, 0.75), colour = "bw")), mapOf(1 to RenderItem(1, photo("p.jpg", 1200, 1600), "sha-p"))) as RenderOutcome.Done
        val img = File(root, "pv-bw.jpg")
        client.renderPdfPage(r.pdf, 0, img, 1280).getOrThrow()
        val bmp = android.graphics.BitmapFactory.decodeFile(img.absolutePath)
        val px = IntArray(bmp.width * bmp.height).also { bmp.getPixels(it, 0, bmp.width, 0, 0, bmp.width, bmp.height) }
        assertEquals("non-grey preview pixels", 0, px.count { Color.red(it) != Color.green(it) || Color.green(it) != Color.blue(it) })
        bmp.recycle()
    }

    /** Gate review F3 / plan review focus 3: Colour -> B&W -> Colour gives the very same colour file again. */
    @Test fun colourThenBlackAndWhiteThenColourGivesTheSameFile() {
        val items = mapOf(1 to RenderItem(1, photo("p.jpg", 1200, 1600), "sha-p"))
        fun file(colour: String): ByteArray {
            File(root, "out").deleteRecursively()
            return (render(RenderPlan.parse(planJson(1, onePerPage(1, 0.75), colour = colour)), items) as RenderOutcome.Done).pdf.readBytes()
        }
        val first = file("colour")
        file("bw")
        assertTrue("byte-identical colour file", first.contentEquals(file("colour")))
    }

    /**
     * Four colours, upright: red top-left, green top-right, blue bottom-left, yellow bottom-right. [exif6]: stored
     * turned a quarter anticlockwise with EXIF orientation 6, so it is the same photo once upright.
     */
    private fun quadrants(name: String, exif6: Boolean): File = quadrants(name, if (exif6) 6 else 1)

    /**
     * The same four-colour photo stored for EXIF orientation [exif]: 1 upright, 6 turned, 2 mirrored, 7 TRANSVERSE
     * (Android applies a mirror first, then a quarter turn clockwise).
     */
    private fun quadrants(name: String, exif: Int): File {
        val w = 1200
        val h = 1600
        fun upright(x: Int, y: Int) = when {
            x < w / 2 && y < h / 2 -> Color.RED
            y < h / 2 -> Color.GREEN
            x < w / 2 -> Color.BLUE
            else -> Color.YELLOW
        }
        val turned = exif == 6 || exif == 7
        val (sw, sh) = if (turned) h to w else w to h
        val bmp = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
        val row = IntArray(sw)
        for (sy in 0 until sh) {
            for (sx in 0 until sw) row[sx] = when (exif) {
                // Turned: upright (x, y) is stored (y, sh - 1 - x).
                6 -> upright(sh - 1 - sy, sx)
                // Mirrored: upright (x, y) is stored (w - 1 - x, y).
                2 -> upright(w - 1 - sx, sy)
                // Mirror then turn clockwise: upright (x, y) is stored (sw - 1 - y, sh - 1 - x).
                7 -> upright(sh - 1 - sy, sw - 1 - sx)
                else -> upright(sx, sy)
            }
            bmp.setPixels(row, 0, sw, 0, sy, sw, 1)
        }
        val f = File(root, name)
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        bmp.recycle()
        if (exif != 1) ExifInterface(f.absolutePath).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, exif.toString())
            saveAttributes()
        }
        return f
    }

    private fun colourName(c: Int) = when {
        Color.red(c) > 180 && Color.green(c) > 180 && Color.blue(c) < 90 -> "yellow"
        Color.red(c) > 180 && Color.green(c) < 90 && Color.blue(c) < 90 -> "red"
        Color.green(c) > 180 && Color.red(c) < 90 && Color.blue(c) < 90 -> "green"
        Color.blue(c) > 180 && Color.red(c) < 90 && Color.green(c) < 90 -> "blue"
        else -> "other(${Integer.toHexString(c)})"
    }

    /**
     * Phase 6 Task 1 (PLAN §F1, review focus 2): a crop chosen on the photo as shown (turned 0..3 quarter turns
     * clockwise, stored upright or EXIF-turned) prints exactly that part. Expected colours are worked out by hand:
     * turned clockwise, the shown top-left quarter is the upright bottom-left one, and so on.
     */
    @Test fun aCropPrintsExactlyThePartShownInTheFrameAtEveryTurn() {
        // shown[turns] = colours of the shown quarters: top-left, top-right, bottom-left, bottom-right.
        val shown = listOf(
            listOf("red", "green", "blue", "yellow"),
            listOf("blue", "red", "yellow", "green"),
            listOf("yellow", "blue", "green", "red"),
            listOf("green", "yellow", "red", "blue"),
        )
        val quarters = listOf(0.0 to 0.0, 0.5 to 0.0, 0.0 to 0.5, 0.5 to 0.5)
        for (exif in listOf(1, 6, 2, 7)) {
            File(root, "out").deleteRecursively()
            val pages = JSONArray()
            for (t in 0..3) for ((qx, qy) in quarters) {
                // A quarter of the shown photo has the shown photo's shape (3:4 upright, 4:3 when turned sideways).
                val (bw, bh) = if (t % 2 == 0) 150.0 to 200.0 else 200.0 to 150.0
                val placement = JSONObject().put("itemIndex", 1).put("turns", t).put("style", "original")
                    .put("crop", JSONObject().put("x", qx).put("y", qy).put("w", 0.5).put("h", 0.5))
                    .put("box", JSONObject().put("x", 100).put("y", 100).put("w", bw).put("h", bh))
                pages.put(JSONObject().put("orientation", "portrait").put("placements", JSONArray().put(placement)))
            }
            val plan = planJson(1).put("pages", pages)
            val r = render(RenderPlan.parse(plan), mapOf(1 to RenderItem(1, quadrants("q$exif.jpg", exif), "sha-q$exif")))
            val pdf = (r as RenderOutcome.Done).pdf
            var n = 0
            for (t in 0..3) for (q in 0..3) {
                val (bw, bh) = if (t % 2 == 0) 150.0 to 200.0 else 200.0 to 150.0
                // The middle and four points near the corners of the box: one colour all over, nothing of another quarter.
                val points = listOf(0.5 to 0.5, 0.15 to 0.15, 0.85 to 0.15, 0.15 to 0.85, 0.85 to 0.85)
                for ((fx, fy) in points) {
                    val got = colourName(colourAt(pdf, n, 100 + bw * fx, 100 + bh * fy))
                    assertEquals("exif=$exif turns=$t quarter=$q at ($fx, $fy)", shown[t][q], got)
                }
                n++
            }
        }
    }

    /**
     * Phase 6 review focus 5: crops of a 108 MP photo stay within the phone's decode memory (strips over the cropped
     * rectangle only) and still reach full print size: a 90 % crop at a full A4 page (3508 px), a 10 % crop at a
     * passport photo (531 px). Skipped when the large fixture was not pushed (scripts/device/push-fixtures.mjs).
     */
    @Test fun cropsOfAHugePhotoStayWithinMemoryAndReachFullPrintSize() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val big = File(ctx.filesDir, "test-fixtures/108mp.jpg")
        org.junit.Assume.assumeTrue("108 MP fixture not pushed", big.isFile)
        val wide = File(root, "crop-wide.jpg")
        val size = client.decodeToJpeg(big, wide, 3508, 92, false, Crop(0.05, 0.05, 0.9, 0.9)).getOrThrow()
        assertEquals("full-page crop reaches 300 dpi", 3508, maxOf(size[0], size[1]))
        assertEquals("cut by the region decoder in strips", 3, size[2])
        val tight = File(root, "crop-tight.jpg")
        val small = client.decodeToJpeg(big, tight, 531, 92, false, Crop(0.45, 0.45, 0.1, 0.1)).getOrThrow()
        assertEquals("passport crop reaches 531 px", 531, maxOf(small[0], small[1]))
        InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply {
            putString("crop", "108 MP: 90 % crop ${size[0]}x${size[1]} peak ${size[5] / 1024} MB; 10 % crop ${small[0]}x${small[1]} peak ${small[5] / 1024} MB")
        })
    }
}

