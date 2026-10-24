package `in`.printsaathi.app.engine

/** Which built-in Android engine can open password-locked PDFs on this phone (PLAN §G5). */
enum class PdfUnlockTier { NATIVE_35, PRE_V, NONE }

/**
 * API 35+: PdfRenderer with LoadParams. API 30–34 with SDK extension S >= 13: PdfRendererPreV
 * (the rule AndroidX itself uses). Anything else cannot unlock natively.
 */
fun pdfUnlockTier(sdkInt: Int, sExtensionLevel: Int): PdfUnlockTier = when {
    sdkInt >= 35 -> PdfUnlockTier.NATIVE_35
    sdkInt in 30..34 && sExtensionLevel >= 13 -> PdfUnlockTier.PRE_V
    else -> PdfUnlockTier.NONE
}
