# Phases 44–47 evidence (owner round 9: Word, PowerPoint and Excel files), 2026-10-27/28

Every Office file, picture, slide and sheet here is synthetic: built in code by `OfficeFixtures` and `OfficeSamples`. No customer's file was used. The owner's screenshots (a Word file shared from WhatsApp) were never copied anywhere.

## Device regression on the final build (`regression/`, after the review fixes)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits |
|---|---|---|---|---|
| API 35 (Medium_Tablet) | 111 passed, 1 failed (see below) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 24 (ps_api24_2gb) | 104 passed, 0 failed, 8 skipped (by design, as in earlier rounds) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 36 (ps_api36) | 112 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |

**The one failure on API 35:** `AccessibilityJourneyDeviceTest.j1` timed out "waiting for the share to open".
- The screen reader's own list at that moment shows the share had opened (Files received, 6 files).
- The test waits for the screen to differ from what was there before the share. A previous test can leave an identical screen.
- It passed in this round's pre-fix full run (109/109) and when rerun alone (2/2, `regression/a11y-journey-rerun-api35.xml`).
- Recorded as the test's order sensitivity. The test is unchanged.

The instrumentation includes the round's device tests on every level: OfficePdfDeviceTest 19, covering Word, PowerPoint, Excel and the review checks. This includes 20 full-size phone photos on the 2 GB API 24 image.

The pre-fix regression is kept in `regress-before-review-fixes/`: API 35 109/109, API 24 101 passed with 8 skipped.

## Round 9 on a device (API 35, final build: `smokes-api35/round9/`)

| Check | Result |
|---|---|
| A shared .docx → "Word file · 1 page", "Made from a Word file…", an A4 print file, the original kept as 0001.office | PASS |
| Print with WPS Office with no office app → "Install WPS Office from the Play Store to print this file." | PASS |
| A shared .pptx (two slides) → "PowerPoint file · 2 pages", two A4 sideways pages | PASS |
| A shared .xlsx → "Excel file · 1 page", upright A4 | PASS |
| .doc (old Word) and .odt → "This Word file prints from WPS Office." with the button, kind and format kept | PASS |
| A shared .txt → "Text message · 1 page" | PASS |

## Older smokes on API 35 (final build: `smokes-api35/`)
- **round8:** 10/10. **round7, round6, round5, round4, round3, place, adjust:** PASS.
- **privacy:** PASS (no customer data in the app's log; Recents shows a blank card).
- **card and rotate:** PASS after a fix to the scripts themselves.
  - Their first runs stopped at the very first screen read after the app's start: the dump found no window, and no older dump file existed (`*-first-run-ui-dump-failed.log`).
  - Their screen read now treats that as "not yet", as the round 8 and 9 smokes already do. No check changed.

## Stage APKs (each phase closed with its own build)

| Phase | APK | sha256 | Proof |
|---|---|---|---|
| 44 | 1.0.293-e1a0453 | `f6cf3ddaf1df155c64e5a9282d1b6070ef54b736fe97e0ffead29b0d07245f95` | `p44-smoke-api35/`, `p44-release-*` |
| 45 | 1.0.296-5aafba7 | `babdc92695aaa689b0c5cdb98ae99b0fff205f40b6463fdbe27af7b83e102478` | `p45-*` |
| 46 | 1.0.299-2581f28 | `fd387ee6cc2b69911ee3bad0695b49af28177d38bb889f382dbb72cac90bb80b` | `p46-*` |
| 47 | 1.0.302-2513e21 | `e0be14775b0bbd846942e8542cf2ec08b4bdac54ec09cc207977a08572901c1b` | `p47-*` |

## The review and its fixes (`review-fixes/`)
- `jvm-red-before-fixes.txt`: the 15 new tests failing before the fixes.
- `OfficePdfDeviceTest-api35-after-fixes.xml`: 19/19.
- `twenty-photos.txt`: a Word file of 20 phone photos made a 104,602 KB print file in 15.3 s before the fix, and 46,079 KB in 7.9 s after (API 35).

## Release (`release/`)
- **The APK:** `apk/PrintSaathi-1.0.305-959ed05.apk`, 1,548,132 bytes, versionCode 305.
  - sha256 `127810dc232c1873195b51d5744cb6284240b97291c49d9016c0c2cbd8dbf632`.
  - Signed with the pinned PrintSaathi key. The release checks pass: no INTERNET permission, both private providers not exported, every Office, OpenDocument, RTF, CSV and text type in the share sheet.
- **release-smoke and release-cards (API 35):** PASS.
- **The release build with Word, PowerPoint, text and Excel shares:** all as on the debug build, 0 PrintSaathi crashes (`final-release-office.json`). The crash log held one Google Play services crash, which belongs to the emulator image.
- **Cold start, first frame:** 1.0.286 against 1.0.305, 20 runs each, alternated. Medians 813 ms and 821 ms (+1 %, within run-to-run noise); means 853 ms and 829 ms (`first-frame-vs-1.0.286-alternating-20-each.json`).

## Browser suite and unit tests (`web/`)
- **Browser suite (e2e):** 1,926 passed, 24 skipped (as before), including office.spec 10.
- **Unit tests:** 586 passed, plus 96 script tests. Android JVM tests 437/437.
- **Start-up size:** JS 61,307 B of 61,440 B; CSS 7,242 B of 15,360 B.

## Not proven here
- WPS Office opening and printing a handed-over file: there is no WPS on the emulators.
- Real customer Word, PowerPoint and Excel files.
- The shop phone's speed with photo-heavy files.
- Paper from the shop's printer.

These are in USER-CHECKLIST §AF.
