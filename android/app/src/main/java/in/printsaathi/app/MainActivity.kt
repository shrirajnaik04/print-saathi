package `in`.printsaathi.app

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import `in`.printsaathi.app.engine.Background
import `in`.printsaathi.app.engine.PrintEnginePlugin
import `in`.printsaathi.app.engine.canHideRecentsThumbnail
import `in`.printsaathi.app.engine.diag.Diagnostics
import `in`.printsaathi.app.engine.webViewTooOld
import `in`.printsaathi.app.engine.jobs.CrashLog
import `in`.printsaathi.app.engine.print.PrintFlow
import com.getcapacitor.BridgeActivity
import com.getcapacitor.WebViewListener

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Must be set before super.onCreate: BridgeActivity replays the launch intent during creation.
        lastCreateWasRestore = savedInstanceState != null
        installCrashLog(applicationContext)
        registerPlugin(PrintEnginePlugin::class.java)
        super.onCreate(savedInstanceState)
        // A web engine older than we support shows a blank page; show a native explanation instead (PLAN §D6).
        if (webViewTooOld(WebViewCompat.getCurrentWebViewPackage(this)?.versionName)) {
            gated = true
            // Back here (never shown long) leaves the app instead of finishing this activity mid-copy.
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    moveTaskToBack(true)
                }
            })
            showGate()
            finishWhenSharesCopied(0)
            return
        }
        bridge?.webView?.settings?.let { settings ->
            // The app scales text itself from the phone's font size (capped at 200 %, PLAN §D6); the WebView must
            // not scale again, or tested layouts would differ from what the shopkeeper sees.
            settings.textZoom = 100
            // Brand "dark mode for apps" must never invert paper previews.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
            }
        }
        // Until the page has drawn, it is see-through (capacitor.config.ts) over the splash picture, the printer where
        // Android's splash drew it: no empty screen at start, and no waiting for it (device check 2026-10-24).
        findViewById<View>(android.R.id.content)?.background = ContextCompat.getDrawable(this, R.drawable.splash)
        // Android 13+: Recents shows a blank card instead of customer photos; normal screenshots still work.
        if (canHideRecentsThumbnail()) setRecentsScreenshotEnabled(false)
        // The web page's renderer can die (memory, a WebView bug). Unhandled, Android then kills the whole app;
        // instead count it as a crash and rebuild the screen, but never while Android's print screen is open,
        // because recreating this activity would close it (PLAN §D5).
        bridge?.addWebViewListener(object : WebViewListener() {
            override fun onRenderProcessGone(webView: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                CrashLog(applicationContext.noBackupFilesDir).record(System.currentTimeMillis())
                runCatching { Diagnostics(applicationContext.noBackupFilesDir).log(Diagnostics.Event.WEBVIEW_GONE) }
                if (PrintFlow.status(applicationContext).optString("state") == "inDialog") recreateWhenBack = true
                else recreate()
                return true
            }
        })
    }

    override fun onResume() {
        super.onResume()
        // Behind the gate this activity only holds the shares' read permission; whatever brought it to the front (a
        // new share, the app icon), the gate is shown again, never the old web engine's blank page (re-review N3).
        if (gated && !isFinishing) showGate()
        if (recreateWhenBack) {
            recreateWhenBack = false
            recreate()
        }
    }

    private var recreateWhenBack = false

    /** The page's own splash is gone, so the page has drawn: solid again, with nothing drawn under it. UI thread. */
    fun splashGone() {
        bridge?.webView?.setBackgroundColor(ContextCompat.getColor(this, R.color.splash_background))
        findViewById<View>(android.R.id.content)?.background = null
    }

    /** True when this phone's web engine is too old: the native gate screen is shown instead of the app. */
    private var gated = false

    // Reorder, not clear: every share would otherwise stack one more gate screen (16 Backs after 16 shares), and
    // clearing would finish this activity and end the share's read permission mid-copy.
    private fun showGate() =
        startActivity(Intent(this, WebViewGateActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))

    /**
     * A share's read permission belongs to this activity and ends when it finishes. Behind the WebView gate it
     * therefore stays (hidden) until the files being received are copied, or Android would cut the copy short and
     * customer files would be lost (Phase 4 regression, API 30: 1-2 of 6 photos "permission").
     */
    private fun finishWhenSharesCopied(waitedMs: Long) {
        if (isFinishing) return
        if (Background.intakesInProgress.isEmpty() || waitedMs >= SHARE_COPY_WAIT_MS) {
            finish()
            return
        }
        Handler(Looper.getMainLooper()).postDelayed({ finishWhenSharesCopied(waitedMs + 250) }, 250)
    }

    /**
     * fontScale is in configChanges, so changing the phone's text size no longer restarts the app (which lost the
     * current screen); the new size goes to the web app instead (PLAN §D6 "updated live").
     */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        (bridge?.getPlugin("PrintEngine")?.instance as? PrintEnginePlugin)?.notifyFontScale(newConfig.fontScale)
    }

    companion object {
        @Volatile
        var lastCreateWasRestore = false

        /** Longest wait behind the gate: past the importer's own 3-minute limit per file for a few files. */
        private const val SHARE_COPY_WAIT_MS = 10 * 60_000L

        @Volatile private var crashLogInstalled = false

        /** Every uncaught crash is timed in state/crashes (no details) before Android's own handler runs. */
        private fun installCrashLog(app: Context) {
            if (crashLogInstalled) return
            crashLogInstalled = true
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { t, e ->
                runCatching { CrashLog(app.noBackupFilesDir).record(System.currentTimeMillis()) }
                runCatching { Diagnostics(app.noBackupFilesDir).crash(e) }
                previous?.uncaughtException(t, e)
            }
        }
    }
}
