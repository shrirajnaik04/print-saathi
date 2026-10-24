package `in`.printsaathi.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import `in`.printsaathi.app.engine.DeviceFacts
import `in`.printsaathi.app.engine.MIN_WEBVIEW_MAJOR

/**
 * Native screen shown when the phone's web engine is too old to run PrintSaathi (PLAN §D6 WebView gate).
 * Works without the WebView, so it also shows the phone facts needed for Phase 0 spike (i).
 */
class WebViewGateActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Back leaves the app (like Home) rather than closing this screen: under it the app may still be receiving
        // a share, and closing would show the old web engine's blank page (gate re-review N3).
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                moveTaskToBack(true)
            }
        })
        val facts = DeviceFacts.read(this)
        val pad = (16 * resources.displayMetrics.density).toInt()
        fun text(s: String, sp: Float, bold: Boolean = false) = TextView(this).apply {
            this.text = s
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
            setTextColor(0xFF0F172A.toInt())
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, pad / 2, 0, pad / 2)
        }
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(0xFFF8FAFC.toInt())
            addView(text("PrintSaathi needs an update on this phone", 26f, bold = true))
            addView(text(
                "This phone's web engine is too old (version ${facts.optString("webViewVersion")}). " +
                    "Please update “Android System WebView” (or Chrome) from the Play Store, then open PrintSaathi again.",
                20f,
            ))
            addView(Button(this@WebViewGateActivity).apply {
                text = "Open Play Store"
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                minHeight = (64 * resources.displayMetrics.density).toInt()
                setOnClickListener {
                    runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.webview")))
                    }
                }
            })
            addView(text("Phone details (for the shop owner)", 20f, bold = true))
            addView(text(
                "${facts.optString("manufacturer")} ${facts.optString("model")}\n" +
                    "Android ${facts.optString("androidRelease")} (level ${facts.optInt("sdkInt")})\n" +
                    "Memory: ${facts.optInt("totalRamMb")} MB\n" +
                    "Web engine: ${facts.optString("webViewPackage")} ${facts.optString("webViewVersion")} (needs $MIN_WEBVIEW_MAJOR or newer)\n" +
                    "Locked PDFs by itself: ${facts.optString("pdfUnlockTier")}",
                18f,
            ))
            gravity = Gravity.TOP
        }
        setContentView(ScrollView(this).apply { addView(column) })
    }
}
