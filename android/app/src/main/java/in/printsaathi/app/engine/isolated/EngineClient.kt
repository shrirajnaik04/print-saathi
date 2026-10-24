package `in`.printsaathi.app.engine.isolated

import android.content.ComponentName
import android.content.Context
import `in`.printsaathi.app.engine.diag.Diagnostics
import android.content.Intent
import android.content.ServiceConnection
import android.os.DeadObjectException
import android.os.IBinder
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.RemoteException
import android.os.SystemClock
import app.printsaathi.engine.IEngine
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class EngineDiedException : Exception("engine process died")

/** The engine could not be started or connected (bind refused or timed out): not the file's fault. */
class EngineUnavailableException : Exception("engine not available")

/** The engine could not open the customer file ([code]: see EngineErrors). Shown as "this file can't be opened". */
class EngineFileException(val code: Int) : Exception("engine file error $code")

/** A card the engine found (Phase 14): corners as fractions of the upright photo or page (TL, TR, BR, BL). */
/** A PDF page that needs its password before its cards can be looked for (review I1). */
class PdfLockedException : Exception("pdf locked")

/** [upsideDown]: the face on it reads only with the card turned over (Phase 14 "card orientation"). */
data class FoundCard(val corners: DoubleArray, val confidence: Double, val face: Boolean, val upsideDown: Boolean = false) {
    companion object {
        /** The engine's reply {n, (8 corners × 10000, confidence × 1000, face) × n}; a short negative reply is an error. */
        fun parse(r: IntArray): List<FoundCard> {
            if (r.isEmpty()) throw EngineFileException(EngineErrors.FILE_UNREADABLE)
            if (r.size == 1 && r[0] == PdfOpen.PASSWORD_REQUIRED) throw PdfLockedException()
            if (r.size == 1 && r[0] < 0) throw EngineFileException(if (r[0] > -100) -r[0] else EngineErrors.FILE_UNREADABLE)
            val n = r[0]
            if (n < 0 || n > 2 || r.size != 1 + 10 * n) throw EngineFileException(EngineErrors.FILE_UNREADABLE)
            return (0 until n).map { k ->
                val face = r[1 + 10 * k + 9]
                FoundCard(DoubleArray(8) { r[1 + 10 * k + it] / 10_000.0 }, r[1 + 10 * k + 8] / 1000.0, face == 1 || face == 2, face == 2)
            }
        }
    }
}

/**
 * App-side handle to the isolated engine. Opens files itself and hands over file descriptors only.
 * Blocking API: call from a background thread (binding completes on the main thread).
 */
class EngineClient(context: Context, private val service: Class<out EngineService> = EngineService::class.java) {
    private val app = context.applicationContext
    @Volatile private var engine: IEngine? = null
    private var connection: ServiceConnection? = null

    /** Wall time of the most recent bind, for spike measurements. */
    @Volatile var lastBindMs: Long = -1
        private set

    @Synchronized
    fun engine(): IEngine {
        check(Looper.myLooper() != Looper.getMainLooper()) { "EngineClient must not be used on the main thread" }
        engine?.takeIf { it.asBinder().isBinderAlive }?.let { return it }
        reset()
        val latch = CountDownLatch(1)
        // The bound binder is handed over through this reference, so a disconnect racing the wait cannot
        // turn into a null engine after the latch opens.
        val bound = AtomicReference<IEngine>()
        val t0 = SystemClock.elapsedRealtime()
        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                val e = IEngine.Stub.asInterface(binder)
                bound.set(e)
                engine = e
                latch.countDown()
            }

            override fun onServiceDisconnected(name: ComponentName) {
                engine = null
            }

            override fun onBindingDied(name: ComponentName) {
                engine = null
            }
        }
        if (!app.bindService(Intent(app, service), conn, Context.BIND_AUTO_CREATE)) {
            runCatching { app.unbindService(conn) } // Android asks for an unbind even when bindService fails
            throw EngineUnavailableException()
        }
        connection = conn
        if (!latch.await(10, TimeUnit.SECONDS)) {
            reset()
            throw EngineUnavailableException()
        }
        lastBindMs = SystemClock.elapsedRealtime() - t0
        return bound.get()
    }

    /** [grey]: Black & white, written as grey data only (R = G = B). [crop]: only that area of the upright photo. */
    fun decodeToJpeg(
        src: File,
        dst: File,
        maxLongSidePx: Int,
        quality: Int = 92,
        grey: Boolean = false,
        crop: `in`.printsaathi.app.engine.render.Crop = `in`.printsaathi.app.engine.render.Crop.FULL,
    ): Result<IntArray> =
        withFds(src, dst) { e, s, d ->
            when {
                !crop.isFull -> e.decodeCropToJpeg(s, d, maxLongSidePx, quality, grey, crop.x, crop.y, crop.w, crop.h)
                grey -> e.decodeToGreyJpeg(s, d, maxLongSidePx, quality)
                else -> e.decodeToJpeg(s, d, maxLongSidePx, quality)
            }
        }

    /** A photo (or [crop] of it) at print size in a print [style] (Styles); OCV Black writes raw 1-bit rows. */
    fun decodeStyled(
        src: File,
        dst: File,
        maxLongSidePx: Int,
        quality: Int,
        style: Int,
        crop: `in`.printsaathi.app.engine.render.Crop = `in`.printsaathi.app.engine.render.Crop.FULL,
    ): Result<IntArray> = withFds(src, dst) { e, s, d -> e.decodeStyled(s, d, maxLongSidePx, quality, style, crop.x, crop.y, crop.w, crop.h) }

    /** The photo upright at ≤ [maxLongSidePx] as raw 8-bit grey rows (smart-crop analysis, PLAN §F3). */
    fun analysisGrey(src: File, dst: File, maxLongSidePx: Int): Result<IntArray> =
        withFds(src, dst) { e, s, d -> e.analysisGrey(s, d, maxLongSidePx) }

    /** Debug builds only: the whole-image decode path (no strips), for path-by-path tests. */
    fun decodeWholeImage(src: File, dst: File, maxLongSidePx: Int, quality: Int, oversample: Int = 1): Result<IntArray> =
        withFds(src, dst) { e, s, d -> e.decodeOversampled(s, d, maxLongSidePx, quality, oversample) }

    /** Renders page [page] of the app's own print file to [dst] (preview); {width, height}. */
    fun renderPdfPage(pdf: File, page: Int, dst: File, maxLongSidePx: Int): Result<IntArray> = call { e ->
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { s ->
            ParcelFileDescriptor.open(dst, ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE).use { d ->
                e.renderPdfPage(s, page, d, maxLongSidePx)
            }
        }
    }.mapCatching { r ->
        if (r.size != 2 || r[0] <= 0) throw EngineFileException(if (r.size == 1) -r[0] else EngineErrors.FILE_UNREADABLE)
        r
    }

    /**
     * A customer PDF's facts (PLAN §G4): see IEngine.pdfFacts. A short reply is an error code (PdfOpen's, or a
     * negative EngineErrors code). The password stays in memory, for this call only.
     */
    fun pdfFacts(pdf: File, password: String): Result<IntArray> = call { e ->
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { e.pdfFacts(it, password) }
    }

    /** Page [page] of a customer PDF as a print image at [dst]; {width, height} or an EngineFileException. */
    /** [style]: a print style (Styles), or -1 for the mode's plain one (Original in colour, Black & White in grey). */
    fun renderCustomerPage(pdf: File, password: String, page: Int, dst: File, maxLongSidePx: Int, quality: Int, mode: Int, style: Int = -1): Result<IntArray> =
        call { e ->
            ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { s ->
                ParcelFileDescriptor.open(dst, ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE).use { d ->
                    if (style < 0) e.renderCustomerPage(s, password, page, d, maxLongSidePx, quality, mode)
                    else e.renderCustomerPageStyled(s, password, page, d, maxLongSidePx, quality, mode, style)
                }
            }
        }.mapCatching { r ->
            if (r.size == 1 && r[0] == -EngineErrors.OUT_OF_MEMORY) reset()
            if (r.size != 2 || r[0] <= 0) throw EngineFileException(if (r.size == 1) -r[0] else EngineErrors.FILE_UNREADABLE)
            r
        }

    /** Opens a customer PDF in the engine; see [PdfOpenResult]. Engine failure or death counts as damaged. */
    fun openPdf(pdf: File, password: String): PdfOpenResult = call { e ->
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { e.openPdf(it, password) }
    }.fold(onSuccess = { r ->
        if (r.size == 1 && r[0] == -EngineErrors.OUT_OF_MEMORY) reset() // that engine is ending itself
        PdfOpenResult.from(r)
    }, onFailure = { PdfOpenResult.Damaged })

    /** Phase 14: cards in a photo (IEngine.detectCards); an EngineFileException for a file the engine can't read. */
    fun detectCards(src: File, maxLongSidePx: Int = Cards.DETECT_PX): Result<List<FoundCard>> = call { e ->
        ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY).use { e.detectCards(it, maxLongSidePx) }
    }.mapCatching { FoundCard.parse(it) }

    /** Phase 14: card panels on a PDF page (e-Aadhaar). */
    fun detectCardsInPage(pdf: File, password: String, page: Int): Result<List<FoundCard>> = call { e ->
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { e.detectCardsInPage(it, password, page) }
    }.mapCatching { FoundCard.parse(it) }

    /** Phase 15: faces at each quarter turn clockwise (4 counts); an EngineFileException for a bad file. */
    fun faceTurns(src: File, maxLongSidePx: Int = 512): Result<IntArray> = call { e ->
        ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY).use { e.faceTurns(it, maxLongSidePx) }
    }.mapCatching { r ->
        if (r.size != 4) throw EngineFileException(if (r.size == 1 && r[0] < 0) -r[0] else EngineErrors.FILE_UNREADABLE)
        r
    }

    /** Phase 15: faces in a photo; -code on failure. */
    fun faceCount(src: File, maxLongSidePx: Int): Result<Int> = call { e ->
        ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY).use { e.faceCount(it, maxLongSidePx) }
    }

    /**
     * Phase 14: the card at [quad] straightened to [outW] × [outH] (a photo, or PDF page [pdfPage]). The reply is the
     * decode reply plus the card's width in the photo's own pixels.
     */
    fun decodeWarped(src: File, dst: File, outW: Int, outH: Int, quality: Int, style: Int, quad: DoubleArray, pdfPage: Int? = null, password: String = ""): Result<IntArray> = call { e ->
        ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY).use { s ->
            ParcelFileDescriptor.open(dst, ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE).use { d ->
                if (pdfPage == null) e.decodeWarped(s, d, outW, outH, quality, style, quad)
                else e.renderPageWarped(s, password, pdfPage, d, outW, outH, quality, style, quad)
            }
        }
    }.mapCatching { r ->
        if (r.size == 1 && r[0] == -EngineErrors.OUT_OF_MEMORY) reset()
        if (r.size == 1) throw EngineFileException(if (r[0] < 0 && r[0] > -100) -r[0] else EngineErrors.FILE_UNREADABLE)
        if (r.size != DECODE_RESULT_SIZE + 1) throw EngineFileException(EngineErrors.FILE_UNREADABLE)
        r
    }

    private fun withFds(src: File, dst: File, op: (IEngine, ParcelFileDescriptor, ParcelFileDescriptor) -> IntArray): Result<IntArray> = call {
        ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY).use { s ->
            ParcelFileDescriptor.open(dst, ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE).use { d ->
                op(it, s, d)
            }
        }
    }.mapCatching { r ->
        if (r.size == 1 && r[0] < 0) {
            if (-r[0] == EngineErrors.OUT_OF_MEMORY) reset()
            throw EngineFileException(-r[0])
        }
        // Any other short reply means the engine did not finish; never treat it as a decoded image. A photo that went in
        // as it is (Decode.PATH_AS_IS) also says its camera turn: one more number, a quarter-turn count.
        val asIs = r.size == DECODE_RESULT_SIZE + 1 && r[2] == Decode.PATH_AS_IS && r[6] in 0..3
        if (r.size != DECODE_RESULT_SIZE && !asIs) throw EngineFileException(EngineErrors.FILE_UNREADABLE)
        r
    }

    fun <T> call(block: (IEngine) -> T): Result<T> = turn {
        try {
            val e = engine()
            val r = block(e)
            // Out of memory: the engine ends itself just after replying. Keep this turn until it is gone, so the next
            // call (maybe for another file) never starts in the dying process (re-review 2, m1).
            if (r is IntArray && r.size == 1 && -r[0] == EngineErrors.OUT_OF_MEMORY) {
                runCatching { Diagnostics(app.noBackupFilesDir).log(Diagnostics.Event.ENGINE_OOM) }
                awaitGone(e)
            }
            Result.success(r)
        } catch (e: java.io.IOException) {
            // A file that cannot be opened here (e.g. deleted as the job was left) is no engine death (re-review 2, m2).
            Result.failure(EngineFileException(EngineErrors.FILE_UNREADABLE))
        } catch (e: EngineUnavailableException) {
            Result.failure(e) // a later try may work; never counted against the customer's file
        } catch (e: DeadObjectException) {
            died()
        } catch (e: RemoteException) {
            died()
        } catch (e: RuntimeException) {
            // Anything else from the binder layer: drop this connection and report a failure, never crash.
            died()
        }
    }

    /** The engine died on a file (contained: only its process); noted for the problem report. */
    private fun died(): Result<Nothing> {
        reset()
        runCatching { Diagnostics(app.noBackupFilesDir).log(Diagnostics.Event.ENGINE_DIED) }
        return Result.failure(EngineDiedException())
    }

    /** Waits (≤ 2 s) until the engine process behind [e] has ended. */
    private fun awaitGone(e: IEngine) {
        val until = SystemClock.elapsedRealtime() + 2_000
        while (e.asBinder().isBinderAlive && SystemClock.elapsedRealtime() < until) SystemClock.sleep(20)
        reset()
    }

    companion object {
        const val DECODE_RESULT_SIZE = 6

        /** One engine call at a time in the whole app, in arrival order (re-review I2). */
        @PublishedApi internal val CALLS = java.util.concurrent.locks.ReentrantLock(true)

        /**
         * Holds the app's turn at the engine for [block]: every call inside is the only one in the engine, so an engine
         * death is seen by that call alone, and a file marked "in the engine" (PoisonMarkers) is the one there. Callers
         * wrap mark → call → unmark in one turn; a call waiting meanwhile finds the dead engine and binds a new one.
         */
        inline fun <T> turn(block: () -> T): T {
            CALLS.lock()
            try {
                return block()
            } finally {
                CALLS.unlock()
            }
        }
    }

    /**
     * Drops the connection (the engine process then exits). Background threads only: on the main thread this
     * could wait behind a bind that itself needs the main thread, freezing the screen.
     */
    @Synchronized
    fun reset() {
        check(Looper.myLooper() != Looper.getMainLooper()) { "EngineClient.reset must not run on the main thread" }
        connection?.let { runCatching { app.unbindService(it) } }
        connection = null
        engine = null
    }
}
