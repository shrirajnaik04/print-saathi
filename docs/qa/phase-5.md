# Phase 5 — closure report (printing hardening, emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-16-phase-5-printing-hardening.md` (Tasks 1–6).
**Commits:**
- `dafebea` … `25e3ee5`: Tasks 1–5;
- `caf32a0`: gate fixes;
- `be472bf`, `e3e28a8`: re-review fixes.

**Verdict:** **CLOSED for the emulator scope.** Milestone A itself (real Brother, the shopkeeper) is USER-CHECKLIST §I and §G.

## What Phase 5 delivers
- **Test page** from Settings and Help: A4 or 4×6 photo paper.
  - Afterwards it says what to measure (A4: a 5 cm square and 3.5 × 4.5 cm boxes).
  - **The printer's photo paper is remembered:** the exact size, so Android preselects it next time, and its margins.
  - Only a page the printer took counts, never Save as PDF.
  - A 4×6 page on the wrong paper explains how to choose 4×6 or 10×15 cm, or that passport photos will use A4.
  - A first run on 10×15 cm paper asks for one more print to measure.
- **Big jobs print in parts** of at most 40 sheets (collated copies). "PRINT PART 1 OF 2", then "Yes, print part 2 of 2".
  - The job remembers which parts the printer took, so coming back later continues and never reprints a part.
  - A job changed after a part printed says so and starts again.
  - A part keeps its plan across an app restart.
- **Delete all customer files** asks first, keeps a job being printed, and says so.
- **Setup help:** Help explains the one-time printer setup with a test page button. Home (owner section) shows "The shop printer is not set up yet" until a test page has printed on a real printer.
- Already in place from Phase 2 and kept: paper guard (no dead end), Save-as-PDF detection, persisted status, lifecycle safety, PHOTO/DOCUMENT content types.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §D4/E/H2/I-15/16/J8/U "Printing"; phase plan with Review focus |
| Automated verification | vitest 154 (parts property 2000 runs; part progress); scripts 60; JVM (PaperCalibration 6, PrintRecord 7); Playwright 463 (test page flows, parts journeys incl. leave/return/change/restart, Delete all, setup reminder; matrix incl. the 3 new screens) |
| Real-device test | API 35 emulator through Android's print screen (`docs/evidence/phase-5/2026-10-16/e2e-api35.md`): A4 test page saved → square 50.00 × 50.00 mm, boxes 35.00 × 45.00 mm (pdf.js); 48-sheet job → part 1 = 40 pages, 142 KB. 5-level regression: below |
| Adversarial challenge | Independent gate → **FAIL** (M1, M2, m1–m5) → fixed → re-review **FAIL** (N1 Major, N2–N4) → fixed → re-review **PASS WITH FINDINGS** (N5 Minor) → fixed (e2e fails without the fix) |

**Final regression (`e3e28a8`, one emulator at a time):**
- **Instrumentation:** API 24 / 28 / 30 had 33 passed, 0 failed, 4 skipped (skipped by design on those images); API 35 / 36 had 37 / 0 / 0.
- **Other checks:** render check (pdf.js ±0.1 pt), share matrix 15/15 and privacy 0 on every level.
- **Crash buffers:** they hold only expected processes:
  - the deliberate renderer crash test (`chrome://crash`);
  - on API 36, the isolated engine aborting in the HEIC test (ADR-003: HEIC cannot decode inside an isolated process; the test proves the failure stays contained).
- **Earlier attempts:** run in pairs, API 28 and 36 timed out booting (host load); rerun sequentially.
- **Evidence:** `docs/evidence/phase-5/2026-10-16/regression-e3e28a8/`.

## Findings and status

| # | Finding | Status |
|---|---|---|
| M1 | Part progress not saved: coming back reprinted part 1; a change re-cut the parts silently | **Fixed + verified:** `partsDone` / `partPrinting` in the job (vitest); e2e: leave after part 1 → part 2; change after part 1 → notice + start again |
| M2 | A printer without 4×6 sent the owner round in circles | **Fixed + verified:** its own wrong-paper message; unreachable "no photo paper" outcome removed (e2e) |
| m1 | Paper saved even when the printer never took the page | **Fixed:** saved only on sent/printing. On the emulator only Save as PDF exists, which is never saved (device: Home reminder stays) |
| m2 | A test result could come back later out of context; no re-check | **Fixed + verified:** cleared on leaving; polls while settling (e2e) |
| m3 | 4×6 test page always 4×6 in | **Fixed:** made at the saved size; first run on 10×15 cm → N3 |
| m4 | 150 MB part limit dropped silently | **Proven intentional:** ADR-006 (worst measured photo part 130 MB); re-check in Phase 7 |
| m5 | Delete all claimed nothing was kept | **Fixed + verified** (e2e) |
| N1 | A part number from the old plan beat the "job changed" reset | **Fixed + verified:** part honoured only with its plan hash (e2e, mutation-checked) |
| N2 | A failed "part started" save still printed | **Fixed + verified** (e2e) |
| N3 | First 4×6 test on 10×15 cm paper was shrunk | **Fixed + verified:** asks for one more print to measure (e2e) |
| N4 | "Photo paper saved" could reflect an older save | **Fixed:** only this run's outcome is shown |
| N5 | After a restart mid-part, the part buttons lost the plan | **Fixed + verified:** the plan hash is kept in the print record (JVM) and passed at app start (e2e fails without it) |

## Coverage statement

**Proven (emulators):**
- The test page prints at exact size: 50.00 mm and 35.00 × 45.00 mm in the file Android made.
- Save as PDF never counts as set-up.
- Parts:
  - every sheet once, in order, at most 40 (property);
  - a 40-page part through Android's print screen;
  - progress across leaving, changing and restarting (e2e).
- Delete all asks first and reports kept jobs.

**Not proven, and why:**
- **Calibration on a real printer:**
  - the 4×6 size stored and preselected next time;
  - margins;
  - a 10×15 cm printer.
  - Needs the shop printer: USER-CHECKLIST §I3–I4.
- **Part 2's file on a device:** the emulator's Save as PDF never moves to the next part. Navigation and counting are e2e; part 2's file is made by the same renderer: USER-CHECKLIST §I5.
- **Delete all keeping the printing job's file on a device:** the keep rule is native code shared with retention (tested in Phase 2), but no device run printed and deleted at the same time.
- **The shopkeeper doing it alone:** USER-CHECKLIST §G7.
