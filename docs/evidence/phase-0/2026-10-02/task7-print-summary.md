# Task 7 — spike (b) on the emulator and spike (g) / ADR-001

Device: `Medium_Tablet` AVD, API 35, destination **Save as PDF**. The only print destination on the emulator is the spooler's built-in PDF printer. No physical printer was used, and nothing here replaces the real Brother checks in the user checklist.

## Paper guard: preview → final sequence (PLAN §D4)

Scenario: "Passport 4×6 — 1 sheet (document)". Raw report: `task7-print-report-api35.json`, read with `run-as` from `no_backup/spike/last-report.json`.

| # | `onLayout` preview flag | Paper in dialog | Our decision | What the dialog showed |
|---|---|---|---|---|
| 1 | true | Index Card 4x6 (4000×6000 mils, preselected from our request) | REAL_DOCUMENT | 6 passport boxes (`task7-api35-4x6-six-slots.png`) |
| 2 | true | Letter | WARNING_PAGE | Our warning page, options still enabled (`task7-api35-warning-page-fixed.png`) |
| 3 | **false** (save pressed) | Letter | FAIL | "Nothing was printed - the paper was not 4x6. Tap Retry, then choose 4x6 at 'Paper size'." Nothing saved (`task7-api35-final-fail-message.png`) |
| 4 | true (after **Retry**) | Letter | WARNING_PAGE | Warning page, options enabled again, so **no dead end** |
| 5 | true | Index Card 4x6 | REAL_DOCUMENT | Real page |
| 6 | false (save pressed) | Index Card 4x6 | REAL_DOCUMENT | Saved to Downloads |

**Report tail:**
- `jobState: completed`
- `printerId: PrinterId{serviceName=com.android.printspooler/…PrintActivity, localId=PDF printer}` → `savedAsPdf: true`
- `finalMediaMils: 4000x6000`, `finalColorMode: 2` (colour), `copies: 1`
- Minimum margins reported by the PDF printer: `0,0,0,0`

**Saved file:** checked by pdf.js — 1 page, 288 × 432 pt (101.6 × 152.4 mm), 7 images drawn. The spooler **re-writes** the PDF: 34,216 B against our 34,467 B, not byte-identical. Page size and content survived.

## Defects found during this run (all fixed and re-verified on the device)

1. **Warning text clipped, and "4x6 in in" repeated.** Labels now auto-fit their width. The copy is now `PaperMessages.warning`, covered by `TestPageLayoutTest.paperMessagesNeverRepeatAWordAndNameThePaper`.
2. **FAIL message told the user to change a disabled option.** It now says nothing was printed and points at Retry (`failMessageSaysNothingPrintedAndPointsAtRetry`).
3. **The 4×6 test page held only 2 passport boxes.** It now uses the computed slots: 6 at 4 mm edges (`fourBySixHoldsSixPassportSlotsAtFourMillimetreEdges`, plus no-overlap and reading-order tests).
4. **The report was readable only by scrolling the UI.** It is now persisted atomically to `no_backup/spike/last-report.json`. It holds spike data only, no customer content.

## Spike (g): writer comparison

See `docs/decisions/ADR-001-pdf-writer.md`. Raw values come from the `PdfWriterComparisonTest` instrumentation output; the pdf.js parse of every output is in `task7-adr001-pdfjs.jsonl`.

## Not proven here (moves to later tasks or the user checklist)

- **Other Android versions.** The print-dialog sequence is proven on API 35 only. API 24/28/30/36 need a non-WebView trigger, because the factory WebView on old images is too old for the UI.
- **The real printer:** dialog preselection on the Brother service, its minimum margins, ruler measurements (PHOTO vs DOCUMENT, 1 vs 2 sheets), whether mono mode is honoured, and the Brother panel's behaviour on a paper mismatch. These are user-only.
- **Two brand behaviours:** whether a brand print dialog sets `EXTRA_PRINT_PREVIEW`, and the 10×15 cm paper variant.
