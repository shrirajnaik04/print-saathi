# Phase 26: closure report (every print starts in colour; a Colour | Black & white switch on Ready)

**Spec:** `docs/superpowers/specs/2026-10-24-round-3-edges-colour-big-preview-rotate-design.md`, Phase 26.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-25-28-edges-colour-big-preview-rotate.md`, Tasks 5–6.

**Commits:**
- 7992e71: every print starts in colour.
- aa66f42: a Colour | Black & white switch on Ready.
- 9a953c7: review fix M1 (a switch that could not be saved says so).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check: the switch on the owner's phone and a black & white print on the Brother (USER-CHECKLIST §Z5).

## What Phase 26 delivers

- **Every new job starts in colour** (owner, item 5: "make sure for all print preview print output must be color"). This covers photos, documents and PDFs, passport photos and ID cards.
  - Settings no longer holds a colour per job type. Its one row is now **Paper for photos**.
  - Printing no longer remembers the colour; it still remembers the photo paper.
  - Old settings files that held colours load without error, and their colours are ignored.
  - Jobs saved by 1.0.224 keep the colour they were saved with.
- **Colour | Black & white on Ready**, under the preview: two big halves. The chosen half is filled and ticked, so colour is never the only signal.
  - For screen readers it is a named group ("Print in") of two pressed buttons.
  - One tap changes this job and draws the print again. Black & white prints from grey data only, as before (PLAN §G2).
  - A change that could not be saved says so (review M1), and the switch stays on what will print.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| New jobs of every kind start in colour; old settings with colours load; 1.0.224 jobs keep theirs | PASS | job.test and settings.test colour-default tests (RED → GREEN); shell.spec; vitest 479/479 at Task 5 |
| The switch on Ready for photos, a PDF, passport photos and ID cards: one tap each way, the plan follows; named group, pressed state, ticked half | PASS | ready.spec 6 (5 RED first + review M1 RED first); Ready matrix, edges and screen reader 246/246 |
| Device: a new ID card job starts in colour; Black & white then Colour each make a new print file, and Ready's line says which | PASS | round3-smoke API 35, `startsInColourAndTheSwitchFlipsIt` |
| Device: a black & white print holds only grey pixels | PASS | PlanRenderDeviceTest "a black and white print holds only grey pixels" (API 24, 35 and 36, `regression/run2/`) |
| On the owner's phone and on the Brother | PENDING (owner) | USER-CHECKLIST §Z5 |

## Coverage statement

**Proven:**
- The defaults by unit tests.
- The switch in Chromium at every screen size and text size.
- The switch on API 35 through Android's own input.
- Grey output on three Android versions.

**Not proven:** whether the Brother uses colour ink for a black & white job. That is the printer's choice; the app sends grey data and asks for monochrome.
