# Phase 16 — closure report (medium size, card source, photos as they are, logo and splash, open source)

**Spec:** `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`, Parts 1 and 5 (the owner's phone
test of 2026-10-23).
**Plan:** `docs/superpowers/plans/2026-10-23-phase-16-18-adjust-passport-medium.md`, Tasks 1–4c and 12.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-23.md` rows 2, 3, 9–13.
**Commits:**
- 30051ae medium size, side space, Continue under the tiles, lazy screens;
- 40a90c4 card source;
- 6d34d7f picked photos as they are;
- 42872d3 logo and splash;
- 38da67f open-source wording;
- db08dc2 splash hand-over (device finding);
- ac07736 docs.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to be seen on the owner's curved-screen phone and
by the shopkeeper: USER-CHECKLIST §V.

## What Phase 16 delivers
- **Medium size:** about 15 % smaller everywhere. Body 17 px, titles 24 px, buttons 18 px with a 56 px minimum height,
  tiles 104 px. A **24 px side space**, because curved phone sides hid the card borders.
- **Home:** the four job tiles, then **Continue the last job** under them.
- **Aadhaar & ID cards** asks "Where is the card?":
  - **Photos of the card** opens Android's photo picker, at most 2 photos;
  - **e-Aadhaar PDF or file** opens the file manager.
- **Photos picked from the phone are shown as they are.** The app never turns them; the camera's own way-up note is
  obeyed, as in the gallery. Shared photos still get the Phase 15 suggestion with Undo.
- **The PS printer logo (brand v3) everywhere:**
  - the adaptive launcher icon (vector) and the themed (one-colour) icon;
  - square and round icons for Android 7;
  - the system splash, the favicon, and the mark beside the name on Home (hidden from screen readers).
- **A short splash:** the phone's splash shows the printer; the app's first screen then feeds a sheet in, prints the
  page and shows the name. It takes about 0.75 s, uses CSS transform and opacity only, and plays nothing with "Remove
  animations" on.
- **No white or empty screen at start** (device finding, 2026-10-24). The page is see-through over the same splash
  picture until its own splash is gone, then solid again.
- **Screens off the start path load when first opened** (lazy), so startup JS stays within budget.
- **Open source:**
  - neutral wording everywhere ("the shopkeeper", "the owner"; on screen "ask the person who set up this app");
  - a guard test keeps family words and personal names out;
  - preflight checks the checkout it lives in.

## Acceptance (spec Parts 1 and 5)

| Criterion | Result | Evidence |
|---|---|---|
| Layout and accessibility matrix (320–480 px, 800×360, text 100–200 %) green with the medium sizes and the 20 px side rule | PASS | Full e2e 1529 passed / 0 failed after the review fixes (`docs/evidence/phase-16-19/2026-10-24/regression/`); the side rule is in `shell.spec.ts` |
| Home at 360 px shows all four job tiles and the Continue card under them | PASS | e2e "Continue the last job … under the tiles"; device `phase-18/2026-10-24/device-smoke-api35/01-home-logo-medium-size.png` |
| The card source screen and both pickers on Android 15 | PASS | adjust-smoke `galleryOpensThePhotoPicker` (PhotoPickerActivity) and `fileAnswerOpensTheFileManager` (DocumentsUI) |
| A picked job is never turned (unit + e2e); a shared one still is | PASS | decide.test, job.test, e2e picked vs shared; device `pickedPhotoNeverTurnedByTheApp` |
| Camera-turned JPEGs show upright exactly once on the device | PASS | Device: a gallery photo stored sideways (EXIF 6) prints as a 190 × 285 mm portrait (`pickedSidewaysPhotoPrintsUpright`); `EngineOrientationTest.allEightOrientationsAreUprightOnBothPaths` and `PlanRenderDeviceTest` (camera-turned quadrants) in the device regression |
| Launcher, round and themed icons at every density; splash attributes; no Capacitor sample art | PASS | `scripts/brand/brand.test.mjs` 6 |
| e2e: the splash shows and is gone within 1.5 s with Home usable; none with reduced motion; the phone is told when it is gone | PASS | shell.spec splash tests |
| Device: icon and splash on Android 15 and Android 7 | PASS | `phase-16/2026-10-23/brand/device-api35/`, `phase-16/2026-10-24/` (API 24 icon and launch window; the old web engine on that image shows the update screen by design) |
| Cold start before and after within 10 % (`am start -W`) | PASS, narrowly: 780 → 852 ms median, +9.2 % (20 alternating cold starts each, release APKs) | `docs/evidence/phase-16-19/2026-10-24/release/cold-start/` |
| Startup JS within 60 KB | PASS: 56.6 KB gzip (CSS 5.4 KB) | `regression/SUMMARY.md` |

## Device finding and fix
**Splash hand-over (API 35, 2026-10-24).** Between Android's splash and the web splash the window and the WebView were
white for about a second. Fixed in db08dc2: a see-through page over the splash picture, made solid again by
`PrintEngine.splashGone()`.

Two alternatives were measured on video and rejected:
- holding Android's splash: it waited longer and still left an empty gap;
- a picture as the window background: Capacitor's SystemBars painted it black.

Evidence: `phase-16/2026-10-24/splash-handover-api35/`. What is left is Android 12+'s own exit fade: the printer dims for
about 0.2 s, in the same place.

## Whole-branch review (fresh reviewer, Phases 16–19 together)
The review ran on Opus over the range 5664b1d..abdd0a8. It found 0 Critical, 3 Important and 15 Minor. For Phase 16:
- **Open source:** older evidence screenshots, taken before the wording sweep, may show old on-screen text. Ruling:
  the public single commit carries only evidence images added from 38da67f on; the older ones stay in the private
  history.
- **Not proven:** the splash hand-over on Android 7–11 (deferred minor). Every old emulator image has a web engine
  below 92 and shows the update screen instead.
- **Two challenged rulings:**
  - Task 6, "tests rewritten, not loosened": wrong. Fixed in Phase 17.
  - Task 7b, documents keep their own page direction: reversed in Phase 18.

The complete list, with every ruling and deferred minor, is in the plan's ledger and summarised in the final report.

## Final regression (Phases 16–19 together, after the review fixes; `docs/evidence/phase-16-19/2026-10-24/regression/SUMMARY.md`)

**Device (debug build of 5c6390a):**

| Level | Instrumentation | Share matrix | pdf.js render check | Privacy hits |
|---|---|---|---|---|
| API 24, 2 GB | 70 passed, 0 failed, 6 skipped (by design on that image) | 15/15 | PASS | 0 |
| API 35 | 76 passed, 0 failed | 15/15 | PASS | 0 |
| API 36, 2.0× text | 76 passed, 0 failed | 15/15 | PASS | 0 |

- **Render check:** the first pass failed on all three levels. The expectation the device test hands to pdf.js still
  drew the camera-turned photo without its turn. The expectation was fixed, and that test and the check were re-run.
- **Crash buffers:** no crash in the app process. The engine crashes are the hostile-input tests' contained crashes.
- **Before the fixes:** a run on the code before the review fixes is kept in `regression/run1-before-review-fixes/`.
  It found the PlanRenderDeviceTest expectation, a transient engine-rebind timing failure on API 24 (not repeated), and
  an Android System UI hang on API 36 that blocked both screen-reader journeys (they passed in the final run).

**PC:**
- full e2e 1529 passed, 0 failed (24 screenshot tests skipped by design);
- vitest 410, script tests 92;
- lint with 0 errors, typecheck clean;
- Android lint and JVM tests in the pre-commit hook;
- startup JS 56.6 KB gzip of 60 KB.

## Coverage statement
**Proven:**
- the medium sizes across the layout and accessibility matrix (320–480 px, landscape, text 100–200 %);
- the card source screen and both pickers on Android 15;
- picked photos never turned (unit, e2e, device);
- the icon and splash on Android 15, and the icon and launch window on Android 7;
- the splash hand-over on video (Android 15);
- the open-source wording guard.

**Not proven:**
- the look on the owner's curved-screen phone;
- the themed (one-colour) icon on a device with themed icons on;
- the splash hand-over on Android 7–11 (no old emulator image can run the web app);
- how the shopkeeper finds the new sizes in daily use.

## Release (`apk/PrintSaathi-1.0.203-1353ebf.apk`, `docs/evidence/phase-16-19/2026-10-24/release/`)

**Checks:**
- 1.4 MB, signed with the pinned PrintSaathi key, 5 info log messages stripped;
- binary-manifest check: no INTERNET, not debuggable, no backup or transfer, only MainActivity exported, the engine
  isolated;
- on API 35:
  - release-smoke PASS: share → Ready → PRINT → Android's print screen, PDF → Ready, no info or debug log lines, no
    crash;
  - release-cards PASS;
  - privacy PASS (on 1.0.201, the same native code): retention, retention in a cold process, backup refused
    (debug and release), the release manifest, app log lines free of paths and names, and the Recents card stored
    blank.

**Cold start** (`release/cold-start/README.md`):
- **First frame:** +9.2 % (inside the spec's 10 %).
- **Home:** traced in the page, Home is ready about 0.28 s later than in 1.0.176 on the software-rendered emulator
  (2.27 s against 1.99 s after launch), while the printer shows about 0.23 s sooner than the old blank screen ended.
  Without the web splash the difference is noise (0.08 s).
- **Fixed during measurement:** the splash first waited for its stalled animation, which made Home 1.4 s later on
  video. It now goes when Home is up.
- **Not proven:** the cost on a real phone with a GPU (USER-CHECKLIST §V2).

**Build finding:** a release build after the icon change failed to link `drawable/ic_launcher_foreground`, because
stale release intermediates still held the old PNG foregrounds. A Gradle clean fixed it; fresh clones are not affected.
