package `in`.printsaathi.app.engine.intake

/**
 * The same share delivered again within [windowMs] (e.g. a rapid double delivery) maps to the intake
 * that already exists. After the window, sharing the same content again is a NEW job: the owner may
 * intentionally print the same file twice (PLAN §D2b). Never drops a share silently.
 */
class DedupeWindow(private val windowMs: Long) {
    private data class Entry(val key: Set<String>, val intakeId: String, val atMs: Long)
    private val entries = ArrayDeque<Entry>()

    @Synchronized
    fun existingIntake(uris: List<String>, nowMs: Long): String? {
        entries.removeAll { nowMs - it.atMs > windowMs }
        val key = uris.toSet()
        return entries.lastOrNull { it.key == key }?.intakeId
    }

    /** Atomically returns the existing intake for these URIs, or records [newIntakeId] and returns null. */
    @Synchronized
    fun claim(uris: List<String>, newIntakeId: String, nowMs: Long): String? =
        existingIntake(uris, nowMs) ?: run {
            record(uris, newIntakeId, nowMs)
            null
        }

    /** Forgets a claim whose import failed, so the "share it again" retry starts a new intake immediately. */
    @Synchronized
    fun release(intakeId: String) {
        entries.removeAll { it.intakeId == intakeId }
    }

    @Synchronized
    fun record(uris: List<String>, intakeId: String, nowMs: Long) {
        entries.addLast(Entry(uris.toSet(), intakeId, nowMs))
    }
}
