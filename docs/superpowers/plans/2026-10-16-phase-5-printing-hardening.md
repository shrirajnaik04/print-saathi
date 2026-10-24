# Phase 5 — Printing hardening (emulator scope): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:** finish what the shop needs around printing so that Milestone A (real Brother + the shopkeeper) is only a matter of
running the USER-CHECKLIST:
- a real **test page** from Settings and Help that also **remembers the shop printer's paper** (calibration);
- **big jobs print in parts** (PLAN §D4: ≤ 40 sheets per part), so a 100-page job never hangs a small phone's spooler;
- **Settings** does what it lists for printing and privacy (test page, delete all customer files);
- **setup help** says how to pick the printer once and to change nothing on Android's print screen.

**Spec:** PLAN §D4 (paper calibration, test page, parts, content types), §E (Delete all), §H3/§I-15/§I-16 (Settings,
Help), §J8 (failure table), §U "Printing". Already done in Phase 2 and kept: paper guard, Save-as-PDF detection,
persisted status, lifecycle safety, PHOTO/DOCUMENT content types.

**Exit (PLAN §T1, Phase 5):** real Brother: photo jobs print correctly; guard and interruption cases behave; the shopkeeper
session. **These are owner checks** (USER-CHECKLIST §B, §G, §H and a new §I); on emulators the exit is: every
task's tests green, 5-level regression green, independent gate closed.

## Global constraints
- Exact paper sizes only from what the print service reports (mils); 4×6 class = 4×6 in (4000 × 6000) or
  10 × 15 cm (3937 × 5906), ± 3 mm; Landscape never matches (existing `paperMatches`).
- Calibration stores no customer data: printer name/id, paper sizes and margins only (state/paper.json, never
  backed up).
- Parts: at most **40 sheets** per part, counted as printed (pages × copies, collated). Every part is its own
  print file and plan hash; the part number is always on screen ("Part 1 of 3").
- Plain words (H2.12): "test page", "photo paper", "part"; never "calibration", "media", "spool".
- No new dependencies.

## Review focus
1. A part must never print pages of another part, and Print again after part 2 must not restart at part 1 silently.
2. A test page print must never be mistaken for a customer job (Recent, Continue, retention, Result wording).
3. Calibration must not change A4 jobs when a printer reports odd A4 mils; only the 4×6 class is remembered.
4. Delete all must not delete the file Android's print screen is reading (protectedHash) and must confirm first.
5. A job of exactly 40 sheets is one part; 41 is two.

---

### Task 1: Paper calibration store (JVM)
- `print/PaperCalibration.kt`: `fun photoClass(mils: Pair<Int, Int>): Boolean` (4×6 class ± 3 mm, either
  orientation); `data class Calibration(printer: String, photoMils: Pair<Int,Int>?, a4MarginsMils: Margins?,
  photoMarginsMils: Margins?)`; JSON load/save (atomic) in `state/paper.json`.
- `PdfPrintAdapter` gains an optional `onLayoutSeen(selectedMils, minMargins, printerId)` used only by the test page.
- **Tests:** 4×6 in and 10×15 cm accepted, 5×7 and A6 refused, rotated sizes accepted, corrupt JSON → null.

### Task 2: Test page as a product feature
- Native `printTestPage({paper: 'A4' | 'PHOTO_4x6'})` → writes `state/testpage-<paper>.pdf` (existing `TestPages`,
  wording for the shop: "Measure the square: it should be 5 cm") and opens Android's print screen through
  `PrintFlow` with a **test** record (`kind: 'test'`, no job id). On the final layout it records calibration.
- `PrintFlow`: record gains `kind`; `status` returns `kind`; `clear` deletes only the test file for tests.
- Web: Result screen for `kind: 'test'` says what to check ("Measure the black square: 5 cm on each side?") and,
  for 4×6, whether the photo paper was found ("4×6 photo paper saved for passport photos" / "This printer did not
  offer 4×6 photo paper; passport photos will use A4").
- **Tests:** JVM record kind round-trip; e2e test flow + both 4×6 outcomes (mock); device: test page prints to Save
  as PDF and the saved PDF has the 50 mm square at 141.73 pt ± 0.1 pt (pdf.js).

### Task 3: Big jobs print in parts
- TS `core/plan/parts.ts`: `splitParts(plan, maxSheets = 40): PrintPlan[]` — expand collated sheets
  (copy-major), cut consecutive runs ≤ 40, each part `{...plan, pages: run, copies: 1}`.
- Ready: when parts > 1, the summary says "Prints in 3 parts" and the button says **PRINT PART 1 OF 3**; each part is
  rendered when it is about to print; Result after a part offers **PRINT PART 2 OF 3**; the job counts as printed
  only after the last part.
- **Tests:** vitest property (every sheet exactly once, in order, ≤ 40, 40 → 1 part, 41 → 2, copies 99 × 1 page);
  e2e 41 sheets → part flow end to end with mocks; device: a 45-page part flow to Save as PDF (part 2 has 5 pages).

### Task 4: Settings — test page and Delete all
- Settings rows: **Print a test page** (A4 / 4×6 photo paper choice) and **Delete all customer files** (confirm
  screen; native `deleteAllJobs` already keeps protected ids). Other rows stay "coming".
- **Tests:** e2e confirm + cancel; device: delete all leaves the printing job's file.

### Task 5: Setup help
- Help: "Setting up the printer (once)" — pick the shop printer at the top of Android's print screen, print a test
  page (button), measure the square; "On the print screen, change nothing — just tap the print button".
- Home: a one-time card "Before the first print: set up the printer" until a test page has been printed.
- **Tests:** e2e card shows until a test print reports sent; jargon lint.

### Task 6: Closure
- 5-level regression; API 35 end to end: test page (A4 + 4×6) to Save as PDF; 45-sheet job in parts.
- Independent gate + re-review; `docs/qa/phase-5.md`; traceability §22–23; USER-CHECKLIST §I (real printer: test
  page ruler, 4×6 found, a 2-part job, the shopkeeper).
