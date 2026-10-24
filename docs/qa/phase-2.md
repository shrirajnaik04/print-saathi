# Phase 2 — closure report (intake, job safety, engine thumbnails, walking skeleton)

**Plan:** `docs/superpowers/plans/2026-10-03-phase-2-intake-jobs-walking-skeleton.md` (Tasks 1–9).
**Commits:** `474fbea` … `f536f90` (+ evidence commits).
**Verdict:** **CLOSED for the emulator scope.** Milestone A0 (the shopkeeper prints WhatsApp photos on the shop printer) is **not proven**: it needs your phone, the shopkeeper and the printer (`docs/spikes/USER-CHECKLIST.md` §G).

## What Phase 2 delivers

A share from WhatsApp → **Files received** (numbered photos, duplicate banner) → **One on each page** → **Ready to print** (every sheet, the summary line, PRINT) → Android's print screen → **Printing** result with its next step and "Did it print correctly?".

Underneath it:
- **Hardened intake:**
  - caps of 200 MB per file and 1 GB per job;
  - free-space checks;
  - a 20 s stall limit that works even where Android cannot interrupt a blocked read;
  - a 3 min overall limit;
  - `.part` files, and a per-share journal that keeps files already received if the app dies.
- **Revision-checked job store:** a stale write can never overwrite newer choices.
- **Isolated engine:** it makes the thumbnails and the 300 dpi print images. Cut-off JPEGs are reported as damaged, and progressive JPEGs over the phone's memory budget are refused before decoding.
- **Print file:** `print.pdf` built from the plan. Copies are collated, sideways pages are turned onto the portrait sheet, the file is re-opened in the engine to count its pages, and only then renamed into place.
- **One print at a time:**
  - the paper guard;
  - a persisted print record;
  - result states (sent, printing, needs attention, saved as a file, nothing printed, wrong paper, interrupted, failed, couldn't check), with "checking" while Android settles the job.
- **Recent jobs and Continue:**
  - automatic deletion (1 day, 1.5 GB cap; on start, on resume, after printing, and daily);
  - a crash-loop breaker (safe start);
  - recovery when the web renderer crashes;
  - the same screen restored within 30 minutes.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §D2–D5, E, F2/F3, G0–G2, J3, J8; phase plan Tasks 1–9 |
| Implementation | Commits above; ledger `.superpowers/sdd/…/progress.md` (git-ignored) |
| Automated verification | vitest 104, scripts 54, JVM 150 (27 classes), Playwright 218 (screens × 5 viewports × 4 text sizes + flows), Android lint |
| Real-device test | Emulators only: API 24 / 28 / 30 / 35 / 36 (`regression-final/`); API 35 end-to-end, kill matrix (`task6-7-print-e2e-api35.md`, `kill-restore-api35.md`) |
| Evidence | `docs/evidence/phase-2/2026-10-03/` |
| Adversarial challenge | Independent gate review → **FAIL** (1 Critical, 4 Important, 6 Minor) → fixes → re-review → **PASS WITH FINDINGS** (8 new, N1–N8) → all fixed; self-found defects below |
| Focused re-test → regression | Each fix has a test that fails without it (mutation-checked where marked); final 5-level regression on `f536f90`: share matrix 15/15 and render check PASS on every level; the one failing test (a test-asset bug) fixed and re-tested 7/7 on API 24 + 35 (`regression-final/SUMMARY.md`) |
| Self-audit | This report: coverage statement and "not proven" list |

## Gate findings and status

| # | Finding | Status |
|---|---|---|
| 1 | **Critical:** a stalled share froze all background work on API 24/28 (close() cannot wake a blocked read there; 69 s, and later shares queued behind it) | **Fixed + verified.** Reads run on a thread the copier can abandon on time. Intake has its own thread. One stalled file ends the rest of that share. Abandoned readers are capped (32) and freed when they end. Proof: `CopyLimitsTest` (uninterruptible stall; fails rather than hangs if reverted) and the hostile share matrix 15/15 on API 24 (stall 20.5 s) and on every level of the final regression. **Open:** Cancel while receiving, because there is no receiving screen yet (see "Needs your decision") |
| 2 | A share arriving mid-pickup was dropped; a startup race could open Received over the safe-start screen | **Fixed + verified:** `intakeRunner` (3 tests, mutation-checked) |
| 3 | "Share it again" within 60 s did nothing; receive failures were silent | **Fixed + verified:** the claim is released when no file arrived; a repeat share opens the existing job; receive failures go to the Problem screen (e2e) |
| 4 | One interruption marked a good photo "damaged" for good; hashes outlived jobs | **Fixed + verified:** 2 deaths needed, and "engine not ready" is not counted; thumbnails offer Try again; marks and the latest-share pointer are pruned with their jobs (`PoisonMarkersTest`, `JobSweeperTest`, e2e `mockRetry`) |
| 5 | Result could say "Sent" or "Nothing printed" wrongly; it never re-checked | **Fixed + verified:** a "checking" state (8 s); Ready and Result keep asking every 2 s while the printer works (`PrintResultTest`, e2e, mutation-checked). Real printer timing not proven (§G) |
| 6 | Only the top screen's job was protected from deletion | **Fixed:** every job on the screen stack is protected; the first sweep waits for the restored stack |
| 7 | A crash between save and acknowledge left the share listed on every start | **Fixed + verified** (`flow.test` RED→GREEN) |
| 8 | An interrupted share forgot the files it had received | **Fixed + verified** (`IntakeJournalTest`) |
| 9 | Spinners that never end; PRINT stuck "busy" | **Fixed:** panels with Try again on Ready and Received; `PrintFlow` resets when the print screen fails. The load-failure path is code-reviewed, not e2e-tested |
| 10 | Thumbnails didn't check the file's folder | **Fixed** (same rule as printing) |
| 11 | A photo could drop out of the print silently | **Fixed + verified:** Ready names it (e2e) |
| N1–N8 | Re-review: thread leak / long hold-up, retry vs damaged, Result polling stopped on a repeated state, stuck "checking", Ready loop after leaving, doubled Received, no intake if start checks fail, a late write | **All fixed.** N3, N6, N7: e2e RED→GREEN or mutation-checked. N1: JVM. N2: e2e. N4, N5, N8: code |
| — | Renderer-crash device test errored on API 28/30 | **Proven intentional (test fixed):** those emulator images ship a WebView older than the app accepts, so the app shows its "update WebView" screen and there is no page renderer to crash. The test now skips there with that reason. It passes on API 35/36 |

**Ruling (decided, ledgered):** a job counts as printed once the printer has queued it (PLAN §D4: "A job counts as sent once queued"). The reviewer suggested waiting for completion. The cost if that is wrong: a queued job on a switched-off printer stops being offered as Continue. Recent still lists it, and the Result screen now changes to "needs attention".

### Defects I found myself (also closed)
- **Sideways badge:** at 320 px and 200 % text it covered the photo, yet every automated check passed. Moved beside the page label (screenshot).
- **Restore:** PLAN §D5 restore (same screen within 30 minutes) was in no task. Added.
- **Deleted job:** opening one showed a blank screen for ever. Now there is an explanation and Home.
- **Phase 0 carry-overs:** truncated and oversized progressive JPEGs were never implemented. Done.
- **Process slips** (caught; rules in the ledger):
  - A mutation run used a stale e2e build.
  - I edited `regress.sh` while a run was executing it, so the API 35 run lost its tail. That level was re-run.
  - A recursion bug (`onFinished`) was caught before it compiled.

## Coverage statement

**Proven, by method:**
- **Layout and plan:**
  - property tests (each photo once, inside the printable area, aspect error ≤ 0.1 %, order, deterministic);
  - a TS ↔ Kotlin contract fixture;
  - a pdf.js read-back of the device-made file (boxes within 0.1 pt, page sizes, turned flags) on every regression level.
- **Print images:**
  - upright pixels for portrait, sideways and EXIF-rotated photos;
  - never enlarged;
  - 300 dpi of the box, rounded up (device test).
- **Intake:** the hostile share matrix (lying length, unknown length, stall, mid-stream error, zero bytes, endless stream, `file://`, own-app URIs, Office, mixed, octet-stream PDF) on 5 levels.
- **Recovery:**
  - kill and restore on Received, Ready and Result (API 35), with no duplicate imports;
  - a kill during the print screen gives "interrupted";
  - renderer crash survived (API 35/36);
  - daily deletion job registered.
- **Retention:** time-shifted JVM tests (1 h / 1 day / 7 days, orphans, protected jobs, cap, scratch).
- **Screens:**
  - 5 viewports × 4 text sizes with axe WCAG 2.2 AA, ≥ 56 px controls, no split words, no sideways scroll;
  - visual review at 320 px / 200 %.
- **Privacy:**
  - no customer paths or names in the app's log lines (0 on all levels; any hit is now saved for diagnosis);
  - Save as PDF offers `PrintSaathi.pdf`;
  - the print record and saved screen stack hold ids only.

**Not proven (stated, not assumed):**
- **Real hardware and people:**
  - a real phone, a real WhatsApp share, and the shop printer: sent, printing, blocked and failed states, the wrong-paper guard in a vendor dialog, and the physical size and scale (USER-CHECKLIST §A, §B, §G);
  - The shopkeeper doing it alone (§G7).
- **On emulators:**
  - Android's own timing for moving a job from "created" to "queued" (handled by "checking"; real order unverified);
  - "Don't keep activities"; the kill matrix on API 24–30 and 36;
  - renderer-crash recovery while the print screen is open (the deferral is code only);
  - storage running out during a real write;
  - Received/Ready load-failure panels (code only).
- **Ready preview:** it is drawn from the plan with engine thumbnails, not rendered from `print.pdf`. The real-file preview with SSIM ≥ 0.98 is Phase 4 scope.
- **Performance budgets (PLAN §P):** not measured on phones (Phase 10).

## Needs your decision
1. **Cancel while receiving** (PLAN §D2 "Cancel works at any moment"). There is no receiving screen yet: the app only learns of a share once it has been received. I propose adding Cancel together with "Choose from phone" (the next intake work). This needs your OK to defer.
2. **Retention choice in Settings** (1 h / 1 day / 7 days). It is fixed at 1 day until the Settings screen phase.
3. The ADR-001 / ADR-002 / ADR-003 and language decisions are still open from Phase 0 (USER-CHECKLIST, "Decisions").
