# Phases 39–40 evidence (owner round 7), 2026-10-25

Every picture and file here is synthetic. No customer's file or photo, and no real ID card, was used. The owner's own screenshots, one of which showed a real card, were never copied anywhere.

## Device regression (`regression/`), build after the review fixes (010c013)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits |
|---|---|---|---|---|
| API 35 (Medium_Tablet) | 83 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |
| API 24 (ps_api24_2gb) | 75 passed, 0 failed, 8 skipped (by design, as in round 6) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 36 (ps_api36) | 83 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |

**API 24, first run (kept in `regression/first-api24-run/`):** 74 passed and 1 failed. `EngineFixtureMatrixTest#decodeEveryFixtureAtScreenAndPrintSize` failed with "engine not available": the isolated engine did not start in time on the 2 GB Android 7 emulator. This round did not touch the engine. The whole API 24 regression was run again on the same build and passed 75/0. The engine's start-up on a slow, low-memory phone is listed as a risk.

## Smokes on API 35 (final build)

| Smoke | Result | Folder |
|---|---|---|
| round7-smoke, run at a phone's screen size (1080 × 2340, density 420):<br>• front and back 60.0 mm apart, front at 20 mm, read from the print file;<br>• the side bars of a photo at the page's top-left on its edges, touch areas 56 px;<br>• the line 2 × 28 px and blinking;<br>• the pasted photo's top-left within 1 mm of the line, read from the print file | 3/3 PASS | `round7-smoke-api35/` |
| round6-smoke | 2/2 PASS | `round6-smoke-api35/` |
| round5-smoke (now with the line's note, and Paste brought into view) | 7/7 PASS | `round5-smoke-api35/` |
| round4-smoke (photos now start with Cut and Copy) | 13/13 PASS | `round4-smoke-api35/` |
| round3-smoke, place-smoke, adjust-smoke, card-smoke, rotate-smoke, privacy | all PASS | their folders |

**Problems the smokes found in themselves, not in the app:**
- **round7-smoke's first runs:**
  - with six photos at a phone's size, no empty spot was left where a copy fits;
  - a tap meant for an empty spot landed inside a side bar's touch area, or chose another photo;
  - **Paste**, now past the five tools on screen, was not brought into view.
- **The round 4 and 5 smokes** still expected the old tool order and the "+ mark" note; both were updated for the owner's change.

## Release (`release/`)
- **The APK:** `apk/PrintSaathi-1.0.274-010c013.apk`, 1,439,339 bytes, versionCode 274.
  - sha256 `9f62246b5b661681ead143f96d1e3ae81d01290e5eaf2bf0a901cd571e1d4747`.
  - Signed with the pinned PrintSaathi key; the release checks pass; no INTERNET permission.
- **release-smoke and release-cards, API 35:** PASS on the first run.
- **Cold start, first frame:** 1.0.271 against 1.0.274, 20 runs each, alternated. The median was 855 ms for both: no slowdown (`first-frame-vs-1.0.271-alternating-20-each.json`).

## Browser suite
- **e2e:** 1893 passed and 24 skipped (screenshot-only tests). One test failed once in the full run (place.spec review I5: a tap on Ready's page as the print file arrives). That test now waits and retries the tap, and passes 8 out of 8.
- **verify:** 566 unit tests, lint and typecheck.
- **Start-up JavaScript:** 59,217 B gzip of the 61,440 B budget.

## What was not proven
- Real phone, real Brother printer and the owner's own use: `docs/spikes/USER-CHECKLIST.md` §AD.
- The blinking line's battery cost on a phone.
