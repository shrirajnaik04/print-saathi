# Phases 37–38: every ruling made during the build, and the findings left open

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost.
Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-25-round-6-undo-redo-front-back-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-25-phase-37-38-round-6.md`
- **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 45–46.

## Rulings

- **No document library for Adjust** (owner decision 45). Adjust edits the job's own plan, so the preview and the print stay one. Cost if wrong: Adjust cannot take features that need free-form layout.
- **Tests first, code after the round-5 regression.** The round 6 tests were written while the round 5 regression ran, and set aside for the commits in between. The hook checks the whole working tree.
- **Undo and Redo are named "Undo the last change" and "Redo what was undone" for screen readers** (visible: "Undo", "Redo"). The Remove panel's own button is already named "Undo". Cost if wrong: longer spoken names.
- **`takeUndo` / `takeRedo` take the job's current revision**, which the plan did not. Without it a stale step could be taken after a change elsewhere.
- **The plan's `stackItem` / `stackIdCard` actions were not added.** Photos use the existing "place photos" change with the page's layers renumbered; cards use the existing "place a card" change, which puts a card on top. Each new reducer case cost startup JavaScript, and the budget had 194 B left. Cost if wrong: none.
- **`restoreEdits` is the only new reducer action**, and it carries the revision it was taken from (review I1).
- **`autoTurned` is in the adjustable choices**, with `turns`. Cost if wrong: none.
- **Steps are forgotten when a change is recorded on another job**, not when a job is left. An app-level import put the startup JavaScript over its budget. A job left and re-opened unchanged keeps its steps, where the spec said "forgotten when the job is left". This is safe for the data because of the revision check. Cost if wrong: Undo is available after leaving and coming back to an unchanged job. **The owner should confirm this.**
- **The two layer buttons and Redo reuse existing icons** (Redo is the Undo arrow flipped by the page's own CSS; the layer buttons use the up and down arrows). Two new SVGs cost about 400 B, and the startup JavaScript has 10 B left (61,430 of 61,440). Cost if wrong: Bring to front looks like Move up, and Send to back like Move down; only the labels differ. **The owner should see this on the phone (AC6–AC7).** A lighter way to draw icons would let proper ones in.
- **Retry after every Undo or Redo** re-lists the job's pictures, as Remove's Undo already does. Cost if wrong: slower Undo on a 100-photo job on a 2 GB phone (not timed).
- **The release smoke:** no failed attempt this round.

## Review findings

A whole-branch review (a fresh reviewer) found **0 Critical, 3 Important and 5 Minor** issues.

**Fixed and verified (each with a test that failed first):**
- **I1:** an Undo could be applied to a job that a change from elsewhere (for example photos just added) had moved on, and write the old photos list over it.
- **I2:** Crop, Fix edges, Add photos and the passport tools were not undoable, and using them silently forgot all earlier steps.
- **I3:** Redo's arrow was identical to Undo's on the phone (the inline style was blocked by the page's rules).
- **M1:** Ctrl+Z while a photo is held reversed the drop.
- **M2:** Ctrl+Z worked behind the "Leave this job?" question; keyboards of other alphabets never matched.
- **M4:** layer numbers could grow past the stored limit.
- **M5:** weak tests (copies and layout "kept" were never changed, the 50-step test did not check which step was dropped, the card layer test never checked the order).

## Open
- **M3: the layer buttons share arrows with Move up / Move down / Move earlier.** Awaiting the owner's view (AC6–AC7).
- **Tilted photos:** the layer buttons can light up for photos whose pictures do not touch. Rare; no change visible.
- **Startup JavaScript has 10 B of its 61,440 B left.** The next feature that touches startup code must first make room (for example by loading Ready on demand, or a lighter icon scheme).
