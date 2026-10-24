package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Phase 7 Task 6 (PLAN §J8, review focus 4): a PDF call that hangs is ended; one that finishes never is. */
class WatchdogTest {
    @Test fun aCallThatRunsPastTheLimitIsEnded() {
        val ended = CountDownLatch(1)
        val t = Thread { Watchdog.run(50, onLate = { ended.countDown() }) { Thread.sleep(2_000) } }.apply { isDaemon = true }
        t.start()
        assertTrue("the late call was ended", ended.await(1, TimeUnit.SECONDS))
    }

    @Test fun aCallThatFinishesInTimeIsLeftAloneAndGivesItsAnswer() {
        val late = AtomicInteger()
        repeat(200) { assertEquals(it, Watchdog.run(80, onLate = { late.incrementAndGet() }) { it }) }
        Thread.sleep(200)
        assertEquals("no finished call is ever ended", 0, late.get())
    }

    @Test fun aCallThatFailsIsLeftAloneToo() {
        val late = AtomicInteger()
        val r = runCatching { Watchdog.run(80, onLate = { late.incrementAndGet() }) { error("broken file") } }
        assertTrue(r.isFailure)
        Thread.sleep(200)
        assertFalse("a failed call is not ended later", late.get() > 0)
    }
}
