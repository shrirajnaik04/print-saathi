package `in`.printsaathi.app.engine.intake

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

/**
 * Round 9: Print with WPS Office. Lets the office app the app hands a file to read that one original ([OfficeShares]),
 * read-only. Not exported: only a URI the app grants opens. Its display name is a plain "Customer file" with the
 * kind's extension, never the customer's own file name.
 */
class OfficeShareProvider : ContentProvider() {
    override fun onCreate() = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val ctx = context ?: throw FileNotFoundException()
        val f = shares(ctx).fileFor(uri.path, mode) ?: throw FileNotFoundException()
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri): String? = uri.getQueryParameter("type")

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? {
        val ctx = context ?: return null
        val f = shares(ctx).fileFor(uri.path, "r") ?: return null
        val c = MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE))
        c.addRow(arrayOf<Any>("Customer file" + (uri.getQueryParameter("ext") ?: ""), f.length()))
        return c
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0

    companion object {
        fun shares(ctx: Context) = OfficeShares(File(ctx.noBackupFilesDir, "inbox"), File(ctx.noBackupFilesDir, "jobs"))

        /** The URI an office app reads granted file [token] from; its type and extension ride along for the viewer. */
        fun uri(ctx: Context, token: String, type: String, ext: String): Uri =
            Uri.parse("content://${ctx.packageName}.office/o/$token").buildUpon()
                .appendQueryParameter("type", type).appendQueryParameter("ext", ext).build()
    }
}
