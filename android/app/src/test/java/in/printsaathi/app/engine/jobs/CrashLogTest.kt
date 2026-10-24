package `in`.printsaathi.app.engine.jobs

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** PLAN §D5: two crashes within 60 s make the next start a safe start (Home, job kept, nothing auto-opened). */
class CrashLogTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun oneCrashIsNotALoop() {
        val log = CrashLog(tmp.root)
        log.record(1_000)
        assertFalse(log.isSafeStart())
    }

    @Test fun twoCrashesWithinAMinuteMakeASafeStart() {
        val log = CrashLog(tmp.root)
        log.record(1_000)
        log.record(50_000)
        assertTrue(log.isSafeStart())
        assertTrue("survives the process", CrashLog(tmp.root).isSafeStart())
    }

    @Test fun twoCrashesFarApartAreNot() {
        val log = CrashLog(tmp.root)
        log.record(1_000)
        log.record(1_000 + 61_000)
        assertFalse(log.isSafeStart())
    }

    @Test fun onlyTheNewestTwoCount() {
        val log = CrashLog(tmp.root)
        log.record(1_000)
        log.record(2_000)
        log.record(500_000)
        assertFalse(log.isSafeStart())
    }

    @Test fun acknowledgingTheSafeStartClearsIt() {
        val log = CrashLog(tmp.root)
        log.record(1_000)
        log.record(2_000)
        log.acknowledge()
        assertFalse(log.isSafeStart())
    }

    @Test fun anUnreadableLogIsNoLoop() {
        tmp.root.resolve("state").mkdirs()
        tmp.root.resolve("state/crashes").writeText("x\n\ny")
        assertFalse(CrashLog(tmp.root).isSafeStart())
    }
}
