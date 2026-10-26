package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Review I4 (round 8): one camera at a time. A second "take a photo" while the camera is open (a double tap) is
 * refused instead of replacing the first one's waiting photo; once the camera has answered, the next is allowed. A
 * camera whose answer never came (the app's screen was rebuilt) does not block the next one for ever.
 */
class CameraGateTest {
    @Test fun aSecondRequestWhileTheCameraIsOpenIsRefused() {
        val gate = CameraGate()
        assertTrue(gate.open(1_000L))
        assertFalse(gate.open(1_200L))
        gate.close()
        assertTrue(gate.open(1_400L))
    }

    @Test fun aCameraThatNeverAnsweredStopsBlockingAfterAWhile() {
        val gate = CameraGate()
        assertTrue(gate.open(0L))
        assertFalse(gate.open(CameraGate.LONGEST_MS - 1))
        assertTrue(gate.open(CameraGate.LONGEST_MS + 1))
    }
}
