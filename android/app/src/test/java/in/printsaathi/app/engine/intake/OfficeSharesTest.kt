package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * Round 9: Print with WPS Office hands one customer file to the office app through the app's own non-exported
 * provider: only a file granted by the app (the job's original NNNN.office), only for reading, by a random token.
 */
class OfficeSharesTest {
    private val base: File = Files.createTempDirectory("ps").toFile()
    private val root = File(base, "jobs")
    private val shares = OfficeShares(File(base, "inbox"), root)

    private fun original(job: String, n: Int) =
        File(root, "$job/src/%04d.office".format(n)).apply { parentFile!!.mkdirs(); writeBytes(ByteArray(4)) }

    @Test fun onlyTheGrantedFileOpensReadOnly() {
        val f = original("job-1", 3)
        val token = shares.grant("job-1", 3)
        assertEquals(f.canonicalPath, shares.fileFor("/o/$token", "r")?.canonicalPath)
    }

    @Test fun writeModesAreRefused() {
        original("job-1", 1)
        val token = shares.grant("job-1", 1)
        for (mode in listOf("w", "wt", "rw", "rwt", "wa")) assertNull(mode, shares.fileFor("/o/$token", mode))
    }

    @Test fun unknownOrTraversalTokensAreRefused() {
        original("job-1", 1)
        val token = shares.grant("job-1", 1)
        for (p in listOf("/o/x", "/o/$token/..", "/c/$token", "/o/", "", null)) assertNull("$p", shares.fileFor(p, "r"))
        assertNull("bad job ids are never granted", runCatching { shares.grant("../x", 1) }.getOrNull())
        assertNull(runCatching { shares.grant("job-1", 0) }.getOrNull())
    }

    @Test fun aMissingOriginalIsNotServed() {
        val token = shares.grant("job-2", 9)
        assertNull(shares.fileFor("/o/$token", "r"))
    }

    @Test fun atMost20Grants() {
        original("job-1", 1)
        val first = shares.grant("job-1", 1)
        repeat(20) { shares.grant("job-1", 1) }
        assertNull("the oldest went", shares.fileFor("/o/$first", "r"))
        val last = shares.grant("job-1", 1)
        assertNotEquals(first, last)
        assertEquals(original("job-1", 1).canonicalPath, shares.fileFor("/o/$last", "r")?.canonicalPath)
    }
}
