package `in`.printsaathi.app.engine.print

import android.app.Activity
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintDocumentInfo
import android.print.PrintJob
import android.print.PrintJobInfo
import android.print.PrintManager
import org.json.JSONObject
import java.io.File

/**
 * The one print in flight, app-wide (PLAN §D4): survives the plugin and the activity being recreated, and is
 * persisted (state/print.json) so its outcome is checked again after the app was killed.
 */
object PrintFlow {
    private val ID = Regex("^[A-Za-z0-9-]{1,64}$")
    private val HASH = Regex("^[0-9a-f]{16}$")

    /** A4 portrait in mils, as Android's MediaSize.ISO_A4 reports it. */
    private val A4_MILS = 8268 to 11693

    @Volatile private var adapterAlive = false
    @Volatile private var job: PrintJob? = null

    /** The paper of the test page's final layout, kept until its print screen closes (calibration). */
    @Volatile private var testPaper: Pair<Pair<Int, Int>, Margins>? = null

    /** The size the 4×6 test page was made at, and what this run saved (re-review N3/N4). */
    @Volatile private var testPageMils: Pair<Int, Int>? = null
    @Volatile private var testOutcome: JSONObject? = null

    /** Test prints use fixed ids that no customer job can have (job ids are UUIDs, plan hashes hex). */
    private const val TEST_JOB_ID = "test"
    private const val TEST_HASH = "0000000000000000"

    private fun store(ctx: Context) = PrintRecordStore(ctx.noBackupFilesDir)

    /** Opens Android's print screen for jobs/<jobId>/out/<planHash>/print.pdf. Returns started, busy, noFile or failed. */
    @Synchronized
    fun start(
        activity: Activity,
        jobId: String,
        planHash: String,
        pages: Int,
        photo: Boolean,
        monochrome: Boolean,
        whenClosed: () -> Unit,
        part: Int = 0,
        parts: Int = 1,
        partOf: String = "",
        /** The shop printer's 4×6-class photo paper the plan was made for (passport sheets); null = A4. */
        photoMils: Pair<Int, Int>? = null,
    ): String {
        val ctx = activity.applicationContext
        if (status(ctx).optString("state") == "inDialog") return "busy"
        if (!ID.matches(jobId) || !HASH.matches(planHash) || pages < 1 || jobId == TEST_JOB_ID) return "noFile"
        val pdf = File(ctx.noBackupFilesDir, "jobs/$jobId/out/$planHash/print.pdf")
        if (!pdf.isFile) return "noFile"
        if (parts < 1 || part !in 0 until parts) return "noFile"
        if (photoMils != null && !isPhotoClass(photoMils)) return "noFile"
        // Android preselects a paper only when its size matches to the mil: ask for the printer's own photo paper.
        val (mils, media, label) = if (photoMils != null) {
            Triple(photoMils, PrintAttributes.MediaSize("PrintSaathi4x6", "4x6", photoMils.first, photoMils.second), "4x6")
        } else {
            Triple(A4_MILS, PrintAttributes.MediaSize.ISO_A4, "A4")
        }
        return open(
            activity, pdf, PrintKind.JOB, jobId, planHash, mils, media, label, pages, photo,
            monochrome, whenClosed, part, parts, if (HASH.matches(partOf)) partOf else "",
        )
    }

    /**
     * Prints the shop test page (PLAN §D4): A4 (a 50 mm square and passport boxes, measured with a ruler) or 4×6 photo
     * paper. The final layout's paper and the printer's margins are remembered when its print screen closes, unless
     * it was only saved as a file. Returns started, busy or failed.
     */
    @Synchronized
    fun startTest(activity: Activity, kind: PrintKind, whenClosed: () -> Unit): String {
        val ctx = activity.applicationContext
        if (!kind.isTest) return "failed"
        if (status(ctx).optString("state") == "inDialog") return "busy"
        val photo = kind == PrintKind.TEST_PHOTO
        // Photo paper: the size this printer offered last time if known (Android preselects only an exact match), and
        // the page is made at that size (gate m3: a 4x6 in page on 10x15 cm paper would be shrunk to 98 %).
        val photoMils = PaperCalibrationStore(ctx.noBackupFilesDir).load()?.photoMils ?: TestPages.Paper.PHOTO_4X6.mils
        val pdf = File(ctx.noBackupFilesDir, "state/testpage.pdf").apply { parentFile?.mkdirs() }
        try {
            if (photo) TestPages.write(pdf, TestPages.Paper.PHOTO_4X6, 1, photoMils) else TestPages.write(pdf, TestPages.Paper.A4, 1)
        } catch (e: java.io.IOException) {
            return "failed"
        }
        val (mils, media, label) = if (photo) {
            Triple(photoMils, PrintAttributes.MediaSize("PrintSaathi4x6", "4x6", photoMils.first, photoMils.second), "4x6")
        } else {
            Triple(A4_MILS, PrintAttributes.MediaSize.ISO_A4, "A4")
        }
        testPaper = null
        testOutcome = null
        testPageMils = if (photo) photoMils else null
        return open(activity, pdf, kind, TEST_JOB_ID, TEST_HASH, mils, media, label, 1, false, false, whenClosed)
    }

    private fun open(
        activity: Activity,
        pdf: File,
        kind: PrintKind,
        jobId: String,
        planHash: String,
        plannedMils: Pair<Int, Int>,
        media: PrintAttributes.MediaSize,
        paperLabel: String,
        pages: Int,
        photo: Boolean,
        monochrome: Boolean,
        whenClosed: () -> Unit,
        part: Int = 0,
        parts: Int = 1,
        partOf: String = "",
    ): String {
        val ctx = activity.applicationContext
        val now = System.currentTimeMillis()
        val record = PrintRecord(
            jobId, planHash, "PrintSaathi ${now % 1_000_000}", now, finished = false, wrongPaper = false, kind = kind,
            part = part, parts = parts, partOf = partOf,
        )
        val store = store(ctx)
        store.save(record)
        val adapter = PdfPrintAdapter(
            pdf, plannedMils, paperLabel, pages,
            if (photo) PrintDocumentInfo.CONTENT_TYPE_PHOTO else PrintDocumentInfo.CONTENT_TYPE_DOCUMENT,
            File(ctx.noBackupFilesDir, "state/warning.pdf"),
            object : PdfPrintAdapter.Events {
                override fun onFinalLayout(wrongPaper: Boolean) {
                    store.load()?.takeIf { it.label == record.label }?.let { store.save(it.copy(wrongPaper = wrongPaper)) }
                }

                override fun onFinalPaper(selectedMils: Pair<Int, Int>, margins: Margins) {
                    if (kind.isTest) testPaper = selectedMils to margins
                }

                override fun onFinished() {
                    store.load()?.takeIf { it.label == record.label }
                        ?.let { store.save(it.copy(finished = true, closedAt = System.currentTimeMillis())) }
                    adapterAlive = false
                    whenClosed()
                }
            },
        )
        val attrs = PrintAttributes.Builder()
            .setMediaSize(media)
            // Black & white asks the printer for monochrome too (the data is grey already, PLAN §D4).
            .setColorMode(if (monochrome) PrintAttributes.COLOR_MODE_MONOCHROME else PrintAttributes.COLOR_MODE_COLOR)
            .build()
        adapterAlive = true
        job = try {
            (activity.getSystemService(Context.PRINT_SERVICE) as PrintManager).print(record.label, adapter, attrs)
        } catch (e: RuntimeException) {
            null
        }
        if (job == null) {
            // The print screen never opened: nothing is in flight (gate review #9: PRINT must not stay "busy").
            adapterAlive = false
            store.clear()
            return "failed"
        }
        return "started"
    }

    /** {state: none | inDialog | checking | sent | printing | blocked | savedAsFile | nothingPrinted | wrongPaper | interrupted | failed | unknown, jobId, planHash}. */
    fun status(ctx: Context): JSONObject {
        val r = store(ctx).load() ?: return JSONObject().put("state", "none")
        val info = findJob(ctx, r.label)
        val result = classify(
            PrintObservation(
                r.finished, r.wrongPaper, info?.let { JobState.of(it.state) },
                PrintSpike.isSaveAsPdf(info?.printerId?.toString()), adapterAlive,
                // A clock set backwards must not mean "still checking" for ever (gate re-review N4).
                if (r.finished) (System.currentTimeMillis() - r.closedAt).let { if (it < 0) Long.MAX_VALUE else it } else 0,
            ),
        )
        // The printer took the test page: only now does its paper count as the shop printer's (gate m1).
        if (r.kind.isTest && (result == PrintResult.SENT || result == PrintResult.PRINTING)) rememberTestPaper(ctx, r.label)
        return JSONObject().put("state", result.wireName).put("jobId", r.jobId).put("planHash", r.planHash)
            .put("kind", r.kind.wireName).put("part", r.part).put("parts", r.parts).put("partOf", r.partOf)
            .apply { if (r.kind.isTest) testOutcome?.let { put("paperSaved", it.optBoolean("paperSaved")).put("remeasure", it.optBoolean("remeasure")) } }
    }

    /** The shop printer's paper from the test page; never from "Save as PDF", which is not a printer. */
    private fun rememberTestPaper(ctx: Context, label: String) {
        val (mils, margins) = testPaper ?: return
        testPaper = null
        val printer = findJob(ctx, label)?.printerId ?: return
        if (PrintSpike.isSaveAsPdf(printer.toString())) return
        val store = PaperCalibrationStore(ctx.noBackupFilesDir)
        store.record(printer.localId, mils, margins)
        // This run's outcome: the photo paper was saved now; and if the printer's size differs from the size the page
        // was made at (first run on 10×15 cm paper), the page was scaled, so it must be printed once more to measure.
        val saved = store.load()?.photoMils
        val photo = isPhotoClass(mils) && saved != null
        testOutcome = JSONObject().put("paperSaved", photo).put("remeasure", photo && saved != testPageMils)
    }

    /**
     * What the test pages learnt about the shop printer: {printer, photoPaper: {wMils, hMils, edgeMm} | null}, or {}.
     * [edgeMm]: the blank edge passport sheets keep: the printer's largest margin, at least 3 mm (PLAN §G0).
     */
    fun paperSetup(ctx: Context): JSONObject {
        val c = PaperCalibrationStore(ctx.noBackupFilesDir).load() ?: return JSONObject()
        val edgeMm = c.photoMargins?.let { m -> maxOf(m.left, m.top, m.right, m.bottom) * 0.0254 }?.coerceAtLeast(3.0) ?: 4.0
        val a4EdgeMm = c.a4Margins?.let { m -> maxOf(m.left, m.top, m.right, m.bottom) * 0.0254 }?.coerceAtLeast(3.0)
        return JSONObject().put("printer", c.printer)
            .apply { if (a4EdgeMm != null) put("a4EdgeMm", a4EdgeMm) }
            .put(
                "photoPaper",
                c.photoMils?.let { JSONObject().put("wMils", it.first).put("hMils", it.second).put("edgeMm", edgeMm) } ?: JSONObject.NULL,
            )
    }

    /** After the Result screen: forget the print and delete its file (generated files go right after printing, §E). */
    @Synchronized
    fun clear(ctx: Context) {
        val r = store(ctx).load() ?: return
        if (status(ctx).optString("state") == "inDialog") return
        store(ctx).clear()
        if (r.kind.isTest) {
            File(ctx.noBackupFilesDir, "state/testpage.pdf").delete()
        } else if (ID.matches(r.jobId) && HASH.matches(r.planHash)) {
            File(ctx.noBackupFilesDir, "jobs/${r.jobId}/out/${r.planHash}").deleteRecursively()
        }
    }

    /** The plan hash whose print file Android's print screen may still read: it must not be deleted. */
    fun protectedHash(ctx: Context): String? =
        if (adapterAlive) store(ctx).load()?.takeIf { !it.kind.isTest }?.planHash else null

    private fun findJob(ctx: Context, label: String): PrintJobInfo? {
        job?.info?.takeIf { it.label == label }?.let { return it }
        val pm = ctx.getSystemService(Context.PRINT_SERVICE) as PrintManager
        return pm.printJobs.map { it.info }.firstOrNull { it.label == label }
    }
}
