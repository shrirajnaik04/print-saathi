package `in`.printsaathi.app.engine.intake

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileNotFoundException

/**
 * Owner, round 8 (scan pages): lets the phone's own camera app write the one waiting photo ([CaptureStore]) straight
 * into the app's private job storage. Not exported: only a URI the app grants opens, and of those only the waiting
 * photo, and only for writing. No camera permission is declared or needed.
 */
class CaptureProvider : ContentProvider() {
    override fun onCreate() = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val ctx = context ?: throw FileNotFoundException()
        val file = store(ctx).fileFor(uri.path, mode) ?: throw FileNotFoundException()
        file.parentFile?.mkdirs()
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.parseMode(mode))
    }

    override fun getType(uri: Uri) = "image/jpeg"

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0

    companion object {
        fun store(ctx: Context) = CaptureStore(File(ctx.noBackupFilesDir, "inbox"), File(ctx.noBackupFilesDir, "jobs"))

        /** The URI the camera writes the waiting photo [token] to. */
        fun uri(ctx: Context, token: String): Uri = Uri.parse("content://${ctx.packageName}.capture/c/$token")
    }
}
