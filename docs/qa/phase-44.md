# Phase 44: closure report (Office files named, Print with WPS Office, text files)

**Spec:** `docs/superpowers/specs/2026-10-27-round-9-office-files-design.md`, Phase 44.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 57–61.
**Rulings and open findings:** `docs/qa/phase-44-47-rulings.md`.
**Evidence:** `docs/evidence/phase-44-47/2026-10-27/` (SUMMARY.md lists every run).
**Commits:** 40cffd7, 2e51ba2, 3cd7d34, e1a0453; review fixes 8e2ec55. Stage APK 1.0.293.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the shop phone with WPS Office installed: USER-CHECKLIST §AF2, AF3, AF6, AF8.

## What Phase 44 delivers
- **The owner's error is gone.** A Word, PowerPoint or Excel file shared from WhatsApp no longer shows "Office file: can't be printed yet". It is named "Word file", "PowerPoint file", "Excel file" (or "Office file").
  - The engine looks inside the file: zip names, old binary stream names, the OpenDocument type, RTF. It never trusts the file's name.
- **Print with WPS Office.**
  - It hands the customer's own file to WPS Office (or another office app when WPS is missing) through a private, read-only, one-file link named "Customer file.docx".
  - With no office app it says: "Install WPS Office from the Play Store to print this file."
  - A second tap while opening does nothing.
- **A shared .txt file prints as a text message** (round 8's text pages).
- **More file types reach PrintSaathi from the share sheet:** OpenDocument, RTF and CSV.
- **The customer's original is kept as `NNNN.office`** inside the job's private folder, beside any pages made from it.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Kinds named from the file's inside (Word/PowerPoint/Excel; OOXML, old binary, OpenDocument, RTF) | PASS | OfficeKindTest 5, SnifferTest (RTF, review C1) |
| Hostile files (zip bomb, DOCTYPE, deep nesting, too many entries, truncated zip) refused, never a crash | PASS | SafeReadersTest 14; device `aHostileDocxIsRefusedNotCrashed` |
| The original kept beside its pages; a failure keeps the kind | PASS | OfficeIntakeTest 8 (review I3 RED first) |
| Hand-off link private, read-only, token-scoped; no names | PASS | OfficeSharesTest 5; manifest check (provider not exported) |
| The Office card, the words, the double-tap guard, no-app message | PASS | office.spec 10 (e2e), jargon and wording checks |
| A real device: docx/doc/odt/pptx/xlsx shared from another app → named and kept; Print with WPS → install message; txt → Text message · 1 page | PASS | round9-smoke API 35 (Phase 44 run 7/7; final run in SUMMARY) |
| The release build does the same | PASS | p44-release-office.json |
| WPS on the shop phone opens and prints the file | PENDING (owner) | §AF2 |

## Coverage statement
**Proven:**
- kinds and limits by JVM tests on synthetic files;
- the card and hand-off by e2e tests;
- the share → card → hand-off path on an API 35 emulator with no office app installed.

**Not proven:**
- WPS Office itself opening the hand-off (no WPS on the emulator);
- real customer files;
- the shop phone's share sheet.
