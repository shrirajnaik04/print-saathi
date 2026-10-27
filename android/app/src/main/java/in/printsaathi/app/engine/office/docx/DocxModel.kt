package `in`.printsaathi.app.engine.office.docx

/**
 * Phase 45: a customer's Word file as the engine draws it (all lengths in points). Read by [DocxReader] inside the
 * isolated engine, drawn by DocxPdf. Only what the spec draws is kept; [DocxDoc.missed] says some parts (charts,
 * diagrams, shapes, pictures it cannot draw) print only from WPS Office; [DocxDoc.legacyFont]: text in an old Hindi
 * font (Kruti Dev …) that would print as Latin letters, so the file is not made into pages.
 */
data class DocxDoc(val sections: List<DSection>, val media: Map<String, ByteArray>, val missed: Boolean, val legacyFont: Boolean = false)

data class Insets4(val top: Float, val right: Float, val bottom: Float, val left: Float)

/**
 * A section: its page, margins, the default header and footer (drawn [headerFrom] below the top and [footerFrom]
 * above the bottom of the page) and its blocks. [newPage] false: a continuous section, carried on on the same page.
 */
data class DSection(
    val pageW: Float,
    val pageH: Float,
    val margins: Insets4,
    val header: List<DBlock>,
    val footer: List<DBlock>,
    val blocks: List<DBlock>,
    val headerFrom: Float = 36f,
    val footerFrom: Float = 36f,
    val newPage: Boolean = true,
    /** "Different first page": the first page's own header and footer (null: as the others). */
    val firstHeader: List<DBlock>? = null,
    val firstFooter: List<DBlock>? = null,
)

enum class Align { LEFT, CENTER, RIGHT, JUSTIFY }
enum class Family { SERIF, SANS, MONO }
enum class SuperSub { NONE, SUPER, SUB }
enum class VMerge { NONE, RESTART, CONTINUE }
enum class FieldKind { PAGE }

data class Borders(val top: Boolean, val left: Boolean, val bottom: Boolean, val right: Boolean) {
    companion object {
        val NONE = Borders(false, false, false, false)
    }
}

sealed interface DBlock

/**
 * A paragraph. [lineMul]: line height as a multiple of single spacing; [indentFirst] is added to [indentLeft] on the
 * first line (negative: a hanging indent, where a list's [label] sits); [markSizePt]: the size of an empty line.
 */
data class DPara(
    val align: Align = Align.LEFT,
    val spaceBefore: Float = 0f,
    val spaceAfter: Float = 0f,
    val lineMul: Float = 1f,
    val indentLeft: Float = 0f,
    val indentFirst: Float = 0f,
    val label: String? = null,
    val runs: List<DRun> = emptyList(),
    val pageBreakBefore: Boolean = false,
    val indentRight: Float = 0f,
    val markSizePt: Float = 10f,
) : DBlock

data class DTable(val colWidths: List<Float>, val rows: List<DRow>) : DBlock
data class DRow(val cells: List<DCell>, val minHeight: Float = 0f)
data class DCell(val span: Int, val vMerge: VMerge, val fill: Int?, val borders: Borders, val blocks: List<DBlock>)

/** A page break between paragraphs. */
data object DBreak : DBlock

sealed interface DRun

data class DText(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false,
    val strike: Boolean = false,
    val sizePt: Float = 10f,
    val color: Int = 0xFF000000.toInt(),
    val highlight: Int? = null,
    val family: Family = Family.SANS,
    val superSub: SuperSub = SuperSub.NONE,
) : DRun

/** A picture: [mediaKey] is its part name in the file (its bytes are in [DocxDoc.media]). */
data class DImage(val mediaKey: String, val wPt: Float, val hPt: Float) : DRun

/** A light grey box marked [label] ("Chart", "Diagram", "Picture") where something not drawn was. */
data class DPlaceholder(val label: String, val wPt: Float, val hPt: Float) : DRun

/** A field drawn on each page (the page number). */
data class DField(val kind: FieldKind) : DRun
