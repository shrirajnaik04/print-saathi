# Phases 41–43 evidence (owner round 8), 2026-10-27

Every picture, page, photo and message here is synthetic. No customer's file, no real document and no real ID card was used. The owner's own screenshots (one showed a real credit-society document) were never copied anywhere.

## Device regression (`regression/`), build after the review fixes (6c02541)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits |
|---|---|---|---|---|
| API 35 (Medium_Tablet) | 93 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |
| API 24 (ps_api24_2gb) | 85 passed, 0 failed, 8 skipped (by design, as in earlier rounds) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 36 (ps_api36) | 93 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |

The instrumentation now includes round 8's device tests on every level:
- PageDetectDeviceTest 2;
- ScanRenderDeviceTest 2;
- TextPdfDeviceTest 6.

All pass, API 24 included.

## Round 8 on a device (API 35)

| Run | Result | Folder |
|---|---|---|
| **round8-smoke**, at a phone's screen size, with the emulator's own camera app. Checks:<br>• no camera permission;<br>• an 80-line WhatsApp text (English, Devanagari, marks) → "Text message · 2 pages" → 2 A4 pages in the print file;<br>• an empty message shared twice says so twice (review I5);<br>• Scan pages → the real camera app → Page 1 with 4 corner circles and 4 side bars → "Couldn't find the page's edges" (the emulator camera sees a room) → Scanned pages → Finish → 1 page in Clean colour;<br>• Back in the camera changes nothing;<br>• the app killed while the camera was open → the photo kept and opened at the next start;<br>• six photos on one page ≥ 10 mm apart (smallest 10.00 mm) | 10/10 PASS | `round8-smoke-api35/` |
| **I5 before the fix**, the same smoke on the unfixed build: the second empty share showed nothing | RED (kept) | `review-fixes/i5-red-before-fix-round8-smoke.json` |
| **Device tests** with the fake camera's known synthetic page (slanted on a table, with a red stamp):<br>• found within 3 % of its corners, none on a bare table;<br>• printed straightened by its corners (page-white where the table was, the stamp where it is on the page);<br>• in Clean colour the paper ≥ 245 and the stamp red;<br>• the print-path tests fail when the corners are left out and Original replaces Clean (mutation check) | 10/10 PASS | `device-tests-api35/` (see NOTES.md) |

## Older smokes on API 35 (final build)

| Smoke | Result |
|---|---|
| round7, round6, round5, round4, round3 | all PASS |
| place, adjust, card, rotate | all PASS |
| privacy (log, Recents) | PASS |

**Problems the smokes found in themselves, not in the app:**
- **place-smoke** looked for photo 3 at 104.2 mm from the top: its place with 3 mm gaps. With the owner's 10 mm gap it is at 106.6 mm. The smoke now finds photo 3 by its row.
- **round8-smoke's first runs:**
  - The test sender's fake camera cannot answer on Android 11+. Only a pre-installed camera app may answer the app's camera request, and the app then said "This phone has no camera app" (correct for that case). The smoke now drives the emulator's own camera app on API 30+.
  - A first API 24 run stopped at the app's own "needs an update" screen: that image's WebView is too old, the known Phase 10 limit.
  - `pidof` failing once the app was killed (wanted) stopped the script; and Back after a share that showed nothing minimised the app. Both are handled now.

## Release (`release/`)
- **The APK:** `apk/PrintSaathi-1.0.286-6c02541.apk`, 1,463,365 bytes, versionCode 286.
  - sha256 `9e617122b666a7e5e055d7b67f035fbfcc370ca38008d56246e0f24216b0b4b2`.
  - Signed with the pinned PrintSaathi key; the release checks pass (no INTERNET permission; the camera provider not exported).
- **release-smoke and release-cards, API 35:** PASS on the first run.
- **Cold start, first frame:** 1.0.274 against 1.0.286, 20 runs each, alternated. The medians were 766 ms and 782 ms (+2.1 %, within run-to-run noise; the mean was 949 ms against 792 ms) (`first-frame-vs-1.0.274-alternating-20-each.json`).

## Browser suite and unit tests
- **e2e:** 1916 passed and 24 skipped (screenshot-only tests).
  - It includes text.spec 7 and scan.spec 15.
  - One older expectation changed for the owner's new style: Print style shows 7 examples (Clean colour added).
- **verify:** 582 unit tests, lint and typecheck.
- **Android JVM:** all tests pass, run by the commit hook (round 8 adds WhatsAppMarks 8, TextIntake 5, PageDetect 5, CleanColour 6, CaptureStore 7, CameraGate 2, JobMerge +1).
- **Start-up JavaScript:** 61,162 B gzip of the 61,440 B budget. The scanning screens and their words load on demand.

## What was not proven
- **Real paper through a real phone camera,** WhatsApp's own Share of a text message, and the 1 cm gap measured on paper: `docs/spikes/USER-CHECKLIST.md` §AE.
- **A found page through the app's screens on a device** (the emulator camera sees no paper). It is proven through the engine's finder and the real print path instead.
- **Emoji in a text PDF on a device.**
- **Time of Clean colour on a 2 GB phone.** It runs within memory at full print size on the 2 GB API 24 emulator (ScanRenderDeviceTest: an A4 page at 300 dpi, passed in the regression), but it was not timed.
