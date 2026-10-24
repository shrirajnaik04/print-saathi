package `in`.printsaathi.app.engine

import android.os.Build
import androidx.annotation.ChecksSdkIntAtLeast

/**
 * Recents privacy (PLAN §D6). Android 13+ (API 33) can hide only the Recents thumbnail, so normal screenshots keep
 * working. Older phones need FLAG_SECURE, and only while a screen shows customer content, unless the owner turned
 * on "Allow screenshots for 15 minutes" for support.
 */
fun recentsScreenshotDisabled(sdkInt: Int): Boolean = sdkInt >= 33

/** This phone's answer to [recentsScreenshotDisabled]; annotated so lint knows the API 33 call behind it is safe. */
@ChecksSdkIntAtLeast(api = 33)
fun canHideRecentsThumbnail(): Boolean = recentsScreenshotDisabled(Build.VERSION.SDK_INT)

fun secureFlagNeeded(sdkInt: Int, customerContentShown: Boolean, screenshotsAllowedUntilMs: Long, nowMs: Long): Boolean =
    sdkInt < 33 && customerContentShown && !screenshotsAllowed(screenshotsAllowedUntilMs, nowMs)

/** The owner's 15 minutes; a time further away than that (a clock set back, an odd file) counts as over. */
fun screenshotsAllowed(untilMs: Long, nowMs: Long): Boolean = nowMs < untilMs && untilMs - nowMs <= SCREENSHOT_WINDOW_MS

const val SCREENSHOT_WINDOW_MS = 15 * 60_000L
