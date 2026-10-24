package `in`.printsaathi.app.engine.print

import android.print.PrintJobInfo

/** Android's print job states (PrintJobInfo.STATE_*), kept as a plain enum so the rules are JVM-testable. */
enum class JobState {
    CREATED, QUEUED, STARTED, BLOCKED, COMPLETED, FAILED, CANCELLED;

    companion object {
        fun of(state: Int): JobState? = when (state) {
            PrintJobInfo.STATE_CREATED -> CREATED
            PrintJobInfo.STATE_QUEUED -> QUEUED
            PrintJobInfo.STATE_STARTED -> STARTED
            PrintJobInfo.STATE_BLOCKED -> BLOCKED
            PrintJobInfo.STATE_COMPLETED -> COMPLETED
            PrintJobInfo.STATE_FAILED -> FAILED
            PrintJobInfo.STATE_CANCELED -> CANCELLED
            else -> null
        }
    }
}

/**
 * What is known about the one print in flight. [finished]: Android closed its print screen (adapter onFinish).
 * [wrongPaper]: the last final layout was refused because the paper was wrong. [state]: the print job's state, or
 * null if the job cannot be found. [adapterAlive]: this process still holds the adapter (false after a restart).
 * [sinceClosedMs]: time since the print screen closed.
 */
data class PrintObservation(
    val finished: Boolean,
    val wrongPaper: Boolean,
    val state: JobState?,
    val savedAsPdf: Boolean,
    val adapterAlive: Boolean,
    val sinceClosedMs: Long,
)

/** How long after the print screen closes an unsettled job is still being checked (gate review #5). */
const val CHECK_MS = 8_000L

/** What the Result screen says (PLAN §I-13, §J8). PRINTING counts as sent: the printer has the job. */
enum class PrintResult { IN_DIALOG, CHECKING, SENT, PRINTING, BLOCKED, SAVED_AS_FILE, NOTHING_PRINTED, WRONG_PAPER, INTERRUPTED, FAILED, UNKNOWN }

fun classify(o: PrintObservation): PrintResult {
    val wentThrough = o.state == JobState.QUEUED || o.state == JobState.STARTED || o.state == JobState.COMPLETED
    return when {
        o.wrongPaper -> PrintResult.WRONG_PAPER
        wentThrough && o.savedAsPdf -> PrintResult.SAVED_AS_FILE
        o.state == JobState.COMPLETED -> PrintResult.SENT
        wentThrough -> PrintResult.PRINTING
        !o.finished && o.adapterAlive -> PrintResult.IN_DIALOG
        !o.finished -> PrintResult.INTERRUPTED
        o.state == JobState.BLOCKED -> PrintResult.BLOCKED
        o.state == JobState.FAILED -> PrintResult.FAILED
        (o.state == JobState.CREATED || o.state == null) && o.sinceClosedMs <= CHECK_MS -> PrintResult.CHECKING
        o.state == JobState.CREATED || o.state == JobState.CANCELLED -> PrintResult.NOTHING_PRINTED
        else -> PrintResult.UNKNOWN
    }
}

/** The name the web app receives: SAVED_AS_FILE -> "savedAsFile". */
val PrintResult.wireName: String
    get() = name.lowercase().split('_').mapIndexed { i, w -> if (i == 0) w else w.replaceFirstChar(Char::uppercaseChar) }.joinToString("")
