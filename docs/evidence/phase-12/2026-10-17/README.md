# Phase 12 evidence (release hardening) — 2026-10-17

## The release APK
- **Built and checked by `npm run android:release`:**
  - R8 shrinks the code and resources;
  - info and debug logs are stripped;
  - it is signed with the PrintSaathi release key (made once by `scripts/release-key.mjs`, kept outside the repo in the user folder);
  - it passes the manifest check: no INTERNET, not debuggable, no backup.
- **`scripts/check-release.mjs`:** signer `CN=PrintSaathi, O=PrintSaathi shop`; size 1.5 MB (budget 10 MB).

## The release build on emulators
- **`release-smoke-api35.json` (Android 15), PASS:**
  1. six shared photos → All on one page → Ready drew the real page (`release-ready-pdf-api35.png` shows the later PDF step) → PRINT → Android's print screen;
  2. back → the result screen;
  3. a shared PDF → Ready.

  No PrintSaathi info or debug line in the log: the debug build logs "intake done" for every share, the release build logged none for two shares. No app crash.
- **`release-smoke-api24.json` (Android 7), PASS:** the release build starts on its native "PrintSaathi needs an update on this phone" screen (`release-start-api24.png`): that image's WebView is 69, and the app needs 92+. No crash, no info or debug lines.

## Not proven here
- The install on the shopkeeper's phone, and the two-week trial: USER-CHECKLIST §R.
