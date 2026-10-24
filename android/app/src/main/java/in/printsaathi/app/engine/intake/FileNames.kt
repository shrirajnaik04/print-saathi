package `in`.printsaathi.app.engine.intake

import java.util.Locale

// Locale.ROOT: on a Marathi or Hindi phone the default locale writes Devanagari digits (०००७), which would put
// non-ASCII names on disk and break sorting and lookups. Proven by FileNamesTest.

/** Name of a file while it is still being copied in. */
fun partName(n: Int): String = String.format(Locale.ROOT, "%04d.part", n)

/** Name of a received file once copied and recognised. */
fun finalName(n: Int, extension: String): String = String.format(Locale.ROOT, "%04d.%s", n, extension)
