package `in`.printsaathi.app.engine.intake

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/** Gate 3 minor 12: job file names must use ASCII digits whatever language the phone uses. */
class FileNamesTest {
    private val original = Locale.getDefault()

    @After fun restore() = Locale.setDefault(original)

    @Test fun namesUseAsciiDigitsOnAMarathiPhone() {
        Locale.setDefault(Locale.forLanguageTag("mr-IN"))
        assertEquals("0007.part", partName(7))
        assertEquals("0012.jpg", finalName(12, "jpg"))
    }

    @Test fun namesUseAsciiDigitsOnAHindiPhoneWithDevanagariNumbers() {
        Locale.setDefault(Locale.forLanguageTag("hi-IN-u-nu-deva"))
        assertEquals("0007.part", partName(7))
    }
}
