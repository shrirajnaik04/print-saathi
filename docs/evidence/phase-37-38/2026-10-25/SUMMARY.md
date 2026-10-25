# Phases 37–38 evidence (owner round 6), 2026-10-25

Every picture and file here is synthetic. No customer's file or photo, and no real ID card, was used.

## Device regression (`regression/`), build after the review fixes (9b680ad)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits |
|---|---|---|---|---|
| API 35 (Medium_Tablet) | 83 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |
| API 24 (ps_api24_2gb) | 75 passed, 0 failed, 8 skipped (6 from round 4, plus the 2 zoom tests of round 5, which need Android 8 or newer by design) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 36 (ps_api36) | 83 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |

Each level was run alone, one after the other, after checking that the previous emulator had stopped (round 5's first API 35 run was invalid because it started while one was still shutting down).

## Smokes on API 35 (final build)

| Smoke | Result | Folder |
|---|---|---|
| round6-smoke: 2 checks (a photo dragged, then Undo puts back the automatic layout exactly and Redo the drag, each read from the print file by pdf.js; with the dragged photo over another, Send to back draws it first and Bring to front last) | 2/2 PASS | `round6-smoke-api35/` |
| round5-smoke | 7/7 PASS | `round5-smoke-api35/` |
| round4-smoke | 13/13 PASS | `round4-smoke-api35/` |
| round3-smoke | 4/4 PASS | `round3-smoke-api35/` |
| place-smoke | 8/8 PASS | `place-smoke-api35/` |
| adjust-smoke | all checks hold | `adjust-smoke-api35/` |
| rotate-smoke | turned upright | `rotate-smoke-api35/` |
| card-smoke | all checks hold | `card-smoke-api35/` |
| privacy | retention, cold retention, backups, logs and the release build PASS. Recents: look at the screenshots, as in earlier rounds | `privacy-api35/` |

The first round6-smoke run failed because the script chose photo 1 after reopening Adjust, not the dragged photo 2 (the app was right: Send to back was greyed out for a photo that covers nothing). The script was fixed.

The first round 6 build had a problem the browser tests could not see: on the phone the Redo arrow looked the same as Undo's (seen in that run's screenshot, which was replaced when the smoke was rerun on the final build). The page's own rules block the inline style that flipped it. The reviewer named the cause; it was fixed with a page style and is now tested by the icon's computed transform (the test failed first).

## Release (`release/`)

- **The APK:** `apk/PrintSaathi-1.0.271-9b680ad.apk`, 1,436,745 bytes, versionCode 271.
  - sha256 `e2f22f2f67233b3bf1c507ee8c3e55b2c580559837db1e6fefff8844f1e0d157`.
  - Signed with the pinned PrintSaathi key, and the release checks pass. No INTERNET permission.
- **release-smoke, API 35:** PASS on the first run (`release-smoke-api35.json`): six photos → Ready → PRINT → Android's print screen, a PDF, a locked PDF unlocked, an update in place keeping the setting, the cold daily cleanup.
- **release-cards, API 35:** PASS (`release-cards-api35`).
- **Cold start, first frame (`am start -W`):** 1.0.267 against 1.0.271 on the API 35 emulator, 20 runs each, alternated. The median went from 1,021 ms to 934 ms (−8.5 %): no slowdown (`first-frame-vs-1.0.267-alternating-20-each.json`). The emulator's run-to-run noise is about this size.

## Browser suite (Chromium, mocked engine)

- Full e2e after the review fixes: 1887 passed, 0 failed, 24 skipped (screenshot-only tests).
- `npm run verify`: 565 unit tests, lint and typecheck.
- Startup JavaScript is 61,430 B gzip (budget 61,440 B: **10 B left**, a risk); CSS is about 7 KB.

## What was not proven

- Real phone, real Brother printer and the owner's own use: `docs/spikes/USER-CHECKLIST.md` §AC.
- A save that really lost a race with another change (the guard is proven in the reducer).
- Undo of Add photos on a phone, and the cost of Undo on a 100-photo job on a 2 GB phone.
