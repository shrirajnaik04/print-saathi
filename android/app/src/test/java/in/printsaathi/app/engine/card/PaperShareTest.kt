package `in`.printsaathi.app.engine.card

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Round 12: a photo is a paper document only when what is inside the page's corners looks like paper. */
class PaperShareTest {
    private val w = 200
    private val h = 280
    private val whole = doubleArrayOf(0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0)

    /** A letter: pale paper with lines of dark print on it. */
    private fun letter(): ByteArray = ByteArray(w * h) { i ->
        val y = i / w
        val x = i % w
        (if (y % 14 in 4..6 && x in 20..180) 40 else 225).toByte()
    }

    /** A photograph: every grey level, smoothly, with a little detail. */
    private fun photo(): ByteArray = ByteArray(w * h) { i ->
        val y = i / w
        val x = i % w
        (((x * 255 / w + y * 255 / h) / 2 + (x * 7 + y * 13) % 24).coerceIn(0, 255)).toByte()
    }

    @Test fun aLetterIsMostlyPaper() {
        assertTrue(PageDetect.paperShare(letter(), w, h, whole) > 0.8)
    }

    @Test fun aPhotographIsNot() {
        assertTrue(PageDetect.paperShare(photo(), w, h, whole) < 0.45)
    }

    @Test fun onlyWhatIsInsideTheCornersCounts() {
        // A letter in the middle of a dark table: the corners hold paper, the whole photo does not.
        val img = ByteArray(w * h) { i ->
            val x = i % w
            val y = i / w
            (if (x in 50..150 && y in 70..210) (if (y % 10 in 3..4) 50 else 220) else 60).toByte()
        }
        val inside = doubleArrayOf(0.26, 0.26, 0.74, 0.26, 0.74, 0.74, 0.26, 0.74)
        assertTrue(PageDetect.paperShare(img, w, h, inside) > 0.7)
        assertTrue(PageDetect.paperShare(img, w, h, whole) < 0.5)
    }

    @Test fun badInputIsNoPaper() {
        assertEquals(0.0, PageDetect.paperShare(ByteArray(3), w, h, whole), 0.0)
        assertEquals(0.0, PageDetect.paperShare(letter(), w, h, doubleArrayOf(0.0)), 0.0)
    }
}
