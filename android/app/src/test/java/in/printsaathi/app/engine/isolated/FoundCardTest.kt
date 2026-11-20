package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Round 12 (owner: voter ID and driving licence cards stand): the engine's face code says how the card is turned. */
class FoundCardTest {
    private fun reply(face: Int) = intArrayOf(1, 1000, 1000, 9000, 1000, 9000, 9000, 1000, 9000, 900, face)

    @Test fun aFaceThatReadsUprightNeedsNoTurn() {
        val c = FoundCard.parse(reply(1)).single()
        assertTrue(c.face)
        assertFalse(c.upsideDown)
        assertEquals(0, c.turns)
    }

    @Test fun aFaceThatReadsOnlyTurnedOverIsUpsideDown() {
        val c = FoundCard.parse(reply(2)).single()
        assertTrue(c.upsideDown)
        assertEquals(2, c.turns)
    }

    @Test fun aFaceThatReadsWithAQuarterTurnMakesTheCardStand() {
        assertEquals(1, FoundCard.parse(reply(3)).single().turns)
        assertEquals(3, FoundCard.parse(reply(4)).single().turns)
        assertTrue(FoundCard.parse(reply(3)).single().face)
        assertFalse(FoundCard.parse(reply(3)).single().upsideDown)
    }

    @Test fun noFaceIsNoTurn() {
        val c = FoundCard.parse(reply(0)).single()
        assertFalse(c.face)
        assertEquals(0, c.turns)
    }
}
