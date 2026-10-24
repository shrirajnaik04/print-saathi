package `in`.printsaathi.app.engine.jobs

import java.io.File

/**
 * Crash-loop breaker (PLAN §D5). Each app crash (uncaught exception, or the WebView's renderer dying) appends its time
 * to state/crashes. When the newest two are within [WINDOW_MS], the next start is a safe start: Home with an
 * explanation, the job kept but not opened automatically, so a file or screen that crashes the app can't trap the shopkeeper
 * in a loop. Times only.
 */
class CrashLog(stateRoot: File) {
    private val file = File(File(stateRoot, "state"), "crashes")

    /** Called from a crash handler: plain append, no temp file, as little work as possible. */
    @Synchronized fun record(nowMs: Long) {
        file.parentFile?.mkdirs()
        file.appendText("$nowMs\n")
    }

    @Synchronized fun isSafeStart(): Boolean {
        val times = runCatching { file.readLines().mapNotNull { it.trim().toLongOrNull() } }.getOrDefault(emptyList())
        if (times.size < 2) return false
        val (a, b) = times.takeLast(2)
        return b - a in 0..WINDOW_MS
    }

    /** The safe start was shown: start counting again. */
    @Synchronized fun acknowledge() {
        file.delete()
    }

    companion object {
        const val WINDOW_MS = 60_000L
    }
}
