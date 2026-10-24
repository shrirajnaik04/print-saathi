package `in`.printsaathi.app.engine.jobs

import `in`.printsaathi.app.engine.docs.Decrypted
import org.json.JSONObject
import java.io.File

/**
 * Retention for customer files (PLAN §E). Under [root] (noBackupFilesDir): every jobs/<id> folder whose last
 * activity is older than the chosen time goes, together with its inbox/<id>.json; received files that never became
 * a job follow the same rule. Above the storage cap the oldest printed jobs go first, then the oldest others.
 * [protect]: the job on screen and the job being printed, never touched. Kept jobs lose their scratch (work/) and
 * half-written print files; the job on screen keeps what its locked PDF needs (unlocked copy, page images), and a kept
 * job not on screen forgets its decrypted data (PLAN §G5). Run it only on the shared background thread, so it never
 * races a render.
 */
class JobSweeper(private val root: File) {
    private class Entry(val id: String, val dir: File, val lastActivity: Long, val printed: Boolean, var bytes: Long = 0)

    /** Returns the ids deleted. */
    fun sweep(nowMs: Long, keepMs: Long, capBytes: Long, protect: Set<String>): Set<String> {
        val entries = (File(root, "jobs").listFiles { f -> f.isDirectory } ?: emptyArray()).map(::entry)
        val deleted = linkedSetOf<String>()
        for (e in entries) {
            if (e.id in protect) continue
            if (nowMs - e.lastActivity > keepMs) {
                delete(e)
                deleted += e.id
            }
        }
        val kept = entries.filter { it.id !in deleted }
        kept.forEach { e ->
            if (e.id in protect) {
                // Scratch only (re-review I5/I6): a locked PDF's unlocked copy and page images stay while it is open.
                File(e.dir, "work").listFiles()
                    ?.filterNot { (it.isFile && it.name.startsWith("unlocked-") && it.name.endsWith(".pdf")) || it.name == "page-thumbs" }
                    ?.forEach { it.deleteRecursively() }
            } else {
                File(e.dir, "work").deleteRecursively()
                if (Decrypted.isMarked(e.dir)) Decrypted.forget(e.dir, keepOut = null)
            }
            File(e.dir, "out").walkBottomUp().filter { it.isFile && it.name.endsWith(".part") }.forEach { it.delete() }
            e.bytes = e.dir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
        }
        var total = kept.sumOf { it.bytes }
        if (total > capBytes) {
            val order = kept.filter { it.id !in protect }
                .sortedWith(compareBy<Entry>({ !it.printed }, { it.lastActivity }))
            for (e in order) {
                if (total <= capBytes) break
                delete(e)
                deleted += e.id
                total -= e.bytes
            }
        }
        dropLatestPointerIfGone()
        return deleted
    }

    /** Content hashes of every file still kept (jobs, and shares not yet taken into a job). */
    fun keptHashes(): Set<String> {
        val jobs = (File(root, "jobs").listFiles { f -> f.isDirectory } ?: emptyArray()).flatMap { d ->
            val items = runCatching { JSONObject(File(d, "job.json").readText()).optJSONArray("items") }.getOrNull()
            (0 until (items?.length() ?: 0)).mapNotNull { items?.optJSONObject(it)?.optString("sha256")?.takeIf(String::isNotEmpty) }
        }
        val inbox = (File(root, "inbox").listFiles { f -> f.name.endsWith(".json") } ?: emptyArray()).flatMap { f ->
            val files = runCatching { JSONObject(f.readText()).optJSONArray("files") }.getOrNull()
            (0 until (files?.length() ?: 0)).mapNotNull { files?.optJSONObject(it)?.optString("sha256")?.takeIf(String::isNotEmpty) }
        }
        return (jobs + inbox).toSet()
    }

    /** inbox/pending.json (the latest share, for test tools) holds paths and hashes: it goes when its job goes. */
    private fun dropLatestPointerIfGone() {
        val p = File(root, "inbox/pending.json")
        val id = runCatching { JSONObject(p.readText()).optString("intakeId") }.getOrNull() ?: return
        if (id.isEmpty() || !File(root, "jobs/$id").isDirectory) p.delete()
    }

    /** Settings → "Delete all customer files now". Returns the ids deleted. */
    fun deleteAll(protect: Set<String>): Set<String> =
        (File(root, "jobs").listFiles { f -> f.isDirectory } ?: emptyArray())
            .filter { it.name !in protect }
            .onEach { delete(entry(it)) }
            .map { it.name }
            .toSet()
            .also { dropLatestPointerIfGone() }

    private fun entry(dir: File): Entry {
        val json = runCatching { JSONObject(File(dir, "job.json").readText()) }.getOrNull()
        val newestFile = dir.walkTopDown().maxOfOrNull { it.lastModified() } ?: 0L
        val lastActivity = maxOf(json?.optLong("updatedAt", 0L) ?: 0L, newestFile)
        return Entry(dir.name, dir, lastActivity, json?.has("printedAt") == true)
    }

    private fun delete(e: Entry) {
        e.dir.deleteRecursively()
        File(root, "inbox/${e.id}.json").delete()
    }
}
