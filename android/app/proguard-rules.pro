# PrintSaathi release (Phase 12): R8 shrinks and renames; these keep what is found by name at run time.
# Capacitor's own rules (plugins, @PluginMethod) come with the library.

# The web page calls the native bridge through @JavascriptInterface methods.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# The isolated engine: the AIDL interface and the parcels that cross it keep their names on both sides.
-keep class in.printsaathi.app.engine.isolated.** { *; }
-keep class app.printsaathi.engine.** { *; }
-keep class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Release builds drop verbose, debug and info logs (PLAN §Q "release builds strip debug logs"); warnings and errors
# stay — they carry codes only, never names, paths or contents.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Crash reports in the problem report keep readable frames (kind + frames only, PLAN §E).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
