package `in`.printsaathi.app.engine.isolated

/** Error codes the engine returns through ServiceSpecificException (never exception messages, never paths). */
object EngineErrors {
    const val FILE_UNREADABLE = 1
    const val OUT_OF_MEMORY = 2
    const val NOT_ALLOWED = 3

    /** A progressive photo larger than this phone can open safely (JpegScan budget). */
    const val TOO_BIG = 4

    /** The app asked for something it never should (a style that does not fit the output, an area outside the photo). */
    const val BAD_REQUEST = 5
}

/** See [EngineErrors.BAD_REQUEST]: the request was wrong, not the customer's file. */
class BadRequest(message: String) : IllegalArgumentException(message)
