package `in`.printsaathi.app.engine

import android.os.Build
import android.os.Bundle
import android.os.ext.SdkExtensions
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.PdfOpenResult
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Spike (d) / ADR-002: which Android versions can open which locked PDFs, inside the isolated engine.
 * Fixtures: tests/fixtures/pdf (synthetic; user password RAMA1965). Page 1 has a black square, so a successful
 * open must also RENDER ink (inkRendered), not only report a page count. Ink presence is checked, not position.
 */
@RunWith(AndroidJUnit4::class)
class PdfOpenSpikeTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private val testAssets = InstrumentationRegistry.getInstrumentation().context.assets
    private val dir = File(ctx.filesDir, "pdf-spike").apply { mkdirs() }

    private val tier: PdfUnlockTier = pdfUnlockTier(
        Build.VERSION.SDK_INT,
        if (Build.VERSION.SDK_INT >= 30) SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) else 0,
    )

    private fun report(key: String, value: Any) {
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("pdf", "$key=$value") })
    }

    private fun fixture(name: String) = File(dir, name).apply { testAssets.open("pdf/$name").use { i -> outputStream().use { i.copyTo(it) } } }

    private fun open(name: String, password: String): PdfOpenResult {
        val client = EngineClient(ctx)
        val r = client.openPdf(fixture(name), password)
        client.reset()
        report("$tier $name pw=${if (password.isEmpty()) "empty" else "set"}", r)
        return r
    }

    @Test fun ownerOnlyPdfOpensWithoutPasswordAndRenders() {
        val r = open("owner-only.pdf", "")
        assertEquals(PdfOpenResult.Opened(pages = 1, inkRendered = true), r)
    }

    @Test fun userPasswordPdfRequiresPassword() {
        for (n in listOf("user-aes256.pdf", "user-aes128.pdf", "user-rc4.pdf")) {
            assertEquals(n, PdfOpenResult.PasswordRequired, open(n, ""))
        }
    }

    @Test fun unlocksWithCorrectPasswordWhenTierAllows() {
        for (n in listOf("user-aes256.pdf", "user-aes128.pdf", "user-rc4.pdf")) {
            val r = open(n, "RAMA1965")
            if (tier == PdfUnlockTier.NONE) {
                assertEquals("$n on tier NONE", PdfOpenResult.PasswordRequired, r)
                report("fallbackNeeded", n)
            } else {
                assertEquals("$n on tier $tier", PdfOpenResult.Opened(pages = 1, inkRendered = true), r)
            }
        }
    }

    /** ADR-002 option (i): the fallback's decrypted copy must open and render on EVERY tier, including NONE. */
    @Test fun fallbackDecryptedCopiesOpenOnEveryTier() {
        for (n in listOf("decrypted-aes256.pdf", "decrypted-aes128.pdf", "decrypted-rc4.pdf")) {
            assertEquals(n, PdfOpenResult.Opened(pages = 1, inkRendered = true), open(n, ""))
        }
    }

    @Test fun wrongPasswordIsRefused() {
        assumeTrue("tier NONE cannot unlock at all (covered by unlocksWithCorrectPasswordWhenTierAllows)", tier != PdfUnlockTier.NONE)
        assertEquals(PdfOpenResult.PasswordRequired, open("user-aes256.pdf", "WRONG1234"))
    }

    @Test fun garbageIsDamagedNotACrash() {
        val f = File(dir, "garbage.pdf").apply { writeBytes("%PDF-1.4\nthis is not a pdf".toByteArray()) }
        val client = EngineClient(ctx)
        val r = client.openPdf(f, "")
        client.reset()
        report("$tier garbage", r)
        assertEquals(PdfOpenResult.Damaged, r)
    }
}
