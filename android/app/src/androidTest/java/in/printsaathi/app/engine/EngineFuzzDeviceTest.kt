package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineDiedException
import `in`.printsaathi.app.engine.isolated.EngineFileException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.random.Random

/**
 * Phase 10 (PLAN §R level 12, §Q): seeded mutations of real photos and PDFs — flipped bits, cut-off files, inserted
 * junk, repeated chunks — through the isolated engine. Each must print-decode properly or come back as "this file
 * can't be opened" (EngineFileException) or end in a contained engine death; never anything else, never an app crash,
 * and the engine keeps working.
 * Synthetic files only.
 */
@RunWith(AndroidJUnit4::class)
class EngineFuzzDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val testAssets = InstrumentationRegistry.getInstrumentation().context.assets
    private val dir = File(ctx.filesDir, "fuzz").apply { mkdirs() }
    private val client = EngineClient(ctx)

    @After fun done() {
        client.reset()
        dir.deleteRecursively()
    }

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("fuzz", "$key=$value") })
    }

    private fun photo(format: Bitmap.CompressFormat, alpha: Boolean): ByteArray {
        val bmp = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888)
        for (y in 0 until 480 step 8) for (x in 0 until 640 step 8) {
            val c = Color.argb(if (alpha && (x + y) % 64 == 0) 40 else 255, x % 256, y % 256, (x * y) % 256)
            for (dy in 0 until 8) for (dx in 0 until 8) bmp.setPixel(x + dx, y + dy, c)
        }
        return ByteArrayOutputStream().also { bmp.compress(format, 90, it); bmp.recycle() }.toByteArray()
    }

    /** One random kind of damage: flipped bytes, a cut, inserted junk, a repeated chunk, or a zeroed range. */
    private fun mutate(b: ByteArray, r: Random): ByteArray = when (r.nextInt(5)) {
        0 -> b.copyOf().also { m -> repeat(1 + r.nextInt(16)) { m[r.nextInt(m.size)] = r.nextInt(256).toByte() } }
        1 -> b.copyOf(r.nextInt(b.size))
        2 -> r.nextInt(b.size).let { at -> b.copyOfRange(0, at) + r.nextBytes(1 + r.nextInt(512)) + b.copyOfRange(at, b.size) }
        3 -> r.nextInt(b.size).let { at -> val n = minOf(b.size - at, 1 + r.nextInt(4096)); b.copyOfRange(0, at + n) + b.copyOfRange(at, b.size) }
        else -> b.copyOf().also { m -> val at = r.nextInt(m.size); for (i in at until minOf(m.size, at + 1 + r.nextInt(2048))) m[i] = 0 }
    }

    /**
     * A file error, or a contained engine death (Android 7's PDF library crashes on some damaged PDFs: only the
     * isolated engine dies; the app marks the file damaged after two deaths, EngineRenderer). Anything else fails.
     */
    private fun outcome(r: Result<IntArray>, what: String, maxPx: Int): String {
        val e = r.exceptionOrNull()
        if (e != null) {
            assertTrue("$what: ${e.javaClass.simpleName} is neither a file error nor a contained engine death",
                e is EngineFileException || e is EngineDiedException)
            return if (e is EngineDiedException) "engineDied" else "refused"
        }
        val wh = r.getOrThrow()
        assertTrue("$what: a success must have a real size, got ${wh.joinToString()}", wh[0] in 1..maxPx && wh[1] in 1..maxPx)
        return "decoded"
    }

    @Test fun mutatedPhotosDecodeOrAreRefused() {
        val r = Random(20261017)
        val seeds = mapOf("jpg" to photo(Bitmap.CompressFormat.JPEG, false), "png" to photo(Bitmap.CompressFormat.PNG, true))
        val counts = mutableMapOf<String, Int>()
        for ((ext, seed) in seeds) repeat(80) { n ->
            val f = File(dir, "m$n.$ext").apply { writeBytes(mutate(seed, r)) }
            val o = outcome(client.decodeToJpeg(f, File(dir, "out.jpg"), 1024), "$ext #$n", 1024)
            counts.merge("$ext-$o", 1, Int::plus)
        }
        report("photos", counts)
        // The engine still works after all of that.
        val good = File(dir, "good.jpg").apply { writeBytes(seeds.getValue("jpg")) }
        assertEquals(640, client.decodeToJpeg(good, File(dir, "out.jpg"), 1024).getOrThrow()[0])
    }

    @Test fun mutatedPdfsOpenRenderOrAreRefused() {
        val r = Random(20261018)
        val seeds = listOf("pdf/docs/text.pdf", "pdf/docs/photo.pdf", "pdf/user-aes256.pdf").map { testAssets.open(it).readBytes() }
        val counts = mutableMapOf<String, Int>()
        repeat(60) { n ->
            val f = File(dir, "m$n.pdf").apply { writeBytes(mutate(seeds[n % seeds.size], r)) }
            val facts = client.pdfFacts(f, "")
            val e = facts.exceptionOrNull()
            assertTrue("pdf #$n facts: ${e?.javaClass?.simpleName} is neither a file error nor a contained engine death",
                e == null || e is EngineFileException || e is EngineDiedException)
            val ok = facts.getOrNull()?.takeIf { it.size > 1 }
            val o = if (ok == null) "refused" else outcome(
                client.renderCustomerPage(f, "", 0, File(dir, "page.jpg"), 1200, 92, n % 4), "pdf #$n render", 1200,
            )
            counts.merge("pdf-$o", 1, Int::plus)
        }
        report("pdfs", counts)
        val good = File(dir, "good.pdf").apply { writeBytes(seeds[0]) }
        assertTrue(client.pdfFacts(good, "").getOrThrow().size > 1)
    }
}
