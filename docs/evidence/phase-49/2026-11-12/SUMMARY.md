# Phase 49 evidence (owner round 11), 2026-11-12/13

Every photo, page and PDF here is synthetic, built in code by the test sender or the tests themselves. No customer's file was used. The owner's screenshots were used only to understand what they meant and were not copied anywhere.

## Device regression on the final build (`regression/`)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | PrintSaathi crash log | App log privacy hits |
|---|---|---|---|---|---|
| API 35 (Medium_Tablet) | 116 passed, 0 failed, 0 skipped | 15/15 PASS | 3/3 exit 0 | none | 0 |
| API 24 (ps_api24_2gb) | 108 passed, 0 failed, 8 skipped (by design, as in earlier rounds) | 15/15 PASS | 3/3 exit 0 | none | 0 |
| API 36 (ps_api36, a read-only copy: the owner's emulator was using the AVD) | 116 passed, 0 failed, 0 skipped | 15/15 PASS | 3/3 exit 0 | none | 0 |

The 3 new tests of this round are `PassportQualityDeviceTest` (113 → 116). The first API 36 attempt stopped at boot ("the same AVD is already running": the owner's emulator); the run above is the second, with `EMU_EXTRA=-read-only` (see `regression/summary.txt`).

## Passport photos as they are, on the real engine (`passport-quality/`)
A sheet of 12 passport photos from a 2400 × 3200 source: one 797 × 1063 image (600 dpi of 35 × 45 mm), 329,317 bytes, made in 1,318 ms; at 300 dpi (before) 399 × 532, 16,941 bytes, 274 ms. 30 photos: one image, 331,289 bytes, 1,524 ms. A 600 × 800 source keeps its own pixels (before: shrunk to 399 × 532). The printer's own speed was not measured.

## Round 11 on a device (API 35, final build: `smokes-api35/`)
**round11-smoke 8/8 PASS** (`round11-rerun/`): Passport photos before Photos on Home; the page list offers only a new page for six photos on one page; the note "Photo 1 is now on page 2."; the print file has two pages (five photos, then the moved photo alone at the place it had, read back by pdf.js); then the list offers Page 1 only (no new page); back to one page with six photos; no crash.
The first run of it failed because the script read the print file while its folder changed (the file read is now retried); the second run passed.

**Older smokes: all PASS** on the same final build (adjust, card, rotate, round3, round4, round5, round6, round8, round9, round10, and place and round7 after their Welcome-tour handling was made to follow the screen: on a host that was fully busy with other projects, a fixed count of taps missed). `place-smoke` also needed to wait for the file manager's list to load. **privacy** ran last and installed the previous round's release APK (the script uses `android/app/build/outputs/apk/release`, which was still 1.0.310 then); it is repeated on this round's release APK below.

## Release (`release/`)
- **The APK:** `apk/PrintSaathi-1.0.316-9e699ac.apk`, 1.5 MB, versionCode 316, sha256 `2f2fc080fd739b37ffe5838717e7ba33f30c78605c9e44581c28e9126d4014cd`. Signed with the pinned PrintSaathi key; the release checks pass (no INTERNET permission, private providers not exported, every share type, log lines stripped).
- **release-smoke, release-cards, privacy (on 1.0.316), release-round11 (API 35): all PASS.** `release-round11` drives the shrunk, signed build by screen only: Home order, six photos → Adjust → Move to page → a new page → the note → Ready says 2 pages; screenshots show the L corner, the turn knob and the page list.

## Browser suite and unit tests (`web/`)
- **Browser suite:** 1,952 passed, 24 skipped (as before), 0 failed. Earlier runs this round had 2–4 load-related failures in `shell.spec.ts` that also occur on the previous commit (see `docs/qa/phase-49-rulings.md`) and one race in this round's own Escape test (fixed; 120/120 over 10 repeats at 8 workers).
- **Unit tests:** 649 passed (76 files), plus 96 script tests; lint clean. **Android JVM tests:** 443 passed, 0 failed (440 + 3).
- **Start-up size:** JS 47,544 B of 61,440 B; CSS 7,605 B of 15,360 B.

## Not proven here
- Paper from the shop's printer: how passport sheets look and how long they take; the printer's own photo mode.
- TalkBack reading of the page list; the handles under a thumb on the owner's phone.
- A Chrome 92 WebView: no image here has one (API 24–29 images' WebView is below the app's minimum, a known limit).

These are in USER-CHECKLIST §AH.
