package `in`.printsaathi.app.engine.docs

import java.io.File
import java.io.FileOutputStream

/**
 * The one bounded bridge exception (PLAN §G5, ADR-002 option i): on phones whose built-in engine cannot open locked
 * PDFs, the WebView unlocks the file and sends it here in chunks. Written to `unlocked-<item>.pdf.part` in the job's
 * work folder, in order, at most [maxBytes]; renamed only after the last chunk, so a half copy is never used. These
 * copies are deleted after printing, with the job, and at app start (the password is asked again).
 */
class UnlockedCopy(private val workDir: File, val maxBytes: Long = 20L * 1024 * 1024) {
    private fun part(item: Int) = File(workDir, "unlocked-$item.pdf.part")

    /** The finished copy for [item], or null. */
    fun file(item: Int): File? = File(workDir, "unlocked-$item.pdf").takeIf { it.isFile }

    /** Appends a chunk at [offset]; false (and nothing kept) if out of order, too big, or over the limit. */
    @Synchronized fun write(item: Int, offset: Long, bytes: ByteArray, last: Boolean): Boolean {
        val p = part(item)
        if (offset == 0L) {
            p.delete()
            File(workDir, "unlocked-$item.pdf").delete()
        }
        val size = if (p.isFile) p.length() else 0L
        if (bytes.size > CHUNK || offset != size || offset + bytes.size > maxBytes) {
            p.delete()
            return false
        }
        workDir.mkdirs()
        FileOutputStream(p, true).use { out ->
            out.write(bytes)
            if (last) out.fd.sync()
        }
        if (last && !p.renameTo(File(workDir, "unlocked-$item.pdf"))) {
            p.delete()
            return false
        }
        return true
    }

    /** Every unlocked copy and half copy of this job (after printing, at app start, with the job). */
    @Synchronized fun deleteAll() {
        workDir.listFiles()?.filter { it.name.startsWith("unlocked-") }?.forEach { it.delete() }
    }

    companion object {
        const val CHUNK = 256 * 1024
    }
}
