# Phase 14 — closure report (Aadhaar & ID card copy)

**Spec:** `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md` Part 2 (approved: all four
inputs, all four sizes, the card flow "perfect").
**Plan:** `docs/superpowers/plans/2026-10-23-phase-14-id-card-copy.md`.
**Commits:** 5ace621 homography + warp, a1a8eef card detector, 916795e engine + plans, 9aecbe2 screens + gate-review fixes.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION** (real cards and the shopkeeper's own e-Aadhaar, the ruler on
paper, the shopkeeper alone: USER-CHECKLIST §S).

## What Phase 14 delivers
- **Inputs:** two photos (front and back), one photo with both sides, a scan or screenshot, an e-Aadhaar PDF (a locked
  one is unlocked first), any ID-1 card (PAN, voter ID, driving licence).
- **Finding the card** (isolated engine, no library): a half-size working copy, sharp-step edges, straight lines,
  four-sided shapes, each side snapped to the photo at sub-pixel precision, the true shape recovered from the camera's
  perspective (card 1.585 ± 9 %), checks against tables, pages and screenshots. e-Aadhaar panels by a printed-panel
  finder (card-sized outlined boxes).
- **Straightening:** only the card's part of the photo is decoded, at the resolution its print needs; a PDF panel is
  drawn from the vector page at that scale.
- **Front and back:** front = the card with a face (Android's built-in face finder, offline); a card whose face reads
  only turned over prints with a half turn.
- **Screens:** Cards found (Front/Back, ✓ Straightened or "Check the corners", Swap, Fix corners, Turn), Fix corners
  (four dots, 56 px touch, Next dot + arrows, live preview), How big? (Real card size, Big size, Many copies, Whole
  e-Aadhaar page for a PDF; the last size first), Ready "ID card · real size · A4 · Colour · 1 copy", Change (Size, the
  cards, Colour, Copies). Home tile "Aadhaar & ID cards"; Received "ID card copy" (1–2 photos; a lone PDF that is
  locked or shows two card-sized panels).
- **Print:** A4, as a document (exact size, never enlarged by the print service); real size exactly 85.6 × 54.0 mm,
  20 mm from the top, 10 mm apart, cut lines; big ≤ 2×; many copies in rows 5 mm apart with cut lines; cards under
  200 dpi say they may print blurry.

## Acceptance (spec Part 2)

| Criterion | Result | Evidence |
|---|---|---|
| Corner error ≤ 1.5 % of the diagonal in ≥ 95 % of clear-background photos (generated corpus ≥ 300) | **96.3 %** (231/240; paper, dark, cloth 180/180; banded wood 51/60) | `phase-14/2026-10-23/detector-metrics.txt` |
| No false card at the auto-accept level in card-free photos | **0 / 100** (blobs, wood, pages, screenshots) | same |
| Front + back in one photo | 38 / 40 | same |
| Real size 85.6 × 54.0 mm ± 0.5 mm in the print file | exactly 242.65 × 153.07 pt, read back from the device's print file | `device-smoke/api35/card-smoke.json` |
| e-Aadhaar PDF gives 2 cards, front = the face panel | 2 panels found and drawn (content checked); the face-panel rule is untested without a face (synthetic) | CardEngineDeviceTest API 24 + 35 |
| Device flow: two card photos → Card copy → Real size → PRINT | PASS on API 35, Android's print screen reached | card-smoke |
| e2e: flow, Swap, Fix corners, sizes, tap counts, locked e-Aadhaar, matrix | PASS (15 + matrix + tap counts) | `tests/e2e/cards.spec.ts`, shell.spec |
| Hostile images through the detector | no exception (200 random/blank/constant), contained in the engine | CardDetectTest, CardEngineDeviceTest |
| Real photos: the same metrics on the owner's cards | PENDING (owner) | §S |

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Automated | JVM: CardDetectTest 6, PanelsTest 5, WarpTest 5, renderer/contract tests; vitest: idcard 10, cards 10, blurry; e2e cards 15 + matrix + tap counts |
| Device | CardEngineDeviceTest 6 on API 24 (2 GB) and API 35; card-smoke on API 35 (asserting) |
| Adversarial | gate review (fresh reviewer): 0 Critical, 9 Important — all fixed (logic fixes with tests seen failing first), 9 Minor (6 fixed, the rest deferred below) |
| Final regression | phase-15/2026-10-23/regression |

## Rulings (ledger, with costs)
- Detector: fixed edge levels + sharp-step test instead of a percentile; half-size working copy, then sub-pixel snapping;
  side pairs up to 30°; true-shape window ± 9 % (the spec's ± 18 % takes in A4); a phone's focal length when the
  corners can't fix it; extra checks against stretched pages.
- Corpus: tilt ≤ 35° in any direction, random camera, "clear" = the whole outline ≥ 22 levels from the table, JPEG,
  screenshots added, mixed seeds.
- Panels: a separate printed-panel finder; 85.6 mm ± 15 % at the page's scale; page 1 only.
- Many copies: 4 rows on A4 with 6 mm edges (the spec's "5" does not fit with 5 mm gaps); solid thin cut lines.
- Taps: sharing two card photos takes 4 taps (Received's choice + Card copy + size + PRINT); from Home 5 as the spec.
- Card orientation by which way the face reads (stronger than "face on the right half").
- A locked PDF goes to Ready as before (Unlock); once readable, a page with two card-sized panels gets the offer "Print just the cards?" (the earlier "ask for every lone locked PDF" was withdrawn: it cost bank statements a tap).

## Deferred minors (owner's call)
- The 40 MP PDF-box cap is fixed, not the phone's budget; Many copies assumes 6 mm edges and has no count stepper;
  dot names by position after moving; square-ish starting frame on portrait photos; faint white outline on white
  paper; no watchdog on photo detection; the cards picker has no 2-photo / 1-PDF limit; an e-Aadhaar chosen through
  the Documents tile also gets the question; Received does not pre-detect cards in photos; "Add the other side" not
  built (one card prints alone, with a note).

## Final regression and release (Phases 13–15 together, `docs/evidence/phase-15/2026-10-23/regression/`, `release/`)
- **Device, debug build:** API 24 (2 GB) instrumentation 65 passed / 0 failed / 6 skipped (by design on that image),
  API 35 71 / 0 / 0, API 36 at 2.0× text 71 / 0 / 0; share matrix 15/15 on each; pdf.js render check PASS; privacy
  hits 0; no PrintSaathi crash in the crash buffers. (API 35/36 ran at c5559ac; the Phase 15 review fixes after it
  were re-checked by the card/face device test on API 24, the card and rotation smokes on API 35 and the release run.)
- **PC:** lint (0 errors), typecheck, vitest 354, script tests, build, size (JS 60.7 KB gzip of a 60 KB budget:
  under 1 KB to spare), Android lint + JVM, full e2e on the final code 1273 passed / 0 failed (earlier runs found 28
  failures, all fixed: see the ledger).
- **Release:** `apk/PrintSaathi-1.0.176-8bcaf35.apk` (1.5 MB, the pinned PrintSaathi key, no INTERNET, not
  debuggable, no backup): release-smoke on API 35 PASS; the card flow and auto-rotation on the release build PASS.

## Coverage statement
Proven: detection on a generated corpus (with the corpus's known limits), the engine on Android 7 (2 GB) and 15, the
print file's exact size on Android 15, the flows and their failure paths on the PC. **Not proven:** real phone photos
of real cards (lighting, glare, laminate, worn corners), a real e-Aadhaar's panel layout, Android's face finder on
small card portraits, the printed size on the shop printer, the shopkeeper using it alone.
