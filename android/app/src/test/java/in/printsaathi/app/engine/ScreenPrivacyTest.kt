package `in`.printsaathi.app.engine

import org.junit.Assert.assertEquals
import org.junit.Test

/** PLAN §D6 Recents privacy. */
class ScreenPrivacyTest {
    @Test fun android13AndNewerHideRecentsWithoutBlockingScreenshots() {
        assertEquals(false, secureFlagNeeded(sdkInt = 33, customerContentShown = true, screenshotsAllowedUntilMs = 0, nowMs = 0))
        assertEquals(true, recentsScreenshotDisabled(sdkInt = 33))
        assertEquals(false, recentsScreenshotDisabled(sdkInt = 32))
    }

    @Test fun android12AndOlderBlockScreenshotsOnlyWhileCustomerContentIsShown() {
        assertEquals(true, secureFlagNeeded(32, customerContentShown = true, screenshotsAllowedUntilMs = 0, nowMs = 0))
        assertEquals(false, secureFlagNeeded(32, customerContentShown = false, screenshotsAllowedUntilMs = 0, nowMs = 0))
        assertEquals(true, secureFlagNeeded(24, customerContentShown = true, screenshotsAllowedUntilMs = 0, nowMs = 0))
    }

    /** Settings → "Allow screenshots for 15 minutes" (support) lifts the block until it expires. */
    @Test fun theTimedSupportSwitchLiftsTheBlockUntilItExpires() {
        val until = 15 * 60_000L
        assertEquals(false, secureFlagNeeded(30, customerContentShown = true, screenshotsAllowedUntilMs = until, nowMs = 60_000))
        assertEquals(true, secureFlagNeeded(30, customerContentShown = true, screenshotsAllowedUntilMs = until, nowMs = until + 1))
    }

    /** A clock set back (or an odd saved time) must never stretch the window past 15 minutes (Phase 10b review M1). */
    @Test fun aWindowFurtherAwayThanFifteenMinutesCountsAsOver() {
        val now = 1_000_000L
        assertEquals(true, secureFlagNeeded(30, customerContentShown = true, screenshotsAllowedUntilMs = now + 16 * 60_000L, nowMs = now))
        assertEquals(false, secureFlagNeeded(30, customerContentShown = true, screenshotsAllowedUntilMs = now + 14 * 60_000L, nowMs = now))
    }
}
