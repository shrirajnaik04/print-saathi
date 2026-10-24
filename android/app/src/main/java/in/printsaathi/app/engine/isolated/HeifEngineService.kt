package `in`.printsaathi.app.engine.isolated

/**
 * ADR-003 spike: the same engine in a separate but NOT isolated process (":heif"). Android's HEIF decoder needs
 * the media.player service, which SELinux denies to isolatedProcess. Declared in the DEBUG manifest only until
 * the owner decides ADR-003. It keeps crash/memory containment but runs with the app's uid (can read app files).
 */
class HeifEngineService : EngineService()
