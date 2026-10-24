package `in`.printsaathi.app.engine.isolated

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.LoadParams
import android.graphics.pdf.PdfRenderer
import android.graphics.pdf.PdfRendererPreV
import android.graphics.pdf.RenderParams
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.ext.SdkExtensions
import androidx.annotation.RequiresApi
import androidx.annotation.RequiresExtension
import `in`.printsaathi.app.engine.PdfUnlockTier
import `in`.printsaathi.app.engine.pdfUnlockTier
import java.io.IOException

/**
 * Runs INSIDE the isolated engine (PLAN §G5). Opens a customer PDF with the strongest built-in engine this
 * phone has, then renders page 1 small onto white to prove the pages are really readable.
 * Returns {pageCount, firstPageInkFound(1/0)} or {code}: -101 password required/wrong, -102 unsupported,
 * -103 damaged. These never overlap EngineErrors (-1..-3), so an engine crash can't read as "needs a password".
 * The password is used only in memory and never logged.
 */
object PdfOpen {
    const val PASSWORD_REQUIRED = -101
    const val UNSUPPORTED = -102
    const val DAMAGED = -103

    fun tier(): PdfUnlockTier = pdfUnlockTier(
        Build.VERSION.SDK_INT,
        if (Build.VERSION.SDK_INT >= 30) SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) else 0,
    )

    @SuppressLint("NewApi") // each branch is gated by tier(), which checks the API level / extension first
    fun open(pdf: ParcelFileDescriptor, password: String): IntArray = try {
        when (tier()) {
            PdfUnlockTier.NATIVE_35 -> open35(pdf, password)
            PdfUnlockTier.PRE_V -> openPreV(pdf, password)
            PdfUnlockTier.NONE -> openClassic(pdf)
        }
    } catch (e: SecurityException) {
        intArrayOf(PASSWORD_REQUIRED) // needs a password, or the given one is wrong
    } catch (e: UnsupportedOperationException) {
        intArrayOf(UNSUPPORTED)
    } catch (e: IOException) {
        intArrayOf(DAMAGED)
    } catch (e: IllegalArgumentException) {
        intArrayOf(DAMAGED)
    }

    @RequiresApi(35)
    private fun open35(pdf: ParcelFileDescriptor, password: String): IntArray {
        val r = PdfRenderer(pdf, LoadParams.Builder().setPassword(password).build())
        try {
            val page = r.openPage(0)
            try {
                return intArrayOf(r.pageCount, inkFound(page.width, page.height) { b -> page.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY) })
            } finally {
                page.close()
            }
        } finally {
            r.close()
        }
    }

    @RequiresExtension(extension = Build.VERSION_CODES.S, version = 13)
    private fun openPreV(pdf: ParcelFileDescriptor, password: String): IntArray {
        val r = PdfRendererPreV(pdf, LoadParams.Builder().setPassword(password).build())
        try {
            val page = r.openPage(0)
            try {
                val params = RenderParams.Builder(RenderParams.RENDER_MODE_FOR_DISPLAY).build()
                return intArrayOf(r.pageCount, inkFound(page.width, page.height) { b -> page.render(b, null, null, params) })
            } finally {
                page.close()
            }
        } finally {
            r.close()
        }
    }

    /** No password support: an encrypted file throws SecurityException, mapped to PASSWORD_REQUIRED. */
    private fun openClassic(pdf: ParcelFileDescriptor): IntArray {
        val r = PdfRenderer(pdf)
        try {
            val page = r.openPage(0)
            try {
                return intArrayOf(r.pageCount, inkFound(page.width, page.height) { b -> page.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY) })
            } finally {
                page.close()
            }
        } finally {
            r.close()
        }
    }

    /** Renders at half size onto WHITE (PDF pages are transparent; PLAN §F2) and looks for dark ink. */
    private fun inkFound(widthPt: Int, heightPt: Int, render: (Bitmap) -> Unit): Int {
        val bmp = Bitmap.createBitmap(maxOf(1, widthPt / 2), maxOf(1, heightPt / 2), Bitmap.Config.ARGB_8888)
        try {
            bmp.eraseColor(Color.WHITE)
            render(bmp)
            val px = IntArray(bmp.width * bmp.height)
            bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
            return if (px.any { Color.red(it) < 40 && Color.green(it) < 40 && Color.blue(it) < 40 }) 1 else 0
        } finally {
            bmp.recycle()
        }
    }
}
