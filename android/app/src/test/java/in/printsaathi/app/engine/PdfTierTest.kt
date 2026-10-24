package `in`.printsaathi.app.engine

import org.junit.Assert.assertEquals
import org.junit.Test

class PdfTierTest {
    @Test fun android15AndAboveUnlockNatively() {
        assertEquals(PdfUnlockTier.NATIVE_35, pdfUnlockTier(36, 0))
        assertEquals(PdfUnlockTier.NATIVE_35, pdfUnlockTier(35, 0))
    }

    @Test fun android11To14UnlockOnlyWithExtension13() {
        assertEquals(PdfUnlockTier.PRE_V, pdfUnlockTier(34, 13))
        assertEquals(PdfUnlockTier.PRE_V, pdfUnlockTier(30, 13))
        assertEquals(PdfUnlockTier.NONE, pdfUnlockTier(34, 12))
    }

    @Test fun olderPhonesCannotUnlock() {
        assertEquals(PdfUnlockTier.NONE, pdfUnlockTier(29, 99))
        assertEquals(PdfUnlockTier.NONE, pdfUnlockTier(24, 0))
    }
}
