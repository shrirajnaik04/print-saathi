package `in`.printsaathi.app.engine.print

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import `in`.printsaathi.app.engine.pdf.ImageKind
import `in`.printsaathi.app.engine.pdf.MiniPdfWriter
import `in`.printsaathi.app.engine.pdf.PlacedImage
import `in`.printsaathi.app.engine.pdf.RectD
import `in`.printsaathi.app.engine.pdf.StrokeRect
import java.io.ByteArrayOutputStream
import java.io.File

/** Phase 0 spike (b) pages: physical-size checks need exact vector boxes, measured with a ruler. */
object TestPages {
    private const val PT_PER_MM = 72.0 / 25.4

    enum class Paper(val wMm: Double, val hMm: Double, val mils: Pair<Int, Int>, val label: String) {
        A4(210.0, 297.0, 8268 to 11693, "A4"),
        PHOTO_4X6(101.6, 152.4, 4000 to 6000, "4x6"),
    }

    private fun mm(v: Double) = v * PT_PER_MM

    private fun rect(r: RectMm) = RectD(mm(r.xMm), mm(r.yMm), mm(r.wMm), mm(r.hMm))

    /** A text label rendered to a JPEG (no fonts in the PDF); the text shrinks until every line fits. Not customer data. */
    fun label(text: String, wPx: Int, hPx: Int, bg: Int = Color.WHITE): ByteArray {
        val lines = text.split('\n')
        val bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888)
        Canvas(bmp).apply {
            drawColor(bg)
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; isFakeBoldText = true }
            p.textSize = hPx * 0.8f / lines.size
            val widest = lines.maxOf { p.measureText(it) }
            if (widest > wPx * 0.92f) p.textSize *= wPx * 0.92f / widest
            val lineH = hPx.toFloat() / lines.size
            lines.forEachIndexed { i, line -> drawText(line, wPx * 0.04f, lineH * i + (lineH + p.textSize * 0.7f) / 2, p) }
        }
        return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it); bmp.recycle() }.toByteArray()
    }

    /**
     * Ruler page. A4: a title, a 50 mm square and 20 passport boxes (35x45 mm). 4x6: the real passport layout,
     * 6 boxes at 4 mm edges (PLAN §G0), with a small title in the bottom strip.
     * [sheets] repeats the page to test whether the print service scales multi-page jobs.
     */
    fun write(file: File, paper: Paper, sheets: Int, sizeMils: Pair<Int, Int>? = null) {
        // [sizeMils]: the printer's own photo-paper size (e.g. 10×15 cm), so the page is never scaled to fit it.
        val wMm = sizeMils?.let { it.first * 0.0254 } ?: paper.wMm
        val hMm = sizeMils?.let { it.second * 0.0254 } ?: paper.hMm
        val wPt = mm(wMm)
        val hPt = mm(hMm)
        val edge = 4.0
        val passport = label("35 x 45 mm", 300, 386, bg = Color.rgb(225, 225, 225))
        file.outputStream().use { out ->
            MiniPdfWriter(out).apply {
                repeat(sheets) {
                    val images = mutableListOf<PlacedImage>()
                    val rects = mutableListOf<StrokeRect>()
                    val slots = if (paper == Paper.A4) {
                        val title = label("PrintSaathi test page - A4\nMeasure: square = 50 mm, boxes = 35 x 45 mm", 1600, 220)
                        images += PlacedImage(title, ImageKind.JPEG_RGB, 1600, 220, RectD(mm(edge), mm(edge), wPt - 2 * mm(edge), mm(14.0)))
                        rects += StrokeRect(RectD(mm(edge), mm(22.0), mm(50.0), mm(50.0)), 0.6)
                        passportSlots(wMm, hMm, edge, 2.0, topReservedMm = 78.0)
                    } else {
                        passportSlots(wMm, hMm, edge, 2.0, topReservedMm = 0.0)
                    }
                    for (s in slots) {
                        images += PlacedImage(passport, ImageKind.JPEG_RGB, 300, 386, rect(s))
                        rects += StrokeRect(rect(s), 0.3)
                    }
                    if (paper == Paper.PHOTO_4X6) {
                        val bottom = slots.maxOf { it.yMm + it.hMm } + 1.0
                        val title = label("PrintSaathi 4x6 test - boxes = 35 x 45 mm", 1600, 80)
                        images += PlacedImage(title, ImageKind.JPEG_RGB, 1600, 80, RectD(mm(edge), mm(bottom), wPt - 2 * mm(edge), mm(hMm - edge - bottom)))
                    }
                    addPage(wPt, hPt, images, rects)
                }
                finish()
            }
        }
    }

    /** Shown in Android's print preview when the chosen paper is wrong (never printed: the final layout fails). */
    fun writeWarning(file: File, selectedMils: Pair<Int, Int>, plannedLabel: String) {
        val wPt = selectedMils.first * 72.0 / 1000
        val hPt = selectedMils.second * 72.0 / 1000
        val img = label(PaperMessages.warning(plannedLabel), 1600, 400, bg = Color.rgb(254, 243, 199))
        file.outputStream().use { out ->
            MiniPdfWriter(out).apply {
                addPage(wPt, hPt, listOf(PlacedImage(img, ImageKind.JPEG_RGB, 1600, 400, RectD(wPt * 0.05, hPt * 0.1, wPt * 0.9, wPt * 0.225))))
                finish()
            }
        }
    }
}
