package `in`.printsaathi.app.engine.fuzz

import `in`.printsaathi.app.engine.intake.sniff
import `in`.printsaathi.app.engine.isolated.Styles
import `in`.printsaathi.app.engine.render.PlanInvalid
import `in`.printsaathi.app.engine.render.RenderPlan
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import kotlin.random.Random

/**
 * Phase 10 (PLAN §R levels 1–2, 12): seeded fuzzing of what crosses into native code from outside — print plans from
 * the web app, the first bytes of shared files, pixels into the print styles. Each must be refused cleanly or handled,
 * never crash with anything else.
 */
class FuzzTest {
    private val fixtures = listOf("plan-v1-sample.json", "plan-v1-bw.json", "plan-v1-turned.json", "plan-v1-passport.json",
        "plan-v1-document.json", "plan-v1-exact.json", "plan-v1-styles.json")
        .map { JSONObject(javaClass.getResource("/$it")!!.readText()).getJSONObject("plan") }

    private val odd = listOf<Any?>(
        null, JSONObject.NULL, -1, 0, 1, 2, 3, 4, 7, 501, Int.MAX_VALUE, Int.MIN_VALUE, -0.0001, 1e-12, 1.0000001, 1e308,
        // NaN and Infinity cannot reach the parser: plans arrive as JSON text, where JSON.stringify makes them null.
        -1e308, 4.9e-324, "", "x", "colour", "bw", "ocv", "vibrant", "original", "A4", "PHOTO_4x6",
        "landscape", JSONObject(), JSONArray(), JSONArray(listOf(1, 2)),
    )

    /** Changes one value somewhere in [o] (or removes a key), at random, in place. */
    private fun mutate(o: Any, r: Random) {
        when (o) {
            is JSONObject -> {
                val keys = o.keys().asSequence().toList()
                if (keys.isEmpty()) return
                val k = keys[r.nextInt(keys.size)]
                val v = o.opt(k)
                if ((v is JSONObject || v is JSONArray) && r.nextInt(3) > 0) mutate(v, r)
                else if (r.nextInt(8) == 0) o.remove(k)
                else o.put(k, odd[r.nextInt(odd.size)])
            }
            is JSONArray -> {
                if (o.length() == 0) return
                val i = r.nextInt(o.length())
                val v = o.opt(i)
                when {
                    (v is JSONObject || v is JSONArray) && r.nextInt(3) > 0 -> mutate(v, r)
                    r.nextInt(6) == 0 -> o.remove(i)
                    r.nextInt(6) == 0 -> o.put(o.opt(r.nextInt(o.length())))
                    else -> o.put(i, odd[r.nextInt(odd.size)])
                }
            }
        }
    }

    @Test fun mutatedPlansAreParsedOrRefusedNeverAnythingElse() {
        val r = Random(20261017)
        var refused = 0
        repeat(5000) { n ->
            val plan = JSONObject(fixtures[n % fixtures.size].toString())
            repeat(1 + r.nextInt(4)) { mutate(plan, r) }
            try {
                val p = RenderPlan.parse(plan)
                // What is accepted is sane: real pages, positive sizes, styles that exist.
                assertTrue(p.pages.isNotEmpty() && p.copies in 1..99)
                assertTrue(p.pages.flatten().all { it.longSidePx > 0 && it.box.w > 0 && it.box.h > 0 && it.style in Styles.ORIGINAL..Styles.OCV })
            } catch (e: PlanInvalid) {
                refused++
            } catch (e: JSONException) {
                refused++ // a missing or wrong-typed field: refused the same way by the plugin
            } catch (e: Throwable) {
                fail("plan $n crashed the parser with ${e.javaClass.simpleName}: $plan")
            }
        }
        assertTrue("most mutations are refused ($refused)", refused > 2000)
    }

    @Test fun anyFirstBytesAreSniffedWithoutCrashing() {
        val r = Random(7)
        repeat(20000) {
            val head = ByteArray(r.nextInt(0, 2049)).also { r.nextBytes(it) }
            // Real headers with random tails, too.
            if (it % 4 == 0 && head.size >= 8) "%PDF-1.7".toByteArray().copyInto(head)
            if (it % 4 == 1 && head.size >= 3) byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()).copyInto(head)
            sniff(head)
        }
    }

    @Test fun anyPixelsGoThroughTheStylesWithinRange() {
        val r = Random(11)
        repeat(300) {
            val w = r.nextInt(1, 70)
            val h = r.nextInt(1, 70)
            val row = IntArray(w) { r.nextInt() }
            Styles.vibrant(row.copyOf(), w)
            Styles.soft(row.copyOf(), w)
            val hist = IntArray(256) { r.nextInt(0, 50) }
            Styles.sharp(row.copyOf(), w, Styles.levels(hist))
            val grey = ByteArray(w * h).also { r.nextBytes(it) }
            val out = Styles.ocv(grey, w, h, stripRows = r.nextInt(1, 40))
            assertEquals((w + 7) / 8 * h, out.size)
        }
    }
}
