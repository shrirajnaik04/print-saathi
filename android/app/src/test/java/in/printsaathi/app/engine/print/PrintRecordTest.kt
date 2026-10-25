package `in`.printsaathi.app.engine.print

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** PLAN §D4: the one print in flight is persisted, so its outcome can be checked after the app was killed. */
class PrintRecordTest {
    @get:Rule val tmp = TemporaryFolder()

    private val record = PrintRecord("job-1", "0123456789abcdef", "PrintSaathi 123456", 1000L, finished = false, wrongPaper = false)

    @Test fun savesAndLoadsTheRecordWithoutCustomerData() {
        val store = PrintRecordStore(tmp.root)
        store.save(record)
        assertEquals(record, store.load())
        val text = tmp.root.resolve("state/print.json").readText()
        assertFalse("no paths in the record", text.contains("/"))
    }

    /** Owner, round 5: whether Android asked for the final file is kept; an older record without it is checked as before. */
    @Test fun keepsWhetherTheFinalFileWasAskedFor() {
        val store = PrintRecordStore(tmp.root)
        store.save(record.copy(finalAsked = false))
        assertFalse(store.load()!!.finalAsked)
        store.save(record.copy(finalAsked = true))
        assertTrue(store.load()!!.finalAsked)
        val old = tmp.root.resolve("state/print.json")
        old.writeText(old.readText().replace(Regex(",?\"finalAsked\":(true|false)"), ""))
        assertTrue("an old record keeps the checking path", store.load()!!.finalAsked)
    }

    @Test fun updatesReplaceTheRecordAtomically() {
        val store = PrintRecordStore(tmp.root)
        store.save(record)
        store.save(record.copy(finished = true, wrongPaper = true))
        assertTrue(store.load()!!.finished)
        assertTrue(store.load()!!.wrongPaper)
        assertFalse(tmp.root.resolve("state/print.json.tmp").exists())
    }

    @Test fun aMissingOrUnreadableRecordMeansNoPrintInFlight() {
        val store = PrintRecordStore(tmp.root)
        assertNull(store.load())
        tmp.root.resolve("state").mkdirs()
        tmp.root.resolve("state/print.json").writeText("{not json")
        assertNull(store.load())
    }

    @Test fun clearRemovesIt() {
        val store = PrintRecordStore(tmp.root)
        store.save(record)
        store.clear()
        assertNull(store.load())
    }

    @Test fun aTestPagePrintIsRememberedAsATestNotAsACustomerJob() {
        val store = PrintRecordStore(tmp.root)
        store.save(record.copy(kind = PrintKind.TEST_A4))
        assertEquals(PrintKind.TEST_A4, store.load()!!.kind)
        store.save(record)
        assertEquals("a record without a kind is a customer job", PrintKind.JOB, store.load()!!.kind)
    }

    @Test fun aPartOfABigJobRemembersWhichPartItIs() {
        val store = PrintRecordStore(tmp.root)
        store.save(record.copy(part = 1, parts = 3))
        assertEquals(1, store.load()!!.part)
        assertEquals(3, store.load()!!.parts)
        store.save(record)
        assertEquals("a job printed in one go is part 0 of 1", 0 to 1, store.load()!!.let { it.part to it.parts })
    }

    @Test fun aPartRemembersThePlanItWasCutFrom() {
        val store = PrintRecordStore(tmp.root)
        store.save(record.copy(part = 0, parts = 2, partOf = "fedcba9876543210"))
        assertEquals("fedcba9876543210", store.load()!!.partOf)
        store.save(record)
        assertEquals("", store.load()!!.partOf)
    }
}
