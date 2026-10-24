package `in`.printsaathi.app.engine.print

import org.junit.Assert.assertEquals
import org.junit.Test

/** PLAN §D4 / §J8: what the shopkeeper is told after Android's print screen closes. Nothing that did not print says "sent". */
class PrintResultTest {
    private fun obs(
        state: JobState?,
        finished: Boolean = true,
        wrongPaper: Boolean = false,
        savedAsPdf: Boolean = false,
        adapterAlive: Boolean = true,
        sinceClosedMs: Long = 60_000,
    ) = PrintObservation(finished, wrongPaper, state, savedAsPdf, adapterAlive, sinceClosedMs)

    @Test fun theDialogIsStillOpenWhileTheAdapterHasNotFinished() {
        assertEquals(PrintResult.IN_DIALOG, classify(obs(JobState.CREATED, finished = false)))
    }

    @Test fun queuedOrStartedCountsAsSentAndStillPrinting() {
        assertEquals(PrintResult.PRINTING, classify(obs(JobState.QUEUED)))
        assertEquals(PrintResult.PRINTING, classify(obs(JobState.STARTED)))
        assertEquals(PrintResult.SENT, classify(obs(JobState.COMPLETED)))
    }

    /** The dialog closed without a print: the job never left "created" (or was cancelled). */
    @Test fun createdAfterTheDialogClosedMeansNothingWasPrinted() {
        assertEquals(PrintResult.NOTHING_PRINTED, classify(obs(JobState.CREATED)))
        assertEquals(PrintResult.NOTHING_PRINTED, classify(obs(JobState.CANCELLED)))
    }

    /**
     * Gate review #5: Android may move the job to "queued" a moment after its print screen closed. Right after
     * closing, a job still "created" (or not yet visible) is being checked, never reported as "nothing printed".
     */
    @Test fun rightAfterTheScreenClosesAnUnsettledJobIsStillBeingChecked() {
        assertEquals(PrintResult.CHECKING, classify(obs(JobState.CREATED, sinceClosedMs = 1_000)))
        assertEquals(PrintResult.CHECKING, classify(obs(null, sinceClosedMs = 1_000)))
        assertEquals(PrintResult.NOTHING_PRINTED, classify(obs(JobState.CREATED, sinceClosedMs = CHECK_MS + 1)))
        assertEquals(PrintResult.PRINTING, classify(obs(JobState.QUEUED, sinceClosedMs = 1_000)))
        assertEquals(PrintResult.NOTHING_PRINTED, classify(obs(JobState.CANCELLED, sinceClosedMs = 1_000)))
    }

    @Test fun theFinalLayoutRefusedForWrongPaperSaysSoEvenIfTheJobLooksCancelled() {
        assertEquals(PrintResult.WRONG_PAPER, classify(obs(JobState.CANCELLED, wrongPaper = true)))
        assertEquals(PrintResult.WRONG_PAPER, classify(obs(JobState.FAILED, wrongPaper = true)))
        assertEquals(PrintResult.WRONG_PAPER, classify(obs(null, wrongPaper = true)))
    }

    @Test fun saveAsPdfIsNeverReportedAsPrinted() {
        assertEquals(PrintResult.SAVED_AS_FILE, classify(obs(JobState.COMPLETED, savedAsPdf = true)))
        assertEquals(PrintResult.SAVED_AS_FILE, classify(obs(JobState.QUEUED, savedAsPdf = true)))
        assertEquals(PrintResult.NOTHING_PRINTED, classify(obs(JobState.CANCELLED, savedAsPdf = true)))
    }

    @Test fun blockedAndFailedJobsAskForAttention() {
        assertEquals(PrintResult.BLOCKED, classify(obs(JobState.BLOCKED)))
        assertEquals(PrintResult.FAILED, classify(obs(JobState.FAILED)))
    }

    /** The app was killed or the screen was replaced while the dialog was open (PLAN §D4 lifecycle). */
    @Test fun aLostDialogIsInterruptedUnlessThePrintAlreadyWentThrough() {
        assertEquals(PrintResult.INTERRUPTED, classify(obs(null, finished = false, adapterAlive = false)))
        assertEquals(PrintResult.INTERRUPTED, classify(obs(JobState.CREATED, finished = false, adapterAlive = false)))
        assertEquals(PrintResult.INTERRUPTED, classify(obs(JobState.CANCELLED, finished = false, adapterAlive = false)))
        assertEquals(PrintResult.PRINTING, classify(obs(JobState.QUEUED, finished = false, adapterAlive = false)))
        assertEquals(PrintResult.SENT, classify(obs(JobState.COMPLETED, finished = false, adapterAlive = false)))
    }

    @Test fun aFinishedPrintWhoseJobCannotBeFoundCannotBeChecked() {
        assertEquals(PrintResult.UNKNOWN, classify(obs(null)))
    }

    /** These names are the web app's contract (src/native/printEngine.ts PrintState). */
    @Test fun wireNamesAreTheWebAppsStateNames() {
        assertEquals(
            listOf(
                "inDialog", "checking", "sent", "printing", "blocked", "savedAsFile", "nothingPrinted", "wrongPaper",
                "interrupted", "failed", "unknown",
            ),
            PrintResult.entries.map { it.wireName },
        )
    }
}
