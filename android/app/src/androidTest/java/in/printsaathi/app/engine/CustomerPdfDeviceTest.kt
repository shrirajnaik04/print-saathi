package `in`.printsaathi.app.engine

import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.PdfOpen
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Phase 7 Task 1 (PLAN §G4, §G5): customer PDFs opened and drawn inside the isolated engine. Fixtures:
 * tests/fixtures/pdf/docs (tests/generate/make-doc-pdfs.mjs, synthetic) and tests/fixtures/pdf (locked, RAMA1965).
 */
@RunWith(AndroidJUnit4::class)
class CustomerPdfDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val assets = InstrumentationRegistry.getInstrumentation().context.assets
    private val dir = File(ctx.filesDir, "customer-pdf-test")
    private val client = EngineClient(ctx)

    @Before fun setUp() {
        dir.deleteRecursively()
        dir.mkdirs()
    }

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    private fun doc(name: String) = File(dir, name.substringAfterLast('/')).apply {
        assets.open("pdf/$name").use { i -> outputStream().use { i.copyTo(it) } }
    }

    private fun facts(name: String, password: String = "") = client.pdfFacts(doc(name), password).getOrThrow()

    private fun page(name: String, n: Int, px: Int = 1000, grey: Boolean = false, password: String = "") =
        File(dir, "p.jpg").also { client.renderCustomerPage(doc(name), password, n, it, px, 92, if (grey) 1 else 0).getOrThrow() }
            .let { BitmapFactory.decodeFile(it.absolutePath) }

    private fun colour(c: Int) = when {
        Color.red(c) > 180 && Color.green(c) < 90 && Color.blue(c) < 90 -> "red"
        Color.green(c) > 150 && Color.red(c) < 90 && Color.blue(c) < 90 -> "green"
        Color.blue(c) > 180 && Color.red(c) < 90 && Color.green(c) < 90 -> "blue"
        Color.red(c) > 230 && Color.green(c) > 230 && Color.blue(c) > 230 -> "white"
        else -> "other"
    }

    /** Sizes are whole points as the built-in engine reports them (A4 595.28 x 841.89 → 595 x 841). */
    @Test fun pageCountsAndSizesAsShown() {
        assertEquals(listOf(1, 0, 595, 841), facts("docs/one.pdf").toList())
        assertEquals(3, facts("docs/three.pdf")[0])
        assertEquals(listOf(841, 595), facts("docs/landscape.pdf").toList().subList(2, 4))
        assertEquals(listOf(3, 0, 595, 841, 792, 612, 419, 595), facts("docs/mixed.pdf").toList())
        assertEquals("a /Rotate 90 page is shown sideways", listOf(841, 595), facts("docs/rotate90.pdf").toList().subList(2, 4))
        assertEquals(listOf(72, 72), facts("docs/tiny.pdf").toList().subList(2, 4))
        assertEquals(listOf(14400, 14400), facts("docs/huge.pdf").toList().subList(2, 4))
        assertEquals(1, facts("docs/blank.pdf")[0])
        val long = facts("docs/pages-320.pdf")
        assertEquals(320, long[0])
        assertEquals(2 + 2 * 320, long.size)
    }

    @Test fun formsAndStampsAreSeen() {
        assertEquals(1, facts("docs/forms.pdf")[1])
        assertEquals(1, facts("docs/stamp.pdf")[1])
        assertEquals(0, facts("docs/text.pdf")[1])
    }

    @Test fun pagesAreDrawnTheRightWayRoundInTheirOrder() {
        val one = page("docs/one.pdf", 0)
        assertEquals("top-left mark", "red", colour(one.getPixel((one.width * 25 / 210.0).toInt(), (one.height * 25 / 297.0).toInt())))
        assertEquals("bottom-right mark", "blue", colour(one.getPixel((one.width * 185 / 210.0).toInt(), (one.height * 272 / 297.0).toInt())))
        assertEquals("centre is paper white", "white", colour(one.getPixel(one.width / 2, one.height / 2)))
        for ((n, want) in listOf("red", "green", "blue").withIndex()) {
            val p = page("docs/three.pdf", n)
            assertEquals("page ${n + 1}", want, colour(p.getPixel(p.width / 2, p.height / 4)))
        }
        val land = page("docs/landscape.pdf", 0)
        assertTrue("landscape page is wide", land.width > land.height)
        assertEquals("red", colour(land.getPixel((land.width * 25 / 297.0).toInt(), (land.height * 25 / 210.0).toInt())))
        // /Rotate 90 turns the page clockwise: its top-left mark ends up top-right.
        val rot = page("docs/rotate90.pdf", 0)
        assertTrue(rot.width > rot.height)
        assertEquals("red", colour(rot.getPixel(rot.width - (rot.width * 25 / 297.0).toInt(), (rot.height * 25 / 210.0).toInt())))
        val huge = page("docs/huge.pdf", 0)
        assertEquals("the biggest page fits the image", "red", colour(huge.getPixel(huge.width * 1600 / 14400, huge.height * 1600 / 14400)))
    }

    @Test fun blackAndWhitePagesAreGreyOnly() {
        for (name in listOf("docs/one.pdf", "docs/photo.pdf", "docs/text.pdf")) {
            val b = page(name, 0, grey = true)
            val px = IntArray(b.width * b.height).also { b.getPixels(it, 0, b.width, 0, 0, b.width, b.height) }
            assertEquals(name, 0, px.count { Color.red(it) != Color.green(it) || Color.green(it) != Color.blue(it) })
        }
    }

    @Test fun lockedPdfsFollowThePhonesTier() {
        assertEquals("owner-only opens with no password", 1, facts("owner-only.pdf")[0])
        val tier = PdfOpen.tier()
        for (n in listOf("user-aes256.pdf", "user-aes128.pdf", "user-rc4.pdf")) {
            assertEquals(n, listOf(PdfOpen.PASSWORD_REQUIRED), facts(n).toList())
            assertEquals(n, listOf(PdfOpen.PASSWORD_REQUIRED), facts(n, "WRONG1999").toList())
            if (tier != PdfUnlockTier.NONE) {
                assertEquals(n, 1, facts(n, "RAMA1965")[0])
                val p = page(n, 0, password = "RAMA1965")
                assertEquals("the unlocked page draws", "other", colour(p.getPixel(0, 0)).let { if (it == "white") "other" else it })
            }
        }
    }

    /** PLAN §R12: hostile PDFs end as an error code or a contained engine death; the engine works afterwards. */
    @Test fun brokenAndHostilePdfsAreContained() {
        for (n in listOf("zero.pdf", "garbage.pdf", "truncated.pdf", "badxref.pdf", "bomb.pdf", "bigimage.pdf")) {
            val t0 = System.currentTimeMillis()
            val f = client.pdfFacts(doc("docs/$n"), "")
            val r = runCatching { client.renderCustomerPage(doc("docs/$n"), "", 0, File(dir, "h.jpg"), 2480, 92, 0).getOrThrow() }
            val ms = System.currentTimeMillis() - t0
            InstrumentationRegistry.getInstrumentation().sendStatus(0, android.os.Bundle().apply {
                putString("hostile", "$n facts=${f.getOrNull()?.take(4)} ${f.exceptionOrNull()?.javaClass?.simpleName ?: ""} render=${if (r.isSuccess) "ok" else r.exceptionOrNull()?.javaClass?.simpleName} ${ms}ms")
            })
            assertTrue("$n within the time limit", ms < 150_000)
            // Whatever happened, the engine still opens a good PDF.
            assertEquals("engine usable after $n", 1, facts("docs/one.pdf")[0])
        }
        assertTrue("zero bytes is not a PDF", client.pdfFacts(doc("docs/zero.pdf"), "").getOrNull()?.size == 1)
    }
}
