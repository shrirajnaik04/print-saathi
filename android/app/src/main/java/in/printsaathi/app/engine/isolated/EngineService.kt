package `in`.printsaathi.app.engine.isolated

import android.app.Service
import android.content.Intent
import android.os.Debug
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.os.Process
import `in`.printsaathi.app.BuildConfig
import app.printsaathi.engine.IEngine
import java.io.FileInputStream

/**
 * The isolated engine (PLAN §B): android:isolatedProcess="true", no permissions, no file system, no
 * network. Every customer file is parsed here, so a malicious or broken file can at worst kill this
 * process — never the app.
 */
open class EngineService : Service() {
    /** One heavy task at a time (PLAN §F2): concurrent binder calls would multiply peak memory. */
    private val heavy = Any()

    /**
     * Every failure is returned as [-code] (EngineErrors), so the app never sees a raw exception, an empty
     * reply or a message that could contain a path. After an OutOfMemoryError this process ends itself
     * once the reply is sent, because its heap can no longer be trusted.
     */
    /**
     * Like engineCall, with a time limit: a customer PDF that hangs the built-in renderer (a decompression bomb, a
     * broken file) must not hold the engine for ever. Past [limitMs] the engine ends itself; the app sees an engine
     * death, which the poison markers turn into "damaged" on the second time (PLAN §D5).
     */
    // The time limit starts once this call holds the engine (inside engineCall's lock): waiting behind another call
    // never counts against this file (review I4).
    private fun limitedCall(limitMs: Long, block: () -> IntArray): IntArray =
        engineCall { Watchdog.run(limitMs, onLate = { Process.killProcess(Process.myPid()) }, block) }

    private fun engineCall(block: () -> IntArray): IntArray = try {
        synchronized(heavy) { block() }
    } catch (e: OutOfMemoryError) {
        Thread { Thread.sleep(200); Process.killProcess(Process.myPid()) }.start()
        intArrayOf(-EngineErrors.OUT_OF_MEMORY)
    } catch (e: SecurityException) {
        intArrayOf(-EngineErrors.NOT_ALLOWED)
    } catch (e: TooBigForThisPhone) {
        intArrayOf(-EngineErrors.TOO_BIG)
    } catch (e: BadRequest) {
        intArrayOf(-EngineErrors.BAD_REQUEST)
    } catch (t: Throwable) {
        intArrayOf(-EngineErrors.FILE_UNREADABLE)
    }

    private val binder = object : IEngine.Stub() {
        override fun decodeToJpeg(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxLongSidePx: Int, quality: Int): IntArray =
            engineCall {
                // Lossless raw output (quality -1) is a measurement tool only.
                if (quality < 0 && !BuildConfig.DEBUG) throw SecurityException("not available")
                src.use { s -> dst.use { d -> Decode.toJpeg(s, d, maxLongSidePx, quality) } }
            }

        override fun decodeToGreyJpeg(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxLongSidePx: Int, quality: Int): IntArray =
            engineCall { src.use { s -> dst.use { d -> Decode.toJpeg(s, d, maxLongSidePx, quality.coerceIn(1, 100), style = Styles.BW) } } }

        override fun pdfFacts(pdf: ParcelFileDescriptor, password: String): IntArray =
            limitedCall(PDF_LIMIT_MS) { pdf.use { CustomerPdf.facts(it, password) } }

        override fun renderCustomerPage(
            pdf: ParcelFileDescriptor,
            password: String,
            page: Int,
            dst: ParcelFileDescriptor,
            maxLongSidePx: Int,
            quality: Int,
            mode: Int,
        ): IntArray = limitedCall(PDF_LIMIT_MS) {
            require(mode in 0..2) { "bad mode" }
            pdf.use { p -> dst.use { d -> CustomerPdf.renderPage(p, password, page, d, maxLongSidePx, quality.coerceIn(1, 100), mode) } }
        }

        override fun analysisGrey(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxLongSidePx: Int): IntArray =
            engineCall {
                if (maxLongSidePx !in 16..1024) throw BadRequest("size")
                src.use { s -> dst.use { d -> Decode.toJpeg(s, d, maxLongSidePx, Decode.RAW_GREY) } }
            }

        override fun decodeStyled(
            src: ParcelFileDescriptor,
            dst: ParcelFileDescriptor,
            maxLongSidePx: Int,
            quality: Int,
            style: Int,
            x: Double,
            y: Double,
            w: Double,
            h: Double,
        ): IntArray = engineCall {
            if (style !in Styles.ORIGINAL..Styles.CLEAN) throw BadRequest("style")
            // The same area check as decodeCropToJpeg (gate M5): inside the photo, not empty.
            if (!(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.0001 && y + h <= 1.0001)) throw BadRequest("area")
            val full = x == 0.0 && y == 0.0 && w == 1.0 && h == 1.0
            src.use { s ->
                dst.use { d ->
                    // The whole photo in Original: a plain JPEG may go into the print as it is (owner, 2026-10-23).
                    Decode.toJpeg(
                        s,
                        d,
                        maxLongSidePx,
                        quality.coerceIn(1, 100),
                        style = style,
                        crop = if (full) null else doubleArrayOf(x, y, w, h),
                        asIs = full && style == Styles.ORIGINAL,
                    )
                }
            }
        }

        override fun renderCustomerPageStyled(
            pdf: ParcelFileDescriptor,
            password: String,
            page: Int,
            dst: ParcelFileDescriptor,
            maxLongSidePx: Int,
            quality: Int,
            mode: Int,
            style: Int,
        ): IntArray = limitedCall(PDF_LIMIT_MS) {
            if (mode !in 0..3 || style !in Styles.ORIGINAL..Styles.CLEAN) throw BadRequest("mode or style")
            pdf.use { p -> dst.use { d -> CustomerPdf.renderPage(p, password, page, d, maxLongSidePx, quality.coerceIn(1, 100), mode, style) } }
        }

        override fun decodeCropToJpeg(
            src: ParcelFileDescriptor,
            dst: ParcelFileDescriptor,
            maxLongSidePx: Int,
            quality: Int,
            grey: Boolean,
            x: Double,
            y: Double,
            w: Double,
            h: Double,
        ): IntArray = engineCall {
            require(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9) { "bad crop" }
            src.use { s -> dst.use { d -> Decode.toJpeg(s, d, maxLongSidePx, quality.coerceIn(1, 100), style = if (grey) Styles.BW else Styles.ORIGINAL, crop = doubleArrayOf(x, y, w, h)) } }
        }

        override fun decodeOversampled(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxLongSidePx: Int, quality: Int, oversample: Int): IntArray =
            engineCall {
                if (!BuildConfig.DEBUG) throw SecurityException("not available")
                src.use { s -> dst.use { d -> Decode.toJpeg(s, d, maxLongSidePx, quality, oversample, useStrips = false) } }
            }

        override fun renderPdfPage(pdf: ParcelFileDescriptor, page: Int, dst: ParcelFileDescriptor, maxLongSidePx: Int): IntArray =
            engineCall { pdf.use { p -> dst.use { d -> PdfPages.renderPage(p, page, d, maxLongSidePx.coerceIn(64, 4096), 80) } } }

        override fun openPdf(pdf: ParcelFileDescriptor, password: String): IntArray =
            engineCall { pdf.use { PdfOpen.open(it, password) } }

        override fun detectCards(src: ParcelFileDescriptor, maxLongSidePx: Int): IntArray =
            engineCall { src.use { Cards.detect(it, maxLongSidePx) } }

        override fun faceTurns(src: ParcelFileDescriptor, maxLongSidePx: Int): IntArray =
            engineCall { src.use { Cards.faceTurns(it, maxLongSidePx) } }

        override fun faceCount(src: ParcelFileDescriptor, maxLongSidePx: Int): Int =
            engineCall { src.use { intArrayOf(Cards.faces(it, maxLongSidePx)) } }[0]

        override fun decodeWarped(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, outW: Int, outH: Int, quality: Int, style: Int, quad: DoubleArray): IntArray =
            engineCall {
                src.use { s ->
                    dst.use { d ->
                        checkCard(outW, outH, style, quad)
                        Cards.warped(s, d, outW, outH, quality.coerceIn(1, 100), style, quad)
                    }
                }
            }

        override fun detectCardsInPage(pdf: ParcelFileDescriptor, password: String, page: Int): IntArray =
            limitedCall(PDF_LIMIT_MS) { pdf.use { Cards.detectInPage(it, password, page) } }

        override fun textToPdf(txt: ParcelFileDescriptor, dst: ParcelFileDescriptor, sizeTenthsPt: Int): IntArray =
            limitedCall(PDF_LIMIT_MS) { txt.use { t -> dst.use { d -> TextPdf.write(t, d, sizeTenthsPt) } } }

        override fun detectPage(src: ParcelFileDescriptor, maxLongSidePx: Int): IntArray =
            engineCall { src.use { Cards.detectPage(it, maxLongSidePx) } }

        override fun officeToPdf(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxPages: Int): IntArray =
            limitedCall(PDF_LIMIT_MS) {
                src.use { s -> dst.use { d -> `in`.printsaathi.app.engine.office.OfficePdf.write(s, d, maxPages.coerceIn(1, 500)) } }
            }

        override fun textFileToPdf(src: ParcelFileDescriptor, txt: ParcelFileDescriptor, dst: ParcelFileDescriptor, sizeTenthsPt: Int): IntArray =
            limitedCall(PDF_LIMIT_MS) {
                src.use { s -> txt.use { t -> dst.use { d -> `in`.printsaathi.app.engine.office.OfficePdf.textFile(s, t, d, sizeTenthsPt) } } }
            }

        override fun renderPageWarped(
            pdf: ParcelFileDescriptor,
            password: String,
            page: Int,
            dst: ParcelFileDescriptor,
            outW: Int,
            outH: Int,
            quality: Int,
            style: Int,
            quad: DoubleArray,
        ): IntArray = limitedCall(PDF_LIMIT_MS) {
            pdf.use { p ->
                dst.use { d ->
                    checkCard(outW, outH, style, quad)
                    Cards.pageWarped(p, password, page, d, outW, outH, quality.coerceIn(1, 100), style, quad)
                }
            }
        }

        override fun pssKb(): Int = Debug.getPss().toInt()

        override fun crashForTest() {
            if (!BuildConfig.DEBUG) throw SecurityException("not available")
            Process.killProcess(Process.myPid())
        }

        override fun canReadPath(path: String): Boolean {
            if (!BuildConfig.DEBUG) throw SecurityException("not available")
            return try {
                FileInputStream(path).use { it.read() }
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    /** A card request the app should never make: refused as such, never as a damaged file (gate M6). */
    private fun checkCard(outW: Int, outH: Int, style: Int, quad: DoubleArray) {
        if (outW !in 16..6000 || outH !in 16..6000) throw BadRequest("size")
        if (style !in Styles.ORIGINAL..Styles.CLEAN) throw BadRequest("style")
        if (!QuadCheck.ok(quad)) throw BadRequest("quad")
    }

    override fun onBind(intent: Intent): IBinder = binder

    companion object {
        /** Time limit for one customer-PDF call (a page at 300 dpi takes well under a second on the test phones). */
        const val PDF_LIMIT_MS = 60_000L
    }
}
