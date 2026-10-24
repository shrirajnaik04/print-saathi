# Phase 3 — closure report (layout engine + Change screens)

**Plan:** `docs/superpowers/plans/2026-10-03-phase-3-layout-and-change.md` (Tasks 1–6).
**Commits:** `f743fe7` … `996b34a`, re-review fixes after (see below).
**Verdict:** **CLOSED for the emulator scope.** The owner still has to review the layout gallery (`docs/evidence/phase-3/2026-10-03/layout-gallery.html`), and the shopkeeper has not tried it yet (USER-CHECKLIST §G).

## What Phase 3 delivers
- **The three photo requests** (PLAN §J1–J3):
  - **All on one page**, which warns below 2.5 cm and offers **Use more pages** or **Keep 1 page**;
  - **Use more pages** (Best = the fewest pages with every photo at least 4 cm, or exactly N);
  - **One on each page**.
- **The layout engine** (PLAN §G0):
  - uniform grids and order-keeping rows (the best row split is found by a binary search on the smallest photo plus a DP over row breaks);
  - the smallest photo is maximised first, then paper use;
  - a grid is preferred within 8 %, upright paper within 3 %;
  - N pages are balanced in-order groups in one direction; a shared grid is used only when it is nearly as good on every page.
- **Behind one Change button** on Ready:
  - Layout and Pages, where every choice is shown as its real first page;
  - Copies (big − / +);
  - **Photos**, where Photo tools can Turn, Move earlier / later and Remove, with Undo in place.
- **Turned photos print turned:** the PDF matrix uses quarter turns with no re-encoding, and the preview turns the same way.
- **Safe changes:**
  - one save at a time, with controls disabled while saving;
  - a stale write re-applies the change instead of losing it;
  - a failed save is said on screen.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §G0/G1/H2/I-5..8/J1–J3; phase plan |
| Automated verification | vitest 139, including the 10 000-case layout property (1–30 photos really drawn); scripts 55; JVM (writer matrices 0..3, net turns, contracts ×2); Playwright 351 (screens × 5 viewports × 4 text sizes, a new rule that controls stay ≥ 8 px from the screen side, flows J1/J2/turn/move/Undo/failure/races) |
| Real-device test | Emulators only. 5-level regression on `52c0f0d`: API 24/28/30 27/0/4, API 35/36 31/0/0; share matrix 15/15, render check and privacy 0 on all levels (`regression-final/`). API 35: all on one page end to end via Save as PDF, read back; render test with clockwise and upside-down photos on a multi-photo page, pdf.js 10 pages PASS, no mirroring |
| Owner review | `layout-gallery.html` (1–30 photos: tall, wide, mixed, with a panorama; all on one page and Best) — **pending** |
| Adversarial challenge | Independent gate → **FAIL** (5 Important, 6 Minor) → all fixed (each with a failing-first or mutation-checked test) → re-review (below) |
| Self-found defects | Mini previews drawn as dots; the stepper ran into the screen side at 200 %; Undo showed no photo; stale revision on two changes in a row; two of my e2e expectations were wrong (30 photos don't warn; photo-order tests passed by timing) — all fixed |

**Native code since the regression:** unchanged. Only the device *test* gained the upside-down photo, and that was re-run on API 35. The web changes since `52c0f0d` are covered by the 351 Playwright tests. The APK's web assets are not exercised by the device suite.

## Gate findings and status

| # | Finding | Status |
|---|---|---|
| 1 | "Best" wasted pages: page 1's grid was forced onto every page (29 photos + one 6:1 → 30 pages) | **Fixed + verified:** the shared grid is used only within 8 % of a page's own best; the same job now gives 3 pages (4 example tests) |
| 2 | Rows split greedily, not by search | **Fixed + verified:** binary search + DP; the mixed 5-photo page went from 37.5 to 62.7 mm (the reviewer's reference was 60.3) |
| 3 | A failed save was a silent dead tap | **Fixed + verified:** "Couldn't save this change …" (e2e, mutation-checked) |
| 4 | Quick taps lost or doubled during a save | **Fixed + verified:** one save at a time and a stale write re-applied (`save.test`); double-tap Remove with a slow save (e2e, mutation-checked after fixing a race in the test itself) |
| 5 | Move earlier/later swapped with hidden files | **Fixed + verified:** moves only among the photos on screen (vitest + e2e with a PDF in between) |
| 6 | Tests claimed more than they checked | **Fixed:** property sizes 1–30; Ready preview turn asserted; device upside-down photo; pdf.js flags mirrored images; gallery panorama row |
| 7 | Undo loose ends | **Fixed + verified:** the page count is restored; Undo is forgotten on leaving Photos |
| 8 | A partial grid page was stuck at the top | **Fixed + verified:** centred |
| 9 | Warning forgot "Keep"; exact N didn't warn | **Fixed + verified** (e2e) |
| 10 | Corrupt stored values could break screens | **Fixed + verified** (`normalizeJob` repairs) |
| 11 | N = photo count used one direction | **Fixed + verified:** one per page, each in its own direction |

## Coverage statement

**Proven:**
- **Layout rules** for 1–30 photos (property: once each, order, inside the printable area, 3 mm gap, aspect ≤ 0.1 %, deterministic, page count), plus examples for Best's page count.
- **Turns:** preview equals print for every page direction × turn, both by reasoning and by test (pixel colours on the device, pdf.js turns, no mirroring).
- **Screens:** readable at 320 px / 200 % and at every matrix size.
- **Races and failures** in the web layer (mock store with slow and failing saves).

**Not proven:**
- **People:** the owner's judgement of the layouts (gallery); the shopkeeper choosing the request alone.
- **Hardware:** a real phone's save timing; real printers.
- **Out of Phase 3 scope:** 4×6 paper, B&W and crop.
- **Ready preview:** it is still drawn from the plan, not rendered from `print.pdf` (Phase 4).

## Re-review (same reviewer) → PASS WITH FINDINGS → all fixed
| # | Finding | Status |
|---|---|---|
| R1 | **Important:** Best still went one photo per page when a photo cannot reach 4 cm even alone (29 photos + a 10:1 panorama or a 1:7.4 screenshot → 30 pages) | **Fixed + verified:** such a photo gets a page of its own, and the photos before and after it are laid out with Best (order kept). Tests 29+10:1, 29+1:7.4 and 99+1:10, RED→GREEN. (A weighted-layout attempt was tried first and dropped: tall strips can't share a page anyway) |
| R2 | A save that wrote and then failed could let a second tap turn twice | **Fixed:** the job is reloaded after any failed save before the next change (code) |
| R3 | Choice cards stayed tappable while saving | **Fixed:** disabled while saving |
| R4 | Undo vanished after opening another photo | **Fixed + verified:** forgotten only when the Photos flow is left (e2e) |
| R5 | "Keep" for small photos counted for every layout | **Fixed + verified:** per job and arrangement (e2e) |
| R6 | `normalizeJob` gaps (fractional pages, text order, copies, duplicates) | **Fixed + verified** (vitest) |
| R7 | Plans rebuilt on every draw | **Fixed:** one plan per choice per job change (useMemo) |
| — | A matrix case failed once: "pinned bar covers 51 %" at 360 × 800, 200 % | **Proven a test race, fixed:** the test changes the text size after load and measured before the action bar's resize observer ran. The matrix now waits two frames; 2 full runs 353/353. In the app the text size is set before the first draw |

