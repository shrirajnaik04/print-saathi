package `in`.printsaathi.app.engine.print

import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Hands a finished print.pdf to Android's print system with the no-dead-end paper guard (PLAN §D4): a wrong paper
 * during a preview layout shows a one-page warning instead of failing (a failed layout locks the dialog's options);
 * only the final layout fails, so nothing prints on the wrong paper. [events] are told about the final layout and
 * about the dialog closing, so the outcome survives in the persisted print record.
 */
class PdfPrintAdapter(
    private val pdf: File,
    private val plannedMils: Pair<Int, Int>,
    private val paperLabel: String,
    private val pageCount: Int,
    private val contentType: Int,
    private val warningFile: File,
    private val events: Events,
) : PrintDocumentAdapter() {
    interface Events {
        /** A final (non-preview) layout happened; [wrongPaper] = it was refused. */
        fun onFinalLayout(wrongPaper: Boolean)

        /** The paper and the printer's smallest margins of a final layout (test page calibration, PLAN §D4). */
        fun onFinalPaper(selectedMils: Pair<Int, Int>, margins: Margins) {}

        fun onFinished()
    }

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
        val matches = media != null && paperMatches(plannedMils, selected, media.isPortrait)
        when (layoutDecision(preview, matches)) {
            LayoutDecision.FAIL -> {
                events.onFinalLayout(wrongPaper = true)
                callback.onLayoutFailed(PaperMessages.fail(paperLabel))
            }
            LayoutDecision.WARNING_PAGE -> {
                // A service that reports no paper size still gets a readable (A4) warning page, never a 0x0 page.
                val warnMils = if (selected.first > 0 && selected.second > 0) selected else TestPages.Paper.A4.mils
                try {
                    TestPages.writeWarning(warningFile, warnMils, paperLabel)
                } catch (e: java.io.IOException) {
                    callback.onLayoutFailed(PaperMessages.fail(paperLabel))
                    return
                }
                writeWarning = true
                callback.onLayoutFinished(info(1), true)
            }
            LayoutDecision.REAL_DOCUMENT -> {
                if (!preview) {
                    events.onFinalLayout(wrongPaper = false)
                    newAttributes.minMargins?.let { m ->
                        events.onFinalPaper(selected, Margins(m.leftMils, m.topMils, m.rightMils, m.bottomMils))
                    }
                }
                val changed = writeWarning
                writeWarning = false
                callback.onLayoutFinished(info(pageCount), changed || oldAttributes != newAttributes)
            }
        }
    }

    // The name is what Save as PDF suggests as a file name: never the customer's.
    private fun info(pages: Int) = PrintDocumentInfo.Builder("PrintSaathi.pdf")
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
        io.shutdown()
        events.onFinished()
    }
}
