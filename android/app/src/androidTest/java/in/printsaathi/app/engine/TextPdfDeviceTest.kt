package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Owner, round 8: a customer's WhatsApp message printed. The isolated engine makes an A4 PDF of the text; it has as
 * many pages as the text needs, Marathi / Hindi letters show, WhatsApp's marks do not print, and bad requests fail.
 */
@RunWith(AndroidJUnit4::class)
class TextPdfDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.noBackupFilesDir, "text-test").apply { deleteRecursively(); mkdirs() }
    private val client = EngineClient(ctx)

    @After fun tearDown() {
        client.reset()
        dir.deleteRecursively()
    }

    private fun pdfOf(text: String, size: Int = 120): Pair<Result<Int>, File> {
        val txt = File(dir, "m.txt").apply { writeText(text, Charsets.UTF_8) }
        val pdf = File(dir, "m-$size.pdf")
        return client.textToPdf(txt, pdf, size) to pdf
    }

    /** Dark pixels on page [page] rendered at 2 px per point (white = none). */
    private fun ink(pdf: File, page: Int = 0): Pair<Int, IntArray> =
        PdfRenderer(ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY)).use { r ->
            r.openPage(page).use { p ->
                val bmp = Bitmap.createBitmap(p.width * 2, p.height * 2, Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Color.WHITE)
                p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                val px = IntArray(bmp.width * bmp.height)
                bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
                bmp.recycle()
                px.count { Color.red(it) < 128 } to intArrayOf(p.width, p.height, r.pageCount)
            }
        }

    @Test fun aLongMessageFillsSeveralA4Pages() {
        val (r, pdf) = pdfOf((1..200).joinToString("\n") { "Line $it of the customer's speech, read slowly with a smile." })
        val pages = r.getOrThrow()
        assertTrue("$pages pages", pages >= 3)
        val (dark, info) = ink(pdf)
        assertEquals(595, info[0])
        assertEquals(842, info[1])
        assertEquals(pages, info[2])
        assertTrue("ink on page 1: $dark", dark > 2_000)
    }

    @Test fun biggerTextMakesMorePages() {
        val text = (1..120).joinToString("\n") { "A reader is a leader, line $it." }
        val normal = pdfOf(text, 120).first.getOrThrow()
        val large = pdfOf(text, 180).first.getOrThrow()
        assertTrue("$normal at 12 pt, $large at 18 pt", large > normal)
    }

    @Test fun marathiAndHindiLettersPrint() {
        val (r, pdf) = pdfOf("नमस्कार मंडळी, *धन्यवाद*!\nपुस्तक वाचा, आनंदी राहा.\nयह एक परीक्षा है।")
        assertEquals(1, r.getOrThrow())
        assertTrue("Devanagari drew ink", ink(pdf).first > 500)
    }

    @Test fun theMarksThemselvesDoNotPrint() {
        // The same words with and without the bold marks: no stars, so bold ink is close to (a little more than) plain.
        val plain = ink(pdfOf("THANK YOU").second).first
        val bold = ink(pdfOf("*THANK YOU*").second).first
        assertTrue("plain $plain, bold $bold", bold > plain && bold < plain * 2)
    }

    @Test fun emptyTextOrAWrongSizeIsRefused() {
        assertTrue(pdfOf("   \n  ").first.isFailure)
        assertTrue(pdfOf("hello", 999).first.isFailure)
    }

    @Test fun theLongestMessageAllowedFinishes() {
        val text = buildString { while (length < 99_000) append("This is a long message that keeps going. ") }
        val t0 = System.currentTimeMillis()
        val pages = pdfOf(text).first.getOrThrow()
        assertTrue("$pages pages in ${System.currentTimeMillis() - t0} ms", pages > 20)
    }
}
