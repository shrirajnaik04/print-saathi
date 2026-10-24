package `in`.printsaathi.app.engine.docs

import java.io.File

/**
 * Decrypted data of a locked PDF (PLAN §G5): the app's unlocked copy, page images made with a password, and print
 * files and previews made from them. A job that held any is marked; leaving the job, or a restart, deletes all of it
 * (review I5). The customer's own files and ordinary thumbnails stay until retention.
 */
object Decrypted {
    // Beside the job's files, not in work/: clearing scratch must never lose it (re-review I5).
    private fun marker(jobDir: File) = File(jobDir, "decrypted")

    fun mark(jobDir: File) {
        if (jobDir.isDirectory) marker(jobDir).createNewFile()
    }

    fun isMarked(jobDir: File) = marker(jobDir).isFile

    /** [keepOut]: the print file Android's print screen may still be reading (its out/<planHash> folder). */
    fun forget(jobDir: File, keepOut: String?) {
        // All of work/: the unlocked copy, locked page images and the pages of a render cut off midway.
        File(jobDir, "work").deleteRecursively()
        File(jobDir, "out").listFiles()?.filter { it.name != keepOut }?.forEach { it.deleteRecursively() }
        marker(jobDir).delete()
    }
}
