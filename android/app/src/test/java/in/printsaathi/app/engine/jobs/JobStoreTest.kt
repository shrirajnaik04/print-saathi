package `in`.printsaathi.app.engine.jobs

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** PLAN §D2c: single writer, revision-checked, atomic. */
class JobStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun store() = JobStore(tmp.root.resolve("jobs"))
    private fun job(rev: Int, copies: Int = 1) = JSONObject().put("id", "j1").put("rev", rev).put("copies", copies)

    @Test fun savesAndLoadsTheNewestRevision() {
        val s = store()
        assertTrue(s.save("j1", job(1)))
        assertTrue(s.save("j1", job(2, copies = 3)))
        assertEquals(3, s.load("j1")!!.getInt("copies"))
    }

    /** A late result built from an older revision must never overwrite newer choices. */
    @Test fun refusesAStaleOrEqualRevision() {
        val s = store()
        s.save("j1", job(5, copies = 4))
        assertFalse(s.save("j1", job(4, copies = 9)))
        assertFalse(s.save("j1", job(5, copies = 9)))
        assertEquals(4, s.load("j1")!!.getInt("copies"))
    }

    @Test fun neverLeavesAHalfWrittenFile() {
        val s = store()
        s.save("j1", job(1))
        assertFalse(File(tmp.root, "jobs/j1/job.json.tmp").exists())
        assertTrue(File(tmp.root, "jobs/j1/job.json").exists())
    }

    @Test fun refusesIdsThatCouldEscapeTheJobsFolder() {
        val s = store()
        assertFalse(s.save("../outside", job(1)))
        assertFalse(s.save("a/b", job(1)))
        assertNull(s.load("../outside"))
    }

    @Test fun listsJobsNewestFirstAndSkipsBrokenFiles() {
        val s = store()
        s.save("old", job(1).put("id", "old").put("updatedAt", 100))
        s.save("new", job(1).put("id", "new").put("updatedAt", 200))
        tmp.root.resolve("jobs/broken").mkdirs()
        tmp.root.resolve("jobs/broken/job.json").writeText("{nope")
        assertEquals(listOf("new", "old"), s.list().map { it.getString("id") })
    }

    @Test fun deleteRemovesTheWholeJobFolder() {
        val s = store()
        s.save("j1", job(1))
        tmp.root.resolve("jobs/j1/src").mkdirs()
        tmp.root.resolve("jobs/j1/src/0001.jpg").writeText("x")
        s.delete("j1")
        assertFalse(tmp.root.resolve("jobs/j1").exists())
    }
}
