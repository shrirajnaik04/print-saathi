package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.IOException

class FallbackTest {
    @Test fun anExceptionMeansTryTheFallback() {
        assertNull(orNullOnException { throw IOException("region decoder cannot read this format") })
        assertNull(orNullOnException { throw IllegalStateException("strip width mismatch") })
    }

    @Test fun successIsReturned() {
        assertEquals(42, orNullOnException { 42 })
    }

    /** Gate 3 #4: after an OutOfMemoryError the heap can't be trusted; never start a heavier fallback in it. */
    @Test(expected = OutOfMemoryError::class)
    fun outOfMemoryIsNotSwallowed() {
        orNullOnException { throw OutOfMemoryError("strip") }
    }
}
