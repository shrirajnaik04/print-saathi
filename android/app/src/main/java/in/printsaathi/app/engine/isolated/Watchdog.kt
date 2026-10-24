package `in`.printsaathi.app.engine.isolated

import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * A time limit for one engine call (PLAN §J8): past [limitMs] [onLate] runs (the engine ends itself), so a customer
 * PDF that hangs the built-in renderer never holds the engine for ever. One timer thread for all calls; a call that
 * finishes or fails in time cancels its timer.
 */
object Watchdog {
    private val timer: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "engine-watchdog").apply { isDaemon = true }
    }

    fun <T> run(limitMs: Long, onLate: () -> Unit, block: () -> T): T {
        val late = timer.schedule(onLate, limitMs, TimeUnit.MILLISECONDS)
        try {
            return block()
        } finally {
            late.cancel(false)
        }
    }
}
