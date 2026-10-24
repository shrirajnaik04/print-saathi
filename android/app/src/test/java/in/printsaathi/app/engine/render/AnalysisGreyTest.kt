package `in`.printsaathi.app.engine.render

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/** Phase 9 (PLAN §F3, §F5): the smart-crop detector's input — a tiny header and raw 8-bit grey rows. */
class AnalysisGreyTest {
    @Test fun headerThenRows() {
        val rows = byteArrayOf(1, 2, 3, 4, 5, 6)
        val file = AnalysisGrey.withHeader(rows, 3, 2)
        // "PSAG", width and height as 16-bit big-endian, then the rows.
        assertArrayEquals(byteArrayOf(0x50, 0x53, 0x41, 0x47, 0, 3, 0, 2, 1, 2, 3, 4, 5, 6), file)
    }

    @Test fun aSizeThatDoesNotFitIsRefused() {
        assertEquals(true, runCatching { AnalysisGrey.withHeader(ByteArray(5), 3, 2) }.isFailure)
        assertEquals(true, runCatching { AnalysisGrey.withHeader(ByteArray(0), 0, 0) }.isFailure)
        assertEquals(true, runCatching { AnalysisGrey.withHeader(ByteArray(70000), 70000, 1) }.isFailure)
    }
}
