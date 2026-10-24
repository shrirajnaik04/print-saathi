package `in`.printsaathi.app.engine.intake

import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** Limits for copying one shared file (PLAN §D2 step 4). The declared length is never trusted. */
data class CopyLimits(
    val maxFileBytes: Long = 200L * 1024 * 1024,
    val maxJobBytes: Long = 1024L * 1024 * 1024,
    val minFreeBytes: Long = 200L * 1024 * 1024,
    val stallMs: Long = 20_000,
    val overallMs: Long = 180_000,
    val freeCheckEveryBytes: Long = 8L * 1024 * 1024,
)

/** What happened to one file; each non-success maps to one plain-English message (PLAN §J8). */
sealed class CopyOutcome {
    data class Copied(val bytes: Long, val sha256: String, val head: ByteArray) : CopyOutcome()
    data object Empty : CopyOutcome()
    data object TooBig : CopyOutcome()
    data object JobTooBig : CopyOutcome()
    data object StorageFull : CopyOutcome()
    data object Stalled : CopyOutcome()
    data object TimedOut : CopyOutcome()
    data class Failed(val errorClass: String) : CopyOutcome()

    /** Short code stored in the intake journal and read by the web app. */
    val code: String
        get() = when (this) {
            is Copied -> "ok"
            Empty -> "empty"
            TooBig -> "tooBig"
            JobTooBig -> "jobTooBig"
            StorageFull -> "storageFull"
            Stalled -> "stalled"
            TimedOut -> "timedOut"
            is Failed -> "failed"
        }
}

private const val HEAD_BYTES = 4096

/** Readers left blocked on a stalled provider (they end when it gives up). */
private val abandonedReaders = java.util.concurrent.atomic.AtomicInteger(0)
const val MAX_ABANDONED_READERS = 32

/**
 * Streams [input] into [out] while hashing, enforcing [limits]. Never reads the declared length; never logs content.
 *
 * A provider that stops sending blocks read() forever, and on Android 7 and 9 closing the pipe does not wake that
 * read (device regression: 69 s on API 24). So the reading happens on its own short-lived thread and the caller
 * waits for it with the stall and overall limits: when one is passed the caller returns at once, closes the
 * stream (best effort) and abandons the reader, which writes nothing more once it has been abandoned.
 */
fun copyStream(
    input: InputStream,
    out: OutputStream,
    limits: CopyLimits,
    jobBytesSoFar: Long,
    freeBytes: () -> Long,
): CopyOutcome {
    // Each abandoned reader stays blocked until its provider gives up; cap them app-wide (gate re-review N1).
    if (abandonedReaders.get() >= MAX_ABANDONED_READERS) return CopyOutcome.Stalled
    val start = System.currentTimeMillis()
    val lastProgress = AtomicLong(start)
    val abandoned = AtomicBoolean(false)
    val writeLock = Any()
    val result = AtomicReference<CopyOutcome?>(null)
    val finished = CountDownLatch(1)
    Thread {
        try {
            result.set(readAll(input, out, limits, jobBytesSoFar, freeBytes, lastProgress, abandoned, writeLock))
        } catch (e: Exception) {
            result.set(CopyOutcome.Failed(e.javaClass.simpleName))
        } finally {
            finished.countDown()
            if (abandoned.get()) abandonedReaders.decrementAndGet()
        }
    }.apply { isDaemon = true; name = "intake-reader" }.start()
    val tick = minOf(100L, limits.stallMs / 3).coerceAtLeast(10L)
    while (true) {
        if (finished.await(tick, TimeUnit.MILLISECONDS)) return result.get() ?: CopyOutcome.Failed("NoResult")
        val now = System.currentTimeMillis()
        val reason = when {
            now - lastProgress.get() > limits.stallMs -> CopyOutcome.Stalled
            now - start > limits.overallMs -> CopyOutcome.TimedOut
            else -> null
        } ?: continue
        // Under the write lock: a reader mid-write finishes that write first; after this none follows (N8).
        synchronized(writeLock) {
            abandoned.set(true)
            if (finished.count > 0) abandonedReaders.incrementAndGet()
        }
        // Best effort: frees the provider's pipe where the platform allows it; never waited on.
        Thread { runCatching { input.close() } }.apply { isDaemon = true; name = "intake-closer" }.start()
        return reason
    }
}

private fun readAll(
    input: InputStream,
    out: OutputStream,
    limits: CopyLimits,
    jobBytesSoFar: Long,
    freeBytes: () -> Long,
    lastProgress: AtomicLong,
    abandoned: AtomicBoolean,
    writeLock: Any,
): CopyOutcome {
    if (freeBytes() < limits.minFreeBytes) return CopyOutcome.StorageFull
    val digest = MessageDigest.getInstance("SHA-256")
    val head = ByteArray(HEAD_BYTES)
    var headLen = 0
    var total = 0L
    var nextFreeCheck = limits.freeCheckEveryBytes
    val buf = ByteArray(64 * 1024)
    while (true) {
        val r = try {
            input.read(buf)
        } catch (e: Exception) {
            return CopyOutcome.Failed(e.javaClass.simpleName)
        }
        // The caller already gave up (stall or overall limit): late bytes are never written.
        if (abandoned.get()) return CopyOutcome.Stalled
        if (r < 0) break
        if (r == 0) continue
        lastProgress.set(System.currentTimeMillis())
        if (total + r > limits.maxFileBytes) return CopyOutcome.TooBig
        if (jobBytesSoFar + total + r > limits.maxJobBytes) return CopyOutcome.JobTooBig
        // Check BEFORE writing, counting the chunk itself, so the reserve is never crossed.
        if (total + r >= nextFreeCheck) {
            if (freeBytes() - r < limits.minFreeBytes) return CopyOutcome.StorageFull
            nextFreeCheck = total + r + limits.freeCheckEveryBytes
        }
        if (headLen < HEAD_BYTES) {
            val c = minOf(r, HEAD_BYTES - headLen)
            System.arraycopy(buf, 0, head, headLen, c)
            headLen += c
        }
        digest.update(buf, 0, r)
        try {
            synchronized(writeLock) {
                if (abandoned.get()) return CopyOutcome.Stalled
                out.write(buf, 0, r)
            }
        } catch (e: Exception) {
            return CopyOutcome.Failed(e.javaClass.simpleName)
        }
        total += r
    }
    if (total == 0L) return CopyOutcome.Empty
    val hex = digest.digest().joinToString("") { String.format(Locale.ROOT, "%02x", it) }
    return CopyOutcome.Copied(total, hex, head.copyOf(headLen))
}
