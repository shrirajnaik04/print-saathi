package `in`.printsaathi.app.engine.office

import android.os.ParcelFileDescriptor
import `in`.printsaathi.app.engine.isolated.BadRequest
import `in`.printsaathi.app.engine.isolated.TextPdf
import `in`.printsaathi.app.engine.office.docx.DocxPdf
import `in`.printsaathi.app.engine.office.docx.DocxReader
import `in`.printsaathi.app.engine.office.pptx.PptxPdf
import `in`.printsaathi.app.engine.office.pptx.PptxReader
import `in`.printsaathi.app.engine.office.xlsx.XlsxPdf
import `in`.printsaathi.app.engine.office.xlsx.XlsxReader
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.InputStream

/**
 * Runs INSIDE the isolated engine (round 9): a customer's Office file as pages. Reply {kind, format, pages, missed}
 * (missed 1: some parts, such as charts, were not drawn) or {kind, format, -code}: [NOT_SUPPORTED] (the kind or format
 * is not made into pages: Print with WPS Office), [REFUSED] (a limit or a damaged file), [TOO_MANY_PAGES].
 */
object OfficePdf {
    const val NOT_SUPPORTED = 7
    const val REFUSED = 8
    const val TOO_MANY_PAGES = 9

    /** The descriptor's stream from its start each time; closing it leaves the descriptor open. */
    private class KeepOpen(private val f: FileInputStream) : FilterInputStream(f) {
        override fun close() = Unit
    }

    fun write(src: ParcelFileDescriptor, dst: ParcelFileDescriptor, maxPages: Int): IntArray {
        val fis = FileInputStream(src.fileDescriptor)
        val open: () -> InputStream = {
            fis.channel.position(0)
            KeepOpen(fis)
        }
        val (kind, format) = OfficeKind.detect(open)
        val no = intArrayOf(kind.code, format.code, -NOT_SUPPORTED)
        if (format != OfficeFormat.OOXML || kind == OfficeKind.OFFICE || dst.statSize < 0 || maxPages < 1) return no
        return try {
            when (kind) {
                // Phase 45: Word files.
                OfficeKind.WORD -> {
                    val parts = open().use { SafeZip.read(it, { n -> n.startsWith("word/") || n.startsWith("_rels/") }) }.parts
                    val doc = DocxReader.read(parts)
                    // Old Hindi fonts would print as Latin letters: the file prints from WPS Office instead.
                    if (doc.legacyFont) return no
                    val drawn = FileOutputStream(dst.fileDescriptor).use { DocxPdf.draw(doc, it, maxPages) }
                    intArrayOf(kind.code, format.code, drawn.pages, if (doc.missed || drawn.missed) 1 else 0)
                }
                // Phase 46: PowerPoint files, one slide per A4 sideways page.
                OfficeKind.POWERPOINT -> {
                    val parts = open().use { SafeZip.read(it, { n -> n.startsWith("ppt/") || n.startsWith("_rels/") }) }.parts
                    val deck = PptxReader.read(parts)
                    if (deck.legacyFont) return no
                    val drawn = FileOutputStream(dst.fileDescriptor).use { PptxPdf.draw(deck, it, maxPages) }
                    intArrayOf(kind.code, format.code, drawn.pages, if (deck.missed || drawn.missed) 1 else 0)
                }
                // Phase 47: Excel files, each visible sheet as table pages.
                OfficeKind.EXCEL -> {
                    val parts = open().use { SafeZip.read(it, { n -> n.startsWith("xl/") || n.startsWith("_rels/") }) }.parts
                    val book = XlsxReader.read(parts)
                    val drawn = FileOutputStream(dst.fileDescriptor).use { XlsxPdf.draw(book, it, maxPages) }
                    intArrayOf(kind.code, format.code, drawn.pages, if (book.missed || drawn.missed) 1 else 0)
                }
                else -> no
            }
        } catch (e: OfficeRefused) {
            intArrayOf(kind.code, format.code, -REFUSED)
        } catch (e: DocxPdf.TooManyPages) {
            intArrayOf(kind.code, format.code, -TOO_MANY_PAGES)
        } catch (e: Exception) {
            // Anything else a strange file causes: it stays an Office file of its kind (review I3).
            intArrayOf(kind.code, format.code, -REFUSED)
        }
    }

    /**
     * Round 9: a customer's .txt file ([src]) as a text message: its text, decoded strictly ([TextFile]), written as
     * UTF-8 to [txt] (for Edit text) and as A4 pages to [dst]. {pages}; a file that is not readable text is a bad request.
     */
    fun textFile(src: ParcelFileDescriptor, txt: ParcelFileDescriptor, dst: ParcelFileDescriptor, sizeTenthsPt: Int): IntArray {
        if (sizeTenthsPt !in TextPdf.SIZES_TENTHS) throw BadRequest("text size")
        val bytes = FileInputStream(src.fileDescriptor).use { it.readUpTo(TextFile.MAX_BYTES + 1) }
        val text = TextFile.decode(bytes) ?: throw BadRequest("not readable text")
        FileOutputStream(txt.fileDescriptor).use { it.write(text.toByteArray(Charsets.UTF_8)) }
        val pages = FileOutputStream(dst.fileDescriptor).use { TextPdf.render(text, sizeTenthsPt / 10f, it) }
        return intArrayOf(pages)
    }
}
