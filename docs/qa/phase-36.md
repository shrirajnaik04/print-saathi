# Phase 36: closure report (PRINT back at once, deleting jobs)

**Spec:** `docs/superpowers/specs/2026-10-25-round-5-copy-paste-cards-drag-zoom-print-back-design.md`, parts 36a–36b.
**Plan:** `docs/superpowers/plans/2026-10-25-phase-33-36-round-5.md`, Tasks 8 and 9.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 42–43.
**Rulings and open findings:** `docs/qa/phase-33-36-rulings.md`.
**Evidence:** `docs/evidence/phase-33-36/2026-10-25/` (SUMMARY.md lists every run).

**Commits:**
- 9a9e5e9: PRINT back at once when the print screen closes without printing.
- e049e32: delete one or all jobs on Recent jobs.
- 2196fe1: review fix M6 (a failed delete is said; a kept printing job is explained).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AB7–AB8.

## What Phase 36 delivers

**36a: PRINT back at once (item 7).** Before, Back on Android's print screen left PRINT showing "Opening the print screen…" for up to 8 seconds, while the app checked whether anything had printed.
- **The cause:** when the print screen closes before Android asks for the final file, no print was sent, but the app still waited for a job to appear.
- **The fix:** the app now records whether Android asked for the final file. If it did not, and the job is only created, cancelled or not found, the result is "not sent" at once, and Ready shows PRINT again.
- A print that did go through is still checked as before.

**36b: deleting jobs (item 8).** Recent jobs has **Delete** on each job and **Delete all jobs**, each asked once (Keep / Delete).
- A job being printed is kept, and Recent jobs says so.
- A failed delete says "Couldn't delete the job. Try again."
- Old jobs were already deleted by themselves 1 day after last use (Settings → Delete customer files after), and Settings' Delete all still exists. The app keeps customer files only under its private no-backup folder.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Closed before the final file was asked for: "not sent" at once; asked for: checked as before | PASS | PrintResultTest 2, PrintRecordTest 1 (RED first), wire names |
| Ready: PRINT enabled at once after Back; TestPage back to its choice; app start clears it | PASS | ready.spec "back from the print screen" ×3 (RED first) |
| Delete one: asks, Keep keeps it, Delete removes it from Recent and Home; Delete all: asks once, empties the list; failures and kept jobs said | PASS | recent.spec ×4 (RED first) |
| Device: Back on Android's print screen → PRINT enabled on Ready about 1 s later (including adb reads) | PASS | round5-smoke API 35 `backFromPrintScreenPrintAtOnce` (1010 ms) |
| Device: Delete all jobs empties Recent jobs and the app's jobs folder | PASS | round5-smoke API 35 `deleteAllEmptiesRecentAndTheJobsFolder` |
| The owner's Brother print screen and phone | PENDING (owner) | USER-CHECKLIST AB7–AB8 |

## Coverage statement

**Proven:**
- The print outcome by JVM tests.
- The screens by e2e.
- Back on stock Android's print screen, on an API 35 emulator.

**Not proven:**
- **Print screens from other makers (Samsung, MIUI)** that might not ask for the final file when Print is pressed. That would show "not sent" for a job still being created. This is a ruling, checked by AB7.
- **Whether the WebView keeps a deleted job's cover picture in its cache** until the next Delete all (ruling).
