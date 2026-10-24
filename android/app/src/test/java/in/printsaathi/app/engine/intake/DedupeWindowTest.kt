package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DedupeWindowTest {
    @Test fun sameUrisWithinSixtySecondsMapToTheExistingIntake() {
        val w = DedupeWindow(windowMs = 60_000)
        w.record(listOf("content://a/1", "content://a/2"), "intake-1", nowMs = 1_000)
        assertEquals("intake-1", w.existingIntake(listOf("content://a/2", "content://a/1"), nowMs = 30_000))
    }

    @Test fun laterReShareOfTheSameContentIsANewIntake() {
        val w = DedupeWindow(windowMs = 60_000)
        w.record(listOf("content://a/1"), "intake-1", nowMs = 1_000)
        assertNull(w.existingIntake(listOf("content://a/1"), nowMs = 61_001))
    }

    @Test fun differentUrisAreNeverDuplicates() {
        val w = DedupeWindow(windowMs = 60_000)
        w.record(listOf("content://a/1"), "intake-1", nowMs = 1_000)
        assertNull(w.existingIntake(listOf("content://a/9"), nowMs = 2_000))
    }

    /** Gate 2 #6: a second delivery while the first import is still copying must reuse the same intake. */
    @Test fun claimRecordsBeforeTheImportFinishes() {
        val w = DedupeWindow(60_000)
        assertEquals(null, w.claim(listOf("content://a/1"), "first", 0))
        assertEquals("first", w.claim(listOf("content://a/1"), "second", 500))
        assertEquals(null, w.claim(listOf("content://a/1"), "third", 61_000))
    }

    /** Gate 3 #5: a failed import tells the shopkeeper to share again; that retry must start a NEW intake at once. */
    @Test fun releasedClaimLetsAnImmediateRetryThrough() {
        val w = DedupeWindow(60_000)
        assertEquals(null, w.claim(listOf("content://a/1"), "failed", 0))
        w.release("failed")
        assertEquals(null, w.claim(listOf("content://a/1"), "retry", 1_000))
        assertEquals("retry", w.existingIntake(listOf("content://a/1"), 2_000))
    }
}
