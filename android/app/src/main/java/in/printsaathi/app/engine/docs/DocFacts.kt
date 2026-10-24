package `in`.printsaathi.app.engine.docs

import `in`.printsaathi.app.engine.isolated.CustomerPdf
import `in`.printsaathi.app.engine.isolated.EngineDiedException
import `in`.printsaathi.app.engine.isolated.EngineErrors
import `in`.printsaathi.app.engine.isolated.EngineUnavailableException
import `in`.printsaathi.app.engine.isolated.PdfOpen
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the engine said about a customer PDF (PLAN §G4, §J8), for the web app: {index, state, pages, sizes, forms}.
 * States: ok, password (locked, or the password was wrong), unsupported, damaged, tooBig, retry (the engine was not
 * ready or died once: Try again). Never a password, never a path.
 */
object DocFacts {
    /** [secondDeath]: the engine died on this file before (poison markers): it is damaged, not "try again". */
    fun toJson(index: Int, reply: Result<IntArray>, secondDeath: Boolean): JSONObject {
        val j = JSONObject().put("index", index)
        val r = reply.getOrElse { e ->
            return j.put(
                "state",
                when (e) {
                    is EngineUnavailableException -> "retry"
                    is EngineDiedException -> if (secondDeath) "damaged" else "retry"
                    else -> "damaged"
                },
            )
        }
        if (r.size >= 2 && r[0] > 0 && r.size == 2 + 2 * minOf(r[0], CustomerPdf.MAX_SIZED_PAGES)) {
            val sizes = JSONArray()
            for (i in 0 until (r.size - 2) / 2) sizes.put(JSONArray().put(r[2 + 2 * i]).put(r[3 + 2 * i]))
            return j.put("state", "ok").put("pages", r[0]).put("forms", r[1] and CustomerPdf.FLAG_FORMS_OR_STAMPS != 0).put("sizes", sizes)
        }
        return j.put(
            "state",
            when (r.singleOrNull()) {
                PdfOpen.PASSWORD_REQUIRED -> "password"
                PdfOpen.UNSUPPORTED -> "unsupported"
                -EngineErrors.TOO_BIG, -EngineErrors.OUT_OF_MEMORY -> "tooBig"
                else -> "damaged"
            },
        )
    }
}
