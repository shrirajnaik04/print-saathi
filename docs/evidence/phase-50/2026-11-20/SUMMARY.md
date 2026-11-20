# Phase 50 evidence (owner round 12), 2026-11-20/21

Every photo, page and PDF here is synthetic (the test sender and the tests build them). No customer's file was used; the owner's screenshots were used only to understand what they meant and were not copied.

## Final build, API 35 smokes (`final-smokes-api35/`)
round12, round11, place, adjust, card, rotate, round4, round5, round6, round7, round8, round9, round10: PASS. **round3** failed in that run on its own measure (its photo lookup scrolled the page, which hid the title its offsets use; a probe showed the knob works on the device) and passes after the script fix (`round3-rerun/`, 4/4). Earlier runs of this round (`smokes-api35/`) found and led to fixes of: the turn knob losing its touch area (reverted, 7a7a86b), smoke scripts matching "Next point" for "Next", and round5's paste mark.
**round12-smoke (8 checks):** the corners screen asks photo 1 to 6 in turn and the last says Done; the print file has 6 pages with every photo centred (pdf.js); the screen pictures are made at 1536 px.

## Regression (`regression/`)
| Level | Instrumentation | Share matrix | Render checks | Crash log | Privacy hits |
|---|---|---|---|---|---|
| API 24 | 108 passed, 0 failed, 8 skipped (by design) | 15/15 | 3/3 | none | 0 |
| API 35 | 114 passed, 2 failed (ZoomDeviceTest pinch, AppSafetyDeviceTest dead renderer): both classes pass alone (2/2 each) | 15/15 | 3/3 | none | 0 |
| API 36 (read-only copy: the owner's emulator uses the AVD) | 113 passed, 3 failed ("System UI isn't responding" in two journey tests, and a pinch check): the classes pass alone | 15/15 | 3/3 | none | 0 |

## Release (`release/`)
`apk/PrintSaathi-1.0.321-2b68af8.apk`, 1.5 MB, sha256 `b6ab269fee8d7b70c2975ba1c993edc49a6351378cdf26b4cac5ac88e19ae8cf`, signed with the pinned key. release-smoke, release-cards, release-round11, release-round12 (the corners chain on the shrunk build), privacy (on 1.0.321): PASS.

## Not proven here
Real photographed documents (the paper finder and its 55 % paper threshold), real faces on vertical cards, the owner's stretched-card photo, ink savings and sharpness on paper, memory on a low-memory phone with many 1536 px pictures. These are in USER-CHECKLIST §AI.
