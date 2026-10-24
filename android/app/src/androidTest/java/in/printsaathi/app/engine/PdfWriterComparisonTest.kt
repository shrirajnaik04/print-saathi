package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.os.Bundle
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.pdf.ImageKind
import `in`.printsaathi.app.engine.pdf.MiniPdfWriter
import `in`.printsaathi.app.engine.pdf.PlacedImage
import `in`.printsaathi.app.engine.pdf.RectD
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Random

/**
 * Spike (g) / ADR-001: the platform PdfDocument against our MiniPdfWriter, on the same inputs.
 * Measures file size, exact page size, colour space of grey pages, image reuse for copies and determinism.
 * Outputs land in files/adr001/ for independent validation with pdf.js (scripts/validate-pdf.mjs).
 */
@RunWith(AndroidJUnit4::class)
class PdfWriterComparisonTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val outDir = File(ctx.filesDir, "adr001").apply { mkdirs() }
    private val a4W = 210.0 * 72 / 25.4
    private val a4H = 297.0 * 72 / 25.4

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("adr001", "$key=$value") })
        android.util.Log.i("PrintSaathiSpike", "adr001 $key=$value")
    }

    /** A photo-like synthetic image: smooth gradients plus fine noise, like a WhatsApp photo (1600x1200). */
    private fun photoJpeg(seed: Int): ByteArray {
        val w = 1600
        val h = 1200
        val rnd = Random(seed.toLong())
        val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val n = rnd.nextInt(24) - 12
            val r = (x * 255 / w + n + seed * 30).coerceIn(0, 255)
            val g = (y * 255 / h + n).coerceIn(0, 255)
            val b = ((x + y) * 255 / (w + h) - n).coerceIn(0, 255)
            px[y * w + x] = Color.rgb(r, g, b)
        }
        val bmp = Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
        return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it); bmp.recycle() }.toByteArray()
    }

    /** A 300 dpi A4 text-like grey page (2480x3508): lines of black text on white. */
    private fun greyPage(n: Int): Bitmap {
        val bmp = Bitmap.createBitmap(2480, 3508, Bitmap.Config.ARGB_8888)
        Canvas(bmp).apply {
            drawColor(Color.WHITE)
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 42f }
            for (line in 0 until 70) drawText("Page $n line $line - the quick brown fox jumps over the lazy dog 0123456789", 200f, 250f + line * 45f, p)
        }
        return bmp
    }

    private fun greyBytes(bmp: Bitmap): ByteArray {
        val px = IntArray(bmp.width * bmp.height)
        bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
        return ByteArray(px.size) { (px[it] and 0xFF).toByte() }
    }

    private fun boxes(): List<RectD> {
        val m = 6 * 72 / 25.4
        val gap = 3 * 72 / 25.4
        val w = (a4W - 2 * m - gap) / 2
        val h = w * 3 / 4
        return List(6) { i -> RectD(m + (i % 2) * (w + gap), m + (i / 2) * (h + gap), w, h) }
    }

    private fun platformPhotos(file: File, jpegs: List<ByteArray>, copies: Int) {
        val doc = PdfDocument()
        val bitmaps = jpegs.map { BitmapFactory.decodeByteArray(it, 0, it.size) }
        repeat(copies) { c ->
            val page = doc.startPage(PdfDocument.PageInfo.Builder(Math.round(a4W).toInt(), Math.round(a4H).toInt(), c + 1).create())
            boxes().forEachIndexed { i, b ->
                page.canvas.drawBitmap(bitmaps[i], null, Rect(b.x.toInt(), b.y.toInt(), (b.x + b.w).toInt(), (b.y + b.h).toInt()), null)
            }
            doc.finishPage(page)
        }
        file.outputStream().use { doc.writeTo(it) }
        doc.close()
        bitmaps.forEach { it.recycle() }
    }

    private fun customPhotos(file: File, jpegs: List<ByteArray>, copies: Int) {
        file.outputStream().use { out ->
            MiniPdfWriter(out).apply {
                val placed = boxes().mapIndexed { i, b -> PlacedImage(jpegs[i], ImageKind.JPEG_RGB, 1600, 1200, b) }
                repeat(copies) { addPage(a4W, a4H, placed) }
                finish()
            }
        }
    }

    private fun text(file: File) = String(file.readBytes(), Charsets.ISO_8859_1)

    @Test
    fun compareWriters() {
        val jpegs = List(6) { photoJpeg(it) }
        report("inputJpegBytes", jpegs.sumOf { it.size })

        for ((name, write) in listOf<Pair<String, (File, Int) -> Unit>>(
            "platform" to { f, c -> platformPhotos(f, jpegs, c) },
            "custom" to { f, c -> customPhotos(f, jpegs, c) },
        )) {
            val one = File(outDir, "$name-6photos-a4.pdf")
            var t = SystemClock.elapsedRealtime()
            write(one, 1)
            report("$name.photos1.ms", SystemClock.elapsedRealtime() - t)
            report("$name.photos1.bytes", one.length())
            val two = File(outDir, "$name-6photos-a4-x2.pdf")
            t = SystemClock.elapsedRealtime()
            write(two, 2)
            report("$name.photos2.ms", SystemClock.elapsedRealtime() - t)
            report("$name.photos2.bytes", two.length())
            val again = File(outDir, "$name-6photos-a4-again.pdf")
            write(again, 1)
            report("$name.deterministic", one.readBytes().contentEquals(again.readBytes()))
            val mediaBox = Regex("""/MediaBox\s*\[([^\]]*)]""").find(text(one))?.groupValues?.get(1)?.trim()
            report("$name.mediaBox", mediaBox ?: "none")
            report("$name.dctPassThrough", text(one).contains("/DCTDecode"))
        }

        // 10-page grey document at 300 dpi.
        val greyPlatform = File(outDir, "platform-grey10.pdf")
        var t = SystemClock.elapsedRealtime()
        PdfDocument().apply {
            for (n in 1..10) {
                val bmp = greyPage(n)
                val page = startPage(PdfDocument.PageInfo.Builder(Math.round(a4W).toInt(), Math.round(a4H).toInt(), n).create())
                page.canvas.drawBitmap(bmp, null, Rect(0, 0, Math.round(a4W).toInt(), Math.round(a4H).toInt()), null)
                finishPage(page)
                bmp.recycle()
            }
            greyPlatform.outputStream().use { writeTo(it) }
            close()
        }
        report("platform.grey10.ms", SystemClock.elapsedRealtime() - t)
        report("platform.grey10.bytes", greyPlatform.length())
        report("platform.grey10.deviceGray", text(greyPlatform).contains("/DeviceGray"))
        report("platform.grey10.deviceRGB", text(greyPlatform).contains("/DeviceRGB"))

        val greyCustom = File(outDir, "custom-grey10.pdf")
        t = SystemClock.elapsedRealtime()
        greyCustom.outputStream().use { out ->
            MiniPdfWriter(out).apply {
                for (n in 1..10) {
                    val bmp = greyPage(n)
                    addPage(a4W, a4H, listOf(PlacedImage(greyBytes(bmp), ImageKind.GREY8_RAW, bmp.width, bmp.height, RectD(0.0, 0.0, a4W, a4H))))
                    bmp.recycle()
                }
                finish()
            }
        }
        report("custom.grey10.ms", SystemClock.elapsedRealtime() - t)
        report("custom.grey10.bytes", greyCustom.length())
        report("custom.grey10.deviceGray", text(greyCustom).contains("/DeviceGray"))
        report("custom.grey10.deviceRGB", text(greyCustom).contains("/DeviceRGB"))

        assertTrue(greyPlatform.length() > 0 && greyCustom.length() > 0)
    }
}
