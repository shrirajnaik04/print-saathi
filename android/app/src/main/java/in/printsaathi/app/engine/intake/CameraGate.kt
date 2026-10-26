package `in`.printsaathi.app.engine.intake

/**
 * Review I4 (round 8): one camera at a time. [open] is refused while a camera asked for earlier has not answered (a
 * double tap), so it never replaces that camera's waiting photo; [close] when it has answered. A camera whose answer
 * never came (the app's screen was rebuilt meanwhile) stops blocking after [LONGEST_MS].
 */
class CameraGate {
    private var since = -1L

    @Synchronized
    fun open(nowMs: Long): Boolean {
        if (since >= 0 && nowMs - since < LONGEST_MS) return false
        since = nowMs
        return true
    }

    @Synchronized
    fun close() {
        since = -1L
    }

    companion object {
        const val LONGEST_MS = 10 * 60_000L
    }
}
