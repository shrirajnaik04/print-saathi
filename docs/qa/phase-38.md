# Phase 38: closure report (Bring to front, Send to back)

**Spec:** `docs/superpowers/specs/2026-10-25-round-6-undo-redo-front-back-design.md`, parts 38a–38d.
**Plan:** `docs/superpowers/plans/2026-10-25-phase-37-38-round-6.md`, Task 4.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 45–46.
**Rulings and open findings:** `docs/qa/phase-37-38-rulings.md`.
**Evidence:** `docs/evidence/phase-37-38/2026-10-25/` (SUMMARY.md lists every run).

**Commits:**
- cf19cbc: Bring to front / Send to back for photos and ID cards.
- 9b680ad: review fix M4 (layer numbers stay 1..n).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AC6–AC7.

## What Phase 38 delivers

**Bring to front** and **Send to back**, Word's names, for photos and for ID cards placed by hand (Real card size, Big size, Own size).
- Each is enabled only where the chosen one covers another on its page, and only in the direction that changes something: Bring to front when a photo it covers is drawn above it, Send to back when one is drawn below it.
- **Photos:** the page's layers are numbered 1, 2, 3 again with this photo first or last (so the numbers never grow without end), saved with the existing "place photos" change.
- **Cards:** placing a card puts it on top, so the layer is made by placing both cards in the order they should be drawn.
- Each is one step, so one Undo takes it back.
- **No new reducer actions, no new icons:** both buttons use the existing up and down arrows. See the rulings (they look like Move up and Move down: only the labels differ).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Nothing covered: both disabled, 56 px or more | PASS | adjust.spec "round 6" (RED first) |
| A photo dropped over another is on top; Send to back puts it under, Bring to front over; one Undo takes a layer change back | PASS | adjust.spec (RED first) |
| ID cards dropped over each other: Send to back then Bring to front change the printed order [2, 1] then [1, 2] | PASS | adjust.spec (RED first, order asserted after review M5) |
| Which button is enabled, and when layers are renumbered | PASS | layers.test layerState ×4, stackedSpots ×5 (RED first) |
| Device: the dragged photo is drawn last; Send to back draws it first; Bring to front last, from the print file | PASS | round6-smoke API 35 `sendToBackAndBringToFrontChangeTheDrawingOrder` |
| Whether the up and down arrows are clear enough beside Move up and Move down | PENDING (owner) | USER-CHECKLIST §AC6–AC7 |

## Coverage statement

**Proven:** the layer logic, the buttons' states and the printed drawing order, in the browser and on an API 35 emulator.

**Not proven:**
- **Tilted photos.** Their outlines can overlap while the pictures do not; the buttons then light up and change nothing visible.
- **The look of the arrows.** They share an icon with Move up, Move down and Move earlier (a size-budget ruling).
