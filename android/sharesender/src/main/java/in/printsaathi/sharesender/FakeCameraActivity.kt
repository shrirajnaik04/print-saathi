package `in`.printsaathi.sharesender

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore

/**
 * Debug-only stand-in for a phone's camera app (owner, round 8: Scan pages). It answers ACTION_IMAGE_CAPTURE by writing
 * a synthetic photographed page (typed lines on an A4 page lying at a slant on a brown table; never a real document)
 * to the EXTRA_OUTPUT URI the app granted, then RESULT_OK. `SendActivity -e mode camera-cancel` makes the next answers
 * "closed without a photo" (nothing written); `camera-hold` writes the photo and stays open until Back (the app can be
 * stopped meanwhile, as Android does on 2 GB phones); `camera-ok` goes back to taking one. The page's corners on the
 * 1200 × 1600 photo are [CORNERS] (round8-smoke.mjs checks the app finds them).
 */
class FakeCameraActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        val out = intent.getParcelableExtra<Uri>(MediaStore.EXTRA_OUTPUT)
        if (out == null || getSharedPreferences("camera", MODE_PRIVATE).getBoolean("cancel", false)) {
            setResult(RESULT_CANCELED)
            finish()
            return
        }
        val bmp = Bitmap.createBitmap(1200, 1600, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.rgb(120, 82, 52))
        c.save()
        c.concat(Matrix().apply { setPolyToPoly(floatArrayOf(0f, 0f, 700f, 0f, 700f, 990f, 0f, 990f), 0, CORNERS, 0, 4) })
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(242, 240, 235) }
        c.drawRect(0f, 0f, 700f, 990f, p)
        p.color = Color.rgb(40, 40, 40)
        var y = 90f
        while (y < 900f) {
            c.drawRect(70f, y, if ((y.toInt() / 30) % 5 == 4) 380f else 630f, y + 9f, p)
            y += 30f
        }
        // A red stamp near the bottom: Clean colour keeps it red.
        p.color = Color.rgb(200, 50, 50)
        c.drawCircle(520f, 860f, 60f, p)
        c.restore()
        contentResolver.openOutputStream(out, "w")?.use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        bmp.recycle()
        if (getSharedPreferences("camera", MODE_PRIVATE).getBoolean("hold", false)) return // Back closes it
        setResult(RESULT_OK)
        finish()
    }

    companion object {
        /** TL, TR, BR, BL on the 1200 × 1600 photo. */
        val CORNERS = floatArrayOf(230f, 200f, 1000f, 260f, 1060f, 1380f, 150f, 1330f)
    }
}
