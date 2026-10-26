package `in`.printsaathi.app.engine.intake

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID

/**
 * Owner, round 8 (scan pages): the one photo the phone's own camera app may write, straight into a new intake's
 * private folder (jobs/<intakeId>/src/0001.capture) through the app's non-exported provider ([fileFor]). A record in
 * inbox/capture.json names it by a random token, so it survives Android stopping the app while the camera is open;
 * whoever [claim]s the record first (the camera's answer, or the next start) imports the photo ([toIntake]) exactly
 * once. Nothing taken leaves nothing. Never logs paths.
 */
class CaptureStore(private val inbox: File, private val root: File) {
    /** [into]: a scan job the page joins; [retake]: the page of that job it takes the place of. */
    data class Pending(val token: String, val intakeId: String, val into: String?, val retake: Int?, val atMs: Long)

    private val record: File get() = File(inbox, "capture.json")

    /** A new waiting photo (any earlier waiting one must have been claimed first). */
    @Synchronized
    fun start(into: String?, retake: Int?, nowMs: Long): Pending {
        require(into == null || JOB_ID.matches(into)) { "job" }
        require(retake == null || (into != null && retake in 1..9_999)) { "page" }
        val p = Pending(UUID.randomUUID().toString(), UUID.randomUUID().toString(), into, retake, nowMs)
        inbox.mkdirs()
        File(File(root, p.intakeId), "src").mkdirs()
        val json = JSONObject().put("token", p.token).put("intakeId", p.intakeId).put("atMs", p.atMs)
        p.into?.let { json.put("into", it) }
        p.retake?.let { json.put("retake", it) }
        val tmp = File(inbox, "capture.json.tmp")
        tmp.outputStream().use { out ->
            out.write(json.toString().toByteArray())
            out.fd.sync()
        }
        check(tmp.renameTo(record)) { "capture not recorded" }
        return p
    }

    /**
     * The file the provider may open for a URI's [path] in [mode]: only the waiting photo ("/c/<token>"), and only to
     * write it (the camera never reads anything of the app's).
     */
    @Synchronized
    fun fileFor(path: String?, mode: String): File? {
        if ('w' !in mode) return null
        val p = read() ?: return null
        if (path != "/c/${p.token}") return null
        return fileOf(p)
    }

    /** The waiting photo's record, taken away (so a second claim gets null); null when none or damaged. */
    @Synchronized
    fun claim(): Pending? {
        val p = read()
        record.delete()
        return p
    }

    /** The waiting photo's intake (its folder is not old customer files: retention leaves it). */
    @Synchronized
    fun waitingIntakeId(): String? = read()?.intakeId

    /**
     * A claimed photo as an intake record (as Importer's, pick "scan", with [Pending.into] / [Pending.retake] as
     * "scan"), or null when the camera gave nothing (its folder is removed). Something that is not a photo is refused.
     */
    fun toIntake(p: Pending): JSONObject? {
        val f = fileOf(p)
        val dir = File(root, p.intakeId)
        if (!f.isFile || f.length() == 0L) {
            dir.deleteRecursively()
            return null
        }
        val head = ByteArray(HEAD)
        val n = f.inputStream().use { it.read(head) }
        val type = sniff(if (n < HEAD) head.copyOf(maxOf(n, 0)) else head)
        val files = JSONArray()
        val problems = JSONArray()
        if (type in PHOTOS) {
            val photo = File(f.parentFile, "0001.${type.extension}")
            check(f.renameTo(photo)) { "photo not kept" }
            files.put(
                JSONObject().put("index", 1).put("path", photo.absolutePath).put("sniffedType", type.name.lowercase())
                    .put("bytes", photo.length()).put("sha256", sha256(photo)),
            )
        } else {
            f.delete()
            problems.put(JSONObject().put("index", 1).put("reason", "notPhoto"))
        }
        val json = JSONObject().put("intakeId", p.intakeId).put("pick", "scan").put("rejected", problems.length())
            .put("refusedByPolicy", 0).put("tooMany", false).put("problems", problems).put("files", files)
        if (p.into != null) json.put("scan", JSONObject().put("into", p.into).apply { p.retake?.let { put("retake", it) } })
        return json
    }

    private fun fileOf(p: Pending) = File(File(File(root, p.intakeId), "src"), CAPTURE)

    private fun read(): Pending? {
        if (!record.isFile) return null
        val p = runCatching {
            val o = JSONObject(record.readText())
            Pending(
                o.getString("token"),
                o.getString("intakeId"),
                o.optString("into").takeIf { it.isNotEmpty() },
                if (o.has("retake")) o.getInt("retake") else null,
                o.optLong("atMs"),
            )
        }.getOrNull()
        val ok = p != null && TOKEN.matches(p.token) && TOKEN.matches(p.intakeId) &&
            (p.into == null || JOB_ID.matches(p.into)) && (p.retake == null || p.retake in 1..9_999)
        if (!ok) {
            record.delete()
            return null
        }
        return p
    }

    private fun sha256(f: File): String {
        val d = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val r = input.read(buf)
                if (r < 0) break
                d.update(buf, 0, r)
            }
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val CAPTURE = "0001.capture"
        private const val HEAD = 4096 // as a copy reads (CopyLimits)
        private val PHOTOS = setOf(SniffedType.JPEG, SniffedType.PNG, SniffedType.WEBP, SniffedType.HEIF)
        private val JOB_ID = Regex("^[A-Za-z0-9-]{1,64}$")
        private val TOKEN = Regex("^[0-9a-f-]{36}$")
    }
}
