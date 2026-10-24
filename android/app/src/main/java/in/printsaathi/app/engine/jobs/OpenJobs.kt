package `in`.printsaathi.app.engine.jobs

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The jobs on the shopkeeper's screens, kept on disk (job ids only) for retention. The daily retention job can run in a process
 * where the web app has not said yet which jobs are open; it still must not delete a job whose screen comes back when
 * The shopkeeper returns (the web app restores the screens for 30 minutes, PLAN §D5). A minute is added for the moments between
 * the two saves.
 */
class OpenJobs(stateRoot: File) {
    private val dir = File(stateRoot, "state")
    private val file = File(dir, "open-jobs.json")

    @Synchronized fun save(ids: Set<String>, nowMs: Long) {
        dir.mkdirs()
        val tmp = File(dir, "open-jobs.json.tmp")
        tmp.outputStream().use { out ->
            out.write(JSONObject().put("at", nowMs).put("ids", JSONArray(ids.toList())).toString().toByteArray())
            out.fd.sync()
        }
        tmp.renameTo(file)
    }

    /** The jobs saved as open, if their screens can still come back at [nowMs]; else none. */
    @Synchronized fun recent(nowMs: Long): Set<String> = runCatching {
        val j = JSONObject(file.readText())
        // One-sided like persist.ts: a clock set back (negative age) still restores, so it still protects (review M1).
        if (nowMs - j.getLong("at") > RESTORE_MS + 60_000) return emptySet()
        val ids = j.getJSONArray("ids")
        (0 until ids.length()).map { ids.getString(it) }.toSet()
    }.getOrDefault(emptySet())

    companion object {
        /** The web app's restore window (src/core/nav/persist.ts RESTORE_MS). */
        const val RESTORE_MS = 30L * 60 * 1000
    }
}
