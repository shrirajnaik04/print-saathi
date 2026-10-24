# Phase 2 final device regression — build f536f90 (2026-10-03)

| Level | Instrumentation (passed / failed / skipped) | Hostile share matrix | pdf.js render check | Privacy hits in app log lines |
|---|---|---|---|---|
| API 24 (2 GB) | 26 / 1 / 4 | 15/15 | PASS | 0 |
| API 28 (2 GB) | 26 / 1 / 4 | 15/15 | PASS | 0 |
| API 30 | 26 / 1 / 4 | 15/15 | PASS | 1 → proven not the app's: `UriGrantsManagerService` (system) logging the matrix's own hostile test URI `content://in.printsaathi.app.fileprovider/private/jobs/x` (`privacy-hits-api30.txt`); `regress.sh` now excludes that system service |
| API 35 | 30 / 1 / 0 | 15/15 | PASS | 0 |
| API 36 | 30 / 1 / 0 | 15/15 | PASS | 0 |

**The one failure on every level** was a test defect, not an app defect. `EngineHostileInputTest#aSmallProgressiveJpegDecodes` read its fixture from the app's assets instead of the test APK's (`FileNotFoundException`). It was fixed, then **focused re-test** of the whole class on API 24 and API 35: 7/7 each (`focused-retest-hostile-api24.txt`, `-api35.txt`). That covers the truncated JPEG being refused and the small progressive photo decoding.

**Skips (stated):**
- **HEIC:** 2 HEIC tests skip below Android 10/12 by design (ADR-003 pending).
- **Wrong-password PDF:** 1 PDF test skips where there is no native unlock tier.
- **Renderer-crash test:** skips on API 24 (no renderer callback before API 26). It also skips on API 28/30, because those images' WebView is older than the app accepts and the app shows "update WebView" instead. It runs and passes on API 35/36.
