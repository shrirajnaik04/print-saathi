package `in`.printsaathi.app.engine.jobs

import java.io.File

/**
 * "New files arrived → Add to this job" (PLAN §I-17, §K9): places the files of job [from] in job [into]'s own src
 * folder, numbered after its own, with their thumbnails. Files are linked (no copy, no extra space) or copied when
 * linking is not possible. [from] is left complete: the web app saves the merged job, then deletes [from], so a
 * failure half-way loses nothing (left-over files go with the job folder at retention).
 */
class JobMerge(private val jobsDir: File, private val link: (src: File, dst: File) -> Boolean) {
    private val idPattern = Regex("^[A-Za-z0-9-]{1,64}$")
    private val number = Regex("^(\\d{4,})\\.([a-z0-9]+)$")

    /** The files of [from] and where they now are in [into], in received order. */
    fun merge(from: String, into: String): List<Pair<File, File>> {
        require(from != into && idPattern.matches(from) && idPattern.matches(into)) { "bad job ids" }
        val src = File(jobsDir, "$from/src")
        val dst = File(jobsDir, "$into/src")
        require(src.isDirectory && dst.isDirectory) { "no such job" }
        val received = { dir: File ->
            (dir.listFiles() ?: emptyArray())
                .mapNotNull { f -> number.matchEntire(f.name)?.let { m -> Triple(f, m.groupValues[1].toInt(), m.groupValues[2]) } }
                .sortedBy { it.second }
        }
        var next = (received(dst).maxOfOrNull { it.second } ?: 0) + 1
        val moved = received(src).map { (f, _, ext) ->
            val target = File(dst, "%04d.%s".format(next++, ext))
            place(f, target)
            f to target
        }
        // Thumbnails and analysis files are named by content hash and settings: bring the finished ones along.
        File(jobsDir, "$from/thumbs").listFiles()?.filter { it.isFile && !it.name.endsWith(".part") }?.forEach { t ->
            val target = File(jobsDir, "$into/thumbs/${t.name}")
            if (!target.exists()) runCatching { target.parentFile?.mkdirs(); place(t, target) }
        }
        return moved
    }

    private fun place(src: File, dst: File) {
        if (runCatching { link(src, dst) }.getOrDefault(false) && dst.isFile) return
        val part = File(dst.parentFile, "${dst.name}.part")
        src.inputStream().use { i -> part.outputStream().use { o -> i.copyTo(o); o.fd.sync() } }
        check(part.renameTo(dst)) { "could not place a file" }
    }
}
