package `in`.printsaathi.app.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebViewGateTest {
    @Test fun parsesTheMajorVersion() {
        assertEquals(53, webViewMajor("53.0.2785.124"))
        assertEquals(151, webViewMajor("151.0.7922.199"))
        assertEquals(null, webViewMajor("unknown"))
        assertEquals(null, webViewMajor(null))
    }

    @Test fun blocksEnginesOlderThanTheSupportedMinimum() {
        assertTrue(webViewTooOld("53.0.2785.124"))
        assertTrue(webViewTooOld("91.0.4472.120"))
        assertFalse(webViewTooOld("92.0.4515.131"))
        assertFalse(webViewTooOld("151.0.7922.199"))
    }

    @Test fun unknownVersionIsNotBlocked() {
        // If the version cannot be read, let the app try rather than lock the owner out.
        assertFalse(webViewTooOld(null))
    }
}
