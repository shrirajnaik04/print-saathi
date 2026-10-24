package `in`.printsaathi.app.engine.print

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TestPageLayoutTest {
    @Test fun fourBySixHoldsSixPassportSlotsAtFourMillimetreEdges() {
        val slots = passportSlots(101.6, 152.4, edgeMm = 4.0, gapMm = 2.0, topReservedMm = 0.0)
        assertEquals(6, slots.size)
    }

    @Test fun slotsStayInsideTheEdgesAndNeverOverlap() {
        val w = 101.6
        val h = 152.4
        val slots = passportSlots(w, h, edgeMm = 4.0, gapMm = 2.0, topReservedMm = 0.0)
        for (s in slots) {
            assertTrue(s.xMm >= 4.0 - 1e-9 && s.yMm >= 4.0 - 1e-9)
            assertTrue(s.xMm + s.wMm <= w - 4.0 + 1e-9 && s.yMm + s.hMm <= h - 4.0 + 1e-9)
            assertEquals(35.0, s.wMm, 0.0)
            assertEquals(45.0, s.hMm, 0.0)
        }
        for (i in slots.indices) for (j in i + 1 until slots.size) {
            val a = slots[i]
            val b = slots[j]
            val apart = a.xMm + a.wMm + 2.0 <= b.xMm + 1e-9 || b.xMm + b.wMm + 2.0 <= a.xMm + 1e-9 ||
                a.yMm + a.hMm + 2.0 <= b.yMm + 1e-9 || b.yMm + b.hMm + 2.0 <= a.yMm + 1e-9
            assertTrue("slots $i and $j closer than the gap", apart)
        }
    }

    @Test fun slotsFillInReadingOrder() {
        val slots = passportSlots(101.6, 152.4, edgeMm = 4.0, gapMm = 2.0, topReservedMm = 0.0)
        assertTrue(slots[0].xMm < slots[1].xMm && slots[0].yMm == slots[1].yMm)
        assertTrue(slots[2].yMm > slots[1].yMm)
    }

    @Test fun a4BelowTheRulerAreaHoldsTwentySlots() {
        assertEquals(20, passportSlots(210.0, 297.0, edgeMm = 4.0, gapMm = 2.0, topReservedMm = 78.0).size)
    }

    @Test fun paperMessagesNeverRepeatAWordAndNameThePaper() {
        for (label in listOf("4x6", "A4")) {
            for (text in listOf(PaperMessages.warning(label), PaperMessages.fail(label))) {
                val words = text.lowercase().split(Regex("""[\s.,]+""")).filter { it.isNotEmpty() }
                assertFalse("repeated word in: $text", words.zipWithNext().any { (a, b) -> a == b })
                assertTrue(text.contains(label))
            }
        }
    }

    @Test fun failMessageSaysNothingPrintedAndPointsAtRetry() {
        val text = PaperMessages.fail("4x6")
        assertTrue(text.startsWith("Nothing was printed"))
        assertTrue(text.contains("Retry"))
    }
}
