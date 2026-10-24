package `in`.printsaathi.app.engine

import java.util.concurrent.Executors

/**
 * The app's background threads. [io] does job, thumbnail, render and retention work and is shared by the plugin and
 * the daily retention job, so a sweep never runs in the middle of a render (PLAN §D2c job lock).
 */
object Background {
    val io = Executors.newSingleThreadExecutor()

    /**
     * Receiving shares runs on its own thread: a slow or hostile sharing app can hold it for minutes (stall and
     * overall limits per file), but never the jobs, thumbnails, renders or prints on [io] (gate review #1).
     */
    val intake = Executors.newSingleThreadExecutor()

    /**
     * Real-file preview pages (gate review F1): never queued behind, or in front of, saves, renders and prints.
     * Scheduled, so the engine connection kept for a run of pages can be closed a moment after the last one.
     */
    val preview: java.util.concurrent.ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()

    /** Intakes being copied right now: old-file deletion and "delete all" never touch their folders. */
    val intakesInProgress: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

    /** Every job on the web app's screen stack (gate review #6: not only the top one): retention never deletes them. */
    @Volatile var activeJobIds: Set<String> = emptySet()

    /** False until the web app has said which jobs are open: the first sweep of a start waits for it. */
    @Volatile var activeJobsKnown = false
}
