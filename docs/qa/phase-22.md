# Phase 22 — closure report (Add photos, Add files)

**Spec:** `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`, Part 3.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-20-24-place-anywhere-scanner-crop.md`, Tasks 6–8.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md` row 1.
**Commits:**
- 7b84779 Add photos and Add files;
- 82c52bf whole-branch review fixes (Phases 20–24).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: Add from the owner's own gallery and
file manager (USER-CHECKLIST §Y3).

## What Phase 22 delivers
- **Add photos** on the photo list and in Adjust's tools (photo jobs); **Add files** on the page list and in Adjust
  (document jobs). No Add on passport jobs; ID cards get "Add the back side" (Phase 24 report, Part 7).
- **"Where are the photos?"**: From the gallery (Android's photo picker) or From the file manager (the document
  picker; photos only for photo jobs, PDFs and photos for documents).
- The files are received like a share (progress after 1 s, Cancel works) and **join the job at the end**; the "New
  files arrived" question is not asked. Back on the screen where Add was pressed; Adjust chooses the first new photo.
- **100 files per job:** only the first files up to 100 join, with a panel saying how many were added.
- **Nothing is lost:** if the job is gone, or the app was closed while the picker was open, the files become their own
  job. The wish "add to job X" holds only the job id and a time (10 minutes), never a file name.

## Acceptance (spec Part 3)

| Criterion | Result | Evidence |
|---|---|---|
| e2e: Add from both sources, from the list and from Adjust; Cancel and close; the 100 cap with its panel; documents take a PDF; no "New files arrived"; Back returns to where Add was pressed | PASS | add.spec 11 (incl. two review tests) |
| Unit: added at the end; the cap holds | PASS | merge.test room cases, addInto.test 3, job.test |
| Device: Add from the file manager through the real picker on API 35, job count unchanged, photo in the job | PASS | place-smoke step 4 (Android's DocumentsUI, a photo in Download): files +1, jobs unchanged, screenshots 08–10 (`docs/evidence/phase-24/2026-10-24/place-smoke-api35-final/`) |
| On the owner's phone | PENDING (owner) | USER-CHECKLIST §Y3 |

## Whole-branch review
- **I1 (Important), fixed:** a pick that came to nothing (receiving cancelled, nothing arrived) left the "add into this
  job" wish behind for 10 minutes, so a later pick from Home could join an earlier customer's job. Now any picker batch
  uses the wish up, and it is used only when every job of the batch came from the picker. Test seen failing first.
- **Minor re-graded Important, fixed:** after Add on the photo list or page order, the "choose this photo" note stayed
  and decided which photo a later Adjust opened on. Those screens take it now. Test seen failing first.
- **Deferred minor:** the plan's "job is not printed" check before adding is missing; harmless, because adding clears
  the printed state, as "Add to this job" already does.

## Coverage statement
**Proven:** both sources, the cap, cancel and close, a gone job and an empty batch in the browser with the mock
engine; the real DocumentsUI pick on API 35.
**Not proven:** the Android photo picker's own multi-select on the owner's phone; very slow providers while adding
(covered by the share pipeline's existing hostile-provider tests, not re-run through Add).
