package `in`.printsaathi.app.engine.intake

import android.content.Context
import `in`.printsaathi.app.engine.diag.Diagnostics
import android.net.Uri
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Phase 0 spike (a): copies shared files into private, never-backed-up storage the moment they arrive
 * (the read grant ends with the receiving task), sniffs the real type, and records a pending intake that
 * JS pulls. Only paths cross the bridge. Caps and timeouts: CopyLimits; one record per intake: IntakeJournal.
 * Never logs names, paths or contents.
 */
class Importer(private val context: Context) {
    data class Imported(val index: Int, val path: String, val type: SniffedType, val bytes: Long, val sha256: String)

    private val root: File get() = File(context.noBackupFilesDir, "jobs").apply { mkdirs() }
    private val pendingFile: File get() = File(File(context.noBackupFilesDir, "inbox").apply { mkdirs() }, "pending.json")

    private val journal by lazy { IntakeJournal(File(context.noBackupFilesDir, "inbox"), root) }

    /** Copies every shared item under [limits]; one journal record per intake (PLAN §D2). */
    fun import(
        uris: List<Uri>,
        isOwnAuthority: (String) -> Boolean,
        intakeId: String = UUID.randomUUID().toString(),
        limits: CopyLimits = CopyLimits(),
        /** Chosen on Home ("photos", "passport", "documents"), kept with the intake; null for a share. */
        pick: String? = null,
        /** After each file: (files done, files shared), for "Receiving files… 12 of 60" (PLAN §H2.7). */
        onProgress: (Int, Int) -> Unit = { _, _ -> },
        /** Cancel while receiving: stop after the file being copied; what arrived is kept (PLAN §D2). */
        cancelled: () -> Boolean = { false },
    ): JSONObject {
        journal.begin(intakeId, uris.size, System.currentTimeMillis())
        val src = File(File(root, intakeId), "src").apply { mkdirs() }
        val files = mutableListOf<Imported>()
        val problems = JSONArray()
        var refusedByPolicy = 0 // subset of rejected: refused by UriPolicy before any read (tests check this)
        var jobBytes = 0L
        val tooMany = uris.size > MAX_FILES
        var gaveUp = false
        var stopped = false
        if (!tooMany) uris.forEachIndexed { i, uri ->
            val n = i + 1
            if (i > 0) onProgress(i, uris.size)
            if (stopped || cancelled()) {
                stopped = true
                return@forEachIndexed
            }
            // After one stalled or timed-out file this sharing app is not sending: the rest of this share would
            // each wait the full limit (100 files x 20 s), holding up the shopkeeper's next real share (gate re-review N1).
            if (gaveUp) {
                problems.put(JSONObject().put("index", n).put("reason", "stalled"))
                return@forEachIndexed
            }
            // What arrived before this item survives process death (PLAN §D2: every file's state is recorded).
            if (i > 0) journal.progress(intakeId, snapshot(intakeId, files, problems, refusedByPolicy, false, uris.size, pick))
            if (!isAcceptableShareUri(uri.scheme, uri.authority, isOwnAuthority)) {
                refusedByPolicy++
                problems.put(JSONObject().put("index", n).put("reason", "refused"))
                return@forEachIndexed
            }
            val part = File(src, partName(n))
            val outcome = try {
                val input = context.contentResolver.openInputStream(uri) ?: error("no stream")
                val r = try {
                    FileOutputStream(part).use { out ->
                        copyStream(input, out, limits, jobBytes) { context.noBackupFilesDir.usableSpace }
                            .also { if (it is CopyOutcome.Copied) out.fd.sync() }
                    }
                } catch (e: Exception) {
                    runCatching { input.close() }
                    throw e
                }
                // After a stall the stream is being closed in the background: closing it here could block this
                // thread on Android 7 and 9 exactly like the stalled read did.
                if (r != CopyOutcome.Stalled && r != CopyOutcome.TimedOut) runCatching { input.close() }
                r
            } catch (e: SecurityException) {
                CopyOutcome.Failed("permission") // the share's read permission has ended: ask to share again
            } catch (e: Exception) {
                CopyOutcome.Failed(e.javaClass.simpleName)
            }
            if (outcome is CopyOutcome.Copied) {
                val type = sniff(outcome.head)
                val final = File(src, finalName(n, type.extension))
                if (part.renameTo(final)) {
                    files += Imported(n, final.absolutePath, type, outcome.bytes, outcome.sha256)
                    jobBytes += outcome.bytes
                    return@forEachIndexed
                }
                problems.put(JSONObject().put("index", n).put("reason", "failed"))
            } else {
                problems.put(JSONObject().put("index", n).put("reason", if (outcome == CopyOutcome.Failed("permission")) "permission" else outcome.code))
            }
            part.delete()
            if (outcome == CopyOutcome.Stalled || outcome == CopyOutcome.TimedOut) gaveUp = true
            Log.w(TAG, "intake item $n: ${outcome.code}")
        }
        val json = snapshot(intakeId, files, problems, refusedByPolicy, tooMany, uris.size, pick)
        if (stopped) json.put("cancelled", true).put("expected", uris.size)
        journal.finish(intakeId, json)
        // Latest-intake pointer kept for the Phase 0 test tools (share matrix); the journal is the record.
        writeAtomically(pendingFile, json.toString())
        Log.i(TAG, "intake done: ${files.size} files, ${problems.length()} problems")
        runCatching {
            Diagnostics(context.noBackupFilesDir).log(Diagnostics.Event.INTAKE, "files" to files.size, "problems" to problems.length())
        }
        return json
    }

    private fun snapshot(
        intakeId: String,
        files: List<Imported>,
        problems: JSONArray,
        refusedByPolicy: Int,
        tooMany: Boolean,
        shared: Int,
        pick: String?,
    ): JSONObject {
        return JSONObject().apply {
            put("intakeId", intakeId)
            if (pick != null) put("pick", pick)
            put("rejected", problems.length() + (if (tooMany) shared else 0))
            put("refusedByPolicy", refusedByPolicy)
            put("tooMany", tooMany)
            put("problems", problems)
            put("files", JSONArray().apply {
                files.forEach {
                    put(JSONObject().apply {
                        put("index", it.index)
                        put("path", it.path)
                        put("sniffedType", it.type.name.lowercase())
                        put("bytes", it.bytes)
                        put("sha256", it.sha256)
                    })
                }
            })
        }
    }

    /** Unacknowledged intakes, oldest first (done or interrupted). */
    fun listPending(): List<JSONObject> = journal.pending()

    fun ack(intakeId: String) = journal.ack(intakeId)

    /** On app start: intakes cut off by process death; their half files are deleted. Returns how many. */
    fun recoverInterrupted(): Int = journal.recoverInterrupted()

    fun pending(): JSONObject? = pendingFile.takeIf { it.exists() }?.let { JSONObject(it.readText()) }

    private fun writeAtomically(target: File, text: String) {
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.outputStream().use { out ->
            out.write(text.toByteArray())
            out.fd.sync()
        }
        if (!tmp.renameTo(target)) error("could not write ${target.name}")
    }

    companion object {
        const val TAG = "PrintSaathi"

        /** PLAN §F6: more than this is refused as a whole ("share up to 100 at a time"), never silently cut. */
        const val MAX_FILES = 100
    }
}
