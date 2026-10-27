package `in`.printsaathi.app.engine.office.pptx

import `in`.printsaathi.app.engine.office.docx.DPara
import `in`.printsaathi.app.engine.office.docx.Insets4

/**
 * Phase 46: a customer's PowerPoint file as the engine draws it, in points on the slide ([slideW] × [slideH]). Text
 * is kept as Word-style paragraphs ([DPara]), so slides use the same tested text layout as Word pages. [missed]: some
 * parts (charts, diagrams, shapes it cannot draw) print only from WPS Office.
 */
data class PptxDeck(
    val slideW: Float,
    val slideH: Float,
    val slides: List<PSlide>,
    val media: Map<String, ByteArray>,
    val missed: Boolean,
    /** Text in an old Hindi font (Kruti Dev …) that would print as Latin letters: not made into pages. */
    val legacyFont: Boolean = false,
)

/** A slide: its background colour ([bg], null: white) or picture ([bgImage]), and its shapes, back to front. */
data class PSlide(val bg: Int?, val shapes: List<PShape>, val bgImage: String? = null)

enum class Anchor { TOP, MIDDLE, BOTTOM }
enum class Geom { RECT, ROUND_RECT, ELLIPSE, OTHER }

/** Every shape has a place on the slide and a turn ([rot], degrees clockwise about its middle). */
sealed interface PShape {
    val x: Float
    val y: Float
    val w: Float
    val h: Float
    val rot: Float
}

/** A shape with a fill, an outline and text inside [insets], placed by [anchor]; [fontScale]: autofit's shrink. */
data class PText(
    override val x: Float,
    override val y: Float,
    override val w: Float,
    override val h: Float,
    override val rot: Float,
    val fill: Int?,
    val line: Int?,
    val lineW: Float,
    val geom: Geom,
    val insets: Insets4,
    val anchor: Anchor,
    val fontScale: Float,
    val paras: List<DPara>,
) : PShape

/** A picture; [crop]: fractions cut from each side of the picture (0: none). */
data class PPicture(
    override val x: Float,
    override val y: Float,
    override val w: Float,
    override val h: Float,
    override val rot: Float,
    val mediaKey: String,
    val crop: Insets4 = Insets4(0f, 0f, 0f, 0f),
) : PShape

/** A straight line across its box, from top-left to bottom-right unless flipped. */
data class PLine(
    override val x: Float,
    override val y: Float,
    override val w: Float,
    override val h: Float,
    override val rot: Float,
    val color: Int,
    val widthPt: Float,
    val flipH: Boolean = false,
    val flipV: Boolean = false,
) : PShape

/** A table cell; [hMerge] / [vMerge]: covered by the cell to its left / above; [rowSpan]: rows it covers. */
data class PCell(
    val paras: List<DPara>,
    val fill: Int?,
    val span: Int = 1,
    val hMerge: Boolean = false,
    val vMerge: Boolean = false,
    val rowSpan: Int = 1,
)

/** Where a table cell is drawn: from [row] to [lastRow], columns [col0] up to (not including) [col1]. */
data class PBox(val row: Int, val col0: Int, val col1: Int, val lastRow: Int, val cell: PCell)

data class PTable(
    override val x: Float,
    override val y: Float,
    override val w: Float,
    override val h: Float,
    override val rot: Float,
    val colWidths: List<Float>,
    val rowHeights: List<Float>,
    val rows: List<List<PCell>>,
) : PShape {
    /**
     * Where each cell is drawn. PowerPoint keeps one cell per grid column, the ones a wider cell covers marked hMerge
     * (and the ones a taller cell covers vMerge); a row with fewer cells than columns counts each cell's gridSpan.
     */
    fun boxes(): List<PBox> {
        val ncol = maxOf(colWidths.size, rows.maxOfOrNull { it.size } ?: 0)
        val out = ArrayList<PBox>()
        rows.forEachIndexed { r, row ->
            val perColumn = row.size >= ncol
            var col = 0
            for (cell in row) {
                val c0 = col
                col += if (perColumn || cell.hMerge) 1 else cell.span
                if (cell.hMerge || cell.vMerge || c0 >= ncol) continue
                out += PBox(r, c0, (c0 + cell.span).coerceAtMost(ncol), (r + cell.rowSpan - 1).coerceAtMost(rows.size - 1), cell)
            }
        }
        return out
    }
}

/** A light grey box marked [label] ("Chart", "Diagram", "Picture") where something not drawn was. */
data class PPlaceholderBox(
    override val x: Float,
    override val y: Float,
    override val w: Float,
    override val h: Float,
    override val rot: Float,
    val label: String,
) : PShape
