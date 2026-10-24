package `in`.printsaathi.app.engine.docs

import org.json.JSONObject
import java.io.File

/**
 * What the engine read from an unlocked PDF (pages, sizes, forms), kept by the file's hash in the job's thumbs folder
 * so it is read once. A damaged entry is forgotten and the PDF read again (review M5); writes are all or nothing.
 */
class FactsCache(private val dir: File) {
    private fun file(sha: String) = File(dir, "pdf-$sha.json")

    fun read(sha: String): JSONObject? {
        val f = file(sha)
        if (!f.isFile) return null
        return runCatching { JSONObject(f.readText()) }.getOrNull() ?: run {
            f.delete()
            null
        }
    }

    fun write(sha: String, facts: JSONObject) {
        val part = File(dir, "pdf-$sha.json.part")
        part.writeText(facts.toString())
        if (!part.renameTo(file(sha))) part.delete()
    }
}
