# Phase 10c — closure report (MVP completion; emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-10c-mvp-completion.md`.

**Why this phase:** the Phase 10b audit found 11 R2 MVP items (PLAN §K) missing or partial.

**Commits:**
- 5b381df 4×6 photos + Paper;
- f704b82 blurry warnings;
- bbaf9d3 print-service check;
- 3eccf80 + be97f2f unprintable files named;
- a82f0ee No → problem report;
- ea8ff64 locked PDF: Print without this file;
- 11014d7 page buttons;
- 0b6eccf Recent covers + Print again;
- ae2508b first start;
- d8626a9 duplicates on Ready;
- a042675 receiving progress + Cancel;
- bbb43ba gate-review fixes;
- the closure commit.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION** (USER-CHECKLIST §P).

## What Phase 10c delivers
- **Photos on 4×6 photo paper (PLAN §K3, §I-6/7):**
  - Change → Paper offers 4×6 once the shop printer's 4×6 test page has calibrated it; until then it offers A4 and says how to add 4×6.
  - Every Change screen previews and counts on the paper the job really prints on.
  - A job set to 4×6 on a printer without it says "A4 (4×6 paper not set up)" and prints on A4.
  - The paper printed last is how the next photo job starts.
  - On 4×6 the photos go to the print service as a document, for exact size (ruling I4).
- **"This photo is small — it may print blurry" (PLAN §F6):** for every layout, at the PLAN thresholds: photos < 100 dpi, documents < 120 dpi, passport < 200 dpi.
- **No printing app (PLAN §D4, §I-18):** Home and Help say "No printing app on this phone" when Android has no print service (Android 7).
- **Files that cannot be printed are named, never dropped (PLAN §J8):** Office, video, iPhone and other files are named on Received and Ready, each with what to do.
- **After "No, it looks wrong":** the help, Print again, and Send problem report.
- **Locked PDF:** "Print without this file" leaves it out (no Undo, ruled).
- **Ready:** Previous / Next page buttons with "Page k of n". They stay pinned while small, and the label follows scrolling.
- **Recent jobs:**
  - each job's first photo;
  - Print again for printed jobs;
  - screenshot protection on Android ≤ 12.
- **First start:** four short steps (share from WhatsApp, pin, set up the printer, don't change the print screen), shown once.
- **Duplicates on Ready:** the same photo twice in a document or mixed job offers Keep both / Remove extra copy.
- **Receiving a big share (PLAN §D2, §H2.7):**
  - "Receiving files… k of n" with a bar and Cancel, after one second (quick shares never flash it).
  - Cancel stops only that share. What arrived waits in Recent jobs and says how to get the rest.
  - Back only leaves the screen.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Automated | vitest: plan (4×6, paperOf, content type), blurry, unprintable, messages, settings. JVM: PlanRendererTest dpi, RenderPlanContractTest photo4x6, PrintServicesTest. e2e: every new flow + 9 gate-review tests; matrix + axe for Welcome, Receiving, Paper, passport count |
| Device (API 35) | Welcome, Receiving 2 of 6 → Files received, quick 20-photo share without a flash, Office note, Recent covers (`docs/evidence/phase-10c/2026-10-17/device-README.md`). Print services on Android 7 and 15: PrintServicesDeviceTest in the regression |
| Adversarial | Gate review: 0 Critical, I1–I9, M1–M12. All Important fixed with a test seen failing first. Minors fixed, deferred or ruled (ledger) |
| Final regression | See "Final regression" below |

## Findings and status

| # | Finding | Status |
|---|---|---|
| Phase 10b audit | 11 MVP items | **Fixed + verified** (Tasks 1–11) |
| I1 | A slow share over an open job skipped "New files arrived" | **Fixed + verified** |
| I2 | The phone's Back on Welcome brought it back | **Fixed + verified** |
| I3 | "Can't be opened" after Remove extra copy | **Fixed + verified** |
| I4 | 4×6 photos sent as PHOTO (borderless risk) | **Fixed + verified** (document, ruled); real print = §P1–P2 |
| I5 | Change screens drew A4 for 4×6 jobs | **Fixed + verified** |
| I6 | 4×6 chosen but not set up: printed A4 silently | **Fixed + verified** |
| I7 | Recent covers without screenshot protection | **Fixed + verified** |
| I8 | Page buttons scrolled away; label ignored scrolling | **Fixed + verified** (pinned while ≤ 15 % of the screen, ruled) |
| I9 | Back cancelled receiving; Cancel stopped every share | **Fixed + verified** |
| M1, M3, M5, M6, M12 help | Receiving restored; iPhone files twice; stopped message without next step; cancel set leak; help text | **Fixed** (M1, M3, M5 with tests) |
| M2, M4, M7–M11, M12 rest | See ledger | **Deferred** (minor; listed for the owner below) |

**Deferred minors** (none affects what prints):
- M2: restore after a first-start share lands on Home (the job is in Recent).
- M4: the duplicates banner says "photos" for duplicate PDFs.
- M7: a slow one-file share shows no Receiving screen.
- M8: a print file cached before this update shows no blurry warning.
- M9: blurry warnings name photos in received order.
- M10: no busy guard on two Ready buttons.
- M11: the print-service check is not re-checked on resume.
- M12: Welcome has text steps but no pictures; Result asks again after the problem report.

## Coverage statement
**Proven (emulators and PC):** everything listed above under "Device (API 35)" and "Automated".

**Not proven:**
- 4×6 photos on the shop Brother: size and quality as a document (§P1–P2).
- Receiving a real 30+ photo WhatsApp share (§P4).
- The print-service warning on the shopkeeper's phone (§P5).
- Welcome after an update on the shopkeeper's phone (§P3).
- The pinned page buttons at the shopkeeper's text size (§P6).

## Final regression (`bbb43ba`, sequential, `docs/evidence/phase-10c/2026-10-17/regression-final/`)
- **Instrumentation:**
  - API 24 / 28 / 30: 59 passed, 0 failed, 4 skipped (by design on those images);
  - API 35 / 36: 63 / 0 / 0.
  - Both counts include the new PrintServicesDeviceTest: Android 7 has no print service, Android 15 has Android's own.
- **Every level:** share 15/15, render check PASS, privacy hits 0.
- **Crash buffers:**
  - the isolated engine only: Android 7's PDF library on EngineFuzzDeviceTest's mutated PDFs (contained), and API 36's deliberate crash and HEIC tests;
  - the WebView renderer killed on purpose (API 35/36).
  - No PrintSaathi app-process crash.
- **PC side:** lint (0 errors), typecheck, vitest 295, e2e 1056, script tests, Android lint + JVM.
