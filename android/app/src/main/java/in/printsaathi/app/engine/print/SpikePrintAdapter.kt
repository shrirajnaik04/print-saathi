package `in`.printsaathi.app.engine.print

import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Phase 0 spike (b): streams a prepared PDF to Android's print system and applies the no-dead-end paper guard
 * (PLAN §D4). Records every onLayout call so the real print service's behaviour can be studied.
 */
class SpikePrintAdapter(
    private val pdf: File,
    private val paper: TestPages.Paper,
    private val pageCount: Int,
    private val contentType: Int,
    private val warningFile: File,
    private val report: PrintSpike.Report,
) : PrintDocumentAdapter() {
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var writeWarning = false

    override fun onLayout(
        oldAttributes: PrintAttributes?,
        newAttributes: PrintAttributes,
        cancellationSignal: CancellationSignal,
        callback: LayoutResultCallback,
        extras: Bundle?,
    ) {
        val media = newAttributes.mediaSize
        val preview = extras?.getBoolean(EXTRA_PRINT_PREVIEW, false) ?: false
        val selected = (media?.widthMils ?: 0) to (media?.heightMils ?: 0)
        val matches = media != null && paperMatches(paper.mils, selected, media.isPortrait)
        val decision = layoutDecision(preview, matches)
        report.layouts += JSONObject().apply {
            put("preview", preview)
            put("mediaId", media?.id)
            put("mediaMils", "${selected.first}x${selected.second}")
            put("portrait", media?.isPortrait)
            put("minMarginsMils", newAttributes.minMargins?.let { "${it.leftMils},${it.topMils},${it.rightMils},${it.bottomMils}" })
            put("colorMode", newAttributes.colorMode)
            put("decision", decision.name)
        }
        when (decision) {
            LayoutDecision.FAIL -> callback.onLayoutFailed(PaperMessages.fail(paper.label))
            LayoutDecision.WARNING_PAGE -> {
                // A service that reports no paper size still gets a readable (A4) warning page, never a 0x0 page.
                val warnMils = if (selected.first > 0 && selected.second > 0) selected else TestPages.Paper.A4.mils
                try {
                    TestPages.writeWarning(warningFile, warnMils, paper.label)
                } catch (e: java.io.IOException) {
                    // Storage full etc.: fail this layout instead of crashing the app on the main thread.
                    callback.onLayoutFailed(PaperMessages.fail(paper.label))
                    return
                }
                writeWarning = true
                callback.onLayoutFinished(info(1), true)
            }
            LayoutDecision.REAL_DOCUMENT -> {
                val changed = writeWarning
                writeWarning = false
                callback.onLayoutFinished(info(pageCount), changed || oldAttributes != newAttributes)
            }
        }
    }

    private fun info(pages: Int) = PrintDocumentInfo.Builder("PrintSaathi-test")
        .setContentType(contentType)
        .setPageCount(pages)
        .build()

    override fun onWrite(
        pages: Array<out PageRange>,
        destination: ParcelFileDescriptor,
        cancellationSignal: CancellationSignal,
        callback: WriteResultCallback,
    ) {
        val source = if (writeWarning) warningFile else pdf
        io.execute {
            try {
                source.inputStream().use { input ->
                    FileOutputStream(destination.fileDescriptor).use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            if (cancellationSignal.isCanceled) {
                                callback.onWriteCancelled()
                                return@execute
                            }
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                        }
                    }
                }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
            } catch (e: Exception) {
                callback.onWriteFailed(e.javaClass.simpleName)
            }
        }
    }

    override fun onFinish() {
        report.finished = true
        io.shutdown()
        PrintSpike.persist()
    }
}
