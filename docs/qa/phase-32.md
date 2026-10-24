# Phase 32: closure report (Colour | B&W beside the title, Paper type)

**Spec:** `docs/superpowers/specs/2026-10-24-round-4-cards-zoom-pages-leave-design.md`, parts 32a–32b.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-29-32-round-4.md`, Tasks 3 and 4.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 24 and 32.

**Commits:**
- 185c903: Colour | B&W at the top of Ready.
- 62c940d: paper type, with a reminder for glossy paper.
- c9b0774: the round-4 device smoke.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone (USER-CHECKLIST):
- §AA1: the toggle's place.
- §AA9: glossy paper on the Brother.

## What Phase 32 delivers

**32a: Colour | B&W beside the title (item 1).** The two-part toggle sits on the same line as "Ready to print", on the right. It shows "Colour | B&W", and screen readers hear the full names. It wraps under the title only when there is no room (a small phone at large text). The toggle above PRINT is gone, and the title is 20 px instead of 24 px on that line.

**32b: Paper type (item 9).** **Change → Paper type** offers Plain paper or Glossy photo paper, for photos, documents and ID cards. Android cannot choose the paper type for the printer, so this is a reminder only:
- Ready says "Put glossy photo paper in the printer." in a yellow panel.
- PRINT reads "PAPER LOADED — PRINT".
- The summary says "Glossy".
- The print file is the same either way (a test proves it).
- On 4×6 photo paper the existing reminder already says this, so the glossy line is not added on top.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| The toggle on the title's line at 360 and 412 px, wrapping below it only when needed; read after Back and Home, the title focused first | PASS | ready.spec title line (RED first); shell "screen reader and keyboard" Ready ×6 (RED first) |
| Paper type: the row, the choice, the reminder, PAPER LOADED — PRINT, "Glossy" in the summary, the same print file | PASS | job.test paper type and summary.test (RED first); ready.spec Paper type (RED on the old build) |
| Device: Colour \| B&W above the summary line, beside the title; Glossy → the reminder, PAPER LOADED — PRINT, saved in the job | PASS | round4-smoke API 35: `colourSwitchIsByTheTitle`, `glossyIsReminded` |
| Device regression: every job starts in colour; B&W and back each in one tap, the print file following | PASS | round3-smoke API 35, `startsInColourAndTheSwitchFlipsIt` |
| The toggle's place, and glossy paper on the Brother | PENDING (owner) | USER-CHECKLIST §AA1, §AA9 |

## Coverage statement

**Proven:**
- The toggle at every width and text size in the matrix (layout, accessibility checks, keyboard).
- Paper type by unit and e2e tests and on an API 35 emulator.
- Startup JavaScript stayed under budget: Change and its choice screens now load when first opened.

**Not proven:**
- **Whether the owner's print service offers a glossy setting.** The shopkeeper chooses it on Android's print screen themselves.
- **Glossy paper's look on the Brother.**
