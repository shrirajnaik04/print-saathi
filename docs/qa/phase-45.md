# Phase 45: closure report (Word files made into pages)

**Spec:** `docs/superpowers/specs/2026-10-27-round-9-office-files-design.md`, Phase 45.
**Rulings and open findings:** `docs/qa/phase-44-47-rulings.md`.
**Evidence:** `docs/evidence/phase-44-47/2026-10-27/`.
**Commits:** 0b4c40a, 5aafba7; shared layout 2581f28; review fixes 8e2ec55. Stage APK 1.0.296.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check with real customer Word files: USER-CHECKLIST §AF1, AF7.

## What Phase 45 delivers
- **A .docx file becomes pages while it is received** ("Getting the Word file ready…"). Ready shows "Word file · N pages" and the note "Made from a Word file. Check the preview — it may look a little different from Word." It prints like any PDF (Colour/B&W, copies, Pages to print).
- **Drawn inside the isolated engine** with Android's own tools (no new library, no network):
  - page size, margins and orientation per section;
  - styles, headings, lists;
  - tables (grid, borders, shading, merged cells, rows split at a page end);
  - pictures at up to 300 dpi of their printed size;
  - headers and footers (including a different first page) with page numbers;
  - fields' saved text and tracked changes as accepted;
  - footnotes at the end; text boxes after their paragraph;
  - Devanagari in the phone's fonts.
- **Honest about what it leaves out.**
  - Charts, diagrams, shapes, pictures the phone cannot draw and symbol-font marks become grey boxes or are noted: "Some parts (charts, diagrams) print only from WPS Office."
  - Files in old Hindi fonts (Kruti Dev …) and files over 500 pages are not made into pages; they keep Print with WPS Office.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Styles, lists, tables, sections, breaks, pictures, charts, fields, tracked changes, headers/footers, footnotes, text boxes read as the spec lists | PASS | DocxReaderTest 17 (RED first) |
| One-page letter → one A4 page; headings taller; table borders where the grid puts them (±3 px); a picture at its paragraph; Devanagari ink; long files flow and stop at the limit; unsupported parts still print the text; empty file → one blank page; hostile files refused; landscape sections | PASS | OfficePdfDeviceTest (Word part) on API 35 and in the instrumentation suite on API 24, 35, 36 |
| 20 full-size phone photos made in time, print file within size | PASS | `aWordFileWithTwentyPhonePhotosIsMadeInTime` (46 MB, 7.9 s on API 35; RED at 104 MB before the fix) |
| A real device: a shared .docx → Ready "Word file · 1 page", A4 print file, original kept, Print with WPS still offered | PASS | round9-smoke `docxBecomesPages` |
| Real customer Word files look like Word | PENDING (owner) | §AF1 |
| Time on the shop phone for a photo-heavy file | PENDING (owner) | §AF7 |

## Coverage statement
**Proven:**
- every listed feature on synthetic files by JVM tests;
- the drawing by device tests (pixel positions read back from the PDF) on API 24, 35 and 36;
- the share → pages path on an API 35 emulator.

**Not proven:**
- real customer files: their variety (fonts, layouts) is the main risk, which is why the preview note is always shown;
- the shop phone's speed.
