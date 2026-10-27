package `in`.printsaathi.app.engine.intake

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.UUID

/**
 * Round 9: the customer files handed to an office app by Print with WPS Office. Each hand-off is a random token naming
 * one job's original Office file (jobs/<id>/src/NNNN.office); [fileFor] serves only those, only for reading. The last
 * [MAX] tokens are kept (inbox/office-shares.json), so an office app reopening the file a little later still can.
 */
class OfficeShares(private val inbox: File, private val root: File) {
    private val record: File get() = File(inbox, "office-shares.json")

    @Synchronized
    fun grant(jobId: String, index: Int): String {
        require(JOB_ID.matches(jobId) && index in 1..9_999) { "bad item" }
        val token = UUID.randomUUID().toString()
        val list = read().apply { add(Triple(token, jobId, index)) }.takeLast(MAX)
        inbox.mkdirs()
        val json = JSONArray()
        for ((t, j, i) in list) json.put(JSONObject().put("token", t).put("jobId", j).put("index", i))
        val tmp = File(inbox, "office-shares.json.tmp")
        tmp.writeText(json.toString())
        check(tmp.renameTo(record) || (record.delete() && tmp.renameTo(record))) { "not recorded" }
        return token
    }

    /** The granted original for a URI's [path] ("/o/<token>") opened in [mode]; never for writing. */
    @Synchronized
    fun fileFor(path: String?, mode: String): File? {
        if ('w' in mode || path == null || !path.startsWith("/o/")) return null
        val token = path.removePrefix("/o/")
        if (!TOKEN.matches(token)) return null
        val (_, jobId, index) = read().firstOrNull { it.first == token } ?: return null
        val f = File(File(File(root, jobId), "src"), String.format(Locale.ROOT, "%04d.office", index))
        return f.takeIf { it.isFile && it.canonicalPath.startsWith(root.canonicalPath + File.separator) }
    }

    private fun read(): MutableList<Triple<String, String, Int>> = runCatching {
        val a = JSONArray(record.readText())
        MutableList(a.length()) { k ->
            val o = a.getJSONObject(k)
            Triple(o.getString("token"), o.getString("jobId"), o.getInt("index"))
        }.filter { (t, j, i) -> TOKEN.matches(t) && JOB_ID.matches(j) && i in 1..9_999 }.toMutableList()
    }.getOrDefault(mutableListOf())

    companion object {
        const val MAX = 20
        private val JOB_ID = Regex("^[A-Za-z0-9-]{1,64}$")
        private val TOKEN = Regex("^[0-9a-f-]{36}$")
    }
}
