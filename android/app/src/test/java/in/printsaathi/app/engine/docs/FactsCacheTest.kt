package `in`.printsaathi.app.engine.docs

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Review M5: a damaged cache entry is read again from the PDF (never "nothing to print"); writes are all or nothing. */
class FactsCacheTest {
    @get:Rule val tmp = TemporaryFolder()

    @Test fun whatWasWrittenIsReadBack() {
        val c = FactsCache(tmp.root)
        c.write("abc", JSONObject().put("state", "ok").put("pages", 3))
        assertEquals(3, c.read("abc")!!.getInt("pages"))
        assertFalse("no half file left", tmp.root.resolve("pdf-abc.json.part").exists())
    }

    @Test fun aCutOffEntryIsForgottenNotTrusted() {
        tmp.root.resolve("pdf-abc.json").writeText("{\"state\":\"ok\",\"pag")
        val c = FactsCache(tmp.root)
        assertNull(c.read("abc"))
        assertFalse(tmp.root.resolve("pdf-abc.json").exists())
        assertNull("never there", c.read("nothing"))
    }
}
