package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/** Re-review I2: one engine call at a time in the whole app, so an engine death has exactly one owner. */
class EngineTurnTest {
    @Test fun twoThreadsNeverHoldATurnTogether() {
        val inside = AtomicInteger()
        val most = AtomicInteger()
        val threads = (1..4).map {
            Thread {
                repeat(200) {
                    EngineClient.turn {
                        most.accumulateAndGet(inside.incrementAndGet(), ::maxOf)
                        Thread.yield()
                        inside.decrementAndGet()
                    }
                }
            }
        }
        threads.forEach { it.start() }
        threads.forEach { it.join() }
        assertEquals(1, most.get())
    }

    @Test fun aTurnInsideATurnDoesNotWaitForItself() {
        assertEquals(7, EngineClient.turn { EngineClient.turn { 7 } })
    }
}
