package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Phase 7 Task 3 (PLAN §G4, §U Documents): customer PDF pages through the real engine into the print file —
 * selection order and collated copies, lossless grey for black & white text, the untouched path byte for byte.
 */
@RunWith(AndroidJUnit4::class)
class DocumentRenderDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val assets = InstrumentationRegistry.getInstrumentation().context.assets
    private val root = File(ctx.noBackupFilesDir, "doc-render-test")
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

    private fun doc(name: String) = File(root, name.substringAfterLast('/')).apply {
        assets.open("pdf/$name").use { i -> outputStream().use { i.copyTo(it) } }
    }

    /** A page of shape [w] x [h] pt fitted inside 6 mm edges, like src/core/plan documentPlan. */
    private fun pageAt(page: Int, w: Double = 595.0, h: Double = 841.0): JSONObject {
        val landscape = w > h
        val (pw, ph) = if (landscape) a4h to a4w else a4w to a4h
        val aw = pw - 2 * edge
        val ah = ph - 2 * edge
        val aspect = w / h
        val bw = if (aspect >= aw / ah) aw else ah * aspect
        val bh = bw / aspect
        val placement = JSONObject().put("itemIndex", 1).put("pdfPage", page).put("turns", 0).put("style", "original")
            .put("crop", JSONObject().put("x", 0).put("y", 0).put("w", 1).put("h", 1))
            .put("box", JSONObject().put("x", (pw - bw) / 2).put("y", (ph - bh) / 2).put("w", bw).put("h", bh))
        return JSONObject().put("orientation", if (landscape) "landscape" else "portrait").put("placements", JSONArray().put(placement))
    }

    private fun plan(copies: Int, colour: String, vararg pages: JSONObject, exact: Boolean = false) = RenderPlan.parse(
        JSONObject().put("v", 1).put("jobId", "d").put("rev", 1).put("colour", colour).put("copies", copies)
            .put("contentType", "document").put("paper", JSONObject().put("id", "A4").put("wPt", a4w).put("hPt", a4h))
            .put("pages", JSONArray().apply { pages.forEach { put(it) } })
            .apply { if (exact) put("exact", JSONObject().put("itemIndex", 1)) },
    )

    private fun render(plan: RenderPlan, file: File): RenderOutcome.Done {
        val steps = EngineRenderer(client, PoisonMarkers(root))
        val r = PlanRenderer(steps, steps, steps).render(plan, mapOf(1 to RenderItem(1, file, "sha-doc")), File(root, "work"), File(root, "out"), CancelToken())
        assertTrue("rendered: $r", r is RenderOutcome.Done)
        return r as RenderOutcome.Done
    }

    private fun pageBitmap(pdf: File, n: Int): Bitmap = ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { r ->
            r.openPage(n).use { p ->
                Bitmap.createBitmap(p.width, p.height, Bitmap.Config.ARGB_8888).apply {
                    eraseColor(Color.WHITE)
                    p.render(this, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                }
            }
        }
    }

    private fun bandColour(b: Bitmap): String {
        val c = b.getPixel(b.width / 2, b.height / 4)
        return when {
            Color.red(c) > 180 && Color.green(c) < 90 -> "red"
            Color.green(c) > 150 && Color.red(c) < 90 -> "green"
            Color.blue(c) > 180 && Color.red(c) < 90 -> "blue"
            else -> "other(${Integer.toHexString(c)})"
        }
    }

    @Test fun aSelectionPrintsThosePagesInThatOrderWithCollatedCopies() {
        val r = render(plan(2, "colour", pageAt(2), pageAt(0)), doc("docs/three.pdf"))
        assertEquals(4, r.pages)
        assertEquals(listOf("blue", "red", "blue", "red"), (0 until 4).map { bandColour(pageBitmap(r.pdf, it)) })
    }

    @Test fun blackAndWhiteTextIsLosslessGreyWithinTheBudget() {
        val r = render(plan(1, "bw", pageAt(0)), doc("docs/text.pdf"))
        val bytes = r.pdf.readBytes()
        val s = String(bytes, Charsets.ISO_8859_1)
        assertTrue("lossless grey", s.contains("/DeviceGray") && s.contains("/Predictor 15"))
        assertTrue("grey text page ${bytes.size} bytes ≤ 1.5 MB", bytes.size <= 1_500_000)
        val b = pageBitmap(r.pdf, 0)
        val px = IntArray(b.width * b.height).also { b.getPixels(it, 0, b.width, 0, 0, b.width, b.height) }
        assertEquals("grey only", 0, px.count { Color.red(it) != Color.green(it) || Color.green(it) != Color.blue(it) })
        InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply { putString("size", "B&W text page ${bytes.size} bytes") })
    }

    @Test fun theUntouchedPathIsTheCustomersFileByteForByte() {
        val src = doc("docs/three.pdf")
        val r = render(plan(1, "colour", pageAt(0), pageAt(1), pageAt(2), exact = true), src)
        assertTrue("byte-identical", src.readBytes().contentEquals(r.pdf.readBytes()))
    }

    @Test fun aWidePageGoesOnASidewaysSheetTheRightWayRound() {
        val r = render(plan(1, "colour", pageAt(0, 841.0, 595.0)), doc("docs/landscape.pdf"))
        // The sheet is portrait in the file; the sideways page's top-left mark lands at the sheet's bottom-left.
        val b = pageBitmap(r.pdf, 0)
        val c = b.getPixel((b.width * 0.12).toInt(), (b.height * 0.88).toInt())
        assertTrue("red mark at ${Integer.toHexString(c)}", Color.red(c) > 180 && Color.green(c) < 90)
    }

    @Test fun tenBlackAndWhitePagesTimeAndSize() {
        val file = doc("docs/pages-120.pdf")
        val t0 = System.currentTimeMillis()
        val r = render(plan(1, "bw", *Array(10) { pageAt(it) }), file)
        val ms = System.currentTimeMillis() - t0
        InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply {
            putString("timing", "10 B&W pages: $ms ms, file ${r.pdf.length()} bytes")
        })
        assertEquals(10, r.pages)
    }
}
