# Phase 33: closure report (Copy, Cut, Paste, the + mark, no hint line)

**Spec:** `docs/superpowers/specs/2026-10-25-round-5-copy-paste-cards-drag-zoom-print-back-design.md`, parts 33a–33c.
**Plan:** `docs/superpowers/plans/2026-10-25-phase-33-36-round-5.md`, Tasks 1–3.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 35–37.
**Rulings and open findings:** `docs/qa/phase-33-36-rulings.md`.
**Evidence:** `docs/evidence/phase-33-36/2026-10-25/` (SUMMARY.md lists every run).

**Commits:**
- 858c07f: no hint line.
- 5acd5f2: Copy, Cut, Paste and the + mark.
- 9376c0a and 2196fe1: review fixes I1, I2, I3, M2, M3, M7.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AB1–AB2.

## What Phase 33 delivers

**33a: Copy, Cut and Paste (item 1).** Adjust's tools have Copy, Cut and Paste after Remove, for photos:
- **Copy** remembers the chosen photo as it is (picture, crop, turn, tilt, size).
- **Paste** adds a copy of it. A copy is the same file, so nothing is copied on the phone, and it never shows as "These photos are the same". Paste twice makes two copies, and a copy can be pasted even after the original was removed.
- **Cut** takes the photo off (as Remove does); Paste puts it back once, on the page shown, above the other photos.
- What was copied belongs to the job: leaving the job forgets it.

**33b: the + mark (item 9, "a cursor like Word").** A tap on an empty spot of the page shows a **+** and "Paste goes to the + mark."; Paste centres the photo there, kept inside the margins. Without a mark, Paste goes to the middle of the page shown.

**33c: no hint line (item 5).** The grey line under "Photo n of N" is gone on every Adjust screen.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Copy then Paste makes a copy with the same picture, size, turn and crop, placed by hand and chosen; Paste waits for a Copy; never "the same photo" | PASS | adjust.spec copy, cut and paste (RED first); job.test copies |
| Paste goes to the + mark; the mark goes when the page changes or after Paste | PASS | adjust.spec "Paste goes to the + mark" (RED first) |
| Cut, then Paste puts it back once; on the page shown; above the others; with no new page after an emptied middle page | PASS | adjust.spec Cut tests; review I2, I3 tests and free.test storedPage (RED first) |
| A photo pasted after Adjust was opened again is drawn; one Paste makes one photo | PASS | review I1 tests (RED first) |
| Cut then Undo leaves nothing to paste; another photo's Undo survives a Paste | PASS | review M2, M3 tests (RED first) |
| Recent jobs counts files received, not copies | PASS | jobText.test (RED first) |
| No hint line on Adjust | PASS | adjust.spec "no hint line" ×4 (RED first) |
| Device: no hint line; Copy, + mark, Paste: one more photo, `copyOf` set, the same file path | PASS | round5-smoke API 35: `noHintLine`, `copyPasteWithTheMark` |
| The owner's use at the counter | PENDING (owner) | USER-CHECKLIST §AB1–AB2 |

## Coverage statement

**Proven:**
- Copy, Cut, Paste and the + mark by unit and e2e tests at a phone's size, and on an API 35 emulator (the job file read back).
- Every review finding about pasting, each with a test that failed first.

**Not proven:**
- **A copy's own picture on the phone.** Until the engine makes it, a copy borrows its original's picture (or one of the same file); the print uses the file itself.
- **Copy and paste in documents, passport sheets and ID cards.** These have no Copy, Cut or Paste, by design (spec 33a).
