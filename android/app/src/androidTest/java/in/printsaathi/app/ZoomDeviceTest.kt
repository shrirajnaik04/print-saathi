package `in`.printsaathi.app

import android.os.Build
import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import `in`.printsaathi.app.engine.webViewTooOld
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Owner, round 5: "zoom must be allowed only in Adjust, just to zoom the printable page". Two fingers spread on the
 * screen (real touches through Android's input system) never zoom it; Adjust's page has its own zoom inside the page.
 */
@RunWith(AndroidJUnit4::class)
class ZoomDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val ctx = instrumentation.targetContext

    @Test fun aTwoFingerPinchOnTheScreenNeverZoomsIt() = assertScaleAfterPinch(allowZoom = false, zooms = false)

    /** The control: the same two fingers do zoom a page that allows it, so the test above can see a zoom. */
    @Test fun theSamePinchZoomsAPageThatAllowsZoom() = assertScaleAfterPinch(allowZoom = true, zooms = true)

    private fun assertScaleAfterPinch(allowZoom: Boolean, zooms: Boolean) {
        // An image whose WebView is too old shows the native "update WebView" screen: no page to pinch.
        assumeTrue(Build.VERSION.SDK_INT >= 26)
        assumeTrue(!webViewTooOld(WebViewCompat.getCurrentWebViewPackage(ctx)?.versionName))
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            SystemClock.sleep(6000) // the page has drawn
            if (allowZoom) {
                scenario.onActivity { a ->
                    a.bridge.webView.settings.setSupportZoom(true)
                    a.bridge.webView.settings.builtInZoomControls = true
                }
            }
            val m = ctx.resources.displayMetrics
            pinchOpen(m.widthPixels / 2f, m.heightPixels / 2f, m.widthPixels * 0.05f, m.widthPixels * 0.35f)
            SystemClock.sleep(1500)
            val scale = AtomicReference<String>()
            val done = CountDownLatch(1)
            scenario.onActivity { a ->
                a.bridge.webView.evaluateJavascript("String(window.visualViewport ? visualViewport.scale : 1)") {
                    scale.set(it)
                    done.countDown()
                }
            }
            done.await(10, TimeUnit.SECONDS)
            val shown = scale.get()?.trim('"')?.toDoubleOrNull() ?: -1.0
            if (zooms) assertTrue("zoomed: $shown", shown > 1.05) else assertEquals(1.0, shown, 0.01)
        }
    }

    /** Two fingers on a line through ([cx], [cy]), [from] px from it each, spreading to [to] px. */
    private fun pinchOpen(cx: Float, cy: Float, from: Float, to: Float) {
        val ui = instrumentation.uiAutomation
        val down = SystemClock.uptimeMillis()
        val props = Array(2) { i ->
            MotionEvent.PointerProperties().apply {
                id = i
                toolType = MotionEvent.TOOL_TYPE_FINGER
            }
        }
        fun coords(d: Float) = arrayOf(
            MotionEvent.PointerCoords().apply { x = cx - d; y = cy; pressure = 1f; size = 1f },
            MotionEvent.PointerCoords().apply { x = cx + d; y = cy; pressure = 1f; size = 1f },
        )
        fun send(action: Int, count: Int, d: Float, t: Long) {
            val e = MotionEvent.obtain(
                down, t, action, count, props, coords(d), 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0,
            )
            check(ui.injectInputEvent(e, true)) { "touch not taken: $action" }
            e.recycle()
        }
        var t = down
        send(MotionEvent.ACTION_DOWN, 1, from, t)
        send(MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), 2, from, t)
        for (k in 1..20) {
            t += 16
            send(MotionEvent.ACTION_MOVE, 2, from + (to - from) * k / 20f, t)
            SystemClock.sleep(16)
        }
        t += 16
        send(MotionEvent.ACTION_POINTER_UP or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), 2, to, t)
        send(MotionEvent.ACTION_UP, 1, to, t)
    }
}
