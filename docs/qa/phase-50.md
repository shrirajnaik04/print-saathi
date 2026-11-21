# Phase 50: closure report (round 12: papers cut and saving ink, sharper pictures, centred pages, corners first, standing ID cards)

**Spec:** `docs/superpowers/specs/2026-11-20-round-12-documents-ink-crop-first-design.md`. **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 72–76. **Rulings and findings:** `docs/qa/phase-50-rulings.md`. **Evidence:** `docs/evidence/phase-50/2026-11-20/` (SUMMARY.md lists every run).
**Commits:** 3bb008d, ad3415e (review fixes), 7a7a86b (turn knob), 2b68af8 (device evidence), 05cf257 (follow-up: the owner's Aadhaar back, see phase-50-rulings.md). **Release APK:** 1.0.323 (05cf257), `apk/PrintSaathi-1.0.323-05cf257.apk`, 1.5 MB, sha256 `aea9c5166b1f4ed6c13aa2ffaacfff5af0463f30c0ca178724925026d00c8abf` (release-cards smoke on API 35 passed: `evidence/phase-50/2026-11-21/rim-followup/`). Before the follow-up: 1.0.321 (2b68af8), sha256 `b6ab269f…e8cf`.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the shop printer and the owner's phone: USER-CHECKLIST §AI.

## What Phase 50 delivers
1. **One on each page is centred** (it was top-left); a photo made Smaller keeps its middle.
2. **Corners first.** After One on each page, the scanner-style corners screen opens for each photo in turn ("Photo 1 of 6", corners with circles, Turn, Whole photo): **Next** … **Done**, then Ready. **Skip the rest** goes straight to Ready.
3. **Papers cut to the paper.** When a layout is chosen, each photo (up to 12) is looked at by the engine's page finder. Where a sheet of paper is found *and what is inside looks like paper* (a pale sheet with print, not a photograph or a framed picture), the photo is cut to its corners. A job whose photos are all such pages **saves ink**: Clean colour in colour, Sharp Black in black & white. A style the shopkeeper picks wins; real photos, PDFs in the job, passport photos and ID cards are never changed; Whole photo, Undo and adding photos take it back.
4. **Sharper pictures:** screen pictures made at 1536 px (640 before), page pictures 640 (320), cut photos and cards drawn from 1024 px pictures (480). The print itself is as before.
5. **ID cards:** a card-shaped box inside a bigger card (an Aadhaar back's QR block) is no longer taken for a card; a frame of the wrong shape says so and **Card shape** fixes it (standing frames are fine); **vertical cards** (voter ID, driving licence): the engine now looks for the face at quarter turns, so a card whose face reads with a quarter turn prints standing and its other side stands with it.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Centred one on each page, landscape, sizes chosen | PASS | centre.test (3), layouts/sizes tests, round12.spec; round12-smoke: every photo centred in the print file (pdf.js) |
| Corners chain: Next, Done, Skip the rest, Back, damaged photo skipped, box crops kept | PASS | round12.spec (7), papers.test, round12-smoke on API 35, release-round12 |
| Paper rule: only paper-like insides are cut; ink only when every photo is paper; once per job; clears on Whole photo / added photos; never for ID cards | PASS | ink.test (8), papers.test (14), `PaperShareTest` (JVM) |
| Pictures at 1536 px (and covers of older jobs still found) | PASS (size on a device); sharpness by eye is the owner's | round12-smoke `picturesMadeAt1536`; screenshots |
| Card nesting, stretched warning, Card shape, standing turns | PASS (logic) | cards.test (18), `FoundCardTest` (JVM) |
| The turn knob and the top side bar on a centred photo | PASS | rotate.spec, adjust.spec, round12.spec (hit test), round3 smoke, `knob/` probe on a device |
| Whole-round review | PASS | 1 Critical, 9 Important, 10 Minor: all fixed with tests or proven intentional |
| Device: API 35 smokes (round12, 11, place, adjust, card, rotate, round3–10) | PASS | `final-smokes-api35/` (round3 after its script fix, `round3-rerun/`) |
| Device regression | PASS with named flakes | API 24: 108 passed, 8 skipped by design; API 35: 114 passed, 2 failed (a pinch-zoom check and the dead-renderer check) that pass alone; API 36 (read-only copy): 113 passed, 3 failed ("System UI isn't responding" ×2 and a pinch check) that pass alone; share matrix 15/15, render checks exit 0, no crash, no privacy hits on all three |
| Release build 1.0.321 | PASS | release-smoke, release-cards, release-round11, release-round12, privacy |
| Browser suite, unit, JVM, size | PASS | 1,959 passed / 24 skipped / 0 failed; 679 unit + 96 script tests; JVM 451; startup JS 48,237 of 61,440 B |
| Ink saved on paper; sharpness on paper; vertical cards on real photos; the owner's stretched-card photo | PENDING (owner) | §AI |

## Coverage statement
**Proven:** the rules (unit and property tests); the screens (browser suite at phone and tablet size, axe at 320 px for the round 11 list); the flow and the print file on an API 35 emulator and on the shrunk, signed build; the engine's paper measure on synthetic pages.

**Not proven here:**
- **Real paper detection:** the finder and the paper measure were tested on synthetic pages and photos, never on real photographed letters; the 55 % threshold and the 30 % to 98.5 % area limits are my choice and may need tuning. A letter on a busy table, or a dark page, may not be cut (it prints as before).
- **Vertical cards:** Android's face finder was never fed a real or synthetic face here; the quarter-turn face check is unproven on a real card. A card without a readable face stays lying; the pairing rule (the back stands with the front) is tested only as logic.
- **Point 5, the owner's photo:** reproduced once the owner sent it (follow-up 05cf257): the true outline was rejected because of the card's thick rim, so the QR block was framed; fixed and proven on that photo (whole card found, 0.94 at 1024 px). The nesting fix from 3bb008d did not address the real cause. The right edge's top corner can still sit about 2 % in. Other photos are not proven.
- **Ink savings:** not measured with a printer; Clean colour and Sharp Black are the existing styles.
- **Memory and speed on a low-memory phone** with many 1536 px pictures, and the time the paper look adds to the layout choice (bounded to 8 s), were not measured on a real phone.
- **Not built:** a separate "ink saver" switch; cutting to paper for PDFs; automatic standing/lying for a card with no face on either side.
- **PLAN §F3:** its 640 px grid picture was changed by the owner's request; the PLAN text is not rewritten.

## Known weaknesses (not caused by this round)
Two `shell.spec.ts` browser tests that wait for a lazily loaded PDF are load-sensitive on a busy PC; the device suite has pinch-zoom and dead-renderer tests that fail in a full run on a loaded host and pass alone.
