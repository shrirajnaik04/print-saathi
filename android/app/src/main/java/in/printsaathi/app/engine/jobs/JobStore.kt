package `in`.printsaathi.app.engine.jobs

import org.json.JSONObject
import java.io.File

/**
 * jobs/<id>/job.json (PLAN §E). The web app is the single writer of a job's choices; this store only accepts a
 * write whose `rev` is newer than the stored one, so a stale writer can never overwrite newer choices (§D2c).
 * Writes are atomic (temp → fsync → rename). A job's id is its first intake's id, so its received files
 * (jobs/<id>/src) live beside it.
 */
class JobStore(private val jobsDir: File) {
    private val idPattern = Regex("^[A-Za-z0-9-]{1,64}$")

    private fun dir(id: String): File? = if (idPattern.matches(id)) File(jobsDir, id) else null

    /** Returns false when [id] is invalid or [job]'s rev is not newer than the stored one. */
    @Synchronized
    fun save(id: String, job: JSONObject): Boolean {
        val d = dir(id) ?: return false
        val rev = job.optInt("rev", -1)
        if (rev < 1) return false
        val current = load(id)?.optInt("rev", 0) ?: 0
        if (rev <= current) return false
        d.mkdirs()
        val tmp = File(d, "job.json.tmp")
        tmp.outputStream().use { out ->
            out.write(job.toString().toByteArray())
            out.fd.sync()
        }
        return tmp.renameTo(File(d, "job.json"))
    }

    @Synchronized
    fun load(id: String): JSONObject? = dir(id)?.let { File(it, "job.json") }?.takeIf { it.exists() }
        ?.let { runCatching { JSONObject(it.readText()) }.getOrNull() }

    /** Every readable job, most recently changed first. */
    @Synchronized
    fun list(): List<JSONObject> = (jobsDir.listFiles { f -> f.isDirectory } ?: emptyArray())
        .mapNotNull { load(it.name) }
        .sortedByDescending { it.optLong("updatedAt") }

    @Synchronized
    fun delete(id: String) {
        dir(id)?.deleteRecursively()
    }
}
