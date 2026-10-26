package `in`.printsaathi.app.engine.intake

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Locale

/**
 * Owner, round 8: a customer's text message (shared from WhatsApp, or pasted on Home). The job's one file is the PDF
 * the isolated engine makes of it ([toPdf]), so every document step works on it; the text itself is kept beside it as
 * NNNN.txt for Edit text and Text size. Only files inside that job's own src folder are ever read or written; the text
 * is never logged.
 */
object TextIntake {
    const val MAX_CHARS = 100_000
    val SIZES = setOf(10, 12, 14, 18)
    private const val DEFAULT_SIZE = 12
    private val JOB_ID = Regex("^[A-Za-z0-9-]{1,64}$")

    /** The intake record (as Importer's) for [text] as job [intakeId]'s file 1, or with its problem and no file. */
    fun make(root: File, intakeId: String, text: String, toPdf: (File, File, Int) -> Result<Int>): JSONObject {
        val problem = when {
            text.isBlank() -> "emptyText"
            text.length > MAX_CHARS -> "textTooLong"
            else -> null
        }
        val files = JSONArray()
        val problems = JSONArray()
        if (problem == null) {
            val src = srcOf(root, intakeId) ?: error("bad intake id")
            src.mkdirs()
            val txt = File(src, name(1, "txt"))
            val pdf = File(src, name(1, "pdf"))
            writeAtomically(txt, text)
            val made = toPdf(txt, pdf, DEFAULT_SIZE * 10)
            if (made.isSuccess && pdf.length() > 0) {
                files.put(fileJson(1, pdf, DEFAULT_SIZE))
            } else {
                txt.delete()
                pdf.delete()
                problems.put(JSONObject().put("index", 1).put("reason", "failed"))
            }
        } else {
            problems.put(JSONObject().put("index", 1).put("reason", problem))
        }
        return JSONObject()
            .put("intakeId", intakeId)
            .put("pick", "text")
            .put("rejected", problems.length())
            .put("refusedByPolicy", 0)
            .put("tooMany", false)
            .put("problems", problems)
            .put("files", files)
    }

    /**
     * Edit text ([text], or the kept text when null) and Text size ([sizePt]) of job [jobId]'s text file [index]: a
     * new PDF beside the old one (a new name, so nothing shown or cached is the old one): {path, bytes, sha256, pages,
     * size}. Fails for a job or file outside the jobs folder, a size the app never offers, or empty / too long text.
     */
    fun remake(root: File, jobId: String, index: Int, text: String?, sizePt: Int, nowMs: Long, toPdf: (File, File, Int) -> Result<Int>): JSONObject {
        require(sizePt in SIZES) { "text size" }
        val src = srcOf(root, jobId) ?: error("bad job")
        val txt = textFile(src, index) ?: error("bad item")
        if (text != null) {
            require(text.isNotBlank() && text.length <= MAX_CHARS) { "empty or too long" }
            writeAtomically(txt, text)
        }
        require(txt.isFile) { "no text" }
        val pdf = File(src, String.format(Locale.ROOT, "%04d-%d-%d.pdf", index, sizePt, nowMs))
        val pages = toPdf(txt, pdf, sizePt * 10).getOrElse {
            pdf.delete()
            throw it
        }
        return fileJson(index, pdf, sizePt).put("pages", pages)
    }

    /** The kept text of job [jobId]'s file [index], or null (none, or not inside that job). */
    fun read(root: File, jobId: String, index: Int): String? {
        val src = srcOf(root, jobId) ?: return null
        val txt = textFile(src, index) ?: return null
        return if (txt.isFile) txt.readText(Charsets.UTF_8) else null
    }

    private fun srcOf(root: File, jobId: String): File? {
        if (!JOB_ID.matches(jobId)) return null
        val src = File(File(root, jobId), "src")
        return src.takeIf { it.canonicalPath.startsWith(root.canonicalPath + File.separator) }
    }

    private fun textFile(src: File, index: Int): File? =
        if (index in 1..9_999) File(src, name(index, "txt")) else null

    private fun name(n: Int, ext: String) = String.format(Locale.ROOT, "%04d.%s", n, ext)

    private fun fileJson(index: Int, pdf: File, size: Int) = JSONObject()
        .put("index", index)
        .put("path", pdf.absolutePath)
        .put("sniffedType", "pdf")
        .put("bytes", pdf.length())
        .put("sha256", sha256(pdf))
        .put("text", JSONObject().put("size", size))

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

    private fun writeAtomically(target: File, text: String) {
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.outputStream().use { out ->
            out.write(text.toByteArray(Charsets.UTF_8))
            out.fd.sync()
        }
        if (!tmp.renameTo(target)) {
            target.delete()
            check(tmp.renameTo(target)) { "text not saved" }
        }
    }
}
