package `in`.printsaathi.app.engine.intake

/**
 * Runs background work so a failure can never kill the app or leak details: anything thrown (including
 * OutOfMemoryError) is reported by class name only, because messages can contain private paths (PLAN §Q).
 */
inline fun guarded(onFailure: (String) -> Unit, block: () -> Unit) {
    try {
        block()
    } catch (t: Throwable) {
        onFailure(t.javaClass.simpleName)
    }
}
