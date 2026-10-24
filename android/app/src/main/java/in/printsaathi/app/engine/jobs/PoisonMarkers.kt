package `in`.printsaathi.app.engine.jobs

import java.io.File

/**
 * Crash-loop protection for customer files (PLAN §D5). Before the engine touches a file its content hash is written
 * to state/processing; afterwards it is removed. A death on that file (the app process dying mid-file, found by the
 * next start's [recover], or the engine process dying, reported via [recordDeath]) is counted in state/poisoned.
 * After [DEATHS] deaths the file shows as "damaged" and is never handed to the engine again; one death is not
 * enough, because Android may end the app in the background mid-photo (gate review #4). Content hashes only, and
 * they are dropped once no kept job holds that file ([retainOnly]).
 */
class PoisonMarkers(stateDir: File) {
    private val dir = File(stateDir, "state").apply { mkdirs() }
    private val processing = File(dir, "processing")
    private val deathsFile = File(dir, "poisoned")

    @Synchronized fun begin(sha256: String) = write(processing, sha256)

    @Synchronized fun end(sha256: String) {
        if (processing.exists() && processing.readText() == sha256) processing.delete()
    }

    /** Counts one death on this file; returns true when it is now marked damaged. */
    @Synchronized fun recordDeath(sha256: String): Boolean {
        deathsFile.appendText("$sha256\n")
        end(sha256)
        return isPoisoned(sha256)
    }

    /** At start: a leftover processing marker means the process died on that file. */
    @Synchronized fun recover() {
        if (processing.exists()) recordDeath(processing.readText().trim())
    }

    @Synchronized fun poisoned(): Set<String> = deaths().filterValues { it >= DEATHS }.keys

    fun isPoisoned(sha256: String) = (deaths()[sha256] ?: 0) >= DEATHS

    /** Forgets every file not in [kept] (the hashes of the jobs still stored). */
    @Synchronized fun retainOnly(kept: Set<String>) {
        val lines = lines().filter { it in kept }
        if (lines.isEmpty()) deathsFile.delete() else write(deathsFile, lines.joinToString("") { "$it\n" })
    }

    private fun lines(): List<String> = if (deathsFile.exists()) deathsFile.readLines().filter { it.isNotBlank() } else emptyList()

    private fun deaths(): Map<String, Int> = lines().groupingBy { it }.eachCount()

    private fun write(f: File, text: String) {
        val tmp = File(f.parentFile, f.name + ".tmp")
        tmp.outputStream().use { out ->
            out.write(text.toByteArray())
            out.fd.sync()
        }
        tmp.renameTo(f)
    }

    companion object {
        const val DEATHS = 2
    }
}
