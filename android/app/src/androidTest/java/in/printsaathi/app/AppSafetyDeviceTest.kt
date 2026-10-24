package `in`.printsaathi.app

import android.app.job.JobScheduler
import android.os.Build
import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import `in`.printsaathi.app.engine.jobs.Retention
import `in`.printsaathi.app.engine.webViewTooOld
import androidx.webkit.WebViewCompat
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Phase 2 Task 8 on a device: daily deletion is scheduled; a dead web renderer rebuilds the screen, no app crash. */
@RunWith(AndroidJUnit4::class)
class AppSafetyDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun theDailyOldFileDeletionIsScheduledAtStart() {
        ActivityScenario.launch(MainActivity::class.java).use {
            val js = ctx.getSystemService(JobScheduler::class.java)
            val deadline = SystemClock.elapsedRealtime() + 10_000
            while (js.getPendingJob(Retention.JOB_ID) == null && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(200)
            val job = js.getPendingJob(Retention.JOB_ID)
            assertNotNull("retention job registered", job)
            assertTrue(job!!.isPeriodic)
        }
    }

    /** Android calls onRenderProcessGone from API 26; before that a renderer crash cannot be caught by any app. */
    @Test fun aDeadWebRendererRebuildsTheScreenAndCountsAsACrash() {
        assumeTrue(Build.VERSION.SDK_INT >= 26)
        // An emulator image whose WebView is older than the app accepts shows the "update WebView" screen instead
        // (PLAN §D6): there is no page renderer to crash (API 28 and 30 images in the regression).
        assumeTrue(!webViewTooOld(WebViewCompat.getCurrentWebViewPackage(ctx)?.versionName))
        val crashes = File(ctx.noBackupFilesDir, "state/crashes").apply { delete() }
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            SystemClock.sleep(3000) // let the page load
            var before: MainActivity? = null
            scenario.onActivity { a ->
                before = a
                a.bridge.webView.loadUrl("chrome://crash")
            }
            // The activity is torn down and rebuilt: ask the lifecycle monitor which MainActivity is resumed, as
            // ActivityScenario.onActivity throws while the old one is being destroyed (API 28 run, gate review).
            val deadline = SystemClock.elapsedRealtime() + 15_000
            var after: MainActivity? = null
            while (SystemClock.elapsedRealtime() < deadline) {
                SystemClock.sleep(500)
                after = resumedMainActivity()
                if (after != null && after !== before) break
            }
            assertNotNull("a MainActivity is back on screen", after)
            assertNotSame("activity was recreated", before, after)
            assertTrue("crash was counted", crashes.exists() && crashes.readLines().any { it.isNotBlank() })
        }
        crashes.delete()
    }

    private fun resumedMainActivity(): MainActivity? {
        var found: MainActivity? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            found = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
                .filterIsInstance<MainActivity>().firstOrNull()
        }
        return found
    }
}
