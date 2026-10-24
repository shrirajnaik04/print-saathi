package `in`.printsaathi.app.engine.render

import `in`.printsaathi.app.engine.isolated.CustomerPdf
import `in`.printsaathi.app.engine.isolated.EngineClient
import `in`.printsaathi.app.engine.isolated.EngineDiedException
import `in`.printsaathi.app.engine.isolated.EngineErrors
import `in`.printsaathi.app.engine.isolated.EngineFileException
import `in`.printsaathi.app.engine.isolated.EngineUnavailableException
import `in`.printsaathi.app.engine.isolated.PdfOpenResult
import `in`.printsaathi.app.engine.isolated.Styles
import `in`.printsaathi.app.engine.jobs.PoisonMarkers
import java.io.File

/**
 * The renderer's two outside steps, both done by the isolated engine: decoding a customer photo (guarded by poison
 * markers, so a file that kills the engine is never tried again, PLAN §D5) and re-opening the finished print.pdf to
 * count its pages. The app process never parses customer content.
 */
class EngineRenderer(
    private val client: EngineClient,
    private val poison: PoisonMarkers,
    /** Locked PDFs' passwords by item, in memory for this render only (never logged, never stored). */
    private val passwords: Map<Int, String> = emptyMap(),
) : PlacementDecoder, PageCounter, PageDecoder, CardDecoder {
    override fun card(item: RenderItem, dst: File, outW: Int, outH: Int, style: Int, quad: List<Double>, pdfPage: Int?): DecodeOutcome =
        EngineClient.turn {
            if (poison.isPoisoned(item.sha256)) return@turn DecodeOutcome.Damaged
            poison.begin(item.sha256)
            val r = client.decodeWarped(item.file, dst, outW, outH, JPEG_QUALITY, style, quad.toDoubleArray(), pdfPage, passwords[item.index] ?: "")
            r.exceptionOrNull()?.let { e -> return@turn failed(item, dst, e) }
            poison.end(item.sha256)
            val v = r.getOrThrow()
            DecodeOutcome.Ok(v[0], v[1], if (style == Styles.OCV) PageMode.ONE_BIT_RAW else PageMode.COLOUR_JPEG, sourcePx = v[6])
        }

    override fun page(item: RenderItem, page: Int, dst: File, longSidePx: Int, mode: PageMode, style: Int): DecodeOutcome =
        EngineClient.turn { ownedPage(item, page, dst, longSidePx, mode, style) }

    private fun ownedPage(item: RenderItem, page: Int, dst: File, longSidePx: Int, mode: PageMode, style: Int): DecodeOutcome {
        if (poison.isPoisoned(item.sha256)) return DecodeOutcome.Damaged
        poison.begin(item.sha256)
        val m = when (mode) {
            PageMode.COLOUR_JPEG -> CustomerPdf.MODE_COLOUR_JPEG
            PageMode.GREY_JPEG -> CustomerPdf.MODE_GREY_JPEG
            PageMode.GREY_RAW -> CustomerPdf.MODE_GREY_RAW
            PageMode.ONE_BIT_RAW -> CustomerPdf.MODE_ONE_BIT
        }
        val r = client.renderCustomerPage(item.file, passwords[item.index] ?: "", page, dst, longSidePx, JPEG_QUALITY, m, style)
        r.exceptionOrNull()?.let { e -> return failed(item, dst, e) }
        poison.end(item.sha256)
        val size = r.getOrThrow()
        return DecodeOutcome.Ok(size[0], size[1], mode)
    }

    private fun failed(item: RenderItem, dst: File, e: Throwable): DecodeOutcome {
        dst.delete()
        // Not the file's fault: the engine was not there, or the request itself was wrong (gate M6).
        if (e is EngineUnavailableException || (e is EngineFileException && e.code == EngineErrors.BAD_REQUEST)) {
            poison.end(item.sha256)
            return DecodeOutcome.EngineUnavailable
        }
        if (e is EngineDiedException && !poison.recordDeath(item.sha256)) return DecodeOutcome.EngineUnavailable
        if (e !is EngineDiedException) poison.end(item.sha256)
        return DecodeOutcome.Damaged
    }

    override fun decode(item: RenderItem, dst: File, longSidePx: Int, style: Int, crop: Crop): DecodeOutcome =
        EngineClient.turn { ownedDecode(item, dst, longSidePx, style, crop) }

    private fun ownedDecode(item: RenderItem, dst: File, longSidePx: Int, style: Int, crop: Crop): DecodeOutcome {
        if (poison.isPoisoned(item.sha256)) return DecodeOutcome.Damaged
        poison.begin(item.sha256)
        val r = client.decodeStyled(item.file, dst, longSidePx, JPEG_QUALITY, style, crop)
        r.exceptionOrNull()?.let { e ->
            dst.delete()
            if (e is EngineUnavailableException || (e is EngineFileException && e.code == EngineErrors.BAD_REQUEST)) {
                poison.end(item.sha256)
                return DecodeOutcome.EngineUnavailable
            }
            // A single engine death is not enough to call the photo damaged (PoisonMarkers.DEATHS); the render
            // stops here and "Try again" retries it.
            if (e is EngineDiedException && !poison.recordDeath(item.sha256)) return DecodeOutcome.EngineUnavailable
            if (e !is EngineDiedException) poison.end(item.sha256)
            return DecodeOutcome.Damaged
        }
        poison.end(item.sha256)
        val size = r.getOrThrow()
        return DecodeOutcome.Ok(
            size[0],
            size[1],
            if (style == Styles.OCV) PageMode.ONE_BIT_RAW else PageMode.COLOUR_JPEG,
            turnsCw = size.getOrElse(6) { 0 },
        )
    }

    override fun pages(pdf: File): Int? = (client.openPdf(pdf, "") as? PdfOpenResult.Opened)?.pages

    companion object {
        /** Colour print quality (PLAN §G2). */
        const val JPEG_QUALITY = 92
    }
}
