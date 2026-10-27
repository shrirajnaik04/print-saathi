# Phase 47: closure report (Excel files made into table pages; low priority)

**Spec:** `docs/superpowers/specs/2026-10-27-round-9-office-files-design.md`, Phase 47.
**Rulings and open findings:** `docs/qa/phase-44-47-rulings.md`.
**Evidence:** `docs/evidence/phase-44-47/2026-10-27/`.
**Commits:** f014de9, 2513e21; review fixes 8e2ec55. Stage APK 1.0.302.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check with a real fees or marks sheet: USER-CHECKLIST §AF5.

## What Phase 47 delivers
- **Each visible sheet of a .xlsx file becomes table pages.** Ready shows "Excel file · N pages" and the "check the preview" note.
- **What is printed:**
  - the values Excel last saved (no formula is worked out);
  - numbers in their format: General, fixed decimals, thousands, ₹ and other symbols, Indian lakh formats, percent, dates and times, 1904 calendars;
  - bold and alignment; column widths; merged cells; light grid lines; the print area when set.
- **How it is laid out:**
  - empty rows and columns at the end are left out; each sheet starts a new page;
  - it is shrunk to the page width down to 50 %, then the columns carry on to later pages;
  - the first row repeats at the top of every page;
  - A4 sideways only when the table is wider than tall and too wide for an upright page.
- **Honest:** a number too wide for its column shows `####` (never cut digits), as Excel does. Cut text, formulas with no saved result and sheets with charts set the "check the preview" note.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Shared/typed text, number formats (incl. literals, conditions, zero padding), hidden sheets, merges, print area, trimming, fit to 50 % then split, first row repeated, sideways rule, numbers too wide, 1904 dates, formulas with no result | PASS | XlsxReaderTest 14 (RED first) |
| 200 rows → several pages, each with the header row at the top; grid lines where the columns and rows are | PASS | OfficePdfDeviceTest (Excel part) on API 24, 35, 36 |
| A real device: the sample fees sheet → "Excel file · 1 page", upright A4 | PASS | round9-smoke `xlsxBecomesTablePages` |
| Real sheets print as the shop expects | PENDING (owner) | §AF5 |

## Coverage statement
**Proven:**
- number formatting and page splitting by JVM tests;
- drawing by device tests;
- the share → pages path on an API 35 emulator.

**Not proven:**
- real sheets: cell colours, wrapped text and Print Titles are not drawn (see rulings).
