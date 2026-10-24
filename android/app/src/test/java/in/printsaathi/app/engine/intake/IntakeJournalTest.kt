package `in`.printsaathi.app.engine.intake

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** PLAN §D2 step 4 (journal) + Gate 2 #7: one record per intake, never overwritten, survives process death. */
class IntakeJournalTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun journal() = IntakeJournal(tmp.root.resolve("inbox"), tmp.root.resolve("jobs"))
    private fun result(id: String, files: Int) = JSONObject().put("intakeId", id).put("files", JSONArray().apply { repeat(files) { put(JSONObject().put("index", it + 1)) } })

    @Test fun twoQuickSharesAreBothKept() {
        val j = journal()
        j.begin("a", 2, nowMs = 1)
        j.finish("a", result("a", 2))
        j.begin("b", 1, nowMs = 2)
        j.finish("b", result("b", 1))
        assertEquals(listOf("a", "b"), j.pending().map { it.getString("intakeId") })
    }

    @Test fun acknowledgedIntakesLeaveTheList() {
        val j = journal()
        j.begin("a", 1, nowMs = 1)
        j.finish("a", result("a", 1))
        j.ack("a")
        assertEquals(emptyList<String>(), j.pending().map { it.getString("intakeId") })
    }

    @Test fun anIntakeStillCopyingIsNotListedAsReady() {
        val j = journal()
        j.begin("a", 3, nowMs = 1)
        assertEquals(emptyList<String>(), j.pending().map { it.getString("intakeId") })
    }

    /** After process death: half-copied files are deleted and the intake says how many were lost. */
    @Test fun interruptedIntakesAreRecoveredOnStart() {
        val j = journal()
        j.begin("a", 3, nowMs = 1)
        val src = tmp.root.resolve("jobs/a/src").apply { mkdirs() }
        File(src, "0001.jpg").writeText("done")
        File(src, "0002.part").writeText("half")
        assertEquals(1, j.recoverInterrupted())
        assertFalse(File(src, "0002.part").exists())
        assertTrue(File(src, "0001.jpg").exists())
        val rec = j.pending().single()
        assertEquals("interrupted", rec.getString("state"))
        assertEquals(3, rec.getInt("expected"))
    }

    /** Gate review #8: files fully received before the process died are kept and listed, not lost. */
    @Test fun filesReceivedBeforeDeathAreKeptInTheInterruptedRecord() {
        val j = journal()
        j.begin("a", 3, nowMs = 1)
        j.progress("a", result("a", 2))
        assertEquals("still copying: not ready yet", emptyList<String>(), j.pending().map { it.getString("intakeId") })
        j.recoverInterrupted()
        val rec = j.pending().single()
        assertEquals("interrupted", rec.getString("state"))
        assertEquals(2, rec.getJSONArray("files").length())
    }

    @Test fun aCorruptRecordIsSkippedNotFatal() {
        val j = journal()
        tmp.root.resolve("inbox").apply { mkdirs() }.resolve("broken.json").writeText("{not json")
        j.begin("a", 1, nowMs = 1)
        j.finish("a", result("a", 1))
        assertEquals(listOf("a"), j.pending().map { it.getString("intakeId") })
    }
}
