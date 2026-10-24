package `in`.printsaathi.app.engine.isolated

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** PLAN §G4: a best-effort scan for form fields or stamps, so older phones can warn they may not show. */
class PdfMarksTest {
    private fun scan(s: String) = PdfMarks.formsOrStamps(s.toByteArray(Charsets.ISO_8859_1))

    @Test fun aFormIsSeen() = assertTrue(scan("<< /Type /Catalog /AcroForm 5 0 R >>"))

    @Test fun annotationsAreSeen() {
        assertTrue(scan("<< /Type /Page /Annots [ 7 0 R ] >>"))
        assertTrue(scan("<< /Type /Page /Annots 9 0 R >>"))
        assertTrue(scan("<</Annots[7 0 R]>>"))
    }

    @Test fun anEmptyAnnotationListIsNothing() {
        assertFalse(scan("<< /Type /Page /Annots [ ] >>"))
        assertFalse(scan("<< /Type /Page /Annots [] /Contents 4 0 R >>"))
        assertFalse(scan("<< /Type /Page /Contents 4 0 R >>"))
    }
}
