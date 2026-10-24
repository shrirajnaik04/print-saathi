package `in`.printsaathi.sharesender

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream
import java.io.IOException

/**
 * Test-only provider that misbehaves on purpose, like a broken or malicious sharing app (PLAN §R4 hostile
 * provider). The URI path picks the behaviour; data flows through a pipe so stalls and endless streams are real.
 */
class HostileProvider : ContentProvider() {
    override fun onCreate() = true

    private fun photoBytes(n: Int = 0): ByteArray {
        val bmp = Bitmap.createBitmap(800, 600, Bitmap.Config.ARGB_8888)
        Canvas(bmp).drawColor(Color.rgb(90, (160 + n * 15) % 256, 210))
        return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it); bmp.recycle() }.toByteArray()
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val c = MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE))
        val size: Long? = when (uri.lastPathSegment) {
            "lying-length" -> 10L // claims 10 bytes, sends a whole photo
            "unknown-length" -> null
            else -> 1000L
        }
        c.addRow(arrayOf<Any?>("customer.jpg", size))
        return c
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val (read, write) = ParcelFileDescriptor.createReliablePipe()
        val behaviour = uri.lastPathSegment
        Thread {
            try {
                when (behaviour) {
                    "lying-length", "unknown-length" ->
                        ParcelFileDescriptor.AutoCloseOutputStream(write).use { it.write(photoBytes()) }
                    "zero-bytes" -> write.close()
                    "midstream-error" -> {
                        FileOutputStream(write.fileDescriptor).write(photoBytes().copyOf(1000))
                        write.closeWithError("provider failed half way")
                    }
                    "stall" -> {
                        FileOutputStream(write.fileDescriptor).write(photoBytes().copyOf(1000))
                        Thread.sleep(10 * 60_000L) // never finishes; the reader must give up
                        write.close()
                    }
                    "endless" -> ParcelFileDescriptor.AutoCloseOutputStream(write).use { out ->
                        val chunk = ByteArray(256 * 1024) { 0x55 }
                        while (true) out.write(chunk) // until the reader closes the pipe
                    }
                    // A slow but honest app (gate re-review N3): a distinct photo in 4 parts over about 2 s, so a
                    // test can act on the app while files are still being received.
                    else -> if (behaviour?.startsWith("slow-") == true) {
                        val bytes = photoBytes(behaviour.removePrefix("slow-").toIntOrNull() ?: 0)
                        ParcelFileDescriptor.AutoCloseOutputStream(write).use { out ->
                            val part = (bytes.size + 3) / 4
                            for (k in 0 until 4) {
                                out.write(bytes, k * part, minOf(part, bytes.size - k * part))
                                out.flush()
                                Thread.sleep(500)
                            }
                        }
                    } else {
                        write.closeWithError("unknown behaviour")
                    }
                }
            } catch (e: IOException) {
                // The reader closed the pipe (expected for stall/endless).
            } catch (e: InterruptedException) {
                // Process ending.
            }
        }.apply { isDaemon = true }.start()
        return read
    }

    override fun getType(uri: Uri) = "image/jpeg"
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?) = 0
}
