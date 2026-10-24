# Phase 25: closure report (card edges on every side, the ID card's back side, side bars only, typed passport count)

**Spec:** `docs/superpowers/specs/2026-10-24-round-3-edges-colour-big-preview-rotate-design.md`, parts 25a–25d.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-25-28-edges-colour-big-preview-rotate.md`, Tasks 1–4.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 16–23.

**Commits:**
- c2f7804: card edges are drawn on every side.
- 01f771d: the ID card's back side is added on a real phone.
- ff8395b: crop with the middle bars only, everywhere.
- e4c9020: type how many passport photos (1–100).
- 9a953c7: the whole-branch review fixes (I1 back side, M2 number box).
- 6137032: the device smoke.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone (USER-CHECKLIST):
- §Z1: the edges at the curved sides.
- §Z2: the back side with a real card photographed at the counter.
- §Z3: how the side bars feel.
- §Z4: 40 photos on paper.

## What Phase 25 delivers

**25a: card edges on every side (item 4).** Every card, tile, row and choice showed its 2 px edge on the right and top, but the left edge was hidden in the outer columns. The page now clips sideways at the page itself (`html { overflow-x: clip }`), not at the screen's host. The edges of the cards in the outer columns are no longer cut off.

**25b: the ID card's back side (item 2).** On a phone, after the back photo joined the job, the screen cancelled its own look for the card when it redrew. The card was never added, and only the front printed.
- Now the look runs until the screen closes, and the screen says "Looking for the card on the back photo…".
- While it looks, Card copy, Fix edges and Turn wait.
- The back is added to the cards as they are then.
- Leaving and coming back looks again (review I1).

**25c: side bars only, everywhere (item 1).** The crop frames for photos, document photo pages and ID cards (Fix edges) have no corner circles. Only the bar in the middle of each side remains:
- Dragging a bar moves that side straight in or out.
- "Side k of 4", Next side, the arrows and Start again do the same without dragging.
- A frame found by the app (ID cards) or saved by 1.0.224 keeps its slant and moves side by side. Nothing can be slanted by hand any more (ruling in `phase-25-28-rulings.md`).
- ID cards: "Fix corners" is now **Fix edges**, with "Check the edges".

**25d: typed passport count (item 3).** Besides 4 · 5 · 6 · 8 and − / +, there is a box: "Or type a number".
- It takes 1–100. The count is saved a moment after a good number is typed, or at once on Enter or on leaving the box.
- Anything else says "Type a number from 1 to 100.", and only then.
- More photos than one sheet holds go onto as many sheets as needed (A4 30 a sheet; 4×6 as calibrated).
- 4 · 5 · 6 · 8 and − / + empty the box. Leaving the box never saves an older number over them (review M2).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| 25a: every card's edge is **painted** left, right and top on every screen at 360 and 412 px (pixels read from a screenshot, not the CSS) | PASS | shell.spec "every card's edge is painted…" 116/116. It failed first: 115/116 RED; 59 screens fail on the old CSS |
| 25a: the round corner and side pills stay inside the screen at 200 % text now that the host no longer clips | PASS | adjust matrix 100/100. Found on the way and fixed: handles near the page's right or bottom edge sit inside it |
| 25b: with a card finder as slow as a phone's, the back is added; during the look it says so and Card copy waits; leaving and coming back adds it | PASS | cards.spec: "as slow as a phone" (RED: 1 card), "while the back photo is looked at…" and "leaving … still adds the back" (RED first: no status). cards + add 41/41 |
| 25b device: Home → Aadhaar & ID cards → gallery photo (Android's photo picker) → Add the back side → gallery photo shows "2 ID cards found" | PASS | round3-smoke API 35, `backSideAddedFromTheGallery` (`docs/evidence/phase-25-28/2026-10-24/round3-smoke-api35/`) |
| 25c: no corner handles anywhere; a bar moves only its side, straight; moves off the photo or across the opposite side are not taken | PASS | quad.test `moveSideStraight` 8/8 (RED first); crop / cards / place 58/58 (17 RED first); shell matrix for crop, Fix edges and cards 234/234 |
| 25c device: the top bar dragged down crops the photo from the top | PASS | place-smoke API 35, `topBarCropsFromTheTop` |
| 25d: typed counts 1–100 kept; 0, 101, letters, "1e3" refused with the message; never NaN in the job; 37 photos on as many sheets as needed (A4 and 4×6) | PASS | job.test (1–100, clamp); passport.spec 6 (RED first) |
| 25d device: 40 typed → "40 passport photos · A4 · 2 sheets"; the print file has 2 pages | PASS | round3-smoke API 35, `typedCountFlowsOntoASecondSheet` |
| How it looks and feels on the owner's phone | PENDING (owner) | USER-CHECKLIST §Z1–Z4 |

## Coverage statement

**Proven:**
- Painted edges on every screen at two phone widths in Chromium.
- The back-side race with a slow test engine and with Android's real photo picker on API 35.
- Side-bar geometry by unit and e2e tests, plus one device drag.
- Typed counts by unit and e2e tests, plus one device run to two sheets.

**Not proven:**
- The curved edges of the owner's phone.
- A real ID card photographed at an angle that the finder misses. The frame cannot be slanted by hand any more: see the rulings file.
- 100 photos on 4×6 paper on the Brother.
