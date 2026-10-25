package `in`.printsaathi.app.engine.print

import org.json.JSONObject
import java.io.File

/** What is being printed: a customer job, or a test page from Settings / Help (never shown as a customer job). */
enum class PrintKind(val wireName: String) {
    JOB("job"),
    TEST_A4("testA4"),
    TEST_PHOTO("testPhoto"),
    ;

    val isTest get() = this != JOB

    companion object {
        fun of(wire: String?) = entries.firstOrNull { it.wireName == wire } ?: JOB
    }
}

/**
 * The one print in flight (PLAN §D4). [label] is the print job's name in Android (no customer data), used to find
 * the job again after the app was killed. Ids and flags only: never a path or a file name.
 */
data class PrintRecord(
    val jobId: String,
    val planHash: String,
    val label: String,
    val startedAt: Long,
    val finished: Boolean,
    val wrongPaper: Boolean,
    /** When Android's print screen closed (0 while it is open). */
    val closedAt: Long = 0,
    val kind: PrintKind = PrintKind.JOB,
    /** Big jobs print in parts (PLAN §D4): which part this is (from 0) of how many. */
    val part: Int = 0,
    val parts: Int = 1,
    /** The full plan's hash the part was cut from ("" for a job printed in one go), kept across a restart. */
    val partOf: String = "",
    /** Android asked for the final file (the print button was pressed). An older record, without it, counts as asked. */
    val finalAsked: Boolean = true,
)

private val HEX16 = Regex("^[0-9a-f]{16}$")

/** state/print.json under noBackupFilesDir; atomic writes (temp -> fsync -> rename). */
class PrintRecordStore(stateRoot: File) {
    private val dir = File(stateRoot, "state")
    private val file = File(dir, "print.json")

    @Synchronized fun save(r: PrintRecord) {
        dir.mkdirs()
        val json = JSONObject()
            .put("jobId", r.jobId).put("planHash", r.planHash).put("label", r.label)
            .put("startedAt", r.startedAt).put("finished", r.finished).put("wrongPaper", r.wrongPaper)
            .put("closedAt", r.closedAt).put("kind", r.kind.wireName)
            .put("part", r.part).put("parts", r.parts).put("partOf", r.partOf).put("finalAsked", r.finalAsked)
        val tmp = File(dir, "print.json.tmp")
        tmp.outputStream().use { out ->
            out.write(json.toString().toByteArray())
            out.fd.sync()
        }
        tmp.renameTo(file)
    }

    @Synchronized fun load(): PrintRecord? = runCatching {
        val j = JSONObject(file.readText())
        PrintRecord(
            j.getString("jobId"), j.getString("planHash"), j.getString("label"),
            j.getLong("startedAt"), j.getBoolean("finished"), j.getBoolean("wrongPaper"), j.optLong("closedAt", 0),
            PrintKind.of(j.optString("kind", "job")),
            j.optInt("part", 0),
            j.optInt("parts", 1),
            j.optString("partOf", "").takeIf { HEX16.matches(it) } ?: "",
            j.optBoolean("finalAsked", true),
        )
    }.getOrNull()

    @Synchronized fun clear() {
        file.delete()
    }
}
