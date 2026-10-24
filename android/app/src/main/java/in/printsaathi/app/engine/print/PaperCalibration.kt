package `in`.printsaathi.app.engine.print

import org.json.JSONObject
import java.io.File

/** A printer's smallest blank edges, in mils (1/1000 inch), as Android's PrintAttributes.Margins reports them. */
data class Margins(val left: Int, val top: Int, val right: Int, val bottom: Int)

private val PHOTO_4X6_IN = 4000 to 6000
private val PHOTO_10X15_CM = 3937 to 5906
private val A4 = 8268 to 11693

/** The 4×6 photo-paper class (4×6 in or 10×15 cm, ± 3 mm, either way round), PLAN §D4. */
fun isPhotoClass(mils: Pair<Int, Int>): Boolean {
    if (mils.first <= 0 || mils.second <= 0) return false
    val portrait = minOf(mils.first, mils.second) to maxOf(mils.first, mils.second)
    return paperMatches(PHOTO_4X6_IN, portrait, true) || paperMatches(PHOTO_10X15_CM, portrait, true)
}

/**
 * What the test page learnt about the shop printer (PLAN §D4 calibration): the exact photo paper it offers, so
 * passport jobs can ask for that size and Android preselects it (sizes must match to the mil), and its margins.
 * Printer name, sizes and margins only: no customer data.
 */
data class Calibration(
    val printer: String,
    val photoMils: Pair<Int, Int>?,
    val photoMargins: Margins?,
    val a4Margins: Margins?,
)

/** state/paper.json under noBackupFilesDir; atomic writes. Only 4×6-class and A4 layouts are remembered. */
class PaperCalibrationStore(stateRoot: File) {
    private val dir = File(stateRoot, "state")
    private val file = File(dir, "paper.json")

    /** A final test-page layout on [printer] with paper [selectedMils] and the printer's smallest [margins]. */
    @Synchronized fun record(printer: String, selectedMils: Pair<Int, Int>, margins: Margins) {
        val photo = isPhotoClass(selectedMils)
        val a4 = paperMatches(A4, minOf(selectedMils.first, selectedMils.second) to maxOf(selectedMils.first, selectedMils.second), true)
        if (!photo && !a4) return
        val old = load()?.takeIf { it.printer == printer } ?: Calibration(printer, null, null, null)
        save(
            if (photo) {
                old.copy(photoMils = minOf(selectedMils.first, selectedMils.second) to maxOf(selectedMils.first, selectedMils.second), photoMargins = margins)
            } else {
                old.copy(a4Margins = margins)
            },
        )
    }

    @Synchronized fun load(): Calibration? = runCatching {
        val j = JSONObject(file.readText())
        fun margins(k: String) = j.optJSONObject(k)?.let { Margins(it.getInt("l"), it.getInt("t"), it.getInt("r"), it.getInt("b")) }
        Calibration(
            j.getString("printer"),
            j.optJSONObject("photo")?.let { it.getInt("w") to it.getInt("h") },
            margins("photoMargins"),
            margins("a4Margins"),
        )
    }.getOrNull()

    private fun save(c: Calibration) {
        dir.mkdirs()
        fun margins(m: Margins?) = m?.let { JSONObject().put("l", it.left).put("t", it.top).put("r", it.right).put("b", it.bottom) }
        val json = JSONObject().put("printer", c.printer)
            .put("photo", c.photoMils?.let { JSONObject().put("w", it.first).put("h", it.second) })
            .put("photoMargins", margins(c.photoMargins))
            .put("a4Margins", margins(c.a4Margins))
        val tmp = File(dir, "paper.json.tmp")
        tmp.outputStream().use { out ->
            out.write(json.toString().toByteArray())
            out.fd.sync()
        }
        if (!tmp.renameTo(file)) tmp.delete()
    }
}
