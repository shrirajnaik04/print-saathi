# Phases 33–36 evidence (owner round 5), 2026-10-25

Every picture and file here is synthetic. No customer's file or photo, and no real ID card, was used. The owner's own screenshots (which showed a real card) were never copied anywhere.

## Device regression (`regression/`), build after the review fixes (2196fe1)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits |
|---|---|---|---|---|
| API 35 (Medium_Tablet) | 83 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |
| API 24 (ps_api24_2gb) | 75 passed, 0 failed, 8 skipped (6 from round 4, plus the 2 new zoom tests, which need Android 8 or newer by design) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 36 (ps_api36) | 83 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |

**An invalid first run of API 35 was discarded, not counted.** It started while the emulator that had just been stopped was still shutting down; its install log says "waiting for device", so every check ran on a device that was not ready (it reported 0 passed and 1 failed on the first test, and failed the render checks and share matrix too). It was deleted and API 35 was run again alone from a clean start, which gave the row above. A second attempt started during the first loop could not boot its emulator ("boot timeout") and was also discarded.

New in this round's instrumentation: `ZoomDeviceTest` (2 tests): a two-finger pinch on the app's screen leaves it at 100 %, and the same pinch does zoom a page that allows zoom (the control).

## Smokes on API 35 (final build)

| Smoke | Result | Folder |
|---|---|---|
| round5-smoke: 7 checks (Back from Android's print screen → PRINT enabled in about 1 s; no hint line; a finger slide leaves Page 1 and › goes to Page 2; Copy + the + mark + Paste = a copy of the same file; a card held and dragged prints elsewhere; Side by side prints in one row, both read from the print file by pdf.js; Delete all jobs empties Recent jobs and the jobs folder) | 7/7 PASS | `round5-smoke-api35/` |
| round4-smoke (now moving pages with ›) | 13/13 PASS | `round4-smoke-api35/` |
| round3-smoke | 4/4 PASS | `round3-smoke-api35/` |
| place-smoke | 8/8 PASS | `place-smoke-api35/` |
| adjust-smoke | all checks hold | `adjust-smoke-api35/` |
| rotate-smoke | turned upright | `rotate-smoke-api35/` |
| card-smoke (now through round 4's crop screens) | all checks hold | `card-smoke-api35/` |
| privacy | retention, cold retention, backups, logs and the release build PASS. Recents: look at the screenshots, as in round 4 | `privacy-api35/` |

Script problems found and fixed while writing round5-smoke (none was an app problem): a tool button inside the sideways-sliding tool row had to be scrolled into view; "Paste" matched the note "Paste goes to the + mark." as well as the button; the card flow has a crop screen per side; the card smoke and round 4's smoke were still written for an older flow.

## Release (`release/`)

- **The APK:** `apk/PrintSaathi-1.0.267-ad8ddee.apk`, 1,435,033 bytes, versionCode 267.
  - sha256 `64f094cf1ac91cc225fd1d2895fa27d88120147fac714d1c74059b45784cc134`.
  - Signed with the pinned PrintSaathi key, and the release checks pass.
  - It has no INTERNET permission, backups are refused (privacy: release PASS).
- **release-smoke, API 35:** PASS on the third run (`release-smoke-api35.json`): six photos → Ready → PRINT → Android's print screen, a PDF, a locked PDF unlocked, an update in place keeping the setting, and the cold daily cleanup.
  - **Attempt 1 failed** (`release-smoke-api35-attempt1-FAILED.*`): after the photos arrived, the script tapped "All on one page" and the screen stayed on "Files received". The same tap by hand on the same build went to Ready at once. The cause is **not proven** (a tap before the screen could take it is the likely reason). It did not happen again in the third run.
  - **Attempt 2 failed** (`...attempt2-FAILED-system-dialog.*`): the emulator image showed "Google Play services keeps stopping" over the app. PrintSaathi uses no Google Play services; the dialog was dismissed.
- **release-cards, API 35:** PASS (`release-cards-api35`, log beside it): Front of the card, Back of the card, 2 ID cards found, Real card size, Ready, and a sideways document turned upright.
- **Cold start, first frame (`am start -W`):** 1.0.252 against 1.0.267 on the API 35 emulator, 20 runs each, alternated. The median went from 909 ms to 848 ms (−6.7 %): no slowdown (`first-frame-vs-1.0.252-alternating-20-each.json`). Some of the older build's runs were slow (up to 1.9 s), which pulls its mean up; the medians are the fair comparison.

## Browser suite (Chromium, mocked engine)

- Full e2e after the review fixes: 1869 passed, 0 failed, 24 skipped (screenshot-only tests).
- `npm run verify`: 542 unit tests, lint and typecheck; `npm run android:test` (Android lint and JVM tests) passes.
- Startup JavaScript is 61,246 B gzip (budget 61,440 B: **194 B left**, tight); CSS is 6,994 B.

## What was not proven

- Real phone, real Brother printer and the owner's own use: `docs/spikes/USER-CHECKLIST.md` §AB.
- What the owner saw as "zoom in the whole app" (not reproduced, AB4).
- Print screens from other makers (Samsung, MIUI) with "Back at once" (AB7).
