package `in`.printsaathi.app.engine.intake

import org.json.JSONObject
import java.io.File

/**
 * One record per intake in [inboxDir]/<intakeId>.json (PLAN §D2 step 4). Records are written atomically and never
 * overwrite each other, so two quick shares are both kept (Gate 2 #7). States: copying → done, or copying →
 * interrupted (found on the next start after process death). The web app lists unacknowledged records and
 * acknowledges each once it has taken it into a job. Records hold paths and counts only, never names or content.
 */
class IntakeJournal(private val inboxDir: File, private val jobsDir: File) {
    private fun fileFor(id: String) = File(inboxDir.apply { mkdirs() }, "$id.json")

    @Synchronized
    fun begin(intakeId: String, expected: Int, nowMs: Long) {
        write(intakeId, JSONObject().put("intakeId", intakeId).put("state", "copying").put("expected", expected).put("createdAt", nowMs).put("acked", false))
    }

    /** Merges the import [result] (files, problems, counts) into the record and marks it done. */
    @Synchronized
    fun finish(intakeId: String, result: JSONObject) {
        val rec = read(fileFor(intakeId)) ?: JSONObject().put("intakeId", intakeId).put("createdAt", System.currentTimeMillis()).put("acked", false)
        for (k in result.keys()) rec.put(k, result.get(k))
        write(intakeId, rec.put("state", "done"))
    }

    /** After each file: what has arrived so far, so files already received survive process death (still copying). */
    @Synchronized
    fun progress(intakeId: String, soFar: JSONObject) {
        val rec = read(fileFor(intakeId)) ?: return
        for (k in soFar.keys()) rec.put(k, soFar.get(k))
        write(intakeId, rec.put("state", "copying"))
    }

    @Synchronized
    fun ack(intakeId: String) {
        read(fileFor(intakeId))?.let { write(intakeId, it.put("acked", true)) }
    }

    /** Ready records (done or interrupted) not yet acknowledged, oldest first. */
    @Synchronized
    fun pending(): List<JSONObject> =
        (inboxDir.listFiles { f -> f.name.endsWith(".json") } ?: emptyArray())
            .mapNotNull { read(it) }
            .filter { it.optString("state") in setOf("done", "interrupted") && !it.optBoolean("acked") }
            .sortedBy { it.optLong("createdAt") }

    /** On app start: intakes that were still copying when the process died. Deletes their half-written files. */
    @Synchronized
    fun recoverInterrupted(): Int {
        var n = 0
        for (f in inboxDir.listFiles { x -> x.name.endsWith(".json") } ?: emptyArray()) {
            val rec = read(f) ?: continue
            if (rec.optString("state") != "copying") continue
            val id = rec.getString("intakeId")
            File(jobsDir, "$id/src").listFiles { p -> p.name.endsWith(".part") }?.forEach { it.delete() }
            write(id, rec.put("state", "interrupted"))
            n++
        }
        return n
    }

    private fun read(f: File): JSONObject? = runCatching { JSONObject(f.readText()) }.getOrNull()

    private fun write(id: String, json: JSONObject) {
        val target = fileFor(id)
        val tmp = File(target.parentFile, "$id.json.tmp")
        tmp.outputStream().use { out ->
            out.write(json.toString().toByteArray())
            out.fd.sync()
        }
        check(tmp.renameTo(target)) { "journal write failed" }
    }
}
