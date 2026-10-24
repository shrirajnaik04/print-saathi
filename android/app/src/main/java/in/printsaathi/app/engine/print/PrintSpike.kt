package `in`.printsaathi.app.engine.print

import android.app.Activity
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintDocumentInfo
import android.print.PrintJob
import android.print.PrintJobInfo
import android.print.PrintManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * App-level (survives the plugin instance) record of the in-flight spike print (PLAN §D4 lifecycle safety).
 * One print at a time.
 */
object PrintSpike {
    class Report(val scenario: String) {
        /** Appended on the main thread (onLayout), read on the plugin thread: always synchronized on itself. */
        val layouts: MutableList<JSONObject> = java.util.Collections.synchronizedList(mutableListOf())
        @Volatile var finished = false
        var job: PrintJob? = null
    }

    @Volatile private var current: Report? = null
    @Volatile private var reportFile: File? = null

    fun start(activity: Activity, paper: TestPages.Paper, sheets: Int, photo: Boolean, monochrome: Boolean): String {
        current?.let { if (!it.finished) return "busy" }
        val dir = File(activity.noBackupFilesDir, "spike").apply { mkdirs() }
        reportFile = File(dir, "last-report.json")
        val pdf = File(dir, "test-${paper.name}-$sheets.pdf")
        TestPages.write(pdf, paper, sheets)
        val report = Report("${paper.name} x$sheets ${if (photo) "PHOTO" else "DOCUMENT"} ${if (monochrome) "MONO" else "COLOUR"}")
        val attrs = PrintAttributes.Builder()
            .setMediaSize(if (paper == TestPages.Paper.A4) PrintAttributes.MediaSize.ISO_A4 else PrintAttributes.MediaSize.NA_INDEX_4X6)
            .setColorMode(if (monochrome) PrintAttributes.COLOR_MODE_MONOCHROME else PrintAttributes.COLOR_MODE_COLOR)
            .build()
        val adapter = SpikePrintAdapter(
            pdf, paper, sheets,
            if (photo) PrintDocumentInfo.CONTENT_TYPE_PHOTO else PrintDocumentInfo.CONTENT_TYPE_DOCUMENT,
            File(dir, "warning.pdf"), report,
        )
        val pm = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
        current = report
        report.job = pm.print("PrintSaathi test", adapter, attrs)
        return "started"
    }

    /** Writes the report where adb (run-as) can read it; spike data only, no customer content. */
    @Synchronized
    fun persist(): JSONObject {
        val json = report()
        reportFile?.let { f ->
            val tmp = File(f.parentFile, "last-report.json.part")
            tmp.writeText(json.toString(2))
            tmp.renameTo(f)
        }
        return json
    }

    fun report(): JSONObject {
        val r = current ?: return JSONObject().put("scenario", JSONObject.NULL)
        val info = r.job?.info
        val printer = info?.printerId
        return JSONObject().apply {
            put("scenario", r.scenario)
            put("finished", r.finished)
            put("layouts", JSONArray(synchronized(r.layouts) { r.layouts.toList() }))
            put("jobState", info?.state?.let(::stateName))
            // PrinterId.getServiceName() is hidden API; its public toString() carries the service component.
            put("printerId", printer?.toString())
            put("printerLocalId", printer?.localId)
            put("savedAsPdf", isSaveAsPdf(printer?.toString()))
            put("finalMediaMils", info?.attributes?.mediaSize?.let { "${it.widthMils}x${it.heightMils}" })
            put("finalColorMode", info?.attributes?.colorMode)
            put("copies", info?.copies)
        }
    }

    /** Android's built-in "Save as PDF" destination belongs to the print spooler itself (AOSP PrintActivity). */
    fun isSaveAsPdf(printerIdText: String?): Boolean = printerIdText?.contains("com.android.printspooler") == true

    private fun stateName(s: Int) = when (s) {
        PrintJobInfo.STATE_CREATED -> "created"
        PrintJobInfo.STATE_QUEUED -> "queued"
        PrintJobInfo.STATE_STARTED -> "started"
        PrintJobInfo.STATE_BLOCKED -> "blocked"
        PrintJobInfo.STATE_COMPLETED -> "completed"
        PrintJobInfo.STATE_FAILED -> "failed"
        PrintJobInfo.STATE_CANCELED -> "cancelled"
        else -> "unknown($s)"
    }
}
