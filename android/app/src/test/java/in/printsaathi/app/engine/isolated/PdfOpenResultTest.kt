package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Test

class PdfOpenResultTest {
    @Test fun mapsEngineReplies() {
        assertEquals(PdfOpenResult.Opened(3, true), PdfOpenResult.from(intArrayOf(3, 1)))
        assertEquals(PdfOpenResult.Opened(1, false), PdfOpenResult.from(intArrayOf(1, 0)))
        assertEquals(PdfOpenResult.PasswordRequired, PdfOpenResult.from(intArrayOf(PdfOpen.PASSWORD_REQUIRED)))
        assertEquals(PdfOpenResult.Unsupported, PdfOpenResult.from(intArrayOf(PdfOpen.UNSUPPORTED)))
        assertEquals(PdfOpenResult.Damaged, PdfOpenResult.from(intArrayOf(PdfOpen.DAMAGED)))
    }

    /** Gate 3 #3: a crash or out-of-memory inside the engine must never look like "enter the password". */
    @Test fun engineFailuresAreDamagedNeverPasswordRequired() {
        for (code in listOf(EngineErrors.FILE_UNREADABLE, EngineErrors.OUT_OF_MEMORY, EngineErrors.NOT_ALLOWED)) {
            assertEquals("engine error $code", PdfOpenResult.Damaged, PdfOpenResult.from(intArrayOf(-code)))
        }
    }

    @Test fun pdfCodesDoNotOverlapEngineErrorCodes() {
        val engine = setOf(-EngineErrors.FILE_UNREADABLE, -EngineErrors.OUT_OF_MEMORY, -EngineErrors.NOT_ALLOWED)
        val pdf = setOf(PdfOpen.PASSWORD_REQUIRED, PdfOpen.UNSUPPORTED, PdfOpen.DAMAGED)
        assertEquals(emptySet<Int>(), engine intersect pdf)
    }

    /** A short, empty or nonsense reply is never treated as an opened document. */
    @Test fun anythingElseIsDamaged() {
        assertEquals(PdfOpenResult.Damaged, PdfOpenResult.from(IntArray(0)))
        assertEquals(PdfOpenResult.Damaged, PdfOpenResult.from(intArrayOf(0, 1)))
        assertEquals(PdfOpenResult.Damaged, PdfOpenResult.from(intArrayOf(-99)))
    }
}
