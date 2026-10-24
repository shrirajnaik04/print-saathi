package `in`.printsaathi.app

import android.accessibilityservice.AccessibilityService
import android.app.UiAutomation
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import `in`.printsaathi.app.engine.webViewTooOld
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Phase 11 (PLAN §U Accessibility: "TalkBack completes J1 and J5"): a share is taken to Android's print screen using
 * only what a screen reader uses. Each step finds the control by its spoken name in the accessibility tree, brings it
 * on screen, puts accessibility focus on it and clicks it through the accessibility API — the calls TalkBack makes
 * for "swipe to it, double tap". Gesture recognition by TalkBack itself is not exercised (emulator input injection
 * bypasses it); that stays a real-phone check.
 */
@RunWith(AndroidJUnit4::class)
class AccessibilityJourneyDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val ctx = instrumentation.targetContext
    // TalkBack stays running alongside the test (by default a test's accessibility connection suppresses others).
    private val ui: UiAutomation = instrumentation.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)

    private fun assumeAppAndSender() {
        assumeTrue("the web app runs (WebView new enough)", !webViewTooOld(WebViewCompat.getCurrentWebViewPackage(ctx)?.versionName))
        // Asked through the shell: Android 11+ hides other apps from this one (package visibility).
        val sender = ui.executeShellCommand("pm path $SENDER").let { pfd ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().readText()
        }
        assumeTrue("the test sender is installed", sender.contains("package:"))
        val talkback = ui.executeShellCommand("pm path com.google.android.marvin.talkback").let { pfd ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().readText()
        }
        assumeTrue("TalkBack is on this image", talkback.contains("package:"))
        // The phone's own accessibility settings, put back exactly after the test (review I2).
        before = read("settings get secure enabled_accessibility_services").trim() to
            read("settings get secure accessibility_enabled").trim()
        // With TalkBack on, the WebView serves a screen reader fully (without one it ignores accessibility clicks).
        shell("settings put secure enabled_accessibility_services $TALKBACK")
        shell("settings put secure accessibility_enabled 1")
        waitFor("TalkBack to start") { ui.serviceInfo != null && isTalkBackOn() }
        SystemClock.sleep(3000)
    }

    private fun isTalkBackOn(): Boolean {
        val am = ctx.getSystemService(android.view.accessibility.AccessibilityManager::class.java)
        return am.isTouchExplorationEnabled
    }

    private fun shell(cmd: String) = ui.executeShellCommand(cmd).close()

    private fun read(cmd: String) =
        android.os.ParcelFileDescriptor.AutoCloseInputStream(ui.executeShellCommand(cmd)).bufferedReader().readText()

    /** The accessibility settings before this test changed them; null = the test changed nothing. */
    private var before: Pair<String, String>? = null

    /** What a screen reader finds on this screen, in its reading order: for the evidence (logged, never asserted). */
    private fun logScreen(step: String) {
        val app = ui.rootInActiveWindow?.packageName
        val heard = nodes().filter { it.packageName == app }.map(::name).filter { it.isNotBlank() }
        android.util.Log.i("A11yJourney", "$step | ${heard.joinToString(" / ")}")
    }

    private fun nodes(): List<AccessibilityNodeInfo> {
        val out = mutableListOf<AccessibilityNodeInfo>()
        fun walk(n: AccessibilityNodeInfo?) {
            if (n == null) return
            out += n
            for (i in 0 until n.childCount) walk(n.getChild(i))
        }
        ui.windows.forEach { walk(it.root) }
        if (out.isEmpty()) walk(ui.rootInActiveWindow)
        return out
    }

    private fun name(n: AccessibilityNodeInfo) = (n.text ?: n.contentDescription ?: "").toString()

    private fun screenText() = nodes().filter { it.packageName == PKG }.map(::name).filter { it.isNotBlank() }

    private fun find(label: String): AccessibilityNodeInfo? =
        nodes().firstOrNull {
            it.packageName == PKG && name(it).startsWith(label) && it.actionList.contains(AccessibilityAction.ACTION_CLICK)
        }

    private fun waitFor(what: String, ms: Long = 30_000, test: () -> Boolean) {
        val end = SystemClock.elapsedRealtime() + ms
        while (SystemClock.elapsedRealtime() < end) {
            if (runCatching(test).getOrDefault(false)) return
            SystemClock.sleep(500)
        }
        val seen = runCatching {
            nodes().map { "${name(it)}${if (it.actionList.contains(AccessibilityAction.ACTION_CLICK)) "[click]" else ""}" }
                .filter { it.isNotBlank() }.take(60)
        }.getOrDefault(emptyList())
        fail("timed out waiting for $what; a screen reader sees: $seen; window ${ui.rootInActiveWindow?.packageName}")
    }

    private val steps = mutableListOf<String>()

    /** "Swipe to it, double tap": on screen, accessibility focus, click — and the control has a spoken name. */
    private fun activate(label: String) {
        waitFor("\"$label\"") { find(label)?.isEnabled == true }
        val node = find(label)!!
        logScreen("before \"$label\"")
        node.performAction(AccessibilityAction.ACTION_SHOW_ON_SCREEN.id)
        SystemClock.sleep(400)
        val focused = (find(label) ?: node).performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
        assertTrue("\"$label\" takes screen-reader focus", focused)
        assertTrue("\"$label\" can be pressed by a screen reader", (find(label) ?: node).performAction(AccessibilityNodeInfo.ACTION_CLICK))
        steps += label
        SystemClock.sleep(800)
    }

    private fun share(mode: String) {
        // What PrintSaathi showed before: the share must change it (the previous journey's screen is not the answer).
        val before = screenText()
        shell("am start -n $SENDER/.SendActivity --es mode $mode --es tag a11y${SystemClock.elapsedRealtime()}")
        // An earlier job still on screen turns the share into a question: a screen-reader user answers it the same way.
        waitFor("the share to open") {
            val now = screenText()
            now != before && now.any { it == "Files received" || it == "Ready to print" || it.startsWith("Start a new job") }
        }
        SystemClock.sleep(1000) // the question may still replace a screen that showed first
        if (find("Start a new job") != null) activate("Start a new job")
    }

    /** Android's print screen, opened from PrintSaathi by this test's PRINT (it was not showing before, review M6). */
    private fun printScreenOpened() =
        waitFor("Android's print screen") { ui.rootInActiveWindow?.packageName?.toString()?.contains("printspooler") == true }

    private fun assertPrintSaathiOnTop() =
        waitFor("PrintSaathi on screen before PRINT") { ui.rootInActiveWindow?.packageName == PKG }

    @Test fun j1PhotosOnOnePageReachThePrintScreenByScreenReaderActionsOnly() {
        assumeAppAndSender()
        share("six-photos")
        activate("All on one page")
        waitFor("Ready", 60_000) { find("PRINT") != null }
        assertPrintSaathiOnTop()
        activate("PRINT")
        printScreenOpened()
        assertTrue(steps.containsAll(listOf("All on one page", "PRINT")))
    }

    @Test fun j5APdfReachesThePrintScreenByScreenReaderActionsOnly() {
        assumeAppAndSender()
        share("pdf")
        waitFor("Ready", 60_000) { find("PRINT") != null }
        assertPrintSaathiOnTop()
        activate("PRINT")
        printScreenOpened()
    }

    /** Only what this test changed is undone: the print screen it opened, and the accessibility settings (review I2). */
    @After fun putThePhoneBack() {
        val (services, enabled) = before ?: return
        ui.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        SystemClock.sleep(1500)
        if (services.isEmpty() || services == "null") shell("settings delete secure enabled_accessibility_services")
        else shell("settings put secure enabled_accessibility_services $services")
        if (enabled.isEmpty() || enabled == "null") shell("settings delete secure accessibility_enabled")
        else shell("settings put secure accessibility_enabled $enabled")
    }

    private companion object {
        const val SENDER = "in.printsaathi.sharesender"
        const val PKG = "in.printsaathi.app"
        const val TALKBACK = "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
    }
}
