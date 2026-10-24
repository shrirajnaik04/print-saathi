package `in`.printsaathi.app.engine.print

import kotlin.math.abs

private const val MM_PER_MIL = 0.0254

/**
 * Same paper size class within [toleranceMm] (default ±3 mm), portrait only (PLAN §D4). Our PDF pages are always
 * portrait, so a Landscape choice in Android's print dialog would make the print service rotate or shrink the page.
 * Sizes are in mils (1/1000 inch), as Android's MediaSize reports them.
 */
fun paperMatches(
    plannedMils: Pair<Int, Int>,
    selectedMils: Pair<Int, Int>,
    selectedIsPortrait: Boolean,
    toleranceMm: Double = 3.0,
): Boolean {
    if (!selectedIsPortrait) return false
    val (pw, ph) = plannedMils
    val (sw, sh) = selectedMils
    val tol = toleranceMm / MM_PER_MIL
    return abs(pw - minOf(sw, sh)) <= tol && abs(ph - maxOf(sw, sh)) <= tol
}

enum class LayoutDecision { REAL_DOCUMENT, WARNING_PAGE, FAIL }

/**
 * Never trap the owner in Android's print dialog: a failed layout disables its options and Retry repeats the failure
 * (verified in AOSP PrintActivity). So a wrong paper during a PREVIEW layout returns a warning page instead; only the
 * final layout fails, so nothing prints on the wrong paper.
 */
fun layoutDecision(isPreview: Boolean, matches: Boolean): LayoutDecision = when {
    matches -> LayoutDecision.REAL_DOCUMENT
    isPreview -> LayoutDecision.WARNING_PAGE
    else -> LayoutDecision.FAIL
}
