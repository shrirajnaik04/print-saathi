package `in`.printsaathi.app.engine.render

import `in`.printsaathi.app.engine.pdf.RectD
import `in`.printsaathi.app.engine.pdf.StrokeRect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import `in`.printsaathi.app.engine.isolated.Styles
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/** PLAN §G2, §G3, §D2c: plan -> print.pdf, atomic, collated copies, cancellable, nothing half-written. */
class PlanRendererTest {
    @get:Rule val tmp = TemporaryFolder()

    private val jpeg = javaClass.getResource("/2x2.jpg")!!.readBytes()
    private val a4w = 595.2755905511812
    private val a4h = 841.8897637795275

    private fun item(i: Int) = RenderItem(i, tmp.root.resolve("src-$i.jpg").apply { writeBytes(jpeg) }, "sha$i")
    private fun page(vararg idx: Int) = idx.map { RenderPlacement(it, RectD(17.0, 17.0, 200.0, 300.0), 0, 1250) }
    private fun plan(copies: Int, vararg pages: List<RenderPlacement>) = RenderPlan(a4w, a4h, copies, pages.toList())
    private fun greyPlan(vararg pages: List<RenderPlacement>) = RenderPlan(a4w, a4h, 1, pages.toList(), grey = true)

    private val decodes = mutableListOf<Int>()
    private val stylesAsked = mutableListOf<Int>()
    private val crops = mutableListOf<Crop>()
    private val decoder = PlacementDecoder { item, dst, px, style, crop ->
        crops += crop
        stylesAsked += style
        decodes += item.index
        assertEquals(1250, px)
        if (style == Styles.OCV) {
            dst.writeBytes(byteArrayOf(0x7F, 0xFF.toByte())) // 2 × 2, one black pixel
            DecodeOutcome.Ok(2, 2, PageMode.ONE_BIT_RAW)
        } else {
            dst.writeBytes(jpeg)
            DecodeOutcome.Ok(2, 2)
        }
    }
    private val counter = PageCounter { pdf -> Regex("""/Type /Page\b""").findAll(pdf.readText(Charsets.ISO_8859_1)).count() }

    private val work get() = tmp.root.resolve("work")
    private val out get() = tmp.root.resolve("out")
    private fun items(vararg i: Int) = i.associateWith { item(it) }

    @Test fun writesCollatedCopiesAndDecodesEachPhotoOnce() {
        val r = PlanRenderer(decoder, counter).render(plan(2, page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Done)
        r as RenderOutcome.Done
        assertEquals(4, r.pages)
        assertEquals(listOf(1, 2), decodes)
        val s = r.pdf.readText(Charsets.ISO_8859_1)
        assertEquals("each photo stored once despite 2 copies", 2, Regex("""/Subtype /Image""").findAll(s).count())
        // Collated: page order is 1, 2, 1, 2 -> image objects alternate.
        val drawn = Regex("""/Im(\d+) Do""").findAll(s).map { it.groupValues[1] }.toList()
        assertEquals(4, drawn.size)
        assertEquals(drawn[0], drawn[2])
        assertEquals(drawn[1], drawn[3])
        assertFalse(drawn[0] == drawn[1])
        assertEquals(r.pdf, out.resolve("print.pdf"))
        assertFalse("no half file left", out.resolve("print.pdf.part").exists())
        assertFalse("render scratch cleared", work.exists())
    }

    @Test fun aRepeatOfTheSameFinishedPlanIsServedFromTheFileWithoutDecoding() {
        val p = plan(1, page(1))
        PlanRenderer(decoder, counter).render(p, items(1), work, out, CancelToken())
        decodes.clear()
        val again = PlanRenderer(decoder, counter).render(p, items(1), work, out, CancelToken())
        assertTrue(again is RenderOutcome.Done)
        assertEquals(emptyList<Int>(), decodes)
    }

    @Test fun cancelStopsAndLeavesNoPrintFile() {
        val token = CancelToken()
        val cancelling = PlacementDecoder { item, dst, px, grey, crop -> decoder.decode(item, dst, px, grey, crop).also { token.cancel() } }
        val r = PlanRenderer(cancelling, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, token)
        assertEquals(RenderOutcome.Cancelled, r)
        assertEquals("stopped after the first photo", listOf(1), decodes)
        assertFalse(out.resolve("print.pdf").exists())
        assertFalse(out.resolve("print.pdf.part").exists())
        assertFalse(work.exists())
    }

    @Test fun aDamagedPhotoNamesItselfAndNothingIsWritten() {
        val failing = PlacementDecoder { item, dst, px, grey, crop -> if (item.index == 2) DecodeOutcome.Damaged else decoder.decode(item, dst, px, grey, crop) }
        val r = PlanRenderer(failing, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertEquals(RenderOutcome.Damaged(2), r)
        assertFalse(out.resolve("print.pdf").exists())
    }

    @Test fun aFileThatDoesNotReopenWithTheRightPageCountIsNeverOffered() {
        val r = PlanRenderer(decoder, PageCounter { 1 }).render(plan(2, page(1)), items(1), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Failed)
        assertFalse(out.resolve("print.pdf").exists())
        assertFalse(out.resolve("print.pdf.part").exists())
    }

    @Test fun aPlacementForAnItemNotInTheJobFails() {
        val r = PlanRenderer(decoder, counter).render(plan(1, page(9)), items(1), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Failed)
    }

    @Test fun reportsProgressUpToTheTotal() {
        val seen = mutableListOf<Pair<Int, Int>>()
        PlanRenderer(decoder, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, CancelToken()) { d, t -> seen += d to t }
        assertEquals(3 to 3, seen.last()) // 2 photos + writing the file
        assertTrue(seen.zipWithNext().all { (a, b) -> b.first >= a.first })
    }

    @Test fun anUnwritableOutputFolderFailsWithoutCrashing() {
        out.parentFile.mkdirs()
        out.writeText("not a folder")
        val r = PlanRenderer(decoder, counter).render(plan(1, page(1)), items(1), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Failed)
    }

    @Test fun aBorderIsDrawnAsABlackRectangleOfItsWidthAfterThePhoto() {
        val border = StrokeRect(RectD(17.75, 17.75, 198.5, 298.5), 1.5)
        val plan = RenderPlan(a4w, a4h, 1, listOf(page(1)), borders = listOf(listOf(border)))
        val s = (PlanRenderer(decoder, counter).render(plan, items(1), work, out, CancelToken()) as RenderOutcome.Done)
            .pdf.readText(Charsets.ISO_8859_1)
        // PDF y of the rectangle's bottom = 841.8898 - 17.75 - 298.5 = 525.6398; 0 G = black.
        val rect = "q 1.5000 w 0 G 17.7500 525.6398 198.5000 298.5000 re S Q"
        assertTrue(s.contains(rect))
        assertTrue("drawn over the photo", s.indexOf(rect) > s.indexOf(" Do Q"))
    }

    /** A photo that goes in as it is keeps the camera's turn in its bytes: the page draws it turned (owner, 2026-10-23). */
    @Test fun aPhotoInAsItIsIsDrawnWithItsCamerasTurn() {
        val asIs = PlacementDecoder { _, dst, _, _, _ ->
            dst.writeBytes(jpeg)
            DecodeOutcome.Ok(2, 2, turnsCw = 1)
        }
        val s = (PlanRenderer(asIs, counter).render(plan(1, page(1)), items(1), work, out, CancelToken()) as RenderOutcome.Done)
            .pdf.readText(Charsets.ISO_8859_1)
        // One quarter turn clockwise = three anticlockwise; box (17, 17, 200, 300): PDF y of its top = 841.8898 - 17.
        assertTrue(s.contains("0 -300.0000 200.0000 0 17.0000 824.8898 cm"))
    }

    @Test fun drawsSidewaysPhotosTurned() {
        val turned = listOf(RenderPlacement(1, RectD(40.0, 17.0, 515.0, 808.0), 1, 3367))
        val any = PlacementDecoder { item, dst, _, grey, crop -> decoder.decode(item, dst, 1250, grey, crop) }
        val r = PlanRenderer(any, counter).render(plan(1, turned), items(1), work, out, CancelToken()) as RenderOutcome.Done
        // PDF y of the box bottom = 841.8898 - 17 - 808 = 16.8898; right edge = 40 + 515 = 555.
        assertTrue(r.pdf.readText(Charsets.ISO_8859_1).contains("0 808.0000 -515.0000 0 555.0000 16.8898 cm"))
    }

    @Test fun aBlackAndWhitePlanAsksTheEngineForGreyPhotos() {
        PlanRenderer(decoder, counter).render(greyPlan(page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertEquals("Black & white = the B&W style", listOf(Styles.BW, Styles.BW), stylesAsked)
    }

    private fun File.readText(cs: java.nio.charset.Charset) = String(readBytes(), cs)

    @Test fun twoDifferentCropsOfOnePhotoAreTwoImagesAndTheSameCropIsDecodedOnce() {
        val a = Crop(0.0, 0.0, 0.5, 0.5)
        val b = Crop(0.5, 0.5, 0.5, 0.5)
        fun at(c: Crop) = RenderPlacement(1, RectD(17.0, 17.0, 200.0, 300.0), 0, 1250, c)
        val r = PlanRenderer(decoder, counter).render(plan(1, listOf(at(a), at(b)), listOf(at(a))), items(1), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Done)
        assertEquals(listOf(1, 1), decodes)
        assertEquals(setOf(a, b), crops.toSet())
    }

    @Test fun photosThatReachLessThan200DpiAreNamedSoReadyCanSaySo() {
        // Item 2 is a small photo: the engine could only make 600 px of the 1250 px (300 dpi) its box needs.
        val small = PlacementDecoder { item, dst, px, grey, crop ->
            dst.writeBytes(jpeg)
            if (item.index == 2) DecodeOutcome.Ok(600, 450) else DecodeOutcome.Ok(1250, 938)
        }
        val r = PlanRenderer(small, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertEquals(setOf(2), (r as RenderOutcome.Done).lowRes)
        // The same plan again comes from the made file, and still says so.
        val again = PlanRenderer(small, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertEquals(setOf(2), (again as RenderOutcome.Done).lowRes)
    }

    /** Phase 10c: each photo's dpi at its box, so Ready can use PLAN §F6's thresholds (photos 100, documents 120). */
    @Test fun eachPhotosDpiAtItsBoxIsGivenAndKept() {
        val small = PlacementDecoder { item, dst, px, grey, crop ->
            dst.writeBytes(jpeg)
            if (item.index == 2) DecodeOutcome.Ok(375, 281) else DecodeOutcome.Ok(1250, 938)
        }
        val r = PlanRenderer(small, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertEquals(mapOf(1 to 300, 2 to 90), (r as RenderOutcome.Done).dpi)
        val again = PlanRenderer(small, counter).render(plan(1, page(1), page(2)), items(1, 2), work, out, CancelToken())
        assertEquals(mapOf(1 to 300, 2 to 90), (again as RenderOutcome.Done).dpi)
    }

    // ---- Phase 7: documents ----

    private fun pdfItem(i: Int, bytes: ByteArray = "%PDF-1.7 customer file $i".toByteArray()) =
        RenderItem(i, tmp.root.resolve("src-$i.pdf").apply { writeBytes(bytes) }, "pdf$i")

    private fun docPage(item: Int, page: Int, style: Int = Styles.ORIGINAL) =
        listOf(RenderPlacement(item, RectD(17.0, 17.0, 561.0, 808.0), 0, 3367, pdfPage = page, style = style))

    private val pagesAsked = mutableListOf<Triple<Int, Int, PageMode>>()
    private val pageStyles = mutableListOf<Int>()

    /** A white page with a few dark lines (text-like), or noise; as the engine would draw it. */
    private fun pageDecoder(noisy: Boolean = false) = PageDecoder { item, page, dst, px, mode, style ->
        pagesAsked += Triple(item.index, page, mode)
        pageStyles += style
        val w = 300
        val h = 424
        when (mode) {
            PageMode.ONE_BIT_RAW -> {
                dst.writeBytes(ByteArray((w + 7) / 8 * h) { i -> if ((i / ((w + 7) / 8)) % 40 == 0) 0 else 0xFF.toByte() })
                DecodeOutcome.Ok(w, h, PageMode.ONE_BIT_RAW)
            }
            PageMode.GREY_RAW -> {
                val rnd = java.util.Random(page.toLong())
                dst.writeBytes(ByteArray(w * h) { i -> if (noisy) rnd.nextInt(256).toByte() else if ((i / w) % 40 == 0) 0 else 0xFF.toByte() })
                DecodeOutcome.Ok(w, h, PageMode.GREY_RAW)
            }
            else -> {
                dst.writeBytes(jpeg)
                DecodeOutcome.Ok(2, 2)
            }
        }
    }

    @Test fun documentPagesAreDrawnOncePerPageInPlanOrder() {
        val plan = RenderPlan(a4w, a4h, 2, listOf(docPage(1, 2), docPage(1, 0)))
        val r = PlanRenderer(decoder, counter, pageDecoder()).render(plan, mapOf(1 to pdfItem(1)), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Done)
        assertEquals(listOf(Triple(1, 2, PageMode.COLOUR_JPEG), Triple(1, 0, PageMode.COLOUR_JPEG)), pagesAsked)
        assertEquals(4, (r as RenderOutcome.Done).pages)
    }

    @Test fun blackAndWhiteTextPagesAreLosslessGreyAndNoisyPagesFallBackToGreyJpeg() {
        val text = PlanRenderer(decoder, counter, pageDecoder()).render(greyPlan(docPage(1, 0)), mapOf(1 to pdfItem(1)), work, out, CancelToken())
        val pdf = (text as RenderOutcome.Done).pdf.readText(Charsets.ISO_8859_1)
        assertTrue("lossless grey", pdf.contains("/DeviceGray") && pdf.contains("/Predictor 15"))
        assertFalse(pdf.contains("/DCTDecode"))
        out.deleteRecursively()
        pagesAsked.clear()
        // Pure noise does not compress: over the 1.5 MB budget at full size; here the budget is scaled to the test page.
        val noisy = PlanRenderer(decoder, counter, pageDecoder(noisy = true), greyBudgetBytes = 50_000)
            .render(greyPlan(docPage(1, 0)), mapOf(1 to pdfItem(1)), work, out, CancelToken())
        assertEquals(listOf(PageMode.GREY_RAW, PageMode.GREY_JPEG), pagesAsked.map { it.third })
        assertTrue((noisy as RenderOutcome.Done).pdf.readText(Charsets.ISO_8859_1).contains("/DCTDecode"))
    }

    @Test fun theUntouchedPathIsTheCustomersOwnBytes() {
        val source = "%PDF-1.7 the customer's own file, never redrawn".toByteArray()
        val plan = RenderPlan(a4w, a4h, 1, listOf(docPage(1, 0), docPage(1, 1)), exactItem = 1)
        val twoPages = PageCounter { 2 }
        val r = PlanRenderer(decoder, twoPages, pageDecoder()).render(plan, mapOf(1 to pdfItem(1, source)), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Done)
        assertTrue("byte-identical", source.contentEquals((r as RenderOutcome.Done).pdf.readBytes()))
        assertTrue("nothing redrawn", pagesAsked.isEmpty())
    }

    /** Review C1: a locked PDF (opened with its password, or the app's unlocked copy) is drawn, never copied. */
    @Test fun aPdfOpenedWithAPasswordIsNeverPrintedAsItIs() {
        val source = "%PDF-1.7 encrypted, opens only with a password".toByteArray()
        val plan = RenderPlan(a4w, a4h, 1, listOf(docPage(1, 0), docPage(1, 1)), exactItem = 1)
        val item = pdfItem(1, source).copy(locked = true)
        val r = PlanRenderer(decoder, PageCounter { 2 }, pageDecoder()).render(plan, mapOf(1 to item), work, out, CancelToken())
        assertTrue("rendered: $r", r is RenderOutcome.Done)
        assertEquals("both pages drawn", listOf(0, 1), pagesAsked.map { it.second })
        assertFalse("not the encrypted bytes", source.contentEquals((r as RenderOutcome.Done).pdf.readBytes()))
    }

    @Test fun anUntouchedFileWithAnotherPageCountIsRefused() {
        val plan = RenderPlan(a4w, a4h, 1, listOf(docPage(1, 0), docPage(1, 1)), exactItem = 1)
        val r = PlanRenderer(decoder, PageCounter { 5 }, pageDecoder()).render(plan, mapOf(1 to pdfItem(1)), work, out, CancelToken())
        assertEquals(RenderOutcome.Failed("check"), r)
        assertFalse(out.resolve("print.pdf").exists())
    }

    // ---- Phase 8: print styles ----

    private fun styled(style: Int, vararg idx: Int) = idx.map { RenderPlacement(it, RectD(17.0, 17.0, 200.0, 300.0), 0, 1250, style = style) }

    @Test fun photosAreDecodedInTheJobsStyle() {
        val r = PlanRenderer(decoder, counter).render(plan(1, styled(Styles.VIBRANT, 1, 2)), items(1, 2), work, out, CancelToken())
        assertTrue(r is RenderOutcome.Done)
        assertEquals(listOf(Styles.VIBRANT, Styles.VIBRANT), stylesAsked)
    }

    @Test fun ocvBlackPhotosAreOneBitImages() {
        val r = PlanRenderer(decoder, counter).render(greyPlan(styled(Styles.OCV, 1)), items(1), work, out, CancelToken())
        val s = (r as RenderOutcome.Done).pdf.readText(Charsets.ISO_8859_1)
        assertEquals(listOf(Styles.OCV), stylesAsked)
        assertTrue(s.contains("/BitsPerComponent 1"))
        assertFalse(s.contains("/DCTDecode"))
    }

    @Test fun documentPagesAreDrawnInTheJobsStyle() {
        var n = 0
        fun render(plan: RenderPlan): String {
            pagesAsked.clear()
            pageStyles.clear()
            // Each plan has its own out folder (a finished one is reused as it is).
            val r = PlanRenderer(decoder, counter, pageDecoder()).render(plan, mapOf(1 to pdfItem(1)), work, out.resolve("${n++}"), CancelToken())
            return (r as RenderOutcome.Done).pdf.readText(Charsets.ISO_8859_1)
        }
        val vibrant = render(RenderPlan(a4w, a4h, 1, listOf(docPage(1, 0, Styles.VIBRANT))))
        assertEquals(listOf(PageMode.COLOUR_JPEG) to listOf(Styles.VIBRANT), pagesAsked.map { it.third } to pageStyles)
        assertTrue(vibrant.contains("/DCTDecode"))
        val sharp = render(greyPlan(docPage(1, 0, Styles.SHARP)))
        assertEquals(listOf(PageMode.GREY_RAW) to listOf(Styles.SHARP), pagesAsked.map { it.third } to pageStyles)
        assertTrue("lossless grey", sharp.contains("/Predictor 15"))
        val ocv = render(greyPlan(docPage(1, 0, Styles.OCV)))
        assertEquals(listOf(PageMode.ONE_BIT_RAW) to listOf(Styles.OCV), pagesAsked.map { it.third } to pageStyles)
        assertTrue(ocv.contains("/BitsPerComponent 1"))
        val plain = render(greyPlan(docPage(1, 0)))
        assertEquals("Black & white = the B&W style", listOf(Styles.BW), pageStyles)
        assertTrue(plain.contains("/Predictor 15"))
    }

    /** Phase 14: a card placement is straightened by the engine at its box's size at 300 dpi, and "may print blurry" follows the card's own pixels. */
    @Test fun aCardIsStraightenedAtItsBoxSizeAndASmallCardIsMarkedBlurry() {
        val quad = listOf(0.1, 0.1, 0.6, 0.12, 0.58, 0.45, 0.12, 0.43)
        val asked = mutableListOf<IntArray>()
        val cards = CardDecoder { item, dst, w, h, _, q, page ->
            assertEquals(quad, q)
            assertEquals(null, page)
            asked += intArrayOf(item.index, w, h)
            dst.writeBytes(jpeg)
            DecodeOutcome.Ok(w, h, sourcePx = if (item.index == 1) w else w / 2)
        }
        // 85.6 × 54 mm boxes (242.65 × 153.07 pt).
        fun at(i: Int) = RenderPlacement(i, RectD(56.0, 56.0, 242.6457, 153.0709), 0, 1012, quad = quad)
        val r = PlanRenderer(decoder, counter, cards = cards).render(plan(1, listOf(at(1), at(2))), items(1, 2), work, out, CancelToken())
        r as RenderOutcome.Done
        assertEquals(listOf(listOf(1, 1012, 638), listOf(2, 1012, 638)), asked.map { it.toList() })
        assertTrue("no plain decode for a card", decodes.isEmpty())
        assertEquals(setOf(2), r.lowRes)
        assertEquals(300, r.dpi[1])
        assertEquals(150, r.dpi[2])
    }
}
