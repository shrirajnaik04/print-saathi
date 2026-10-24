package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.IOException

class GuardedTest {
    @Test fun exceptionIsReportedByClassNameOnlyAndNotRethrown() {
        var reported: String? = null
        guarded({ reported = it }) { throw IOException("No space left: /data/user/0/in.printsaathi.app/no_backup/jobs/abc") }
        assertEquals("IOException", reported)
    }

    @Test fun errorsSuchAsOutOfMemoryAreAlsoContained() {
        var reported: String? = null
        guarded({ reported = it }) { throw OutOfMemoryError("x") }
        assertEquals("OutOfMemoryError", reported)
    }

    @Test fun successDoesNotReport() {
        var reported: String? = null
        var ran = false
        guarded({ reported = it }) { ran = true }
        assertEquals(true, ran)
        assertNull(reported)
    }
}
