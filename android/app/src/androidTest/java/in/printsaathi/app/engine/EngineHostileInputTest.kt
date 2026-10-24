package `in`.printsaathi.app.engine

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineFileException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Random

/**
 * Gate 2 finding 1: a broken customer file must come back as "this file can't be opened" (a failed Result),
 * never as an app crash and never as an empty "success". The engine must keep working afterwards.
 */
@RunWith(AndroidJUnit4::class)
class EngineHostileInputTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(ctx.filesDir, "hostile").apply { mkdirs() }
    private val out = File(dir, "out.jpg")

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("hostile", "$key=$value") })
    }

    private fun jpeg(w: Int, h: Int): ByteArray {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(200, 120, 40)) }
        return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it); bmp.recycle() }.toByteArray()
    }

    private fun file(name: String, bytes: ByteArray) = File(dir, name).apply { writeBytes(bytes) }

    private fun assertFileError(client: EngineClient, f: File) {
        val r = client.decodeToJpeg(f, out, 1024)
        report("${f.name}.result", r.exceptionOrNull()?.javaClass?.simpleName ?: "success:${r.getOrNull()?.joinToString(",")}")
        assertTrue("${f.name} must fail as a file error, got $r", r.exceptionOrNull() is EngineFileException)
    }

    @Test fun garbageBytesAreAFileErrorNotACrash() {
        val client = EngineClient(ctx)
        assertFileError(client, file("garbage.bin", ByteArray(64 * 1024).also { Random(1).nextBytes(it) }))
        client.reset()
    }

    @Test fun emptyFileIsAFileError() {
        val client = EngineClient(ctx)
        assertFileError(client, file("empty.jpg", ByteArray(0)))
        client.reset()
    }

    @Test fun pdfPassedAsAnImageIsAFileError() {
        val client = EngineClient(ctx)
        assertFileError(client, file("doc.pdf", "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n".toByteArray()))
        client.reset()
    }

    @Test fun jpegHeaderWithGarbageBodyIsAFileError() {
        val client = EngineClient(ctx)
        val head = jpeg(64, 64).copyOf(20)
        assertFileError(client, file("header-only.jpg", head + ByteArray(4096).also { Random(2).nextBytes(it) }))
        client.reset()
    }

    /** Phase 0 carry-over: a cut-off JPEG is damaged, never printed with a grey half (PLAN §F2). */
    @Test fun aTruncatedJpegIsAFileError() {
        val client = EngineClient(ctx)
        val full = jpeg(1600, 1200)
        assertFileError(client, file("truncated.jpg", full.copyOf(full.size / 2)))
        client.reset()
    }

    /** Phase 10 fuzz finding: a cut-off PNG or WebP is damaged too, never printed with its missing rows blank. */
    @Test fun aTruncatedPngOrWebpIsAFileError() {
        val client = EngineClient(ctx)
        val bmp = Bitmap.createBitmap(800, 600, Bitmap.Config.ARGB_8888).apply {
            for (y in 0 until 600 step 4) for (x in 0 until 800 step 4) setPixel(x, y, Color.rgb(x % 256, y % 256, 90))
        }
        for ((name, format) in listOf("cut.png" to Bitmap.CompressFormat.PNG, "cut.webp" to @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP)) {
            val full = ByteArrayOutputStream().also { bmp.compress(format, 90, it) }.toByteArray()
            assertEquals(800, client.decodeToJpeg(file("whole-$name", full), out, 1024).getOrThrow()[0])
            assertFileError(client, file(name, full.copyOf(full.size * 2 / 3)))
        }
        bmp.recycle()
        client.reset()
    }

    /** A progressive JPEG within this phone's budget still decodes (fixture made with Pillow, progressive=True). */
    @Test fun aSmallProgressiveJpegDecodes() {
        val client = EngineClient(ctx)
        // androidTest assets live in the test APK, not the app (tests/fixtures).
        val testAssets = InstrumentationRegistry.getInstrumentation().context.assets
        val src = file("prog-small.jpg", testAssets.open("prog-small.jpg").readBytes())
        val r = client.decodeToJpeg(src, out, 800).getOrThrow()
        assertEquals(800, maxOf(r[0], r[1]))
        client.reset()
    }

    @Test fun engineStillWorksAfterHostileInputs() {
        val client = EngineClient(ctx)
        client.decodeToJpeg(file("garbage2.bin", ByteArray(1024).also { Random(3).nextBytes(it) }), out, 1024)
        val ok = client.decodeToJpeg(file("good.jpg", jpeg(800, 600)), out, 400).getOrThrow()
        assertEquals(400, ok[0])
        assertEquals(300, ok[1])
        client.reset()
    }
}
