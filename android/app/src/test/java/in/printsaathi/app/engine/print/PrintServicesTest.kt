package `in`.printsaathi.app.engine.print

import org.junit.Assert.assertEquals
import org.junit.Test

/** Phase 10c (PLAN §D4, §K12, §I-18): can this phone print to the shop printer at all, and with what? */
class PrintServicesTest {
    @Test fun androidsOwnServiceTheBrotherPluginAndMopriaAreRecognised() {
        val r = PrintServices.classify(listOf("com.android.bips", "com.brother.printservice", "org.mopria.printplugin"))
        assertEquals(PrintServices.Found(any = true, builtIn = true, brother = true, mopria = true), r)
    }

    @Test fun noServiceAtAllMeansNothingButSaveAsPdf() {
        assertEquals(PrintServices.Found(any = false, builtIn = false, brother = false, mopria = false), PrintServices.classify(emptyList()))
    }

    @Test fun anotherMakersPluginStillCounts() {
        assertEquals(PrintServices.Found(any = true, builtIn = false, brother = false, mopria = false), PrintServices.classify(listOf("com.hp.android.printservice")))
    }
}
