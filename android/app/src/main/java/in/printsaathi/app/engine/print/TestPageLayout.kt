package `in`.printsaathi.app.engine.print

/** A box on the page in millimetres, top-left origin. */
data class RectMm(val xMm: Double, val yMm: Double, val wMm: Double, val hMm: Double)

/**
 * Passport slots in reading order (PLAN §G0): as many [wMm]x[hMm] boxes as fit inside [edgeMm] edges with
 * [gapMm] between them, below [topReservedMm] of reserved space; the grid is centred across the page.
 */
fun passportSlots(
    paperWmm: Double,
    paperHmm: Double,
    edgeMm: Double,
    gapMm: Double,
    topReservedMm: Double,
    wMm: Double = 35.0,
    hMm: Double = 45.0,
): List<RectMm> {
    val cols = ((paperWmm - 2 * edgeMm + gapMm) / (wMm + gapMm)).toInt()
    val rows = ((paperHmm - 2 * edgeMm - topReservedMm + gapMm) / (hMm + gapMm)).toInt()
    if (cols <= 0 || rows <= 0) return emptyList()
    val gridW = cols * wMm + (cols - 1) * gapMm
    val x0 = (paperWmm - gridW) / 2
    val y0 = edgeMm + topReservedMm
    return List(rows * cols) { i -> RectMm(x0 + (i % cols) * (wMm + gapMm), y0 + (i / cols) * (hMm + gapMm), wMm, hMm) }
}

/** Words the shopkeeper sees inside Android's print screen when the paper is wrong (PLAN §D4, §H2 plain English). */
object PaperMessages {
    fun warning(label: String) = "Wrong paper. Nothing will print.\nAt 'Paper size' above, choose $label."

    fun fail(label: String) = "Nothing was printed - the paper was not $label. Tap Retry, then choose $label at 'Paper size'."
}
