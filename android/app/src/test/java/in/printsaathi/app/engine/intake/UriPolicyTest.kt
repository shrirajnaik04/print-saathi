package `in`.printsaathi.app.engine.intake

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UriPolicyTest {
    // Stands in for PackageManager.resolveContentProvider(authority)?.packageName == our package.
    private val ownProviders = setOf("in.printsaathi.app.fileprovider", "in.printsaathi.app.androidx-startup")
    private val isOwn: (String) -> Boolean = { a -> ownProviders.any { it.equals(a, ignoreCase = true) } }

    @Test fun rejectsFileSchemeAndOwnAuthority() {
        assertFalse(isAcceptableShareUri("file", null, isOwn))
        assertFalse(isAcceptableShareUri("content", "in.printsaathi.app.fileprovider", isOwn))
    }

    @Test fun acceptsForeignContentUri() {
        assertTrue(isAcceptableShareUri("content", "com.whatsapp.provider.media", isOwn))
    }

    @Test fun rejectsNullOrUnknownScheme() {
        assertFalse(isAcceptableShareUri(null, "x", isOwn))
        assertFalse(isAcceptableShareUri("http", "example.com", isOwn))
        assertFalse(isAcceptableShareUri("content", null, isOwn))
    }

    @Test fun authorityComparisonIgnoresCase() {
        assertFalse(isAcceptableShareUri("CONTENT", "IN.PRINTSAATHI.APP.FILEPROVIDER", isOwn))
    }

    /** ContentResolver strips "userId@", so "0@<our authority>" opens our own provider (Gate 2 finding 3). */
    @Test fun rejectsUserPrefixedOwnAuthority() {
        assertFalse(isAcceptableShareUri("content", "0@in.printsaathi.app.fileprovider", isOwn))
        assertFalse(isAcceptableShareUri("content", "10@0@in.printsaathi.app.androidx-startup", isOwn))
    }

    /** "Dual WhatsApp" (MIUI/ColorOS dual apps) shares from another user id; those must still work. */
    @Test fun acceptsUserPrefixedForeignAuthority() {
        assertTrue(isAcceptableShareUri("content", "999@com.whatsapp.provider.media", isOwn))
    }

    @Test fun rejectsAnyProviderOwnedByUsNotOnlyTheFileProvider() {
        assertFalse(isAcceptableShareUri("content", "in.printsaathi.app.androidx-startup", isOwn))
    }

    @Test fun rejectsEmptyAuthorityAfterTheUserPrefix() {
        assertFalse(isAcceptableShareUri("content", "0@", isOwn))
    }
}
