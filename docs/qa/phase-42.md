# Phase 42: closure report (a customer's text message printed)

**Spec:** `docs/superpowers/specs/2026-10-26-round-8-photo-gap-text-scan-design.md`, parts 42a–42c.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 53–54 ("Share it, or paste it").
**Rulings and open findings:** `docs/qa/phase-41-43-rulings.md`.
**Evidence:** `docs/evidence/phase-41-43/2026-10-27/` (SUMMARY.md lists every run).
**Commits:** 3bb24da (engine), 44e516a (native), b2a117c (screens), 6c02541 (review fixes I1 and I5).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check with WhatsApp on the owner's phone: USER-CHECKLIST §AE2–AE4.

## What Phase 42 delivers
- **Two ways in:**
  - **Shared from WhatsApp** (Share → PrintSaathi): the message opens straight on Ready.
  - **Home → Text message:** a big box with **Paste** (a button; no press-and-hold needed) and Done. What was typed survives Back.
- **The print:** the isolated engine makes an A4 PDF of the text (36 pt edges, 1.15 line spacing). WhatsApp's marks print as bold, italic, struck through and fixed-width; the marks themselves are not printed; a mark without a partner, or inside a word (`2*3*4`, `snake_case`), prints as typed. Marathi / Hindi letters print with the phone's own fonts.
- **Afterwards an ordinary document:** Ready says **Text message · N pages**, with Colour / B&W, copies, Pages to print and PRINT, plus **Edit text** (the box filled in; Done makes the PDF again). **Change → Text size:** Small 10, Normal 12 (default), Large 14, Extra large 18 pt, each with a sample.
- **Refusals that say what to do:** empty text ("There is no text to print."); over 100,000 characters ("…Ask the customer to send it as a PDF.").
- **Storage and privacy:** the text is kept as `src/NNNN.txt` beside its PDF in the job's own folder; every native path is checked to be inside that job's folder; the text is never logged.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| WhatsApp's marks: pairs only, on one line, never inside words; marks not printed | PASS | WhatsAppMarksTest 8 (RED first) |
| A4 pages as needed; bigger size → more pages; Devanagari ink; empty / too long / wrong size refused; 99,000 characters in 0.6 s | PASS | TextPdfDeviceTest 6 on API 35 (5 RED with the drawing stubbed) |
| The intake: one PDF file with its text beside it; problems leave no half files; Edit text / size remake inside the job only | PASS | TextIntakeTest 5 (RED first) |
| Job model: text size kept, a size never offered dropped, setTextPdf; summary "Text message"; problem lines | PASS | text.test 5 (RED first) |
| Screens: paste, empty / too long, nothing copied, a share straight to Ready, Text size → more pages, Edit text, 320 px | PASS | text.spec 7 (written first) |
| Device: an 80-line WhatsApp share (English, Devanagari, marks) → Ready "Text message · 2 pages" → 2 A4 pages in the print file; Edit text shown | PASS | round8-smoke API 35 `textPrintsAsA4Pages`, screenshot 01 |
| Review: a text added to another job keeps Edit text and Text size (I1); a share that could not print can be shared again at once (I5) | PASS | JobMergeTest, merge.test (RED first); round8-smoke `failedTextCanBeSharedAgain` RED on the device before the fix, GREEN after |
| WhatsApp on the owner's phone | PENDING (owner) | USER-CHECKLIST §AE2–AE4 |

## Coverage statement
**Proven:** the marks parser, the engine's PDF, the native intake and the screens by tests written first; the share path and the print file on an API 35 emulator with the test sender standing in for WhatsApp.
**Not proven:** WhatsApp's own Share of a text message on the owner's phone (its exact intent), emoji drawing (the phone's emoji font decides; not tested on a device), and Devanagari shaping by eye (the device test counts ink; the round 8 smoke's screenshot 01 shows it shaped correctly on API 35).
