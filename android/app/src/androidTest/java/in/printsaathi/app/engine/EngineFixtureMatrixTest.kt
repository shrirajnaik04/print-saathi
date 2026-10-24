package `in`.printsaathi.app.engine

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineErrors
import `in`.printsaathi.app.engine.isolated.EngineFileException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Spike (e), Gate 2 finding 5: decode every pushed fixture (4:4:4, 4:2:0, odd-size PNG; the 108 MP progressive
 * one must be refused as too big) to 2048 px and to 3508 px (A4 long side at 300 dpi, the real print size), losslessly, and record
 * time and engine memory. Quality is compared on the PC against an exact area-average reference.
 */
@RunWith(AndroidJUnit4::class)
class EngineFixtureMatrixTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val fixtures = File(ctx.filesDir, "test-fixtures")
    private val outDir = File(ctx.filesDir, "test-out").apply { mkdirs() }

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("matrix", "$key=$value") })
    }

    @Test fun decodeEveryFixtureAtScreenAndPrintSize() {
        val files = fixtures.listFiles()?.filter { it.name.endsWith(".jpg") || it.name.endsWith(".png") }?.sortedBy { it.name }.orEmpty()
        assumeTrue("no fixtures pushed", files.isNotEmpty())
        for (f in files) {
            for (target in listOf(2048, 3508)) {
                val client = EngineClient(ctx) // fresh engine per decode: peak memory belongs to this decode only
                val out = File(outDir, "${f.nameWithoutExtension}-$target.rgba")
                val key = "${f.name}@$target"
                val result = client.decodeToJpeg(f, out, target, -1)
                client.reset()
                if (f.name.contains("prog")) {
                    // 108 MP progressive is over every phone's budget (40 MP max, PLAN §F2): refused, not decoded
                    // (Phase 0 measured 427-484 MB for it).
                    val e = result.exceptionOrNull()
                    report("$key.result", e?.javaClass?.simpleName ?: "decoded")
                    assertTrue("$key refused as too big", e is EngineFileException && e.code == EngineErrors.TOO_BIG)
                    continue
                }
                val r = result.getOrThrow()
                report("$key.size", "${r[0]}x${r[1]}")
                report("$key.path", listOf("ImageDecoder", "BitmapFactory", "RegionStrips")[r[2]])
                report("$key.ms", r[3])
                report("$key.enginePssKb", r[4])
                report("$key.enginePeakRssKb", r[5])
                assertEquals("$key long side", target, maxOf(r[0], r[1]))
                assertEquals("$key raw bytes", r[0].toLong() * r[1] * 4, out.length())
                assertTrue("$key should use the region-strip path", r[2] == 2)
            }
        }
    }
}
