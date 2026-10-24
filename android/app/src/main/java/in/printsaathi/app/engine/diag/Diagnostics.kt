package `in`.printsaathi.app.engine.diag

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Diagnostics (PLAN §E, §Q): what happened and how long it took, for the problem report (§K10). Events are fixed in
 * the code; their values are numbers and true/false only — any text is dropped — so a customer's file name, path,
 * text or password can never be kept. Crashes keep their kind and where in the code, never their message. Two
 * rotating files of at most [maxBytesPerFile] each (1 MB in all) in noBackupFilesDir/diag, never backed up and only
 * ever shared by the owner's own tap.
 */
class Diagnostics(
    stateRoot: File,
    private val maxBytesPerFile: Long = 512L * 1024,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    enum class Event(val wire: String) {
        START("start"), SAFE_START("safe_start"), INTAKE("intake"), ENGINE_DIED("engine_died"), ENGINE_OOM("engine_oom"),
        RENDER("render"), PRINT("print"), WEBVIEW_GONE("webview_gone"), CRASH("crash"),
    }

    private val dir = File(stateRoot, "diag")
    private val file = File(dir, "log.jsonl")
    private val older = File(dir, "log.1.jsonl")

    /** One event; [fields] keep only numbers and true/false (keys are the code's own words). */
    fun log(event: Event, vararg fields: Pair<String, Any?>) {
        val o = JSONObject().put("t", clock()).put("e", event.wire)
        for ((k, v) in fields) when (v) {
            is Double -> if (v.isFinite()) o.put(k, v)
            is Float -> if (v.isFinite()) o.put(k, v.toDouble())
            is Number -> o.put(k, v.toLong())
            is Boolean -> o.put(k, v)
            else -> Unit // text and anything else: never kept
        }
        append(o.toString())
    }

    /**
     * An app crash: its kind and the code it went through (full class.method:line), never its message. Full names, so a
     * release build's renamed classes map back through its mapping file without ambiguity (Phase 12 review I4).
     */
    fun crash(e: Throwable) {
        val frames = JSONArray()
        e.stackTrace.take(15).forEach { frames.put("${it.className}.${it.methodName}:${it.lineNumber}") }
        val kinds = JSONArray()
        var c: Throwable? = e
        while (c != null && kinds.length() < 5) {
            kinds.put(c.javaClass.name)
            c = c.cause
        }
        append(JSONObject().put("t", clock()).put("e", Event.CRASH.wire).put("kinds", kinds).put("at", frames).toString())
    }

    /** The newest [n] events, oldest first. */
    fun recent(n: Int): List<String> = synchronized(LOCK) {
        (lines(older) + lines(file)).takeLast(n)
    }

    /** The problem report: [header] (versions, phone, shop) and the newest 200 events. */
    fun report(header: List<String>): String =
        (header + listOf("", "Last events (times in ms since 1970):") + recent(200)).joinToString("\n")

    private fun lines(f: File): List<String> = runCatching { f.readLines().filter { it.isNotBlank() } }.getOrDefault(emptyList())

    /** One lock for every Diagnostics object (they are made on several threads, review M6). */
    private fun append(line: String) = synchronized(LOCK) {
        runCatching {
            dir.mkdirs()
            if (file.length() + line.length + 1 > maxBytesPerFile) {
                older.delete()
                file.renameTo(older)
            }
            file.appendText(line + "\n")
        }
    }

    private companion object {
        val LOCK = Any()
    }
}
