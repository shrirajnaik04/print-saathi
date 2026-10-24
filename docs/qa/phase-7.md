# Phase 7 — closure report (documents & locked PDFs, emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-7-documents-locked-pdfs.md` (Tasks 1–6).

**Commits:**
- `3bf5c22` engine reads and draws customers' PDFs;
- `b9ecdd9` deterministic fixtures;
- `cc7f2f3` document jobs and plans;
- `508d229` print files for documents;
- `d3df252` native document API;
- `29a9a28` in-app unlock (ADR-002 option i);
- `e16d45f` screens;
- `b399514` one-pass grey (performance);
- `2ca4c8d` watchdog unit;
- gate fixes `f4715a8`, `322817c`;
- re-review fixes `c883364`, `af3192f`.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Milestone C itself needs real PDFs on the shop printer, your own e-Aadhaar, and the shopkeeper's phone (USER-CHECKLIST §D, §K, §C).

## What Phase 7 delivers
- **A shared PDF prints in 1 tap (PLAN §J5).** The share goes straight to Ready: "1 PDF · 4 pages · A4 · Black & white · 1 copy" → PRINT. Photos shared together with PDFs become pages in received order.
- **Two paths (PLAN §G4):**
  - **Untouched:** the customer's own file, byte for byte. Used only for one unlocked PDF with every page, in order, unturned, in Colour, 1 copy. The engine checks this again natively, and a re-open checks the page count.
  - **Processed (everything else):**
    - each page is drawn at 300 dpi onto white and fitted to A4 in its own shape (a wide page goes on a sideways sheet);
    - colour pages are JPEG q92;
    - Black & white pages are lossless grey (Flate with PNG predictors) when they fit 1.5 MB, otherwise exact-grey JPEG.
- **Change (documents):**
  - **Pages to print:** a tick per page with its image; All pages / No pages. A PDF of more than 300 pages opens here first.
  - **Page order:** a grid of pages; a tap opens Move earlier / Move later / Turn.
  - **Colour** and **Copies** (sets collated).
- **Locked PDFs (PLAN §G5, ADR-002):**
  - A PDF with only an owner password opens with no questions.
  - **Unlock PDF:** the e-Aadhaar helper (letters made CAPITALS + year of birth on the number pad, asks for a missing part), or Other password. Suggestions, autocorrect and autofill are off; Show writes the password large below the field.
  - Phones with built-in unlock (Android 15, or 11–14 with the SDK extension) open the file inside the engine with the password, which is held in memory for that call only.
  - **Other phones (ADR-002 option i):**
    - the app unlocks the file with pdf-lib;
    - it sends the copy in ≤ 256 KB chunks, ≤ 20 MB, in order (the one bridge exception);
    - the copy becomes usable only after the last chunk.
- **Privacy:**
  - Passwords live only in memory, per job, and are forgotten when the job leaves the screens and on restart.
  - Decrypted data is marked and deleted on leaving the job, on restart, and by the sweep for jobs not on screen: the unlocked copy, page images made with a password, and print files and previews.
  - While the job is open, its next part and Print again work.
- **Robustness:**
  - The engine reads facts and draws pages under a 60 s limit (inside its lock), with poison markers for page images too.
  - There is one engine call at a time app-wide, so a crash is counted once, against the file in the engine.
  - A damaged facts cache is read again.
- **Plain messages:** locked, damaged, can't open this kind of lock, too big, forms/stamps may not show (only on phones whose engine can't draw them), "This PDF has 620 pages. Only the first 500 can be printed…", "Unlock the PDF first. Then you can choose its pages…".

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §G4, §G5, §I-7, §I-12, §J5, §J8, §F6, §Q, §U (Documents, Locked PDFs); phase plan with Review focus 1–5; owner decisions 2026-10-17 (ADR-002 accepted) |
| Automated verification | <ul><li>**vitest 209:** document plans 11, unlock 8, passwords 3, page queue 3</li><li>**JVM:** PdfMarks, GreyFlate, DocFacts, FactsCache 2, UnlockedCopy 4, Decrypted 3, JobSweeper (+2), Watchdog 3, EngineTurn 2, PlanRenderer 17, RenderPlanContract 7</li><li>**Playwright 668:** J5, Pages to print, Page order and page tools, locked (helper, Other, missing year), NONE-tier unlock with chunks, damaged, forms, > 300, > 500, mixed, no page choices while locked; matrix + axe for 4 new screens</li></ul> |
| Real-device test | **Emulators only** (`docs/evidence/phase-7/2026-10-17/`): <ul><li>**Device suites:** CustomerPdf 6 and DocumentRender 5 on API 35 and API 24 (2 GB).</li><li>**API 35 end to end:** shared PDF → B&W print file (DeviceGray Flate, 3 × A4); Colour untouched file SHA-256 = received file; Save as PDF detected; locked AES-256 PDF: wrong/right password; `RAMA1965` 0 hits in logcat and app storage; decrypted data kept while open, gone after Home.</li><li>**Performance:** 10 B&W pages 2.6 s (engine); 40 B&W pages to the print file in 9.4 s; 20 repeated jobs, app memory 144 → 134 MB.</li></ul> |
| Adversarial challenge | <ul><li>**Gate:** C1 + I1–I6 + M1–M6 → fixed.</li><li>**Re-review 1:** I1–I3 + m4–m7, I1 reproduced on device → fixed.</li><li>**Re-review 2:** no Critical/Important; m1–m3 + nit fixed, m4 not reachable.</li><li>**Own findings:** Turn on a photo page did nothing; empty-year message.</li></ul> |
| Fix → focused re-test → regression | Every fix has a test seen failing first, except EngineTurnTest (written after the lock; noted in the ledger). Full vitest, JVM, e2e and API 35 instrumentation after each round |

**Final regression (`af3192f`, sequential, one emulator at a time):**
- **Instrumentation:**
  - API 24 / 28 / 30: 46 passed, 0 failed, 4 skipped (by design on those images);
  - API 35 / 36: 50 / 0 / 0.
- **Every level:** share matrix 15/15, render check (pdf.js ±0.1 pt) PASS, privacy hits 0.
- **Crash buffers, engine process only:**
  - API 24: one SIGSEGV inside Android 7's own libpdfium while closing a broken fixture, i.e. the hostile-PDF test, contained (the test passed).
  - API 36: the deliberate renderer crash and the contained HEIC abort (ADR-003), as in Phase 6.
- **Evidence:** `docs/evidence/phase-7/2026-10-17/regression-af3192f/`.

## Findings and status

| # | Finding | Status |
|---|---|---|
| C1 | A locked PDF could take the untouched path: the encrypted copy failed the check, or the pdf-lib re-save printed as "the customer's file" | **Fixed + verified:** `unlocked` fact + `RenderItem.locked` (vitest, PlanRendererTest RED→GREEN) |
| M4 | The native untouched check did not require page order / no turns | **Fixed + verified** (RenderPlanContractTest failed on the old code) |
| I1 | > 500 pages silently cut | **Fixed + verified:** first 500 offered, Ready says so (e2e) |
| I2 | A PDF unlocked later was left out of an earlier page choice | **Fixed + verified:** no page choices while a PDF is locked or read (e2e) |
| I3 | Back loop on > 300 pages | **Fixed + verified** (e2e) |
| I4 | Page images unbounded, no poison markers, timer started before the lock | **Fixed + verified:** lazy, queued, cancelled; markers; timer inside the lock (e2e < 100 images of 320) |
| I5 | Passwords and decrypted data kept after leaving | **Fixed + verified:** keepOnly + Decrypted (vitest, JVM, device) |
| I6 | Unlocked copy deleted between parts | **Fixed + verified:** kept while the job is open (JVM, device) |
| M1 / M2 / M3 / M5 / M6 | Wording for a failed PDF; "… of … pages"; Page order images and shapes; atomic facts cache; unsupported lock shown as a wrong password | **Fixed + verified** (e2e / FactsCacheTest / unlock.test) |
| own | Turn on a photo page of a document did nothing | **Fixed + verified** (vitest RED→GREEN) |
| R1-I1 | Sweep deleted `work/` of the open job (mark and unlocked copy) | **Fixed + verified:** reproduced on device, JobSweeperTest + DecryptedTest, device re-check |
| R1-I2 | One engine death could be counted twice | **Fixed + verified:** EngineClient.turn (EngineTurnTest) |
| R1-I3 | Page-image requests not cancelled | **Fixed + verified:** PageQueue (3 tests) |
| R1-m4–m7 | Failed image never retried; start-up keepOut; scratch left by forget; page counts | **Fixed + verified** |
| R2-m1–m3, nit | Dying engine reused; IOException left a mark; death outside the turn; empty helper | **Fixed** (m1/m2: code + device suite; m3, nit: code/e2e) |
| R2-m4 | Screen reused for another job | **Proven intentional / not reachable:** no navigation changes jobId on a mounted screen (re-reviewer checked every push/replace) |
| obs | On a 2560 × 1600 landscape tablet the PRINT bar flows after the preview | **Proven intentional (Phase 1 rule):** pinned only while ≤ 25 % of the screen; the shopkeeper's phone is used upright |

## Coverage statement
**Proven (emulators, synthetic fixtures):**
- Facts and rendering of 20 fixtures (sizes, landscape, rotated, mixed, forms, stamps, tiny/huge, 120/320 pages, hostile files contained).
- Selection order and collated copies.
- Byte-identical untouched path.
- Grey-only B&W with lossless text pages.
- Locked PDFs per tier, wrong password, unsupported lock.
- Password never on disk or in logs (grep).
- Decrypted data lifecycle.
- Performance targets on API 35.

**Not proven, and why:**
- **Real e-Aadhaar** (USER-CHECKLIST §D).
- **Real customer-like PDFs on the shop printer and the shopkeeper doing J5** (§K).
- **The shopkeeper's phone tier, i.e. whether ADR-002 (i) is the path there** (§C, §D6).
- **Forms/stamps on a real old phone** (§K6).
- **Process death in the middle of an unlock transfer on a device:** covered by UnlockedCopyTest and start-up cleanup; no device kill test.
- **A PDF that truly hangs PdfRenderer:** no such fixture. The watchdog is unit-tested, and engine death handling is device-tested from Phase 4.
- **Performance on a real low-end phone.**
