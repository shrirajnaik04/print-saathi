package `in`.printsaathi.app.engine.docs

import `in`.printsaathi.app.engine.isolated.EngineDiedException
import `in`.printsaathi.app.engine.isolated.EngineErrors
import `in`.printsaathi.app.engine.isolated.EngineUnavailableException
import org.junit.Assert.assertEquals
import org.junit.Test

/** Phase 7: what the engine said about a customer PDF, in the words the web app shows (never a password). */
class DocFactsTest {
    private fun state(r: Result<IntArray>, secondDeath: Boolean = false) = DocFacts.toJson(3, r, secondDeath).getString("state")

    @Test fun aReadPdfGivesItsPagesSizesAndFormsMark() {
        val j = DocFacts.toJson(3, Result.success(intArrayOf(2, 1, 595, 841, 841, 595)), false)
        assertEquals("ok", j.getString("state"))
        assertEquals(3, j.getInt("index"))
        assertEquals(2, j.getInt("pages"))
        assertEquals(true, j.getBoolean("forms"))
        assertEquals("[[595,841],[841,595]]", j.getJSONArray("sizes").toString())
    }

    @Test fun eachProblemHasItsOwnState() {
        assertEquals("password", state(Result.success(intArrayOf(-101))))
        assertEquals("unsupported", state(Result.success(intArrayOf(-102))))
        assertEquals("damaged", state(Result.success(intArrayOf(-103))))
        assertEquals("tooBig", state(Result.success(intArrayOf(-EngineErrors.TOO_BIG))))
        assertEquals("tooBig", state(Result.success(intArrayOf(-EngineErrors.OUT_OF_MEMORY))))
        assertEquals("damaged", state(Result.success(intArrayOf(-EngineErrors.FILE_UNREADABLE))))
        assertEquals("damaged", state(Result.success(intArrayOf())))
    }

    @Test fun anEngineThatWasNotReadyOrDiedOnceMeansTryAgain() {
        assertEquals("retry", state(Result.failure(EngineUnavailableException())))
        assertEquals("retry", state(Result.failure(EngineDiedException())))
        assertEquals("a second death: damaged", "damaged", state(Result.failure(EngineDiedException()), secondDeath = true))
    }
}
