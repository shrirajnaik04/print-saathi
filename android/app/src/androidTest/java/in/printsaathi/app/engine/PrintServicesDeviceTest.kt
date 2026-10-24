package `in`.printsaathi.app.engine

import android.os.Build
import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.print.PrintServices
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Phase 10c (PLAN §D4, §K12): the app can see the phone's print services (the manifest's <queries> on Android 11+).
 * Android 8+ ships its own Default Print Service; Android 7 has none, so Home warns there.
 */
@RunWith(AndroidJUnit4::class)
class PrintServicesDeviceTest {
    @Test fun thePhonesOwnPrintServiceIsSeenFromAndroid9AndAbsentOnAndroid7() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val installed = PrintServices.installed(ctx)
        val found = PrintServices.classify(installed)
        InstrumentationRegistry.getInstrumentation().sendStatus(0, Bundle().apply { putString("printServices", "$found") })
        if (Build.VERSION.SDK_INT >= 28) assertTrue("Android's Default Print Service", found.builtIn)
        if (Build.VERSION.SDK_INT < 26) assertFalse("Android 7 has no print service of its own", found.builtIn)
    }
}
