package `in`.printsaathi.app.engine.jobs

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Log
import `in`.printsaathi.app.engine.Background
import `in`.printsaathi.app.engine.print.PrintRecordStore
import `in`.printsaathi.app.engine.settings.SettingsStore

/** When customer files are deleted (PLAN §E): at start, on resume, after printing, and once a day. */
object Retention {
    const val KEEP_MS = 24L * 60 * 60 * 1000 // the default; the owner's choice is read from SettingsStore at each sweep
    const val CAP_BYTES = 1536L * 1024 * 1024
    const val JOB_ID = 4201
    private const val TAG = "PrintSaathi"

    /**
     * Jobs that must not be touched: those on the screen stack (as the web app said in this process, or as saved on
     * disk while those screens can still come back), the one being printed, and shares being received.
     */
    fun protectedIds(ctx: Context): Set<String> =
        setOfNotNull(PrintRecordStore(ctx.noBackupFilesDir).load()?.jobId) + Background.activeJobIds +
            OpenJobs(ctx.noBackupFilesDir).recent(System.currentTimeMillis()) + Background.intakesInProgress +
            setOfNotNull(`in`.printsaathi.app.engine.intake.CaptureProvider.store(ctx).waitingIntakeId())

    /** Runs on the shared background thread; [deleted] is told how many jobs went (to clear the WebView cache). */
    fun sweepAsync(ctx: Context, deleted: (Int) -> Unit = {}) {
        val app = ctx.applicationContext
        Background.io.execute {
            val n = runCatching {
                val sweeper = JobSweeper(app.noBackupFilesDir)
                // The owner's choice: 1 hour, 1 day (default) or 7 days (Settings → Delete customer files after).
                val keepMs = SettingsStore(app.noBackupFilesDir).keepMs()
                sweeper.sweep(System.currentTimeMillis(), keepMs, CAP_BYTES, protectedIds(app)).size.also {
                    // "Damaged photo" marks are content hashes: they go when no kept job holds that file.
                    PoisonMarkers(app.noBackupFilesDir).retainOnly(sweeper.keptHashes())
                }
            }.onFailure { Log.w(TAG, "retention failed: ${it.javaClass.simpleName}") }.getOrDefault(0)
            if (n > 0) Log.i(TAG, "retention: $n old jobs deleted")
            deleted(n)
        }
    }

    /**
     * One daily platform job (no extra library, PLAN §E); Android may run it later than asked. Only while the phone
     * is idle: scheduled again at a start after a force-stop or reboot, it otherwise ran at once on the main thread
     * during the WebView's first frame ("isn't responding", Phase 10). Sweeps at start, on resume and after printing
     * keep their timing.
     */
    fun schedule(ctx: Context) {
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        if (js.getPendingJob(JOB_ID)?.isRequireDeviceIdle == true) return // an older one without it is replaced
        js.schedule(
            JobInfo.Builder(JOB_ID, ComponentName(ctx, RetentionJobService::class.java))
                .setPeriodic(24L * 60 * 60 * 1000)
                .setRequiresDeviceIdle(true)
                .build(),
        )
    }
}

/** The daily retention run. Not exported; only the system can bind it (BIND_JOB_SERVICE). */
class RetentionJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Retention.sweepAsync(this) { jobFinished(params, false) }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true
}
