# Phase 40: closure report (ID card gap, printed jobs open on their pages)

**Spec:** `docs/superpowers/specs/2026-10-25-round-7-tools-cursor-bars-card-gap-design.md`, parts 40a–40b.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 50–51.
**Rulings and open findings:** `docs/qa/phase-39-40-rulings.md`.
**Evidence:** `docs/evidence/phase-39-40/2026-10-25/` (SUMMARY.md lists every run).
**Commits:** fb94c3a (round 7), 010c013 (review fixes).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone and printer: USER-CHECKLIST §AD4–AD5.

## What Phase 40 delivers
- **ID card gap (row 50).** Front and back one under the other are 60 mm apart (was 10 mm): front at 20 mm from the top as before, the back starting at 134 mm.
  - **Big and Own size:** where the page has no room for 60 mm, the gap narrows (to 10 mm at least) instead of making the cards smaller.
  - **Unchanged:** Side by side and Many copies. Cards placed by hand keep their places.
- **Printed jobs (row 51).**
  - In Recent jobs, tapping a printed job opens Ready: its pages (Page 1 of N, ‹ ›) with Change, Adjust and PRINT.
  - Its second button is **Choose again**, back to "What did the customer ask?", for passport photos or an ID card copy from the same file (review I2).
  - A job not printed yet opens on "What did the customer ask?" as before.
  - The pages are drawn from today's job and today's app (review M5): a job changed after printing shows the change.
- **Start-up size:** Photos, Photo tools and Result load on demand. Start-up JavaScript went from 61,430 B to 59,217 B of 61,440 B.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Real size: 60 mm between front and back, 20 mm from the top; Big and Own size 60 mm where they fit; never smaller for the gap (Big standing cards keep 161 %) | PASS | idcard.test (RED first); the shared plan fixture regenerated; Android JVM tests pass |
| A printed job opens on its pages; Choose again opens its choices; a job not printed opens on its choices | PASS | recent.spec, shell.spec (RED first) |
| Device: front and back 60.0 mm apart, front at 20 mm, read from the print file by pdf.js | PASS | round7-smoke API 35 `frontAndBack60mmApart` |
| Device regression and the older smokes | PASS | regression API 24/35/36; 10 smokes (see SUMMARY) |
| The owner's printer, by the ruler | PENDING (owner) | USER-CHECKLIST §AD4–AD5 |

## Coverage statement
**Proven:**
- The gap in every size and arrangement by unit tests, and on an API 35 emulator from the print file.
- The Recent jobs paths by e2e.

**Not proven:**
- **The gap on paper.**
- **A reprint of a card job printed before this update.** It now uses the 60 mm gap.
