package `in`.printsaathi.app.engine.settings

import org.json.JSONObject
import java.io.File

/**
 * The shop owner's settings (PLAN §I-15) at state/settings.json (never backed up, PLAN §E). The web app is the only
 * writer and normalises them (src/core/settings); this side keeps the file and reads the few values the phone itself
 * needs — the retention period (the daily cleanup runs without the web app), the screenshots window, the shop name —
 * each with its default when missing or odd.
 */
class SettingsStore(stateRoot: File) {
    private val dir = File(stateRoot, "state")
    private val file = File(dir, "settings.json")

    @Synchronized fun load(): JSONObject? = runCatching { JSONObject(file.readText()) }.getOrNull()

    /** False when [settings] is too big to be settings (16 KB). Atomic: temp → fsync → rename. */
    @Synchronized fun save(settings: JSONObject): Boolean {
        val bytes = settings.toString().toByteArray()
        if (bytes.size > MAX_BYTES) return false
        dir.mkdirs()
        val tmp = File(dir, "settings.json.tmp")
        tmp.outputStream().use { out ->
            out.write(bytes)
            out.fd.sync()
        }
        return tmp.renameTo(file)
    }

    /** "Delete customer files after": 1 hour, 1 day (default) or 7 days. */
    fun keepMs(): Long = when (load()?.optString("retention")) {
        "1h" -> HOUR
        "7d" -> 7 * DAY
        else -> DAY
    }

    /** "Allow screenshots for 15 minutes": until this time (ms), 0 when off. */
    fun screenshotsUntil(): Long = load()?.opt("screenshotsUntil").let { (it as? Number)?.toLong() ?: 0L }.coerceAtLeast(0)

    fun shopName(): String = (load()?.opt("shopName") as? String)?.take(40) ?: ""

    companion object {
        const val MAX_BYTES = 16 * 1024
        private const val HOUR = 3_600_000L
        private const val DAY = 24 * HOUR
    }
}
