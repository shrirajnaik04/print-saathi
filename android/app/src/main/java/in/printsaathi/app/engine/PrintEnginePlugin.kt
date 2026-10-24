package `in`.printsaathi.app.engine

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Parcelable
import android.util.Log
import android.view.WindowManager
import `in`.printsaathi.app.MainActivity
import `in`.printsaathi.app.engine.intake.DedupeWindow
import `in`.printsaathi.app.engine.intake.Importer
import `in`.printsaathi.app.engine.intake.guarded
import `in`.printsaathi.app.engine.print.PrintFlow
import `in`.printsaathi.app.engine.print.PrintServices
import `in`.printsaathi.app.engine.print.PrintResult
import `in`.printsaathi.app.engine.print.wireName
import `in`.printsaathi.app.engine.print.PrintKind
import `in`.printsaathi.app.engine.print.PrintSpike
import `in`.printsaathi.app.engine.print.TestPages
import com.getcapacitor.annotation.ActivityCallback
import androidx.activity.result.ActivityResult
import android.provider.MediaStore
import android.os.ext.SdkExtensions
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import `in`.printsaathi.app.engine.docs.Decrypted
import `in`.printsaathi.app.engine.docs.DocFacts
import `in`.printsaathi.app.engine.docs.FactsCache
import `in`.printsaathi.app.engine.docs.UnlockedCopy
import `in`.printsaathi.app.engine.isolated.CustomerPdf
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineDiedException
import `in`.printsaathi.app.engine.isolated.EngineErrors
import `in`.printsaathi.app.engine.isolated.EngineFileException
import `in`.printsaathi.app.engine.isolated.EngineUnavailableException
import `in`.printsaathi.app.engine.isolated.Styles
import `in`.printsaathi.app.engine.jobs.CrashLog
import `in`.printsaathi.app.engine.jobs.JobStore
import `in`.printsaathi.app.engine.jobs.JobMerge
import `in`.printsaathi.app.engine.jobs.JobSweeper
import `in`.printsaathi.app.engine.jobs.OpenJobs
import `in`.printsaathi.app.engine.diag.Diagnostics
import `in`.printsaathi.app.engine.screenshotsAllowed
import `in`.printsaathi.app.engine.settings.SettingsStore
import `in`.printsaathi.app.engine.jobs.Retention
import `in`.printsaathi.app.engine.jobs.PoisonMarkers
import `in`.printsaathi.app.engine.render.AnalysisGrey
import `in`.printsaathi.app.engine.render.CancelToken
import `in`.printsaathi.app.engine.render.Crop
import `in`.printsaathi.app.engine.render.EngineRenderer
import `in`.printsaathi.app.engine.render.OneBit
import `in`.printsaathi.app.engine.render.PlanInvalid
import `in`.printsaathi.app.engine.render.PlanRenderer
import `in`.printsaathi.app.engine.render.RenderItem
import `in`.printsaathi.app.engine.render.RenderOutcome
import `in`.printsaathi.app.engine.render.RenderPlan
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.UUID

/** Thin bridge: small JSON in and out, never image or PDF bytes (PLAN §B). */
@CapacitorPlugin(name = "PrintEngine")
class PrintEnginePlugin : Plugin() {
    private val importer by lazy { Importer(context) }
    private val jobs by lazy { JobStore(File(context.noBackupFilesDir, "jobs")) }
    private val poison by lazy { PoisonMarkers(context.noBackupFilesDir) }
    private val crashLog by lazy { CrashLog(context.noBackupFilesDir) }
    private val diag by lazy { Diagnostics(context.noBackupFilesDir) }

    /** On every start: intakes cut off by process death are marked interrupted and their half files removed. */
    override fun load() {
        Background.io.execute { diag.log(Diagnostics.Event.START, "sdk" to Build.VERSION.SDK_INT) }
        // Recovery runs on the intake thread itself, so it can never mistake a share being received now for one cut off.
        Background.intake.execute {
            guarded({ Log.w(Importer.TAG, "start-up recovery failed: $it") }) { importer.recoverInterrupted() }
        }
        io.execute {
            guarded({ Log.w(Importer.TAG, "start-up recovery failed: $it") }) {
                poison.recover() // a file that took the whole app down twice is never retried
                // "Allow screenshots for 15 minutes" survives a restart within its window (PLAN §D6).
                screenshotsAllowedUntilMs = SettingsStore(context.noBackupFilesDir).screenshotsUntil()
                // Unlocked PDF copies never survive a restart: the password is asked again (PLAN §J5, §G5).
                File(context.noBackupFilesDir, "jobs").listFiles()?.forEach { j ->
                    UnlockedCopy(File(j, "work")).deleteAll()
                    File(j, "work/page-thumbs").deleteRecursively()
                    // ...and print files made with a password (review I5): no print can be in progress after a restart.
                    if (Decrypted.isMarked(j)) Decrypted.forget(j, keepOut = PrintFlow.protectedHash(context))
                }
            }
        }
        // The first sweep waits until the web app says which jobs are open (setActiveJobs), so a job restored
        // onto the screen after the process was killed is never deleted under it.
        Retention.schedule(context)
    }

    /** Coming back to the app is also when old customer files are deleted (PLAN §E). */
    override fun handleOnResume() {
        super.handleOnResume()
        sweepOldJobs()
    }

    private fun sweepOldJobs() {
        if (Background.activeJobsKnown) Retention.sweepAsync(context) { n -> if (n > 0) clearWebCache() }
    }

    /** Deleted photos must not linger in the WebView's cache of displayed thumbnails. */
    private fun clearWebCache() {
        bridge?.webView?.let { wv -> wv.post { wv.clearCache(true) } }
    }

    // ---- Start-up and housekeeping ----

    /** {safeStart}: the app crashed twice within a minute, so open on Home and explain (PLAN §D5). */
    @PluginMethod
    fun getStartInfo(call: PluginCall) {
        io.execute {
            guarded({ call.reject("no start info", it) }) {
                val safe = crashLog.isSafeStart()
                if (safe) diag.log(Diagnostics.Event.SAFE_START)
                call.resolve(JSObject().put("safeStart", safe))
            }
        }
    }

    @PluginMethod
    fun ackSafeStart(call: PluginCall) {
        io.execute { guarded({ call.reject("not acknowledged", it) }) { crashLog.acknowledge(); call.resolve() } }
    }

    /** Every job on the screen stack: retention never deletes them. The first call of a start runs the first sweep. */
    @PluginMethod
    fun setActiveJobs(call: PluginCall) {
        val ids = call.getArray("jobIds")?.toList<String>()?.toSet() ?: emptySet()
        Background.activeJobIds = ids
        // Leaving a job (its screens are gone) deletes what was decrypted for it (PLAN §G5, review I5): the web app
        // forgets its passwords at the same moment.
        // On disk too, at once (a tiny file; not queued behind a render, review M2): the daily retention job may run
        // in a process where the web app has not said this again (Phase 10 finding).
        runCatching { OpenJobs(context.noBackupFilesDir).save(ids, System.currentTimeMillis()) }
            .onFailure { Log.w(Importer.TAG, "saving the open jobs failed: ${it.javaClass.simpleName}") }
        io.execute {
            guarded({ Log.w(Importer.TAG, "forgetting decrypted data failed: $it") }) {
                val keep = PrintFlow.protectedHash(context)
                File(context.noBackupFilesDir, "jobs").listFiles()
                    ?.filter { it.name !in ids && Decrypted.isMarked(it) }
                    ?.forEach { Decrypted.forget(it, keep) }
            }
        }
        if (!Background.activeJobsKnown) {
            Background.activeJobsKnown = true
            sweepOldJobs()
        }
        call.resolve()
    }

    /** Settings: "Delete all customer files now" (the job being printed is kept until its print ends). */
    @PluginMethod
    fun deleteAllJobs(call: PluginCall) {
        // keepOpen: "Delete old PrintSaathi jobs" when the phone is full (PLAN §J8): the jobs on screen stay too.
        val keepOpen = call.getBoolean("keepOpen") ?: false
        io.execute {
            guarded({ call.reject("not deleted", it) }) {
                // From Settings only the job being printed and shares still arriving are kept.
                val open = Background.activeJobIds + OpenJobs(context.noBackupFilesDir).recent(System.currentTimeMillis())
                val keep = if (keepOpen) Retention.protectedIds(context) else Retention.protectedIds(context) - open
                val n = JobSweeper(context.noBackupFilesDir).deleteAll(keep).size
                clearWebCache()
                // Kept: a job being printed or shares still arriving; the screen says so (gate m5).
                val kept = keep.count { File(context.noBackupFilesDir, "jobs/$it").isDirectory }
                call.resolve(JSObject().put("deleted", n).put("kept", kept))
            }
        }
    }

    // ---- Jobs (PLAN §D2c: the web app is the single writer; stale revisions are refused) ----

    @PluginMethod
    fun saveJob(call: PluginCall) {
        val job = call.getObject("job") ?: return call.reject("no job")
        io.execute {
            guarded({ call.reject("job not saved", it) }) {
                call.resolve(JSObject().put("saved", jobs.save(job.getString("id") ?: "", job)))
            }
        }
    }

    @PluginMethod
    fun loadJob(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("no id")
        io.execute { guarded({ call.reject("job unreadable", it) }) { call.resolve(JSObject().put("job", jobs.load(id) ?: JSObject.NULL)) } }
    }

    @PluginMethod
    fun listJobs(call: PluginCall) {
        io.execute {
            guarded({ call.reject("jobs unreadable", it) }) {
                call.resolve(JSObject().put("jobs", org.json.JSONArray().apply { jobs.list().forEach { put(it) } }))
            }
        }
    }

    @PluginMethod
    fun deleteJob(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("no id")
        io.execute { guarded({ call.reject("job not deleted", it) }) { jobs.delete(id); call.resolve() } }
    }

    /**
     * New files arrived → Add to this job (PLAN §I-17): job [from]'s files are placed in job [into]'s src folder.
     * Reply {files: [{from, to}]} (paths); the web app then saves the merged job and deletes [from].
     */
    @PluginMethod
    fun mergeJobFiles(call: PluginCall) {
        val from = call.getString("from") ?: return call.reject("no from")
        val into = call.getString("into") ?: return call.reject("no into")
        io.execute {
            guarded({ call.reject("files not added", it) }) {
                val link = { a: File, b: File -> runCatching { android.system.Os.link(a.path, b.path) }.isSuccess }
                val moved = JobMerge(File(context.noBackupFilesDir, "jobs"), link).merge(from, into)
                val files = org.json.JSONArray()
                moved.forEach { (a, b) -> files.put(JSObject().put("from", a.absolutePath).put("to", b.absolutePath)) }
                call.resolve(JSObject().put("files", files))
            }
        }
    }

    // ---- Thumbnails, made by the isolated engine (PLAN §F3); originals are never shown directly ----

    // ---- Documents (PLAN §G4, §G5): customer PDFs read and drawn by the isolated engine ----

    /** A job's received file that is really inside its src folder (never another path). */
    private fun jobFile(jobId: String, item: org.json.JSONObject): File? {
        val f = File(item.optString("path")).canonicalFile
        return f.takeIf { isJobFile(jobId, it.path) }
    }

    /** The unlocked copies the web app sent for this job's locked PDFs (phones with no built-in unlock). */
    private fun unlocked(jobId: String) = UnlockedCopy(File(context.noBackupFilesDir, "jobs/$jobId/work"))

    /**
     * Every PDF of a job as the engine reads it: {items: [{index, state, pages, sizes, forms}]} (DocFacts). [passwords]
     * ({item: password}) are used in memory for this call only. Results without a password are kept in thumbs/.
     */
    @PluginMethod
    fun documentFacts(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        val passwords = call.getObject("passwords")?.let { o ->
            o.keys().asSequence().mapNotNull { k -> k.toIntOrNull()?.let { it to o.optString(k) } }.toMap()
        } ?: emptyMap()
        io.execute {
            guarded({ call.reject("facts failed", it) }) {
                val job = jobs.load(id) ?: return@guarded call.reject("no such job")
                val items = job.getJSONArray("items")
                val thumbs = File(context.noBackupFilesDir, "jobs/$id/thumbs").apply { mkdirs() }
                val copies = unlocked(id)
                val client = EngineClient(context)
                val out = org.json.JSONArray()
                try {
                    for (n in 0 until items.length()) {
                        val item = items.getJSONObject(n)
                        if (item.optString("type") != "pdf") continue
                        val index = item.getInt("index")
                        val sha = item.getString("sha256")
                        val copy = copies.file(index)
                        val file = copy ?: jobFile(id, item) ?: continue
                        val password = if (copy != null) "" else passwords[index] ?: ""
                        val cache = FactsCache(thumbs)
                        val cached = if (copy == null && password.isEmpty()) cache.read(sha) else null
                        if (cached != null) {
                            out.put(cached.put("index", index))
                            continue
                        }
                        if (poison.isPoisoned(sha)) {
                            out.put(org.json.JSONObject().put("index", index).put("state", "damaged"))
                            continue
                        }
                        val (r, second) = EngineClient.turn {
                            poison.begin(sha)
                            val r = client.pdfFacts(file, password)
                            val died = r.exceptionOrNull() is EngineDiedException
                            val second = died && poison.recordDeath(sha)
                            if (!died) poison.end(sha)
                            r to second
                        }
                        val facts = DocFacts.toJson(index, r, second)
                        // Opened with a password or as the unlocked copy: never the untouched path (review C1).
                        if (facts.optString("state") == "ok" && (copy != null || password.isNotEmpty())) facts.put("unlocked", true)
                        if (copy == null && password.isEmpty() && facts.optString("state") == "ok") cache.write(sha, facts)
                        out.put(facts)
                    }
                } finally {
                    client.reset()
                }
                call.resolve(JSObject().put("items", out))
            }
        }
    }

    /**
     * Print style samples (PLAN §I-7, §J7): photo [item] (or page [page] of that PDF) in all six styles, ≤ 360 px, made
     * by the same engine code as the print. Resolves {samples: [{style, path}]} (path null when one could not be made).
     * Locked PDFs ([password], or the unlocked copy): in work/page-thumbs, as decrypted data of the job.
     */
    @PluginMethod
    fun styleSamples(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        val index = call.getInt("item") ?: return call.reject("no item")
        val page = call.getInt("page") ?: 0
        val password = call.getString("password") ?: ""
        // The photo as the print starts it: the plan's crop (on the photo as shown) and turns, mapped to the stored
        // photo like RenderPlan does (gate M2). The examples are shown turned by the web app.
        val turns = Math.floorMod(call.getInt("turns") ?: 0, 4)
        val shown = Crop(call.getDouble("cropX") ?: 0.0, call.getDouble("cropY") ?: 0.0, call.getDouble("cropW") ?: 1.0, call.getDouble("cropH") ?: 1.0)
        val crop = if (shown == Crop.FULL) Crop.FULL else shown.uprightOf(turns)
        val generation = previewGeneration
        Background.preview.execute {
            val list = org.json.JSONArray()
            val reply = JSObject()
            guarded({ call.resolve(reply.put("samples", list)) }) {
                val job = jobs.load(id) ?: return@guarded call.resolve(reply.put("samples", list))
                val items = job.getJSONArray("items")
                val item = (0 until items.length()).map { items.getJSONObject(it) }.firstOrNull { it.optInt("index") == index }
                    ?: return@guarded call.resolve(reply.put("samples", list))
                val isPdf = item.optString("type") == "pdf"
                if (!isPdf && item.optString("type") !in THUMB_TYPES) return@guarded call.resolve(reply.put("samples", list))
                val copy = if (isPdf) unlocked(id).file(index) else null
                val file = copy ?: jobFile(id, item) ?: return@guarded call.resolve(reply.put("samples", list))
                val jobDir = File(context.noBackupFilesDir, "jobs/$id")
                val locked = copy != null || (isPdf && password.isNotEmpty())
                if (locked) Decrypted.mark(jobDir)
                val sha = item.getString("sha256")
                val dir = File(jobDir, if (locked) "work/page-thumbs" else "thumbs").apply { mkdirs() }
                val cropKey = if (crop.isFull || isPdf) "" else "-" + crop.key
                for ((name, style) in STYLE_SAMPLES) {
                    val img = File(dir, "style-${if (locked) "$index" else sha}-$page$cropKey-$name.${if (style == Styles.OCV) "x3.png" else "jpg"}")
                    // The screen moved on (a style was chosen, a new render began): stop making examples (gate M4).
                    val stale = generation != previewGeneration
                    if (!stale && !img.isFile && !poison.isPoisoned(sha) && dir.usableSpace >= PREVIEW_MIN_FREE_BYTES) {
                        val part = File(dir, img.name + ".part")
                        // OCV Black is made at 3 × the size and averaged down, so the example looks like the print (gate M2).
                        val px = if (style == Styles.OCV) STYLE_SAMPLE_PX * OCV_SAMPLE_FACTOR else STYLE_SAMPLE_PX
                        val r = EngineClient.turn {
                            poison.begin(sha)
                            val engine = previewEngine(generation)
                            val r = if (isPdf) {
                                val mode = when {
                                    style == Styles.OCV -> CustomerPdf.MODE_ONE_BIT
                                    Styles.isGrey(style) -> CustomerPdf.MODE_GREY_JPEG
                                    else -> CustomerPdf.MODE_COLOUR_JPEG
                                }
                                engine.renderCustomerPage(file, if (copy != null) "" else password, page, part, px, 85, mode, style)
                            } else {
                                engine.decodeStyled(file, part, px, 85, style, crop)
                            }
                            if (r.exceptionOrNull() is EngineDiedException) poison.recordDeath(sha) else poison.end(sha)
                            r
                        }
                        val png = File(dir, img.name + ".png.part")
                        try {
                            val ok = r.isSuccess && if (style == Styles.OCV) {
                                // 1-bit rows from the engine (our own output, never the customer's file), within the size
                                // asked for → averaged to a small grey PNG, written whole then renamed (gate M3).
                                val (w, h) = r.getOrThrow().let { it[0] to it[1] }
                                check(w in 1..px && h in 1..px) { "size" }
                                // A very thin page (a long receipt) still gets its example: never average more than it has.
                                val factor = minOf(OCV_SAMPLE_FACTOR, w, h)
                                val (sw, sh) = w / factor to h / factor
                                val pixels = OneBit.toGreyScaled(part.readBytes(), w, h, factor)
                                val bmp = android.graphics.Bitmap.createBitmap(pixels, sw, sh, android.graphics.Bitmap.Config.ARGB_8888)
                                try {
                                    png.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } && png.renameTo(img)
                                } finally {
                                    bmp.recycle()
                                }
                            } else {
                                part.renameTo(img)
                            }
                            if (!ok) img.delete()
                        } catch (e: Exception) {
                            img.delete()
                        } finally {
                            part.delete()
                            png.delete()
                        }
                    }
                    list.put(JSObject().put("style", name).put("path", if (img.isFile) img.absolutePath else JSObject.NULL))
                }
                call.resolve(reply.put("samples", list))
            }
            closePreviewEngineSoon()
        }
    }

    /**
     * A small image of page [page] of a job's PDF, for choosing pages (≤ 320 px). Unlocked files: kept in thumbs/.
     * Locked ones (a password, or an unlocked copy): in work/, deleted with the job's scratch, never kept for long.
     */
    @PluginMethod
    fun pdfPageThumb(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        val index = call.getInt("item") ?: return call.reject("no item")
        val page = call.getInt("page") ?: return call.reject("no page")
        val password = call.getString("password") ?: ""
        Background.preview.execute {
            val reply = JSObject().put("item", index).put("page", page)
            guarded({ call.resolve(reply.put("path", JSObject.NULL)) }) {
                val job = jobs.load(id) ?: return@guarded call.resolve(reply.put("path", JSObject.NULL))
                val items = job.getJSONArray("items")
                val item = (0 until items.length()).map { items.getJSONObject(it) }.firstOrNull { it.optInt("index") == index && it.optString("type") == "pdf" }
                    ?: return@guarded call.resolve(reply.put("path", JSObject.NULL))
                val copy = unlocked(id).file(index)
                val file = copy ?: jobFile(id, item) ?: return@guarded call.resolve(reply.put("path", JSObject.NULL))
                val locked = copy != null || password.isNotEmpty()
                if (locked) Decrypted.mark(File(context.noBackupFilesDir, "jobs/$id"))
                val sha = item.getString("sha256")
                if (poison.isPoisoned(sha)) return@guarded call.resolve(reply.put("path", JSObject.NULL))
                val dir = if (locked) File(context.noBackupFilesDir, "jobs/$id/work/page-thumbs") else File(context.noBackupFilesDir, "jobs/$id/thumbs")
                val img = File(dir.apply { mkdirs() }, if (locked) "$index-$page.jpg" else "pdf-${item.getString("sha256")}-$page.jpg")
                if (!img.isFile) {
                    if (dir.usableSpace < PREVIEW_MIN_FREE_BYTES) return@guarded call.resolve(reply.put("path", JSObject.NULL))
                    val part = File(dir, img.name + ".part")
                    // A page that hangs or crashes the engine counts against its file, like reading it (review I4).
                    val r = EngineClient.turn {
                        poison.begin(sha)
                        val r = previewEngine(previewGeneration).renderCustomerPage(
                            file, if (copy != null) "" else password, page, part, PAGE_THUMB_PX, 80, CustomerPdf.MODE_COLOUR_JPEG,
                        )
                        if (r.exceptionOrNull() is EngineDiedException) poison.recordDeath(sha) else poison.end(sha)
                        r
                    }
                    val ok = r.isSuccess && part.renameTo(img)
                    if (!ok) {
                        part.delete()
                        closePreviewEngine()
                        return@guarded call.resolve(reply.put("path", JSObject.NULL))
                    }
                }
                call.resolve(reply.put("path", img.absolutePath))
            }
            closePreviewEngineSoon()
        }
    }

    /**
     * ADR-002 option (i): one chunk (base64, ≤ 256 KB) of the PDF the WebView unlocked, written in order to the job's
     * work folder (≤ 20 MB). Resolves {ok}; a refused chunk discards the half copy (the web app says to try again).
     */
    @PluginMethod
    fun writeUnlocked(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        val index = call.getInt("item") ?: return call.reject("no item")
        val offset = call.getLong("offset") ?: return call.reject("no offset")
        val data = call.getString("data") ?: return call.reject("no data")
        val last = call.getBoolean("last") ?: false
        io.execute {
            guarded({ call.resolve(JSObject().put("ok", false)) }) {
                val job = jobs.load(id) ?: return@guarded call.resolve(JSObject().put("ok", false))
                val items = job.getJSONArray("items")
                val isPdf = (0 until items.length()).any { items.getJSONObject(it).let { o -> o.optInt("index") == index && o.optString("type") == "pdf" } }
                if (!isPdf) return@guarded call.resolve(JSObject().put("ok", false))
                Decrypted.mark(File(context.noBackupFilesDir, "jobs/$id"))
                val bytes = android.util.Base64.decode(data, android.util.Base64.NO_WRAP)
                call.resolve(JSObject().put("ok", unlocked(id).write(index, offset, bytes, last)))
            }
        }
    }

    /**
     * Smart-crop analysis bytes (PLAN §F3, §F5): every photo of the job upright at ≤ 512 px as raw grey with a small
     * header (AnalysisGrey), hash-named in thumbs/. Resolves {items: [{index, path}]} (path null when it could not be
     * made: damaged, poisoned, no space). The web app's worker reads the files by path.
     */
    @PluginMethod
    fun analysisBytes(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        // existingOnly: the files made already, answered at once — never queued behind the analysis itself (review I5).
        if (call.getBoolean("existingOnly") == true) {
            return guarded({ call.reject("analysis failed", it) }) {
                val job = jobs.load(id) ?: return@guarded call.reject("no such job")
                val items = job.getJSONArray("items")
                val thumbs = File(context.noBackupFilesDir, "jobs/$id/thumbs")
                val out = org.json.JSONArray()
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    if (item.optString("type") !in THUMB_TYPES) continue
                    val file = File(thumbs, "${item.getString("sha256")}-a${AnalysisGrey.MAX_SIDE}.grey")
                    out.put(JSObject().put("index", item.getInt("index")).put("path", if (file.isFile) file.absolutePath else JSObject.NULL))
                }
                call.resolve(JSObject().put("items", out))
            }
        }
        // A time budget (gate I-1): photos not reached in time get no file this time, so the io thread is never held
        // for long (saves, renders and thumbnails wait behind it).
        val budget = (call.getInt("budgetMs") ?: 6000).coerceIn(500, 30_000)
        val until = android.os.SystemClock.elapsedRealtime() + budget
        // On the preview thread: made ahead while Received is shown, it never holds up a save or a render (io).
        Background.preview.execute {
            analysisCancelled.remove(id)
            guarded({ call.reject("analysis failed", it) }) {
                val job = jobs.load(id) ?: return@guarded call.reject("no such job")
                val items = job.getJSONArray("items")
                val thumbs = File(context.noBackupFilesDir, "jobs/$id/thumbs").apply { mkdirs() }
                val client = EngineClient(context)
                val out = org.json.JSONArray()
                try {
                    for (i in 0 until items.length()) {
                        val item = items.getJSONObject(i)
                        if (item.optString("type") !in THUMB_TYPES) continue
                        val index = item.getInt("index")
                        val sha = item.getString("sha256")
                        val file = File(thumbs, "$sha-a${AnalysisGrey.MAX_SIDE}.grey")
                        if (!file.isFile && android.os.SystemClock.elapsedRealtime() < until && id !in analysisCancelled &&
                            isJobFile(id, item.optString("path")) && !poison.isPoisoned(sha) &&
                            thumbs.usableSpace >= PREVIEW_MIN_FREE_BYTES
                        ) {
                            val raw = File(thumbs, file.name + ".raw")
                            val r = EngineClient.turn {
                                poison.begin(sha)
                                client.analysisGrey(File(item.getString("path")), raw, AnalysisGrey.MAX_SIDE).also { r ->
                                    if (r.exceptionOrNull() is EngineDiedException) poison.recordDeath(sha) else poison.end(sha)
                                }
                            }
                            try {
                                r.getOrNull()?.let { size ->
                                    val part = File(thumbs, file.name + ".part")
                                    part.writeBytes(AnalysisGrey.withHeader(raw.readBytes(), size[0], size[1]))
                                    if (!part.renameTo(file)) part.delete()
                                }
                            } catch (e: Exception) {
                                file.delete()
                            } finally {
                                raw.delete()
                            }
                        }
                        out.put(JSObject().put("index", index).put("path", if (file.isFile) file.absolutePath else JSObject.NULL))
                    }
                } finally {
                    client.reset()
                }
                call.resolve(JSObject().put("items", out))
            }
        }
    }

    /** Cancel while receiving (PLAN §D2): this share stops after its current file; what arrived stays (review I9). */
    @PluginMethod
    fun cancelIntake(call: PluginCall) {
        val id = call.getString("intakeId")
        if (id != null && id in Background.intakesInProgress) intakesCancelled.add(id)
        call.resolve()
    }

    /** The choice was made: this job's analysis stops after the photo being looked at (Ready's previews come first). */
    @PluginMethod
    fun cancelAnalysis(call: PluginCall) {
        call.getString("jobId")?.let { analysisCancelled.add(it) }
        call.resolve()
    }

    /** Cancel on Received (PLAN §F6): the job's thumbnails stop after the photo being made; the job is kept. */
    @PluginMethod
    fun cancelThumbnails(call: PluginCall) {
        call.getString("jobId")?.let { thumbsCancelled.add(it) }
        call.resolve()
    }

    @PluginMethod
    fun makeThumbnails(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        thumbsCancelled.remove(id)
        io.execute {
            guarded({ call.reject("thumbnails failed", it) }) {
                val job = jobs.load(id) ?: return@guarded call.reject("no such job")
                val items = job.getJSONArray("items")
                val thumbs = File(context.noBackupFilesDir, "jobs/$id/thumbs").apply { mkdirs() }
                val client = EngineClient(context)
                val out = org.json.JSONArray()
                try {
                    for (i in 0 until items.length()) {
                        val item = items.getJSONObject(i)
                        val sha = item.getString("sha256")
                        val type = item.getString("type")
                        val result = JSObject().put("index", item.getInt("index"))
                        when {
                            type == "heif" -> result.put("state", "unsupported") // ADR-003 pending: never crash the engine
                            type !in THUMB_TYPES -> result.put("state", "notPhoto")
                            poison.isPoisoned(sha) -> result.put("state", "damaged")
                            // Only files inside this job's own src folder are ever decoded (gate review #10).
                            !isJobFile(id, item.optString("path")) -> result.put("state", "damaged")
                            else -> {
                                val dst = File(thumbs, "$sha-$THUMB_PX.jpg")
                                // Upright size of the thumbnail = the photo's shape after EXIF; the layout needs it.
                                val dims = File(thumbs, "$sha-$THUMB_PX.json")
                                var failState = "damaged"
                                if (!dst.exists() || !dims.exists()) {
                                    val part = File(thumbs, "$sha-$THUMB_PX.jpg.part")
                                    var damagedNow = false
                                    val r = EngineClient.turn {
                                        poison.begin(sha)
                                        client.decodeToJpeg(File(item.getString("path")), part, THUMB_PX, 80).also { r ->
                                            // The mark is settled in the same turn (re-review I2); the rest follows.
                                            if (r.exceptionOrNull() is EngineDiedException) damagedNow = poison.recordDeath(sha) else poison.end(sha)
                                        }
                                    }
                                    r.exceptionOrNull()?.let { e ->
                                        part.delete()
                                        // Only a file that took the engine down twice, or that the engine refuses,
                                        // is "damaged"; an engine that wasn't ready or died once is a "retry"
                                        // (gate re-review N2): Try again, never "ask the customer to resend".
                                        failState = when {
                                            e is EngineUnavailableException -> "retry"
                                            e is EngineDiedException -> if (damagedNow) "damaged" else "retry"
                                            e is EngineFileException && e.code == EngineErrors.TOO_BIG -> "tooBig"
                                            else -> "damaged"
                                        }
                                    } ?: run {
                                        val size = r.getOrThrow()
                                        dims.writeText(JSObject().put("width", size[0]).put("height", size[1]).toString())
                                        part.renameTo(dst)
                                    }
                                }
                                if (dst.exists() && dims.exists()) {
                                    val d = org.json.JSONObject(dims.readText())
                                    result.put("state", "ok").put("thumb", dst.absolutePath)
                                        .put("width", d.getInt("width")).put("height", d.getInt("height"))
                                } else {
                                    result.put("state", failState)
                                }
                            }
                        }
                        out.put(result)
                        notifyListeners("thumbnailProgress", JSObject().put("jobId", id).put("done", i + 1).put("total", items.length()))
                        if (thumbsCancelled.remove(id)) break // Cancel: the rest are left (a later visit makes them)
                    }
                } finally {
                    client.reset()
                }
                call.resolve(JSObject().put("items", out))
            }
        }
    }

    // ---- ID cards (Phase 14): found and straightened by the isolated engine ----

    /**
     * The ID cards in every photo of a job, and the card panels on its PDFs' first pages (e-Aadhaar):
     * {items: [{index, page?, state: ok | damaged | locked, cards: [{quad: [8 fractions], confidence, face}]}]}.
     * [passwords] ({item: password}) are used in memory for this call only.
     */
    @PluginMethod
    fun findCards(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        val passwords = call.getObject("passwords")?.let { o ->
            o.keys().asSequence().mapNotNull { k -> k.toIntOrNull()?.let { it to o.optString(k) } }.toMap()
        } ?: emptyMap()
        io.execute {
            guarded({ call.reject("cards failed", it) }) {
                val job = jobs.load(id) ?: return@guarded call.reject("no such job")
                val items = job.getJSONArray("items")
                val client = EngineClient(context)
                val out = org.json.JSONArray()
                try {
                    for (i in 0 until items.length()) {
                        val item = items.getJSONObject(i)
                        val index = item.getInt("index")
                        val sha = item.getString("sha256")
                        val type = item.getString("type")
                        val file = unlocked(id).file(index) ?: jobFile(id, item)
                        val pages = if (type == "pdf") (0 until CARD_PDF_PAGES).toList() else listOf(null)
                        for (page in pages) {
                            val r = JSObject().put("index", index)
                            if (page != null) r.put("page", page)
                            if (file == null || poison.isPoisoned(sha) || (type != "pdf" && type !in THUMB_TYPES)) {
                                out.put(r.put("state", "damaged").put("cards", org.json.JSONArray()))
                                continue
                            }
                            val found = EngineClient.turn {
                                poison.begin(sha)
                                val f = if (page == null) client.detectCards(file) else client.detectCardsInPage(file, passwords[index] ?: "", page)
                                if (f.exceptionOrNull() is EngineDiedException) poison.recordDeath(sha) else poison.end(sha)
                                f
                            }
                            val cards = found.getOrNull()
                            // A locked e-Aadhaar: said so, so the screens can offer card copy and unlock it first.
                            if (found.exceptionOrNull() is `in`.printsaathi.app.engine.isolated.PdfLockedException) {
                                out.put(r.put("state", "locked").put("cards", org.json.JSONArray()))
                                continue
                            }
                            if (cards == null) {
                                // Past a PDF's last page the engine says "no such page": the PDF simply has no more.
                                if (page != null && page > 0) break
                                out.put(r.put("state", "damaged").put("cards", org.json.JSONArray()))
                                continue
                            }
                            val list = org.json.JSONArray()
                            for (c in cards) {
                                list.put(
                                    JSObject().put("quad", org.json.JSONArray(c.corners.toList())).put("confidence", c.confidence).put("face", c.face)
                                        .put("upsideDown", c.upsideDown),
                                )
                            }
                            out.put(r.put("state", "ok").put("cards", list))
                        }
                    }
                } finally {
                    client.reset()
                }
                call.resolve(JSObject().put("items", out))
            }
        }
    }

    /**
     * Phase 15 (spec Part 3): for every photo of a job, the faces Android's finder sees at each quarter turn
     * clockwise: {items: [{index, faces: [4]}]}; photos it cannot read are left out (nothing is turned for them).
     */
    @PluginMethod
    fun faceTurns(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        // A time limit and a stop (review I2): Ready's previews share this thread and come first.
        val budgetMs = (call.getInt("budgetMs") ?: 6000).coerceIn(500, 20_000)
        faceTurnsCancelled.remove(id)
        Background.preview.execute {
            val t0 = android.os.SystemClock.elapsedRealtime()
            guarded({ call.resolve(JSObject().put("items", org.json.JSONArray())) }) {
                val job = jobs.load(id) ?: return@guarded call.resolve(JSObject().put("items", org.json.JSONArray()))
                val items = job.getJSONArray("items")
                val out = org.json.JSONArray()
                for (i in 0 until items.length()) {
                    if (id in faceTurnsCancelled || android.os.SystemClock.elapsedRealtime() - t0 > budgetMs) break
                    val item = items.getJSONObject(i)
                    val sha = item.getString("sha256")
                    if (item.getString("type") !in THUMB_TYPES || poison.isPoisoned(sha)) continue
                    val file = jobFile(id, item) ?: continue
                    val r = EngineClient.turn {
                        poison.begin(sha)
                        val r = previewEngine(previewGeneration).faceTurns(file)
                        if (r.exceptionOrNull() is EngineDiedException) poison.recordDeath(sha) else poison.end(sha)
                        r
                    }
                    r.getOrNull()?.let { f -> out.put(JSObject().put("index", item.getInt("index")).put("faces", org.json.JSONArray(f.toList()))) }
                }
                call.resolve(JSObject().put("items", out))
            }
            closePreviewEngineSoon()
        }
    }

    /** Stops this job's face check after the photo being looked at (the shopkeeper made a choice). */
    @PluginMethod
    fun cancelFaceTurns(call: PluginCall) {
        call.getString("jobId")?.let { faceTurnsCancelled += it }
        call.resolve()
    }

    /**
     * One card straightened, for the screens: [width] px wide (the card's shape), JPEG. Kept in thumbs/ (or work/ for a
     * locked PDF). Resolves {path} or {path: null} when it can't be made.
     */
    @PluginMethod
    fun cardImage(call: PluginCall) {
        val id = call.getString("jobId") ?: return call.reject("no jobId")
        val index = call.getInt("item") ?: return call.reject("no item")
        val page = call.getInt("page")
        val width = (call.getInt("width") ?: 640).coerceIn(64, 1280)
        val quadJson = call.getArray("quad") ?: return call.reject("no quad")
        val quad = DoubleArray(quadJson.length()) { quadJson.getDouble(it) }
        if (!`in`.printsaathi.app.engine.isolated.QuadCheck.ok(quad)) return call.reject("bad quad")
        val password = call.getString("password") ?: ""
        Background.preview.execute {
            guarded({ call.resolve(JSObject().put("path", JSObject.NULL)) }) {
                val job = jobs.load(id) ?: return@guarded call.resolve(JSObject().put("path", JSObject.NULL))
                val items = job.getJSONArray("items")
                val item = (0 until items.length()).map { items.getJSONObject(it) }.firstOrNull { it.optInt("index") == index }
                    ?: return@guarded call.resolve(JSObject().put("path", JSObject.NULL))
                val copy = unlocked(id).file(index)
                val file = copy ?: jobFile(id, item) ?: return@guarded call.resolve(JSObject().put("path", JSObject.NULL))
                val sha = item.getString("sha256")
                if (poison.isPoisoned(sha)) return@guarded call.resolve(JSObject().put("path", JSObject.NULL))
                val locked = copy != null || password.isNotEmpty()
                if (locked) Decrypted.mark(File(context.noBackupFilesDir, "jobs/$id"))
                val dir = File(context.noBackupFilesDir, if (locked) "jobs/$id/work/cards" else "jobs/$id/thumbs").apply { mkdirs() }
                val key = Integer.toHexString(quad.toList().hashCode())
                val img = File(dir, "card-$sha-${page ?: "p"}-$key-$width.jpg")
                if (!img.isFile) {
                    val part = File(dir, img.name + ".part")
                    val height = Math.round(width / `in`.printsaathi.app.engine.card.CardDetect.ASPECT).toInt()
                    val r = EngineClient.turn {
                        poison.begin(sha)
                        val r = previewEngine(previewGeneration).decodeWarped(file, part, width, height, 85, Styles.ORIGINAL, quad, page, if (copy != null) "" else password)
                        if (r.exceptionOrNull() is EngineDiedException) poison.recordDeath(sha) else poison.end(sha)
                        r
                    }
                    if (!(r.isSuccess && part.renameTo(img))) {
                        part.delete()
                        closePreviewEngine()
                        return@guarded call.resolve(JSObject().put("path", JSObject.NULL))
                    }
                }
                call.resolve(JSObject().put("path", img.absolutePath))
            }
            closePreviewEngineSoon()
        }
    }

    // ---- Print file (PLAN §G2/G3): plan -> jobs/<id>/out/<planHash>/print.pdf ----

    /**
     * Renders [plan] (PrintPlan v1, built by the web app) to a print file. One render at a time: a new one cancels
     * the previous. The result names the plan hash, so the web app ignores a result for a plan it no longer shows.
     * Resolves {planHash, state: done (pdfPath, pages) | damaged (itemIndex) | cancelled | noSpace | failed}.
     */
    @PluginMethod
    fun renderPlan(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("no jobId")
        val hash = call.getString("planHash")?.takeIf(RenderPlan::isPlanHash) ?: return call.reject("bad planHash")
        val planJson = call.getObject("plan") ?: return call.reject("no plan")
        // Locked PDFs' passwords, by item: held in memory for this render only, never logged or stored (PLAN §G5).
        val passwords = call.getObject("passwords")?.let { o ->
            o.keys().asSequence().mapNotNull { k -> k.toIntOrNull()?.let { it to o.optString(k) } }.toMap()
        } ?: emptyMap()
        val token = CancelToken()
        synchronized(Companion) {
            renderToken?.cancel()
            renderToken = token
        }
        previewGeneration++ // previews queued for an older plan are dropped
        io.execute {
            val reply = JSObject().put("planHash", hash)
            guarded({ call.resolve(reply.put("state", "failed")); Log.w(Importer.TAG, "render failed: $it") }) {
                val plan = try {
                    if (planJson.optString("jobId") != jobId) throw PlanInvalid("job mismatch")
                    RenderPlan.parse(planJson)
                } catch (e: Exception) {
                    Log.w(Importer.TAG, "plan refused: ${e.javaClass.simpleName}") // never a message: it may quote plan values
                    return@guarded call.resolve(reply.put("state", "failed"))
                }
                val job = jobs.load(jobId) ?: return@guarded call.resolve(reply.put("state", "failed"))
                val jobDir = File(context.noBackupFilesDir, "jobs/$jobId")
                if (jobDir.usableSpace < MIN_FREE_BYTES) return@guarded call.resolve(reply.put("state", "noSpace"))
                // Older print files of this job are stale the moment a different plan is asked for (PLAN §D2c).
                // ...except the one Android's print screen may still be reading.
                val keep = setOf(hash, PrintFlow.protectedHash(context))
                File(jobDir, "out").listFiles()?.filter { it.name !in keep }?.forEach { it.deleteRecursively() }
                val items = renderItems(job, jobDir, passwords)
                if (items.values.any { it.locked }) Decrypted.mark(jobDir)
                val client = EngineClient(context)
                val engineSteps = EngineRenderer(client, poison, passwords)
                val t0 = android.os.SystemClock.elapsedRealtime()
                val outcome = try {
                    PlanRenderer(engineSteps, engineSteps, engineSteps, cards = engineSteps).render(
                        plan, items, File(jobDir, "work/$hash"), File(jobDir, "out/$hash"), token,
                    ) { done, total ->
                        notifyListeners("renderProgress", JSObject().put("jobId", jobId).put("planHash", hash).put("done", done).put("total", total))
                    }
                } finally {
                    client.reset() // free the engine's memory before the print screen opens
                }
                when (outcome) {
                    is RenderOutcome.Done -> reply.put("state", "done").put("pdfPath", outcome.pdf.absolutePath).put("pages", outcome.pages)
                        .put("lowRes", org.json.JSONArray(outcome.lowRes.sorted()))
                        .put("dpi", JSObject().apply { outcome.dpi.forEach { (k, v) -> put(k.toString(), v) } })
                    is RenderOutcome.Damaged -> reply.put("state", "damaged").put("itemIndex", outcome.itemIndex)
                    RenderOutcome.Cancelled -> reply.put("state", "cancelled")
                    // A write that failed because the phone filled up gets the storage message, which says what to do.
                    is RenderOutcome.Failed -> reply.put("state", if (jobDir.usableSpace < MIN_FREE_BYTES) "noSpace" else "failed")
                        .also { Log.w(Importer.TAG, "render failed: ${outcome.reason}") }
                }
                // For the problem report: how big, how long, how it ended (0 done, 1 damaged, 2 cancelled, 3 failed).
                val code = when (outcome) {
                    is RenderOutcome.Done -> 0
                    is RenderOutcome.Damaged -> 1
                    RenderOutcome.Cancelled -> 2
                    else -> 3
                }
                diag.log(
                    Diagnostics.Event.RENDER, "pages" to plan.pages.size,
                    "ms" to android.os.SystemClock.elapsedRealtime() - t0, "outcome" to code,
                    "noSpace" to (jobDir.usableSpace < MIN_FREE_BYTES),
                )
                call.resolve(reply)
            }
        }
    }

    // ---- Printing (PLAN §D4): one print at a time, outcome persisted and checked again on resume ----

    /** The shop test page (PLAN §D4) on A4 or 4×6 photo paper. Resolves {result: started | busy | failed}. */
    @PluginMethod
    fun printTestPage(call: PluginCall) {
        val act = activity ?: return call.reject("no activity")
        val kind = when (call.getString("paper")) {
            "A4" -> PrintKind.TEST_A4
            "PHOTO_4x6" -> PrintKind.TEST_PHOTO
            else -> return call.reject("bad paper")
        }
        Background.preview.execute { closePreviewEngine() }
        act.runOnUiThread {
            guarded({ call.reject("print failed", it) }) {
                val r = PrintFlow.startTest(act, kind) {
                    notifyListeners("printClosed", JSObject().put("kind", kind.wireName), true)
                }
                call.resolve(JSObject().put("result", r))
            }
        }
    }

    /** What the test pages learnt about the shop printer: {printer?, photoPaper?: {wMils, hMils} | null}. */
    @PluginMethod
    fun paperSetup(call: PluginCall) {
        io.execute { guarded({ call.reject("unreadable", it) }) { call.resolve(JSObject.fromJSONObject(PrintFlow.paperSetup(context))) } }
    }

    /** Opens Android's print screen for a finished print file. Resolves {result: started | busy | noFile}. */
    @PluginMethod
    fun printFile(call: PluginCall) {
        val act = activity ?: return call.reject("no activity")
        val jobId = call.getString("jobId") ?: return call.reject("no jobId")
        val hash = call.getString("planHash") ?: return call.reject("no planHash")
        val pages = call.getInt("pages") ?: return call.reject("no pages")
        val photo = call.getString("contentType") != "document"
        val monochrome = call.getString("colour") == "bw"
        val part = call.getInt("part") ?: 0
        val parts = call.getInt("parts") ?: 1
        val partOf = call.getString("partOf") ?: ""
        val photoMils = call.getObject("photoPaper")?.let { p ->
            (p.optInt("wMils", 0) to p.optInt("hMils", 0)).takeIf { it.first > 0 && it.second > 0 }
        }
        Background.preview.execute { closePreviewEngine() }
        act.runOnUiThread {
            guarded({ call.reject("print failed", it) }) {
                val r = PrintFlow.start(act, jobId, hash, pages, photo, monochrome, {
                    notifyListeners("printClosed", JSObject().put("jobId", jobId).put("planHash", hash), true)
                }, part, parts, partOf, photoMils)
                call.resolve(JSObject().put("result", r))
            }
        }
    }

    /** {state, jobId, planHash} of the print in flight (state "none" when there is none). */
    @PluginMethod
    fun printStatus(call: PluginCall) {
        io.execute { guarded({ call.reject("status unavailable", it) }) { call.resolve(JSObject.fromJSONObject(PrintFlow.status(context))) } }
    }

    /** The Result screen is done: forget the print and delete its print file. */
    @PluginMethod
    fun clearPrint(call: PluginCall) {
        io.execute {
            guarded({ call.reject("not cleared", it) }) {
                // Decrypted data (unlocked copy, locked page images) stays while the job is open, for its next part or
                // Print again (review I6); leaving the job deletes it (setActiveJobs), and so does a restart.
                // For the problem report: how the print ended (PrintResult order; -1 when there was none).
                val state = PrintFlow.status(context).optString("state")
                if (state != "none") diag.log(Diagnostics.Event.PRINT, "state" to PrintResult.entries.indexOfFirst { it.wireName == state })
                PrintFlow.clear(context)
                call.resolve()
            }
        }
        sweepOldJobs() // after each print (PLAN §E)
    }

    /**
     * The real-file preview (PLAN §G7.3): page [index] of out/<planHash>/print.pdf rendered by the engine (≤ 1280 px,
     * made once, deleted with the print file). One page per call, on its own thread, so previews never hold up saving,
     * making the file or printing; a new render stops queued previews (gate review F1). Resolves {planHash, index,
     * path} (path null when the file is gone, space is short or the page could not be made).
     */
    @PluginMethod
    fun previewPage(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("no jobId")
        val hash = call.getString("planHash")?.takeIf(RenderPlan::isPlanHash) ?: return call.reject("bad planHash")
        val index = call.getInt("index") ?: return call.reject("no index")
        val generation = previewGeneration
        Background.preview.execute {
            val reply = JSObject().put("planHash", hash).put("index", index)
            guarded({ call.resolve(reply.put("path", JSObject.NULL)) }) {
                val out = File(context.noBackupFilesDir, "jobs/$jobId/out/$hash")
                val pdf = File(out, "print.pdf")
                val ok = generation == previewGeneration && jobs.load(jobId) != null && pdf.isFile &&
                    index in 0 until RenderPlan.MAX_PAGES
                if (!ok) return@guarded call.resolve(reply.put("path", JSObject.NULL))
                val img = File(File(out, "preview"), "$index.jpg")
                if (!img.isFile) {
                    // A page image is ~150 KB: its own small floor, not the print file's 200 MB (gate re-review N4).
                    if (out.usableSpace < PREVIEW_MIN_FREE_BYTES) return@guarded call.resolve(reply.put("path", JSObject.NULL))
                    img.parentFile?.mkdirs()
                    val part = File(img.parentFile, "$index.jpg.part")
                    val made = previewEngine(generation).renderPdfPage(pdf, index, part, PREVIEW_PX).isSuccess &&
                        part.renameTo(img)
                    if (!made) {
                        closePreviewEngine() // the next page starts from a fresh engine
                        part.delete() // a failed render or rename never hands out a broken image (gate review F5)
                        return@guarded call.resolve(reply.put("path", JSObject.NULL))
                    }
                }
                call.resolve(reply.put("path", img.absolutePath))
            }
            closePreviewEngineSoon()
        }
    }

    // One engine connection for a run of preview pages (gate re-review N2: a new isolated process per page cost
    // 20-200 ms each). Used only on Background.preview; closed a moment after the last page, when a newer plan's
    // pages start, or when printing starts (the engine is left free while Android's print screen is open).
    private var previewClient: EngineClient? = null
    private var previewClientGeneration = -1
    private var previewCloseToken = 0

    private fun previewEngine(generation: Int): EngineClient {
        previewCloseToken++
        if (previewClientGeneration != generation) closePreviewEngine()
        return previewClient ?: EngineClient(context).also {
            previewClient = it
            previewClientGeneration = generation
        }
    }

    private fun closePreviewEngine() {
        previewClient?.reset()
        previewClient = null
        previewClientGeneration = -1
    }

    private fun closePreviewEngineSoon() {
        val token = ++previewCloseToken
        Background.preview.schedule({ if (token == previewCloseToken) closePreviewEngine() }, 3, TimeUnit.SECONDS)
    }

    @PluginMethod
    fun cancelRender(call: PluginCall) {
        synchronized(Companion) { renderToken?.cancel() }
        call.resolve()
    }

    private fun isJobFile(jobId: String, path: String): Boolean {
        val src = File(context.noBackupFilesDir, "jobs/$jobId/src").canonicalFile
        val f = File(path).canonicalFile
        return f.parentFile == src && f.isFile
    }

    /** The job's photos that may be printed: decodable types whose file really is inside this job's src folder. */
    /** [passwords]: a PDF opened with one is marked locked (drawn, never printed as the customer's file). */
    private fun renderItems(job: org.json.JSONObject, jobDir: File, passwords: Map<Int, String> = emptyMap()): Map<Int, RenderItem> {
        val src = File(jobDir, "src").canonicalFile
        val items = job.getJSONArray("items")
        return (0 until items.length()).map { items.getJSONObject(it) }
            .filter { it.optString("type") in THUMB_TYPES || it.optString("type") == "pdf" }
            .mapNotNull { o ->
                val f = File(o.getString("path")).canonicalFile
                // A locked PDF unlocked by the web app (no built-in unlock): its unlocked copy is what prints.
                val copy = if (o.optString("type") == "pdf") UnlockedCopy(File(jobDir, "work")).file(o.getInt("index")) else null
                when {
                    copy != null -> RenderItem(o.getInt("index"), copy, o.getString("sha256"), locked = true)
                    f.parentFile == src && f.isFile ->
                        RenderItem(o.getInt("index"), f, o.getString("sha256"), locked = !passwords[o.getInt("index")].isNullOrEmpty())
                    else -> null
                }
            }
            .associateBy { it.index }
    }

    @PluginMethod
    fun getDeviceFacts(call: PluginCall) {
        call.resolve(DeviceFacts.read(context))
    }

    /** The phone's font-size setting; the web app turns it into its root text size (PLAN §D6). */
    @PluginMethod
    fun getFontScale(call: PluginCall) {
        call.resolve(JSObject().put("fontScale", context.resources.configuration.fontScale.toDouble()))
    }

    /** The page's splash is gone (it has drawn): the page goes solid again (MainActivity.splashGone). */
    @PluginMethod
    fun splashGone(call: PluginCall) {
        val act = activity as? `in`.printsaathi.app.MainActivity ?: return call.resolve()
        act.runOnUiThread {
            act.splashGone()
            call.resolve()
        }
    }

    /** The page's own splash is on screen: Android's splash goes at once (MainActivity.pageSplashShown). */
    @PluginMethod
    fun splashShown(call: PluginCall) {
        val act = activity as? `in`.printsaathi.app.MainActivity ?: return call.resolve()
        act.runOnUiThread {
            act.pageSplashShown()
            call.resolve()
        }
    }

    /** Called by MainActivity when the phone's text size changes while the app runs. */
    fun notifyFontScale(fontScale: Float) {
        notifyListeners("fontScaleChanged", JSObject().put("fontScale", fontScale.toDouble()))
    }

    // ---- Settings (PLAN §I-15): the web app normalises and writes them; the phone keeps and reads them ----

    /** {settings}: the saved settings object, or null when none were saved yet (the web app uses its defaults). */
    @PluginMethod
    fun getSettings(call: PluginCall) {
        // A tiny file, read at once: never queued behind thumbnails and renders (review M10).
        guarded({ call.reject("settings unreadable", it) }) {
            call.resolve(JSObject().put("settings", SettingsStore(context.noBackupFilesDir).load() ?: JSObject.NULL))
        }
    }

    /** {saved}. A new retention period applies at once: old jobs go at the next sweep (the open ones are kept). */
    @PluginMethod
    fun saveSettings(call: PluginCall) {
        val settings = call.getObject("settings") ?: return call.reject("no settings")
        io.execute {
            guarded({ call.reject("settings not saved", it) }) {
                val saved = SettingsStore(context.noBackupFilesDir).save(settings)
                screenshotsAllowedUntilMs = SettingsStore(context.noBackupFilesDir).screenshotsUntil()
                call.resolve(JSObject().put("saved", saved))
                if (saved) sweepOldJobs()
            }
        }
    }

    /**
     * Send problem report (PLAN §K10): versions, phone, shop and the newest events. No customer file, name, path or
     * password can be in it (Diagnostics keeps numbers only). Shared only by the owner's tap (shareText).
     */
    @PluginMethod
    fun problemReport(call: PluginCall) {
        io.execute {
            guarded({ call.reject("no report", it) }) {
                val facts = DeviceFacts.read(context)
                val settings = SettingsStore(context.noBackupFilesDir)
                val saved = settings.load()
                val info = context.packageManager.getPackageInfo(context.packageName, 0)
                val retention = saved?.optString("retention")?.takeIf { it in setOf("1h", "1d", "7d") } ?: "1d"
                val edges = saved?.optString("edges")?.takeIf { it in setOf("normal", "more") } ?: "normal"
                val header = listOf(
                    "PrintSaathi problem report",
                    "App: ${info.versionName}",
                    "Android ${facts.optString("androidRelease")} (API ${facts.optInt("sdkInt")})",
                    "Phone: ${facts.optString("manufacturer")} ${facts.optString("model")}, " +
                        "${facts.optInt("totalRamMb")} MB${if (facts.optBoolean("isLowRamDevice")) ", low-RAM" else ""}",
                    "WebView: ${facts.optString("webViewPackage")} ${facts.optString("webViewVersion")}",
                    "Locked PDFs: ${facts.optString("pdfUnlockTier")}",
                    "Shop: ${settings.shopName().ifBlank { "(not set)" }}",
                    "Delete after: $retention, edges: $edges",
                    "Made: ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.ROOT).format(java.util.Date())}",
                )
                call.resolve(JSObject().put("text", diag.report(header)))
            }
        }
    }

    /** {covers: {jobId: path | null}}: each job's first photo thumbnail if already made (Recent jobs, PLAN §I-14). */
    @PluginMethod
    fun jobCovers(call: PluginCall) {
        val ids = call.getArray("jobIds")?.toList<String>() ?: emptyList()
        io.execute {
            guarded({ call.reject("no covers", it) }) {
                val covers = JSObject()
                for (id in ids) {
                    val items = jobs.load(id)?.optJSONArray("items")
                    val thumbs = File(context.noBackupFilesDir, "jobs/$id/thumbs")
                    val cover = (0 until (items?.length() ?: 0)).asSequence()
                        .map { items!!.getJSONObject(it) }
                        .filter { it.optString("type") in THUMB_TYPES }
                        .map { File(thumbs, "${it.optString("sha256")}-$THUMB_PX.jpg") }
                        .firstOrNull { it.isFile }
                    covers.put(id, cover?.absolutePath ?: JSObject.NULL)
                }
                call.resolve(JSObject().put("covers", covers))
            }
        }
    }

    /** {any, builtIn, brother, mopria}: can this phone print at all, and with what (PLAN §D4, §K12, §I-18)? */
    @PluginMethod
    fun printServices(call: PluginCall) {
        guarded({ call.reject("print services unknown", it) }) {
            val f = PrintServices.classify(PrintServices.installed(context))
            call.resolve(JSObject().put("any", f.any).put("builtIn", f.builtIn).put("brother", f.brother).put("mopria", f.mopria))
        }
    }

    /** Screens showing customer files call this; on Android 12 and older it blocks screenshots meanwhile (§D6). */
    @PluginMethod
    fun setCustomerContentShown(call: PluginCall) {
        val shown = call.getBoolean("shown") ?: false
        val act = activity ?: return call.reject("no activity")
        customerContentShown = shown
        act.runOnUiThread {
            val secure = applySecureFlag(act)
            call.resolve(JSObject().put("secure", secure))
        }
    }

    /** FLAG_SECURE as it should be now; while screenshots are allowed, checked again when the window ends (M1). */
    private fun applySecureFlag(act: android.app.Activity): Boolean {
        val now = System.currentTimeMillis()
        val secure = secureFlagNeeded(Build.VERSION.SDK_INT, customerContentShown, screenshotsAllowedUntilMs, now)
        if (secure) act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (!secure && customerContentShown && Build.VERSION.SDK_INT < 33 && screenshotsAllowed(screenshotsAllowedUntilMs, now))
            act.window.decorView.postDelayed({ applySecureFlag(act) }, screenshotsAllowedUntilMs - now + 50)
        return secure
    }

    /** Phase 0 spike (b): prints a ruler test page through Android's real print dialog. */
    @PluginMethod
    fun printSpike(call: PluginCall) {
        val act = activity ?: return call.reject("no activity")
        val paper = if (call.getString("paper") == "4x6") TestPages.Paper.PHOTO_4X6 else TestPages.Paper.A4
        val sheets = (call.getInt("sheets") ?: 1).coerceIn(1, 2)
        val photo = call.getString("contentType") == "photo"
        val mono = call.getBoolean("monochrome") ?: false
        act.runOnUiThread {
            guarded({ call.reject("print could not start", it) }) {
                call.resolve(JSObject().put("result", PrintSpike.start(act, paper, sheets, photo, mono)))
            }
        }
    }

    @PluginMethod
    fun lastPrintReport(call: PluginCall) {
        guarded({ call.reject("report unavailable", it) }) { call.resolve(JSObject.fromJSONObject(PrintSpike.persist())) }
    }

    /** Shares plain text (spike reports only — never customer data) through Android's share sheet. */
    @PluginMethod
    fun shareText(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("no text")
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        activity?.startActivity(Intent.createChooser(send, "Send report"))
        call.resolve()
    }

    /** Every received intake not yet taken into a job, oldest first (PLAN §D2: nothing dropped silently). */
    @PluginMethod
    fun listIntakes(call: PluginCall) {
        io.execute {
            guarded({ call.reject("intakes unreadable", it) }) {
                val arr = org.json.JSONArray()
                importer.listPending().forEach { arr.put(it) }
                call.resolve(JSObject().put("intakes", arr))
            }
        }
    }

    /** The web app took this intake into a job; it leaves the pending list. */
    @PluginMethod
    fun ackIntake(call: PluginCall) {
        val id = call.getString("intakeId") ?: return call.reject("no intakeId")
        io.execute { guarded({ call.reject("ack failed", it) }) { importer.ack(id); call.resolve() } }
    }

    /** JS pulls on start, so a share is never lost before JS listens (PLAN §D2). */
    @PluginMethod
    fun getPendingIntake(call: PluginCall) {
        io.execute {
            guarded({ call.reject("intake unreadable", it) }) {
                val p = importer.pending()
                call.resolve(JSObject().apply { put("intake", p ?: JSObject.NULL) })
            }
        }
    }

    /**
     * Choose from phone (PLAN §D3, §J0): the phone's photo picker (no permission needed; one photo for passport) where
     * there is one, else the system file picker; documents: PDFs and photos. Resolves {picked} (0 = closed without
     * files); the files then arrive like a share.
     */
    @PluginMethod
    fun pickFiles(call: PluginCall) {
        val kind = call.getString("kind") ?: "photos"
        // Where from: the gallery (Android's photo picker, photos only) or the file manager (the document picker). Home's
        // tiles say nothing: photos and passport photos come from the gallery, documents and ID cards from the file
        // manager. The choice screens say which (ID cards, 2026-10-23; Add photos / Add files, 2026-10-24).
        val from = call.getString("from")
        val gallery = when (from) {
            "gallery" -> true
            "files" -> false
            else -> kind != "documents" && kind != "cards"
        }
        // At most: ID card photos 2 (front and back); Add photos what still fits the job (a job holds 100).
        val max = minOf(if (kind == "cards" && gallery) 2 else MAX_PICK, call.getInt("max") ?: MAX_PICK)
            .coerceAtLeast(1)
        val many = kind != "passport" && max > 1
        val photoPicker = gallery && hasPhotoPicker()
        val intent = when {
            photoPicker -> Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                type = "image/*" // photos only, never videos (review M2)
                if (many) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, minOf(max, MediaStore.getPickImagesMaxLimit()))
            }
            (kind == "documents" || kind == "cards") && !gallery -> Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "image/*"))
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, many)
            }
            else -> Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "image/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, many)
            }
        }
        try {
            startActivityForResult(call, intent, "pickResult")
        } catch (e: android.content.ActivityNotFoundException) {
            // A phone that says it has the photo picker but lacks it (review M3): the system file picker instead.
            if (!photoPicker) return call.reject("no picker on this phone")
            val files = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "image/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, many)
            }
            try {
                startActivityForResult(call, files, "pickResult")
            } catch (e2: android.content.ActivityNotFoundException) {
                call.reject("no picker on this phone")
            }
        }
    }

    @ActivityCallback
    private fun pickResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val data = result.data
        if (result.resultCode != android.app.Activity.RESULT_OK || data == null) return call.resolve(JSObject().put("picked", 0))
        val uris = mutableListOf<Uri>()
        data.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i)?.uri?.let(uris::add) }
        if (uris.isEmpty()) data.data?.let(uris::add)
        importUris(uris, pick = call.getString("kind") ?: "photos")
        call.resolve(JSObject().put("picked", uris.size))
    }

    /** Android's photo picker: Android 13+, or Android 11–12 with the system update that brings it. */
    private fun hasPhotoPicker(): Boolean =
        Build.VERSION.SDK_INT >= 33 ||
            (Build.VERSION.SDK_INT >= 30 && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2)

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return
        // Capacitor replays the launch intent through onNewIntent on every activity creation; a restore
        // (or a launch from Recents) must not import the same share again (PLAN §D2b).
        val isLaunchIntent = intent === activity?.intent
        if (isLaunchIntent && MainActivity.lastCreateWasRestore) {
            Log.i(Importer.TAG, "share skipped: activity restore")
            return
        }
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) {
            Log.i(Importer.TAG, "share skipped: launched from history")
            return
        }
        // A hostile sender can put unparcelable extras in the intent; reading them must not crash the activity.
        var uris: List<Uri> = emptyList()
        guarded({ Log.w(Importer.TAG, "share unreadable: $it") }) { uris = collectUris(intent) }
        importUris(uris)
    }

    /**
     * Files from a share or from Choose from phone go the same way (PLAN §D2, §D3): copied at once (the read
     * permission ends with the task), with the caps, part files and journal of every intake; intakeReady follows.
     */
    /** [pick]: what the files were chosen for on Home; kept with the intake (it survives a restart). */
    private fun importUris(uris: List<Uri>, pick: String? = null) {
        if (uris.isEmpty()) return
        val now = System.currentTimeMillis()
        val keys = uris.map { it.toString() }
        // Claimed before copying starts, so a second delivery during a slow import reuses this intake. Files chosen
        // on Home are a deliberate new job every time (review I2: the repeat path lost what they were chosen for).
        val intakeId = UUID.randomUUID().toString()
        if (pick == null) dedupe.claim(keys, intakeId, now)?.let {
            Log.i(Importer.TAG, "share repeated within window: existing intake reused")
            notifyListeners("intakeReady", JSObject().put("intakeId", it).put("repeat", true), true)
            return
        }
        Background.intakesInProgress += intakeId
        Background.intake.execute {
            guarded({
                Log.w(Importer.TAG, "share import failed: $it")
                dedupe.release(intakeId) // the retry the shopkeeper is asked for must not be taken for a duplicate
                notifyListeners("intakeFailed", JSObject().put("intakeId", intakeId).put("error", it), true)
            }) {
                notifyListeners("intakeProgress", JSObject().put("intakeId", intakeId).put("done", 0).put("total", uris.size))
                val result = importer.import(
                    uris, ::isOwnAuthority, intakeId, pick = pick,
                    onProgress = { done, total ->
                        notifyListeners("intakeProgress", JSObject().put("intakeId", intakeId).put("done", done).put("total", total))
                    },
                    cancelled = { intakeId in intakesCancelled },
                )
                // Nothing arrived (stalled, permission ended, empty): "share it again" must work at once, not be
                // taken for a repeat of this failed share (gate review #3).
                if (result.optJSONArray("files")?.length() == 0) dedupe.release(intakeId)
                notifyListeners("intakeReady", JSObject().put("intakeId", intakeId).put("repeat", false), true)
            }
            Background.intakesInProgress -= intakeId
            intakesCancelled.remove(intakeId) // also after a failed import (review M6)
        }
    }

    /** True when the authority (without any "userId@" prefix) belongs to a provider of this app. */
    private fun isOwnAuthority(authority: String): Boolean {
        val bare = authority.substringAfterLast('@')
        if (bare.startsWith("${context.packageName}.", ignoreCase = true)) return true
        return runCatching { context.packageManager.resolveContentProvider(bare, 0)?.packageName == context.packageName }
            .getOrDefault(true)
    }

    @Suppress("DEPRECATION")
    private fun collectUris(intent: Intent): List<Uri> {
        val out = LinkedHashSet<Uri>()
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val u = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableExtra<Parcelable>(Intent.EXTRA_STREAM) as? Uri
                u?.let(out::add)
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val list = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                list?.let(out::addAll)
            }
        }
        intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let(out::add) }
        return out.toList()
    }

    companion object {
        /** Survives activity recreation within the process, so a duplicate delivery maps to the same intake. */
        private val dedupe = DedupeWindow(windowMs = 60_000)

        /** Long side of the real-file preview pages (PLAN §F3 "preview thumbnail ≤ 1280 px"). */
        private const val PREVIEW_PX = 1280

        /** Long side of grid/preview thumbnails: crisp on a phone grid, small on disk (PLAN §F3). */
        private const val THUMB_PX = 640

        /** Page images for choosing pages (PLAN §F3: PDF page thumbnail). */
        private const val PAGE_THUMB_PX = 320

        /** Jobs whose face check was stopped (the shopkeeper chose); cleared when a new check starts. */
        private val faceTurnsCancelled: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

        /** An e-Aadhaar's cards are on its first page: only that page is looked at (review I2: every lone PDF pays). */
        private const val CARD_PDF_PAGES = 1

        /** Choose from phone: at most this many photos at once (as shares, PLAN §F6). */
        private const val MAX_PICK = 100

        /** Shares whose copying was cancelled (Receiving files → Cancel). */
        private val intakesCancelled: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

        /** Jobs whose black-edge analysis was stopped (the choice was made). */
        private val analysisCancelled: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

        /** Jobs whose thumbnails were cancelled (Received → Cancel). */
        private val thumbsCancelled: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

        /** Style samples (PLAN §F3: ≤ 360 px), in the order the Print style screen shows them. */
        private const val STYLE_SAMPLE_PX = 360
        private const val OCV_SAMPLE_FACTOR = 3
        private val STYLE_SAMPLES = listOf(
            "original" to Styles.ORIGINAL, "vibrant" to Styles.VIBRANT, "soft" to Styles.SOFT,
            "bw" to Styles.BW, "sharp" to Styles.SHARP, "ocv" to Styles.OCV,
        )
        private val THUMB_TYPES = setOf("jpeg", "png", "webp", "gif", "bmp")

        /** The app's one background thread (shared with the daily retention job, so they never race). */
        private val io = Background.io

        /** Raised by every new render: queued previews of an older plan are not made. */
        @Volatile private var previewGeneration = 0

        /** The running render's cancel switch; a new render or cancelRender() flips it. */
        private var renderToken: CancelToken? = null

        /** Keep at least this much free before writing a print file (same floor as receiving files, PLAN §D2). */
        private const val MIN_FREE_BYTES = 200L * 1024 * 1024

        /** Below this, no new preview page is made (the drawing stays); pages already made are still shown. */
        private const val PREVIEW_MIN_FREE_BYTES = 20L * 1024 * 1024

        /** Settings → "Allow screenshots for 15 minutes" sets this (Phase 2 settings). */
        @Volatile var screenshotsAllowedUntilMs = 0L
        @Volatile private var customerContentShown = false
    }
}
