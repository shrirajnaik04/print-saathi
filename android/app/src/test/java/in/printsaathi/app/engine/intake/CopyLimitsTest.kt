package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** PLAN §D2 step 4: hostile or broken sharing apps can lie, stall or never stop; the copy must stay safe. */
class CopyLimitsTest {
    private val small = CopyLimits(
        maxFileBytes = 1_000,
        maxJobBytes = 5_000,
        minFreeBytes = 100,
        stallMs = 300,
        overallMs = 5_000,
        freeCheckEveryBytes = 256,
    )

    private fun copy(input: InputStream, limits: CopyLimits = small, jobSoFar: Long = 0, free: () -> Long = { 1_000_000 }) =
        copyStream(input, ByteArrayOutputStream(), limits, jobSoFar, free)

    @Test fun copiesAndHashesANormalFile() {
        val r = copy(ByteArrayInputStream(ByteArray(700) { it.toByte() }))
        assertTrue(r is CopyOutcome.Copied)
        r as CopyOutcome.Copied
        assertEquals(700L, r.bytes)
        assertEquals(64, r.sha256.length)
        assertEquals(700, r.head.size)
    }

    @Test fun anEmptyFileIsReportedAsEmpty() {
        assertEquals(CopyOutcome.Empty, copy(ByteArrayInputStream(ByteArray(0))))
    }

    /** An endless or oversized stream stops at the cap; nothing beyond it is kept. */
    @Test fun aFileOverThePerFileCapIsRefused() {
        val endless = object : InputStream() {
            override fun read(): Int = 7
            override fun read(b: ByteArray, off: Int, len: Int): Int = len.also { b.fill(7, off, off + len) }
        }
        assertEquals(CopyOutcome.TooBig, copy(endless))
    }

    @Test fun theWholeJobCapCountsEarlierFiles() {
        assertEquals(CopyOutcome.JobTooBig, copy(ByteArrayInputStream(ByteArray(800)), jobSoFar = 4_500))
    }

    @Test fun storageRunningOutStopsTheCopy() {
        var free = 600L
        val r = copy(ByteArrayInputStream(ByteArray(900)), free = { free.also { free -= 256 } })
        assertEquals(CopyOutcome.StorageFull, r)
    }

    @Test fun aStreamThatStopsSendingIsStoppedAfterTheStallTime() {
        val released = CountDownLatch(1)
        val stalling = object : InputStream() {
            var sent = false
            override fun read(): Int = throw UnsupportedOperationException()
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (!sent) {
                    sent = true
                    return 10
                }
                // Blocks like a stalled provider until the copier closes the stream.
                released.await(10, TimeUnit.SECONDS)
                throw IOException("closed")
            }
            override fun close() = released.countDown()
        }
        val t0 = System.currentTimeMillis()
        assertEquals(CopyOutcome.Stalled, copy(stalling))
        assertTrue("stopped in ${System.currentTimeMillis() - t0} ms", System.currentTimeMillis() - t0 < 3_000)
    }

    /**
     * Android 7 and 9: closing a provider's pipe does not wake a read() blocked on it (device regression: 69 s on
     * API 24). The copy must still give up on time, and bytes that arrive after giving up must never be written.
     */
    @Test(timeout = 10_000) fun aStallThatCloseCannotInterruptStillStopsOnTimeAndWritesNothingLate() {
        val release = CountDownLatch(1)
        val stalling = object : InputStream() {
            var calls = 0
            override fun read(): Int = throw UnsupportedOperationException()
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                calls++
                if (calls == 1) return 10
                release.await(10, TimeUnit.SECONDS) // close() does NOT release this read
                b.fill(9, off, off + 5)
                return 5 // late data, after the copy gave up
            }
            override fun close() {}
        }
        val out = ByteArrayOutputStream()
        val t0 = System.currentTimeMillis()
        assertEquals(CopyOutcome.Stalled, copyStream(stalling, out, small, 0) { 1_000_000 })
        assertTrue("stopped in ${System.currentTimeMillis() - t0} ms", System.currentTimeMillis() - t0 < 3_000)
        release.countDown()
        Thread.sleep(300)
        assertEquals("only the 10 bytes before the stall", 10, out.size())
    }

    /** Gate re-review N1: readers stuck on hostile providers are capped app-wide, and the cap frees itself. */
    @Test(timeout = 20_000) fun stuckReadersAreCappedAndTheCapFreesWhenTheyEnd() {
        val fast = small.copy(stallMs = 30)
        val release = CountDownLatch(1)
        fun stuck() = object : InputStream() {
            override fun read(): Int = throw UnsupportedOperationException()
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                release.await(15, TimeUnit.SECONDS)
                throw IOException("provider gave up")
            }
            override fun close() {}
        }
        repeat(MAX_ABANDONED_READERS) { assertEquals(CopyOutcome.Stalled, copy(stuck(), fast)) }
        // Cap reached: refused at once, without starting another reader.
        val t0 = System.currentTimeMillis()
        assertEquals(CopyOutcome.Stalled, copy(ByteArrayInputStream(ByteArray(10)), fast))
        assertTrue(System.currentTimeMillis() - t0 < 20)
        release.countDown()
        val deadline = System.currentTimeMillis() + 5_000
        var r: CopyOutcome = CopyOutcome.Stalled
        while (r == CopyOutcome.Stalled && System.currentTimeMillis() < deadline) {
            Thread.sleep(50)
            r = copy(ByteArrayInputStream(ByteArray(10)), fast)
        }
        assertTrue("copies work again once the stuck readers end: $r", r is CopyOutcome.Copied)
    }

    @Test fun aReadErrorIsAFailureWithItsClassNameOnly() {
        val broken = object : InputStream() {
            override fun read(): Int = throw IOException("/data/user/0/secret/path")
        }
        assertEquals(CopyOutcome.Failed("IOException"), copy(broken))
    }
}
