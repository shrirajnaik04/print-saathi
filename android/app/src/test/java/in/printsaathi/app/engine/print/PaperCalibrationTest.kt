package `in`.printsaathi.app.engine.print

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** PLAN §D4 paper calibration: the test page remembers the shop printer's exact 4×6-class photo paper and margins. */
class PaperCalibrationTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun fourBySixInchesAndTenByFifteenCentimetresArePhotoPaper() {
        assertTrue(isPhotoClass(4000 to 6000))
        assertTrue(isPhotoClass(3937 to 5906))
        assertTrue("either way round", isPhotoClass(6000 to 4000))
        assertTrue("within 3 mm", isPhotoClass(4100 to 6100))
    }

    @Test fun otherSmallPapersAreNotPhotoPaper() {
        assertFalse("5x7 in", isPhotoClass(5000 to 7000))
        assertFalse("A6", isPhotoClass(4134 to 5827))
        assertFalse("A4", isPhotoClass(8268 to 11693))
        assertFalse("nothing reported", isPhotoClass(0 to 0))
    }

    @Test fun aPhotoPaperLayoutIsRememberedWithItsMargins() {
        val store = PaperCalibrationStore(tmp.root)
        store.record(printer = "Brother DCP-T720DW", selectedMils = 3937 to 5906, margins = Margins(118, 118, 118, 118))
        val c = store.load()!!
        assertEquals("Brother DCP-T720DW", c.printer)
        assertEquals(3937 to 5906, c.photoMils)
        assertEquals(Margins(118, 118, 118, 118), c.photoMargins)
        assertNull(c.a4Margins)
    }

    @Test fun anA4LayoutKeepsOnlyItsMarginsAndNeverReplacesThePhotoPaper() {
        val store = PaperCalibrationStore(tmp.root)
        store.record("Shop printer", 4000 to 6000, Margins(0, 0, 0, 0))
        store.record("Shop printer", 8270 to 11690, Margins(250, 250, 250, 500))
        val c = store.load()!!
        assertEquals(4000 to 6000, c.photoMils)
        assertEquals(Margins(250, 250, 250, 500), c.a4Margins)
    }

    @Test fun anotherPrinterStartsAgain() {
        val store = PaperCalibrationStore(tmp.root)
        store.record("Old printer", 4000 to 6000, Margins(0, 0, 0, 0))
        store.record("New printer", 8268 to 11693, Margins(250, 250, 250, 250))
        val c = store.load()!!
        assertEquals("New printer", c.printer)
        assertNull("the old printer's photo paper is not this printer's", c.photoMils)
    }

    @Test fun otherSizesAreIgnoredAndAnUnreadableFileMeansNotSetUp() {
        val store = PaperCalibrationStore(tmp.root)
        store.record("Shop printer", 5000 to 7000, Margins(0, 0, 0, 0))
        assertNull(store.load())
        tmp.root.resolve("state").mkdirs()
        tmp.root.resolve("state/paper.json").writeText("{bad")
        assertNull(store.load())
        assertFalse(tmp.root.resolve("state/paper.json.tmp").exists())
    }
}
