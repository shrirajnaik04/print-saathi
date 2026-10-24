package `in`.printsaathi.app.engine

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Gate 2 minor 11: the client must never block or misbehave on the main thread, and reconnects cleanly. */
@RunWith(AndroidJUnit4::class)
class EngineClientLifecycleTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun resetOnTheMainThreadIsRefusedInsteadOfFreezingTheScreen() {
        val client = EngineClient(ctx)
        var thrown: Throwable? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            thrown = runCatching { client.reset() }.exceptionOrNull()
        }
        assertTrue("reset() on the main thread must be refused, got $thrown", thrown is IllegalStateException)
    }

    @Test fun manyResetAndReconnectCyclesKeepWorking() {
        val client = EngineClient(ctx)
        val src = File(ctx.filesDir, "lifecycle.jpg")
        android.graphics.Bitmap.createBitmap(64, 48, android.graphics.Bitmap.Config.ARGB_8888).apply {
            eraseColor(android.graphics.Color.BLUE)
            src.outputStream().use { compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, it) }
            recycle()
        }
        repeat(10) {
            assertEquals(32, client.decodeToJpeg(src, File(ctx.filesDir, "lifecycle-out.jpg"), 32).getOrThrow()[0])
            client.reset()
        }
    }
}
