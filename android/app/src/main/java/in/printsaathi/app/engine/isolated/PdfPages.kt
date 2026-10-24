package `in`.printsaathi.app.engine.isolated

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Runs INSIDE the isolated engine (PLAN §G7.3 "the real file is previewed"): renders one page of the app's own
 * print.pdf, on white, at preview size. Ready shows these images, so what the shopkeeper sees is what the printer gets.
 * Returns {width, height}. One renderer per call, on the engine's one heavy thread.
 */
object PdfPages {
    fun renderPage(pdf: ParcelFileDescriptor, index: Int, dst: ParcelFileDescriptor, maxLongSide: Int, quality: Int): IntArray {
        val renderer = PdfRenderer(pdf)
        try {
            require(index in 0 until renderer.pageCount) { "no such page" }
            val page = renderer.openPage(index)
            try {
                val scale = maxLongSide.toDouble() / max(page.width, page.height)
                val w = max(1, (page.width * scale).roundToInt())
                val h = max(1, (page.height * scale).roundToInt())
                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
                try {
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    FileOutputStream(dst.fileDescriptor).use { out ->
                        check(bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)) { "encode failed" }
                    }
                } finally {
                    bmp.recycle()
                }
                return intArrayOf(w, h)
            } finally {
                page.close()
            }
        } finally {
            renderer.close()
        }
    }
}
