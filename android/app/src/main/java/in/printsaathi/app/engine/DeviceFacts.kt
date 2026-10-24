package `in`.printsaathi.app.engine

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.ext.SdkExtensions
import androidx.webkit.WebViewCompat
import com.getcapacitor.JSObject

/** Facts that decide memory budgets and the locked-PDF approach (PLAN §F2, §G5). */
object DeviceFacts {
    fun read(context: Context): JSObject {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mem = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val sExt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S)
        } else {
            null
        }
        // WebViewCompat also works before Android 8 (where WebView.getCurrentWebViewPackage does not exist).
        val webView = WebViewCompat.getCurrentWebViewPackage(context)
        return JSObject().apply {
            put("androidRelease", Build.VERSION.RELEASE)
            put("sdkInt", Build.VERSION.SDK_INT)
            put("sExtensionLevel", sExt ?: JSObject.NULL)
            put("totalRamMb", (mem.totalMem / (1024 * 1024)).toInt())
            put("isLowRamDevice", am.isLowRamDevice)
            put("memoryClassMb", am.memoryClass)
            put("largeMemoryClassMb", am.largeMemoryClass)
            put("webViewPackage", webView?.packageName ?: "unknown")
            put("webViewVersion", webView?.versionName ?: "unknown")
            put("pdfUnlockTier", pdfUnlockTier(Build.VERSION.SDK_INT, sExt ?: 0).name)
            put("manufacturer", Build.MANUFACTURER)
            put("model", Build.MODEL)
            put("fontScale", context.resources.configuration.fontScale.toDouble())
        }
    }
}
