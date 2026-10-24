# Phases 29–32 evidence (owner round 4), 2026-10-25

Every picture and file here is synthetic. No customer's file or photo, and no real ID card, was used.

## Device regression (`regression/`), build after the review fixes (8608a38)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits | Crash buffer |
|---|---|---|---|---|---|
| API 35 (Medium_Tablet) | 81 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 | 1 WebView renderer crash, caused on purpose by `AppSafetyDeviceTest`; round 3 had the same |
| API 24 (ps_api24_2gb) | 75 passed, 0 failed, 6 skipped (TalkBack journeys, HEIC, PDF unlock tier, renderer recreation: none of them exist on Android 7) | 15/15 PASS | 3/3 exit 0 | 0 | 16 engine-process crashes from the crash-containment tests; round 3 had the same |
| API 36 (ps_api36) | 81 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 | 1 WebView renderer crash (on purpose) and 2 engine-process crashes (containment tests); round 3 had the same |

## Smokes on API 35

| Smoke | Result | Folder |
|---|---|---|
| round4-smoke: 13 checks (Home, both questions, crop screen for each side, Change photo, a standing card at 54 × 85.6 mm from the print file, the toggle by the title, glossy reminder, compact tools, 10 px peek, a real finger swipe moving one page, 200 % zoom exactly 2×, a finger panning the zoomed page) | 13/13 PASS | `round4-smoke-api35/` |
| round3-smoke (now through the crop screens) | 4/4 PASS | `round3-smoke-api35/` |
| place-smoke | 8/8 PASS | `place-smoke-api35/` |
| adjust-smoke (now answering Leave) | all checks hold | `adjust-smoke-api35/` |
| rotate-smoke | turned upright | `rotate-smoke-api35/` |
| privacy | 5 PASS. Recents: the stored thumbnail is blank; the live view is Android's own animation out of the running app | `privacy-api35/` |

The first round4-smoke run found a real problem: one quick flick slid three pages. It was fixed (8608a38, test RED first) and the smoke then passed. Two other failures in that first run were the script's own: a prefix tap hit the question's title, and a swipe aimed at a tablet's tool column. Both were fixed in the script.

## Release (`release/`)

- **The APK:** `apk/PrintSaathi-1.0.252-c9b0774.apk`, 1,431,524 bytes, versionCode 252.
  - sha256 `c0f52ff23ad45b7d74b505b9bdd59b4333b65424a2ade9e33f1603ed9f0d940e`.
  - Signed with the pinned PrintSaathi key, and the release checks pass.
  - It has no INTERNET permission; the only permission is AndroidX's own receiver guard.
- **release-smoke, API 35:** PASS (`release-smoke-api35.json`).
  - It shares a file, goes through Ready and PRINT to Android's print screen, and opens a PDF on Ready.
  - It found no debug or info log lines and no crash.
  - The script now answers "Leave this job?" with Leave.
- **release-cards, API 35:** PASS (`release-cards-api35/`). It shares two card photos into the release build: Front of the card, Back of the card, 2 ID cards found, Real card size, Ready, and a sideways document turned upright.
- **Cold start, first frame (`am start -W`):** 1.0.239 against 1.0.252 on the API 35 emulator, 20 runs each, alternated. The median went from 741 ms to 726 ms (−2 %, within noise): no slowdown (`first-frame-vs-1.0.239-alternating-20-each.json`).

## Browser suite (Chromium, mocked engine)

- Full e2e after the review fixes: 1835 passed, 0 failed, 24 skipped (screenshot-only tests).
- `npm run verify`: 522 unit tests, 95 script tests, lint and typecheck.
- Startup JavaScript is 59,839 B gzip (budget 61,440 B); CSS is 6,922 B.
