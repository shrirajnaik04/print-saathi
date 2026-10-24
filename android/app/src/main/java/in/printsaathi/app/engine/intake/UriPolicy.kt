package `in`.printsaathi.app.engine.intake

/**
 * Only content:// URIs from OTHER apps are imported. file:// is refused (no path tricks) and our own
 * authorities are refused so a malicious app cannot make us re-import our private job files (PLAN §D2).
 * ContentResolver ignores a "userId@" prefix, so the check runs on the bare authority; a prefix alone is
 * allowed because dual-app WhatsApp (another user id) shares that way.
 */
fun isAcceptableShareUri(scheme: String?, authority: String?, isOwnAuthority: (String) -> Boolean): Boolean {
    if (!scheme.equals("content", ignoreCase = true)) return false
    val bare = authority?.substringAfterLast('@')
    if (bare.isNullOrBlank()) return false
    return !isOwnAuthority(bare)
}
