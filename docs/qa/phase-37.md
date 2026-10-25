# Phase 37: closure report (Undo / Redo on Adjust)

**Spec:** `docs/superpowers/specs/2026-10-25-round-6-undo-redo-front-back-design.md`, parts 37a–37e.
**Plan:** `docs/superpowers/plans/2026-10-25-phase-37-38-round-6.md`, Tasks 1–3.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 45–46.
**Rulings and open findings:** `docs/qa/phase-37-38-rulings.md`.
**Evidence:** `docs/evidence/phase-37-38/2026-10-25/` (SUMMARY.md lists every run).

**Commits:**
- cf19cbc: Undo / Redo for every change on Adjust.
- 9b680ad: review fixes I1, I2, I3, M1, M2, M4, M5.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AC1–AC5.

## What Phase 37 delivers

**Undo and Redo** are the 3rd and 4th tools on every Adjust screen (photos, document pages, passport sheets, ID cards), after Zoom out and Zoom in.
- **What a step is.** Each change made on Adjust is one step: a move or drop, Bigger or Smaller, a corner drag, Turn, Tilt, Remove, Cut, Paste, Move earlier or later, Automatic, a card's place or arrangement, a page's size or turn, Bring to front or Send to back, and what the other screens of Adjust do (Crop, Fix edges, Add photos, the passport tools), one step per visit.
- **How far back.** Up to 50 steps. A new change after an Undo clears Redo, as in Word.
- **What it never touches.** Zoom, ‹ ›, choosing a photo and Copy are not changes. Neither are Change's choices (colour, paper, layout, copies, style) nor anything that happened outside Adjust (printed, parts).
- **It never takes back a change made elsewhere.** The steps are valid only while the job is exactly as the last step left it. A change from Ready, Change, a print, or a save that arrived in between forgets them, and an Undo is applied only to the revision it was taken from (review I1).
- **Keyboard.** Ctrl+Z is Undo; Ctrl+Y or Ctrl+Shift+Z is Redo (also by key position on other alphabets). Not while typing in a field, behind a question like "Leave this job?", or while a finger holds a photo.
- **Round 5's own Undo panels** ("Photo removed", "Page removed") close when Undo or Redo is used, so one removal is never undone twice, and a cut photo that is back leaves nothing to paste.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Undo and Redo are the 3rd and 4th tools on every kind, 56 px or more, greyed out with nothing to undo | PASS | adjust.spec "round 6" (RED first) |
| A move, Remove, Paste, Cut, a page turn and a card drag are undone and redone; a new change clears Redo | PASS | adjust.spec ×7 (RED first) |
| Steps stay after Done → Ready → Adjust; forgotten after a change elsewhere (Colour on Ready) | PASS | adjust.spec ×2 (RED first) |
| A crop, and the passport count, made from Adjust are one step each; earlier steps survive; a crop screen left unchanged adds none | PASS | adjust.spec review I2 ×3 (RED first); history.test returned ×2 |
| A job that moved on is never restored over; the oldest step is the one dropped at 51 | PASS | job.test review I1; history.test 50 steps (RED first) |
| Redo's arrow turns the other way (under the page's own CSS) | PASS | adjust.spec I3 (RED first: the old inline style was blocked) |
| No Undo mid-gesture, nor behind the Leave question | PASS | adjust.spec M1, M2 (RED first) |
| Device: a drag is undone (the automatic layout back) and redone, each read from the print file | PASS | round6-smoke API 35 `aDragIsUndoneAndRedone` |
| The owner's use at the counter; Undo on a 100-photo job on a 2 GB phone | PENDING (owner) | USER-CHECKLIST §AC1–AC5 |

## Coverage statement

**Proven:**
- The step store, the restore action and the Adjust wiring by unit and e2e tests; a real drag, Undo and Redo on an API 35 emulator, read back from the print file by pdf.js.
- The whole device regression on API 35, 24 and 36 on the final build.

**Not proven:**
- **A save that really lost a race.** The revision guard is proven in the reducer (a stale `fromRev` changes nothing) and the wrapper's rule by reading; no test makes the phone's store refuse a save mid-Undo.
- **Undo of Add photos on a phone.** The path is the same as Crop's (proven in the browser), but a gallery pick was not driven on a device in this round.
- **Cost on a 2 GB phone.** After each Undo the job's pictures are listed again, which on a 100-photo job has not been timed.
