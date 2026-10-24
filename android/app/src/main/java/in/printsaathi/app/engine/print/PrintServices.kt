package `in`.printsaathi.app.engine.print

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/**
 * The phone's print services (PLAN §D4, §K12): Android 8+ has its own (Default Print Service), Android 7 has none,
 * and the shop's Brother printer is reached through the Brother Print Service Plugin or Mopria. With none, the print
 * screen offers only "Save as PDF". Whether a service is turned on is not visible to apps; Help says how to check.
 */
object PrintServices {
    data class Found(val any: Boolean, val builtIn: Boolean, val brother: Boolean, val mopria: Boolean)

    private const val BUILT_IN = "com.android.bips"

    fun classify(packages: List<String>): Found = Found(
        any = packages.isNotEmpty(),
        builtIn = BUILT_IN in packages,
        brother = packages.any { it.startsWith("com.brother.") },
        mopria = packages.any { it.startsWith("org.mopria.") },
    )

    /** The installed print services' packages (the manifest's <queries> lets the app see them on Android 11+). */
    fun installed(ctx: Context): List<String> =
        ctx.packageManager.queryIntentServices(Intent("android.printservice.PrintService"), PackageManager.GET_META_DATA)
            .mapNotNull { it.serviceInfo?.packageName }
            .distinct()
}
