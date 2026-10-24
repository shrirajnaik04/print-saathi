package `in`.printsaathi.app.engine.isolated

/**
 * Runs [block]; an Exception means "this path can't handle the file, try the next one" and gives null.
 * Errors (OutOfMemoryError above all) are NOT caught: after one the heap can't be trusted, so no heavier fallback
 * may start in it; EngineService turns it into an out-of-memory reply and ends the engine process (Gate 3 #4).
 */
inline fun <T> orNullOnException(block: () -> T): T? = try {
    block()
} catch (e: Exception) {
    null
}
