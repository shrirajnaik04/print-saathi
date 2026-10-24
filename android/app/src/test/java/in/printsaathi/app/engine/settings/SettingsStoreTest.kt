package `in`.printsaathi.app.engine.settings

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** Phase 10b (PLAN §I-15, §E): the owner's settings, read by the native side too (the daily cleanup has no web app). */
class SettingsStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun nothingSavedMeansTheDefaults() {
        val s = SettingsStore(tmp.newFolder())
        assertNull(s.load())
        assertEquals(24L * 3600 * 1000, s.keepMs())
        assertEquals(0L, s.screenshotsUntil())
        assertEquals("", s.shopName())
    }

    @Test fun savedSettingsAreReadBackAndUsed() {
        val root = tmp.newFolder()
        assertTrue(SettingsStore(root).save(JSONObject("""{"v":1,"retention":"7d","shopName":"Star Xerox","screenshotsUntil":123}""")))
        val s = SettingsStore(root)
        assertEquals("7d", s.load()!!.getString("retention"))
        assertEquals(7L * 24 * 3600 * 1000, s.keepMs())
        assertEquals(123L, s.screenshotsUntil())
        assertEquals("Star Xerox", s.shopName())
        SettingsStore(root).save(JSONObject("""{"v":1,"retention":"1h"}"""))
        assertEquals(3600L * 1000, SettingsStore(root).keepMs())
    }

    @Test fun aBrokenFileOrOddValuesFallBackToTheDefaults() {
        val root = tmp.newFolder()
        File(root, "state").mkdirs()
        File(root, "state/settings.json").writeText("{broken")
        assertEquals(24L * 3600 * 1000, SettingsStore(root).keepMs())
        SettingsStore(root).save(JSONObject("""{"v":1,"retention":"forever","screenshotsUntil":"soon","shopName":5}"""))
        assertEquals(24L * 3600 * 1000, SettingsStore(root).keepMs())
        assertEquals(0L, SettingsStore(root).screenshotsUntil())
        assertEquals("", SettingsStore(root).shopName())
    }

    @Test fun oversizedSettingsAreRefused() {
        val root = tmp.newFolder()
        assertFalse(SettingsStore(root).save(JSONObject().put("shopName", "x".repeat(20_000))))
        assertNull(SettingsStore(root).load())
    }
}
