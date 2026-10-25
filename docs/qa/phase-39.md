# Phase 39: closure report (Adjust: tool order, the blinking line, side bars on the edges)

**Spec:** `docs/superpowers/specs/2026-10-25-round-7-tools-cursor-bars-card-gap-design.md`, parts 39a–39c.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 47–49.
**Rulings and open findings:** `docs/qa/phase-39-40-rulings.md`.
**Evidence:** `docs/evidence/phase-39-40/2026-10-25/` (SUMMARY.md lists every run).
**Commits:** fb94c3a (round 7), 010c013 (review fixes).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AD1–AD3.

## What Phase 39 delivers
- **Tool order (row 47).** On photos the row starts Cut, Copy, Crop, Turn, Undo, then Redo, Paste, Zoom out, Zoom in, Smaller, Bigger, then the rest. Each tool appears once. Documents, passport sheets and ID cards keep Zoom, Undo and Redo first.
- **The blinking line (row 48).**
  - The paste mark is now Word's cursor: a 2 px vertical line, 1.75 rem tall, blinking about once a second. It is steady when the phone asks for less motion.
  - It appears only once something is copied or cut, and stays on the page.
  - Paste puts the photo's top-left corner at the line, kept inside the margins.
  - The note says "Paste goes to the line."
- **Side bars on the edges (row 49).**
  - **Cause:** near the page's top or left edge, the whole 56 px touch area of a bar was moved inside the photo, so its bar showed 28 px inside.
  - **Fix:** the bar is now drawn on the edge. Its touch area reaches 0.25 rem past the edge and sits above the turn handle, so a drag on the top bar crops and never turns the photo (review I1).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Photos tool order; each tool once; Zoom and Undo positions on every kind | PASS | adjust.spec round 7 + updated round 4 and round 6 order tests (RED first) |
| The line: thin, tall, blinking, steady with reduced motion, top at the tap, only once something is copied, kept on the page | PASS | adjust.spec ×4 (RED first; the clamp shown RED by removing it) |
| Paste's top-left corner at the line, in both directions, where the copy fits | PASS | adjust.spec (RED first; review M4 strengthened) |
| Each bar's middle on its edge; a finger on the bar, or 3 px outside it, takes the bar | PASS | adjust.spec ×2 (RED first) |
| Device, at a phone's screen size: bars on the edges with 56 px touch areas; the line 2 px × 28 px and blinking; the pasted photo's top-left within 1 mm of the line in the print file | PASS | round7-smoke API 35 `sideBarsOnTheEdges`, `pasteStartsAtTheBlinkingLine` |
| The owner's use | PENDING (owner) | USER-CHECKLIST §AD1–AD3 |

## Coverage statement
**Proven:**
- The order, the line and the bars, by e2e tests and on an API 35 emulator set to a phone's screen size.

**Not proven:**
- **Battery cost of the blinking line** on a phone.
- **The bars at 200 % text with zoom** on a real phone.
