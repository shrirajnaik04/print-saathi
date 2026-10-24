# Release signing and release build (Phase 12) — 2026-10-17

## Decision
- **The key.** PrintSaathi's release key is made once by `scripts/release-key.mjs`:
  - RSA 4096, PKCS12, 30 years, APK signature v2 (enough for minSdk 24);
  - kept in `%USERPROFILE%\.printsaathi\` (or `PRINTSAATHI_SIGNING`), never in the repo.
- **The pinned fingerprint.** The certificate's SHA-256 is public, and is pinned in `android/release-cert.sha256`. `npm run android:release` refuses an APK signed by any other key, even one with the same name.
- **A missing key is restored, never remade.** On a new PC the backed-up key folder is restored. `release-key.mjs` refuses to make a second key while a fingerprint is pinned. Only `--new-key-i-understand` overrides this, and it means reinstalling the app on the shopkeeper's phone.
- **The password sits in `signing.properties` next to the keystore.** One private backup restores everything. The cost: anyone holding the backup can sign updates. The backup must stay private (USB stick + private cloud folder; INSTALL.md says so). A separate password store was rejected: losing either half loses the ability to update the shopkeeper's phone without wiping it, which is the bigger risk for a one-shop app.
- **The release build itself:**
  - R8 shrinks and renames the code; the WebView bridge and the AIDL engine are kept by name;
  - `Log.v/d/i` are stripped (the release check confirms the messages are gone from the dex);
  - crash records keep full class names, and each release keeps its `mapping.txt` next to the APK.
- **Versions.** `versionCode` is the commit count, so it rises with every build; `versionName` is `1.0.<count> (<commit>)`.

## Not changed
- **No new dependency.** keytool and apksigner come with the JDK and SDK already used.
- **The audit (`docs/evidence/phase-12/2026-10-17/audit.txt`):**
  - npm (shipped packages): 0 vulnerabilities;
  - Android release runtime classpath: no issues;
  - `uuid@7.0.3` is flagged in the lockfile. It is pulled in only by `@capacitor/cli` → `xcode` (iOS project tooling on the PC) and is never in the app.
