package `in`.printsaathi.app.engine.render

import `in`.printsaathi.app.engine.isolated.Styles
import `in`.printsaathi.app.engine.pdf.GreyFlate
import `in`.printsaathi.app.engine.pdf.ImageKind
import `in`.printsaathi.app.engine.pdf.MiniPdfWriter
import `in`.printsaathi.app.engine.pdf.PdfImage
import `in`.printsaathi.app.engine.pdf.PlacedImage
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream

/** A received file the plan places; [file] is its copy under jobs/<id>/src. */
/** [locked]: opened with a password, or the app's unlocked copy: drawn page by page, never printed as it is. */
data class RenderItem(val index: Int, val file: File, val sha256: String, val locked: Boolean = false)

/** Phase 14: straightens the card at [quad] of a photo (or PDF page [pdfPage]) to exactly [outW] × [outH]. */
fun interface CardDecoder {
    fun card(item: RenderItem, dst: File, outW: Int, outH: Int, style: Int, quad: List<Double>, pdfPage: Int?): DecodeOutcome
}

sealed class DecodeOutcome {
    /** [mode]: how a document page was written (raw grey is compressed here; see PageMode). */
    /** [sourcePx]: for a straightened card, its width in the photo's own pixels (it may have been enlarged). */
    /** [turnsCw]: the photo went in as it is (its own bytes) and needs this many quarter turns clockwise to be upright. */
    data class Ok(
        val width: Int,
        val height: Int,
        val mode: PageMode = PageMode.COLOUR_JPEG,
        val sourcePx: Int? = null,
        val turnsCw: Int = 0,
    ) : DecodeOutcome()
    data object Damaged : DecodeOutcome()

    /** The engine could not do it this time (not started, or died once): "Try again" may work. */
    data object EngineUnavailable : DecodeOutcome()
}

/**
 * Decodes [item] upright, cut to [crop] (of the upright photo), to a JPEG at [dst] whose long side is at most
 * [longSidePx] (the isolated engine); [grey]: Black & white, grey data only.
 */
/** [style]: a print style (Styles.*): colour styles give a JPEG, Black & White / Sharp Black a grey JPEG, OCV Black 1-bit rows. */
fun interface PlacementDecoder {
    fun decode(item: RenderItem, dst: File, longSidePx: Int, style: Int, crop: Crop): DecodeOutcome
}

/**
 * How the engine writes an image: colour JPEG, grey JPEG (R = G = B), raw 8-bit grey rows, or raw 1-bit rows
 * (OCV Black: MSB first, rows padded to bytes, 0 = black).
 */
enum class PageMode { COLOUR_JPEG, GREY_JPEG, GREY_RAW, ONE_BIT_RAW }

/** Draws page [page] of a customer PDF onto white at [longSidePx] in [style] into [dst] (the isolated engine). */
fun interface PageDecoder {
    fun page(item: RenderItem, page: Int, dst: File, longSidePx: Int, mode: PageMode, style: Int): DecodeOutcome
}

/** One image of the print file: a photo or PDF page at a size, cut a certain way, in a style (each made once). */
private data class ImageKey(
    val itemIndex: Int,
    val longSidePx: Int,
    val crop: Crop,
    val pdfPage: Int? = null,
    val style: Int = Styles.ORIGINAL,
    val quad: List<Double>? = null,
    /** A card's output size (px, as the image stands before turning onto the sheet). */
    val outW: Int = 0,
    val outH: Int = 0,
) {
    val name get() = "$itemIndex-$longSidePx${if (crop.isFull) "" else "-" + crop.key}${pdfPage?.let { "-p$it" } ?: ""}-s$style" +
        (quad?.let { q -> "-q" + Integer.toHexString(q.hashCode()) + "-${outW}x$outH" } ?: "")
}

/** Re-opens a finished file and returns its page count, or null if it does not open. */
fun interface PageCounter {
    fun pages(pdf: File): Int?
}

class CancelToken {
    @Volatile var cancelled = false
        private set

    fun cancel() {
        cancelled = true
    }
}

sealed class RenderOutcome {
    /** [lowRes]: photos whose image reached less than 200 dpi at their box (they may print blurry, PLAN §F6). */
    /** [dpi]: each photo's dots per inch at its box (lowest over its places), for PLAN §F6's thresholds by job type. */
    data class Done(val pdf: File, val pages: Int, val lowRes: Set<Int> = emptySet(), val dpi: Map<Int, Int> = emptyMap()) :
        RenderOutcome()
    data class Damaged(val itemIndex: Int) : RenderOutcome()
    data object Cancelled : RenderOutcome()
    data class Failed(val reason: String) : RenderOutcome()
}

/**
 * Plan -> print.pdf (PLAN §G2, §G3). Each distinct photo is decoded once by the engine at 300 dpi of its box; the
 * app process only frames those engine-made JPEGs, page after page and copy after copy (collated, images reused).
 * The file is written as print.pdf.part, synced, re-opened and its pages counted, and only then renamed: a cancel,
 * a crash or a bad file never leaves a print.pdf that could be printed. [workDir] is scratch, cleared every time.
 */
class PlanRenderer(
    private val decoder: PlacementDecoder,
    private val counter: PageCounter,
    private val pages: PageDecoder? = null,
    /** A lossless grey page bigger than this is written as grey JPEG instead (PLAN §P: grey page ≤ 1.5 MB). */
    private val greyBudgetBytes: Int = 1_500_000,
    private val cards: CardDecoder? = null,
) {
    fun render(
        plan: RenderPlan,
        items: Map<Int, RenderItem>,
        workDir: File,
        outDir: File,
        cancel: CancelToken,
        progress: (done: Int, total: Int) -> Unit = { _, _ -> },
    ): RenderOutcome {
        val expected = plan.pages.size * plan.copies
        val pdf = File(outDir, "print.pdf")
        val meta = File(outDir, "print.json")
        val part = File(outDir, "print.pdf.part")
        return try {
            if (pdf.isFile && meta.isFile) {
                val m = JSONObject(meta.readText())
                if (m.optInt("pages") == expected) {
                    val low = m.optJSONArray("lowRes")
                    val dpiJson = m.optJSONObject("dpi")
                    val dpi = dpiJson?.keys()?.asSequence()?.associate { it.toInt() to dpiJson.getInt(it) } ?: emptyMap()
                    return RenderOutcome.Done(pdf, expected, (0 until (low?.length() ?: 0)).map { low!!.getInt(it) }.toSet(), dpi)
                }
            }
            workDir.deleteRecursively()
            if (!workDir.mkdirs() || !(outDir.isDirectory || outDir.mkdirs())) return RenderOutcome.Failed("no folder")
            plan.exactItem?.takeIf { items[it]?.locked != true }?.let { item ->
                // The untouched path (PLAN §G4): the customer's own file, byte for byte, checked by a re-open.
                val src = items[item]?.file ?: return RenderOutcome.Failed("unknown item")
                src.inputStream().use { i -> part.outputStream().use { o -> i.copyTo(o) } }
                if (cancel.cancelled) {
                    part.delete()
                    return RenderOutcome.Cancelled
                }
                if (counter.pages(part) != expected) {
                    part.delete()
                    return RenderOutcome.Failed("check")
                }
                pdf.delete()
                meta.delete()
                if (!part.renameTo(pdf)) return RenderOutcome.Failed("rename")
                meta.writeText(JSONObject().put("pages", expected).toString())
                progress(1, 1)
                return RenderOutcome.Done(pdf, expected)
            }
            val unique = plan.pages.flatten().map { keyOf(plan, it) }.distinct()
            val total = unique.size + 1
            val decoded = HashMap<ImageKey, Triple<File, DecodeOutcome.Ok, ImageKind>>()
            for ((n, key) in unique.withIndex()) {
                if (cancel.cancelled) return RenderOutcome.Cancelled
                val item = items[key.itemIndex] ?: return RenderOutcome.Failed("unknown item")
                val dst = File(workDir, "${key.name}.img")
                val tmp = File(workDir, dst.name + ".part")
                val r = if (key.quad != null) {
                    val c = cards ?: return RenderOutcome.Failed("no card decoder")
                    c.card(item, tmp, key.outW, key.outH, key.style, key.quad, key.pdfPage).let {
                        if (it is DecodeOutcome.Ok) it to (if (it.mode == PageMode.ONE_BIT_RAW) ImageKind.GREY1_RAW else ImageKind.JPEG_RGB) else it to null
                    }
                } else if (key.pdfPage != null) {
                    val p = pages ?: return RenderOutcome.Failed("no page decoder")
                    documentPage(p, item, key, tmp)
                } else {
                    decoder.decode(item, tmp, key.longSidePx, key.style, key.crop).let {
                        if (it is DecodeOutcome.Ok) it to (if (it.mode == PageMode.ONE_BIT_RAW) ImageKind.GREY1_RAW else ImageKind.JPEG_RGB) else it to null
                    }
                }
                when (val o = r.first) {
                    is DecodeOutcome.Ok -> if (tmp.renameTo(dst)) decoded[key] = Triple(dst, o, r.second as ImageKind) else return RenderOutcome.Failed("scratch")
                    DecodeOutcome.Damaged -> return RenderOutcome.Damaged(key.itemIndex)
                    DecodeOutcome.EngineUnavailable -> return RenderOutcome.Failed("engine")
                }
                progress(n + 1, total)
            }
            // Under 200 dpi (2/3 of the 300 dpi target): Ready says the photo may print blurry (gate M1).
            // A straightened card is made at its box's size; what counts is how many photo pixels it had (Phase 14).
            fun reached(key: ImageKey, v: DecodeOutcome.Ok) =
                if (key.quad != null) 300.0 * (v.sourcePx ?: key.outW) / key.outW else 300.0 * maxOf(v.width, v.height) / key.longSidePx
            val lowRes = decoded.filter { (key, v) -> (key.pdfPage == null || key.quad != null) && reached(key, v.second) * 3 < 300 * 2 }
                .keys.map { it.itemIndex }.toSet()
            // Dots per inch each photo reached at its box (300 when the photo was big enough), the lowest over its places.
            val dpi = decoded.filter { (key, _) -> key.pdfPage == null || key.quad != null }
                .entries.groupBy { it.key.itemIndex }
                .mapValues { (_, places) -> places.minOf { (key, v) -> reached(key, v.second).toInt().coerceAtMost(300) } }
            if (!write(plan, decoded, part, cancel)) {
                part.delete()
                return RenderOutcome.Cancelled
            }
            if (counter.pages(part) != expected) {
                part.delete()
                return RenderOutcome.Failed("check")
            }
            pdf.delete()
            meta.delete()
            if (!part.renameTo(pdf)) return RenderOutcome.Failed("rename")
            meta.writeText(
                JSONObject().put("pages", expected).put("lowRes", org.json.JSONArray(lowRes.sorted()))
                    .put("dpi", JSONObject().apply { dpi.forEach { (k, v) -> put(k.toString(), v) } }).toString(),
            )
            progress(total, total)
            RenderOutcome.Done(pdf, expected, lowRes, dpi)
        } catch (e: Exception) {
            part.delete()
            RenderOutcome.Failed(e.javaClass.simpleName)
        } finally {
            workDir.deleteRecursively()
        }
    }

    /** Returns false if cancelled part-way. */
    /**
     * A customer PDF page (PLAN §G4): colour as JPEG; black & white as lossless grey (GreyFlate) when it fits the
     * grey page budget, else as grey JPEG (scans and photos), drawn again by the engine.
     */
    private fun documentPage(p: PageDecoder, item: RenderItem, key: ImageKey, tmp: File): Pair<DecodeOutcome, ImageKind?> {
        val page = key.pdfPage as Int
        val style = key.style
        if (style == Styles.OCV) {
            return p.page(item, page, tmp, key.longSidePx, PageMode.ONE_BIT_RAW, style).let { if (it is DecodeOutcome.Ok) it to ImageKind.GREY1_RAW else it to null }
        }
        if (!Styles.isGrey(style)) {
            return p.page(item, page, tmp, key.longSidePx, PageMode.COLOUR_JPEG, style).let { if (it is DecodeOutcome.Ok) it to ImageKind.JPEG_RGB else it to null }
        }
        val raw = p.page(item, page, tmp, key.longSidePx, PageMode.GREY_RAW, style)
        if (raw !is DecodeOutcome.Ok) return raw to null
        if (raw.mode == PageMode.GREY_RAW) {
            val flate = GreyFlate.encode(tmp.readBytes(), raw.width, raw.height)
            if (flate.size <= greyBudgetBytes) {
                tmp.writeBytes(flate)
                return raw to ImageKind.GREY8_FLATE
            }
        }
        return p.page(item, page, tmp, key.longSidePx, PageMode.GREY_JPEG, style).let { if (it is DecodeOutcome.Ok) it to ImageKind.JPEG_RGB else it to null }
    }

    /** One image per photo, size, cut, page, style and card corners; a card is made at its box's size at 300 dpi. */
    private fun keyOf(plan: RenderPlan, p: RenderPlacement): ImageKey {
        if (p.quad == null) return ImageKey(p.itemIndex, p.longSidePx, p.crop, p.pdfPage, styleOf(plan, p))
        val w = Math.ceil(p.box.w * RenderPlan.DPI / 72.0 - 1e-9).toInt()
        val h = Math.ceil(p.box.h * RenderPlan.DPI / 72.0 - 1e-9).toInt()
        // The box is on the portrait sheet; the image stands as it will be turned onto it.
        val (ow, oh) = if (p.quarterTurnsCcw % 2 == 1) h to w else w to h
        return ImageKey(p.itemIndex, p.longSidePx, p.crop, p.pdfPage, styleOf(plan, p), p.quad, ow, oh)
    }

    /** The placement's style; on a Black & white plan "Original" means plain Black & White (plans before Phase 8). */
    private fun styleOf(plan: RenderPlan, p: RenderPlacement) = if (plan.grey && p.style == Styles.ORIGINAL) Styles.BW else p.style

    private fun write(plan: RenderPlan, decoded: Map<ImageKey, Triple<File, DecodeOutcome.Ok, ImageKind>>, part: File, cancel: CancelToken): Boolean {
        val images = decoded.mapValues { (key, v) ->
            val (file, size, kind) = v
            PdfImage(key.name, kind, size.width, size.height) { file.readBytes() }
        }
        FileOutputStream(part).use { fos ->
            val writer = MiniPdfWriter(BufferedOutputStream(fos, 256 * 1024))
            repeat(plan.copies) {
                for ((n, page) in plan.pages.withIndex()) {
                    if (cancel.cancelled) return false
                    writer.addPage(
                        plan.widthPt,
                        plan.heightPt,
                        page.map {
                            // A photo in as it is still carries the camera's turn: the page turns it (owner, 2026-10-23).
                            val turnsCw = decoded.getValue(keyOf(plan, it)).second.turnsCw
                            PlacedImage(images.getValue(keyOf(plan, it)), it.box, Math.floorMod(it.quarterTurnsCcw - turnsCw, 4))
                        },
                        rects = plan.borders.getOrNull(n).orEmpty(),
                        lines = plan.guides.getOrNull(n).orEmpty(),
                    )
                }
            }
            writer.finish()
            fos.fd.sync()
        }
        return true
    }
}
