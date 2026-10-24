package `in`.printsaathi.app.engine

/** Oldest Android System WebView we support (vite build.target = chrome92; Capacitor 8 needs >= 60). */
const val MIN_WEBVIEW_MAJOR = 92

fun webViewMajor(versionName: String?): Int? = versionName?.substringBefore('.')?.toIntOrNull()

/** Unknown versions are not blocked: better to try than to lock the owner out. */
fun webViewTooOld(versionName: String?): Boolean = webViewMajor(versionName)?.let { it < MIN_WEBVIEW_MAJOR } ?: false
