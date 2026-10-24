package `in`.printsaathi.app.engine

import android.app.job.JobScheduler
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.printsaathi.app.engine.jobs.Retention
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Phase 10 finding ("Don't keep activities" kill matrix, API 36): the daily retention job, scheduled again at every
 * start after a force-stop or reboot, ran at once on the main thread while the WebView drew its first frame, and
 * Android reported "PrintSaathi isn't responding" (No response to onStartJob). It now waits until the phone is idle;
 * sweeps at start, on resume and after printing are unchanged.
 */
@RunWith(AndroidJUnit4::class)
class RetentionScheduleDeviceTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun theDailyCleanupWaitsForAnIdlePhone() {
        val js = ctx.getSystemService(JobScheduler::class.java)
        js.cancel(Retention.JOB_ID)
        Retention.schedule(ctx)
        val job = js.getPendingJob(Retention.JOB_ID)
        assertNotNull(job)
        assertTrue("periodic", job!!.isPeriodic)
        assertTrue("runs only while the phone is idle", job.isRequireDeviceIdle)
    }
}
