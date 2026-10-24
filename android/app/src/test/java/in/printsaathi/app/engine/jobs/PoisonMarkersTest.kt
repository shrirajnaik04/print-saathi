package `in`.printsaathi.app.engine.jobs

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * PLAN §D5: a file that kills the engine must not crash it again on every start (no crash loops). Phase plan Task 3
 * and gate review #4: only a file that did it TWICE is marked damaged, so one unlucky interruption (Android ending
 * the app in the background mid-photo) never brands a good photo for good; marks go when their jobs go.
 */
class PoisonMarkersTest {
    @get:Rule val tmp = TemporaryFolder()

    /** The app process died while this file was being decoded: it counts once, not yet damaged. */
    @Test fun oneDeathDuringAFileIsNotEnough() {
        PoisonMarkers(tmp.root).begin("sha-bad")
        // process dies here: end() never runs
        val after = PoisonMarkers(tmp.root)
        after.recover()
        assertFalse(after.isPoisoned("sha-bad"))
    }

    @Test fun aSecondDeathOnTheSameFileMarksItDamaged() {
        val m = PoisonMarkers(tmp.root)
        m.begin("sha-bad")
        PoisonMarkers(tmp.root).recover() // died once (app process)
        val m2 = PoisonMarkers(tmp.root)
        m2.begin("sha-bad")
        assertTrue("engine died again on it", m2.recordDeath("sha-bad"))
        assertTrue(m2.isPoisoned("sha-bad"))
        assertFalse(m2.isPoisoned("sha-good"))
    }

    @Test fun twoEngineDeathsWhileRunningMarkIt() {
        val m = PoisonMarkers(tmp.root)
        m.begin("sha-x")
        assertFalse(m.recordDeath("sha-x"))
        assertFalse(m.isPoisoned("sha-x"))
        m.begin("sha-x")
        assertTrue(m.recordDeath("sha-x"))
        assertTrue(m.isPoisoned("sha-x"))
    }

    @Test fun aFinishedFileLeavesNoMarker() {
        val m = PoisonMarkers(tmp.root)
        m.begin("sha-ok")
        m.end("sha-ok")
        m.recover()
        m.recover()
        assertFalse(m.isPoisoned("sha-ok"))
    }

    /** Content hashes of customer files must not outlive the jobs (privacy, gate review #4). */
    @Test fun marksForFilesNoLongerInAnyJobAreForgotten() {
        val m = PoisonMarkers(tmp.root)
        repeat(2) { m.begin("gone"); m.recordDeath("gone") }
        repeat(2) { m.begin("kept"); m.recordDeath("kept") }
        m.retainOnly(setOf("kept"))
        assertFalse(m.isPoisoned("gone"))
        assertTrue(m.isPoisoned("kept"))
        assertFalse(tmp.root.resolve("state/poisoned").readText().contains("gone"))
        assertEquals(setOf("kept"), m.poisoned())
    }
}
