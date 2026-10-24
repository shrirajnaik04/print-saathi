package `in`.printsaathi.app.engine.isolated

/** App-side meaning of the engine's openPdf reply. */
sealed class PdfOpenResult {
    data class Opened(val pages: Int, val inkRendered: Boolean) : PdfOpenResult()
    data object PasswordRequired : PdfOpenResult()
    data object Unsupported : PdfOpenResult()
    data object Damaged : PdfOpenResult()

    companion object {
        fun from(reply: IntArray): PdfOpenResult = when {
            reply.size == 2 && reply[0] >= 1 -> Opened(reply[0], reply[1] == 1)
            reply.size == 1 && reply[0] == PdfOpen.PASSWORD_REQUIRED -> PasswordRequired
            reply.size == 1 && reply[0] == PdfOpen.UNSUPPORTED -> Unsupported
            else -> Damaged
        }
    }
}
