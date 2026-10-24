package `in`.printsaathi.app.engine.diag

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Phase 10b (PLAN §E diagnostics, §K10 problem report, §Q logs): events, timings and codes only — a customer's file
 * name, path, text or password can never get in, because only numbers and true/false are kept; at most 1 MB.
 */
class DiagnosticsTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun eventsKeepNumbersAndYesNoOnlyNeverText() {
        val root = tmp.newFolder()
        val d = Diagnostics(root, clock = { 1000L })
        d.log(Diagnostics.Event.INTAKE, "files" to 6, "ms" to 2400L, "name" to "photo-RAMA1965.jpg", "ok" to true)
        val line = JSONObject(File(root, "diag/log.jsonl").readLines().single())
        assertEquals("intake", line.getString("e"))
        assertEquals(1000L, line.getLong("t"))
        assertEquals(6, line.getInt("files"))
        assertTrue(line.getBoolean("ok"))
        assertFalse("text never stored", line.has("name"))
        assertFalse(File(root, "diag/log.jsonl").readText().contains("RAMA1965"))
    }

    @Test fun aCrashKeepsItsKindAndWhereNeverItsMessage() {
        val root = tmp.newFolder()
        val e = IllegalStateException("could not open /data/user/0/in.printsaathi.app/no_backup/jobs/abc/src/0001.jpg")
        Diagnostics(root).crash(e)
        val text = File(root, "diag/log.jsonl").readText()
        // Full class names: a release build renames classes (R8), and only full names can be mapped back without
        // ambiguity (Phase 12 review I4). They name code, never customers.
        assertTrue(text.contains("java.lang.IllegalStateException"))
        assertTrue(text.contains("in.printsaathi.app.engine.diag.DiagnosticsTest."))
        assertFalse(text.contains("no_backup") || text.contains("0001.jpg") || text.contains("could not open"))
    }

    @Test fun theLogStaysUnderOneMegabyte() {
        val root = tmp.newFolder()
        val d = Diagnostics(root, maxBytesPerFile = 4_000)
        repeat(2_000) { d.log(Diagnostics.Event.RENDER, "pages" to it, "ms" to 1234L) }
        val total = File(root, "diag").listFiles()!!.sumOf { it.length() }
        assertTrue("total $total", total <= 8_000 + 200)
        assertTrue(d.recent(50).size == 50)
        assertTrue(d.recent(50).last().contains("\"pages\":1999"))
    }

    @Test fun theReportHasTheFactsAndNothingPrivate() {
        val root = tmp.newFolder()
        val d = Diagnostics(root)
        d.log(Diagnostics.Event.PRINT, "state" to 3)
        val report = d.report(header = listOf("App 1.0", "Android 16 (API 36)", "Shop: Star Xerox"))
        assertTrue(report.contains("Android 16 (API 36)") && report.contains("Star Xerox") && report.contains("\"e\":\"print\""))
        for (bad in listOf("no_backup", ".jpg", ".pdf", "/data/")) assertFalse(bad, report.contains(bad))
    }
}
