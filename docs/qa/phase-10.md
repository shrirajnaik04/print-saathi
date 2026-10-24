# Phase 10 — closure report (robustness, performance, security; emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-10-robustness-performance-security.md` (Tasks 1–6).

**Commits:**
- 92533b0 performance and early black-edge analysis; d57fa89 big-job progress + Cancel;
- 788f4a6 fuzzing; 27b3cdb dependency audit; 959aaaa retention fix + privacy run;
- b1f5c08 New files arrived; b0282b0 damaged PNG/WebP; a56a794 PRINT tap storm + kill matrix;
- 1dd1390 storage full + idle-only daily cleanup;
- gate fixes dc7c355; 289fc95 privacy cold-job proof; e5c503e final kill matrix + perf; closure commit (fuzz contract + this report).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** What only a real phone can prove is USER-CHECKLIST §N (and the performance rows of `docs/evidence/phase-10/2026-10-17/perf.md`).

## What Phase 10 delivers
- **Performance budgets measured** (PLAN §P) through the real app on API 35 (`perf.md`).
  - Fixed: the black-edge check no longer sits between the shopkeeper's choice and Ready (analysis made while Received is shown, stopped at the tap).
  - Not fixable in the app: WebView start-up and memory on a software GPU (cold start mid, idle, low-end peak). Recorded for a real phone.
- **Big jobs:** "Getting the photos ready… 12 of 60" with a bar and Cancel; Ready's "Preparing pages…" has Cancel (PLAN §F6, §H2.7).
- **New files arrived** (PLAN §I-17, §J8), found missing:
  - Start a new job, Add them to this job, or Keep working;
  - every share since the question opened joins it;
  - no Add once the job was printed;
  - merged files keep their own file numbers; nothing is deleted before the merged job is saved.
- **Retention is safe for the job on screen**, also in the cold daily-job process (open jobs kept on disk for the 30-minute restore window). The daily job runs only while the phone is idle.
- **Damaged files:** cut-off or damaged PNGs (critical-chunk CRC, as libpng) and cut-off WebPs are refused like cut-off JPEGs.
- **Phone storage full:** clear words, "Try again", and "Delete old PrintSaathi jobs" (keeps the job on screen) on the share problem, on Received and on Ready.
- **Race guards:** ten quick taps on PRINT, on a choice or on Back.
- **Tooling:**
  - `npm run audit` (fails only on what ships, fails closed);
  - `scripts/device/kill-matrix.mjs` (20 screens, normal and "Don't keep activities");
  - `scripts/device/privacy.mjs`;
  - seeded fuzzing (JVM, vitest, device).

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §P, §Q, §R levels 8–12, §U Recovery/Privacy/Robustness, §F6, §J8; phase plan with Review Focus |
| Automated verification | Phase 10 added: vitest (detector fuzz 3, addItems 4, merge 4, stack 1), JVM (FuzzTest 3, OpenJobsTest 6, JobMergeTest 4, ImageScanTest 7), scripts (audit 4), e2e (New files 6 + matrix, races 3, storage 3, black-edge I5 1, big jobs 2) |
| Real-device test | **Emulators:** API 35 tablet (`emulator-5580`) and API 36 phone at 2.0× text (`emulator-5582`): perf, kill matrix ×2, privacy, engine fuzz, low storage, New files arrived, cold daily job (evidence below) |
| Adversarial challenge | Own adversarial passes (fuzz, kill matrix, low storage, races, privacy) found F1–F7; gate review: 0 Critical, 8 Important, 11 Minor |
| Final regression | See "Final regression" below |

## Evidence (`docs/evidence/phase-10/2026-10-17/`)
- `perf.md`, `perf-api35.json`: PLAN §P rows (see the verdict column; misses are WebView on a software GPU, pending a real phone).
- `kill-matrix-api35.json`, `kill-matrix-dont-keep-api36.json`: HOME → `am kill` → reopen on 20 screens.
- `privacy/privacy-api36.json`, `privacy/privacy-log-hits-api36.txt` (empty), `privacy/recents-*.png`.
- `engine-fuzz-api35.txt`: 160 mutated photos + 60 mutated PDFs through the isolated engine. Every result is decoded or a file error; the engine kept working.
- `audit.txt`: shipped npm packages and the 51 release-classpath packages: no known vulnerability. Build/test-tool advisories are listed for review.
- `new-files-device.md`: share → share → Add → the print file contains the added photo.

## Findings and status

| # | Finding | Status |
|---|---|---|
| F1 | The daily retention job (own process, no web app) deleted an old job restored on screen | **Fixed + verified:** OpenJobs on disk (JVM red first; device: cold job forced, job on screen kept) |
| F2 | New files arrived (planned Phase 2 Task 4) never built nor ruled | **Fixed + verified** (e2e red first; device API 35) |
| F3 | Cut-off/damaged PNG and cut-off WebP printed with blank rows | **Fixed + verified:** ImageScan (JVM red first; device fuzz 78 → 2 of 80 PNGs decoded, the 2 harmless) |
| F4 | Ten synchronous PRINT taps → ten print requests (native guard existed) | **Fixed + verified** (e2e red first) |
| F5 | "Delete old PrintSaathi jobs" (PLAN §J8) missing on storage full | **Fixed + verified** (e2e red first; device /data at 150 MB free) |
| F6 | ANR "No response to onStartJob": the daily job ran at start during the WebView's first frame (API 36, PC under load) | **Fixed + verified:** idle-only (device test red first; no job run at start) |
| F7 | HARNESS promised `npm run audit`, which did not exist | **Fixed** |
| F8 | Settings is still the Phase 1 skeleton (shop name, prices, defaults, retention choice, 15-min screenshots, problem report) | **Open, planned:** Phase 10b (`docs/superpowers/plans/2026-10-17-phase-10b-settings-and-problem-report.md`), next |
| Gate I1–I8 | Merge numbering, New files state/batches/re-print, black-edge queueing, audit/privacy false PASS, ledger claim | **Fixed + verified** (each with a test seen failing first, except the Received storage button and the privacy-script changes, which are tooling verified by their runs) |
| Gate M1, M2, M4–M9 | Clock back, save latency, cold job proof, kill PASS needs a kill, repeat share, restored question, merge guard, delete wording | **Fixed** |
| Gate M3, M10, M11, M6 (second half) | Idle-only cleanup timing, CRC cost on giant PNGs, orphan links after a failed Add, repeat of an added job | **Proven intentional** (rulings in the ledger) |

## Coverage statement
**Proven (emulators, synthetic files):**
- Every screen of a job comes back after process death, normally and with "Don't keep activities", with no duplicate import.
- Retention keeps the job on screen in both processes.
- Backups are refused; the release build has no internet.
- No path, file name, tag or password appears in any app, engine or WebView log line of a full session.
- Hostile and mutated files are refused or decoded, never crash the app.
- Storage full is handled at intake and at render.
- Quick taps cannot double-print.
- Shares during an open job are never lost.

**Not proven, and why:**
- **Performance on a real phone.** Emulator CPU is a desktop's and the GPU is software (USER-CHECKLIST §N1–N3).
- **Android ≤ 12 Recents protection (FLAG_SECURE).** Those emulator images show the "update WebView" gate, so it was not reached through the UI (§N7).
- **Overnight idle cleanup on a real phone** (§N6).
- **Real WhatsApp shares during an open job** (§N4–N5).
- **The release build's behaviour beyond its manifest and permissions** on the shopkeeper's phone (Phase 12).

## Final regression (`e5c503e`, sequential, `docs/evidence/phase-10/2026-10-17/regression-final/`)
- **Instrumentation:**
  - API 28 / 30: 58 passed, 0 failed, 4 skipped (by design on those images);
  - API 35 / 36: 62 / 0 / 0;
  - API 24: 57 / 1 / 4. The one failure was the new mutated-PDF fuzz: Android 7's PDF library crashed inside the isolated engine (contained, the app and the engine's next call unaffected) and the test only accepted file errors. That is the containment the plan asks for, so the test's contract now accepts a contained engine death too (the app marks the file damaged after two, EngineRenderer). Rerun on API 24: 10/10 (`instrumentation-api24-2gb-fuzz-rerun.txt`: 60 mutated PDFs → 8 decoded, 38 refused, 14 contained engine deaths).
- **Every level:** share 15/15, render check PASS, privacy hits 0.
- **Crash buffers:**
  - the engine only (the Android 7 PDF library on hostile PDFs; the API 36 deliberate crash and HEIC tests);
  - the WebView renderer killed on purpose by AppSafetyDeviceTest (API 35/36);
  - two Google system apps failing at emulator boot (API 35).
  - No PrintSaathi app-process crash.
- **PC side:** lint, typecheck, vitest 244, scripts 64, e2e 786, JVM 261, build + size (JS 47.0 KB, CSS 3.2 KB gzip), release build + binary-manifest checks (release and debug).
