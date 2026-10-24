package `in`.printsaathi.app.engine.print

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PaperMatchTest {
    private val fourBySix = 4000 to 6000
    private val a4 = 8268 to 11693

    @Test fun fourBySixInchMatchesTenByFifteenCentimetre() {
        assertTrue(paperMatches(fourBySix, 3937 to 5906, selectedIsPortrait = true))
    }

    @Test fun fourBySixDoesNotMatchA4() {
        assertFalse(paperMatches(fourBySix, a4, selectedIsPortrait = true))
    }

    @Test fun landscapeSelectionIsAMismatch() {
        assertFalse(paperMatches(fourBySix, fourBySix, selectedIsPortrait = false))
    }

    @Test fun a4DoesNotMatchLetter() {
        assertFalse(paperMatches(a4, 8500 to 11000, selectedIsPortrait = true))
    }

    @Test fun previewMismatchReturnsWarningPage() {
        assertEquals(LayoutDecision.WARNING_PAGE, layoutDecision(isPreview = true, matches = false))
        assertEquals(LayoutDecision.FAIL, layoutDecision(isPreview = false, matches = false))
        assertEquals(LayoutDecision.REAL_DOCUMENT, layoutDecision(isPreview = false, matches = true))
        assertEquals(LayoutDecision.REAL_DOCUMENT, layoutDecision(isPreview = true, matches = true))
    }
}
