# Phase 4 — closure report (black & white, real-file preview, file size)

**Plan:** `docs/superpowers/plans/2026-10-03-phase-4-bw-and-real-preview.md` (Tasks 1–6).
**Commits:** `bcb61ed` … `3bcc179` (Tasks 1–6), gate fixes `59847c2` … `a7a54b1`, re-review fixes `779423a` … `a89fc3e`.
**Verdict:** **CLOSED for the emulator scope**, with one item that needs real photos (file size, §P) and the
printer checks in USER-CHECKLIST §H.

## What Phase 4 delivers
- **Black & white that really is grey** (PLAN §F4, §G2, §D4):
  - the engine turns every photo into exact Rec.601 grey before encoding, so every decoded pixel has R = G = B (ADR-005: `YuvImage` was rejected because it tinted edge blocks);
  - Android's print screen is asked for **Black & White** (`COLOR_MODE_MONOCHROME`);
  - **Change → Colour** offers Colour or Black & white, each shown as its real first page; drawn previews use the same Rec.601 weights.
- **Ready shows the real print file** (PLAN §G7.3):
  - once the file is made, each page is rendered back from `print.pdf` by the isolated engine and replaces the drawing;
  - sideways pages are turned for display only;
  - work happens one page at a time on its own thread with one engine connection. A newer plan or PRINT stops it, a page the engine can't show stays drawn, and pages already made come straight from storage.
- **File size per page** measured against PLAN §P: a 12 MP photo-like page is 0.98 MB in colour and 0.91 MB in grey.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §F4/G2/G7/D4/P/U; phase plan with its Review focus |
| Automated verification | vitest 144; scripts 60; JVM (Grey, plan bw, writer); Playwright 382 (Colour flow, file pages, missing page, no old pages after a change in place or via Change, previews pause while printing, Rec.601 filter; matrix 5 viewports × 4 text sizes) |
| Real-device test | Emulators only. 5-level regression on `a89fc3e`: see below. API 35: B&W end to end (print screen preselects Black & White; saved PDF 0 non-grey pixels), 6 file pages shown from the engine, SSIM 0.984 / 0.986. API 30: share behind the WebView gate (before/after) |
| Adversarial challenge | Independent gate → PASS WITH FINDINGS (F1–F8) → fixed → independent re-review → PASS WITH FINDINGS (N1 Major, N2–N6 Minor) → fixed (each with a failing-first or mutation-checked test, or device before/after) |
| Self-found defects | API 30 share lost files behind the WebView gate; the test sender sent six identical photos while the matrix still passed; a device run tested a stale web app (all fixed, see below) |

**Final regression (`a89fc3e`):**
- **Instrumentation:** API 24 / 28 / 30: 33 passed, 0 failed, 4 skipped (by design on those images: no renderer callback before API 26, no HEIC isolation, no native PDF unlock). API 36: 37 / 0 / 0.
- **API 35:**
  - the first run stopped at test 34 of 37 with "Process crashed", so its render check had no file (finding R4);
  - two fresh-boot reruns: 37 / 0 / 0 with the render check PASS;
  - also 3 full suites and 15 runs of the crashing test class on a running emulator: 0 failures.
- **Share matrix:** 15/15 on every level (six-photos now needs 6 different files).
- **Render check:** pdf.js ±0.1 pt PASS on every level that produced a file.
- **Privacy:** 0 app log lines with private paths on every level.
- **Measured (identical on every level ±0.02 %):**
  - SSIM 0.9839 / 0.9864;
  - colour page 0.98 MB, grey 0.91 MB;
  - busy synthetic page 3.25 MB (reported).
- Evidence: `docs/evidence/phase-4/2026-10-16/regression-final-a89fc3e/`.

## Findings and status

| # | Finding | Status |
|---|---|---|
| F1 | Previews blocked the shared io thread | **Fixed + verified:** own executor, one page per call, newer plan stops older requests (device: 6 pages 0.25 s apart) |
| F2 | Size test was flattering | **Fixed (honest test)**, result in N1 |
| F3 | Missing checks (SSIM, grey preview, determinism) | **Fixed + verified** on device (SSIM ≥ 0.98, 0 non-grey preview pixels, byte-identical colour file after a B&W round trip) |
| F4 | Drawn grey used CSS weights | **Fixed + verified:** Rec.601 SVG filter; e2e red → 76 and the computed filter (mutation-checked) |
| F5 | Unchecked rename | **Fixed** (`.part` deleted, no path returned) |
| F6 | A test passed by timing | **Fixed** (`mockNoPreview`; stale-page tests) |
| F7 | Docs and evidence | **Fixed:** ADR-005, PLAN §G2 note, date folders, this report, traceability rows 16 and 20–21 |
| F8 | No free-space check on previews | **Fixed**, then refined in N4 |
| N1 | Size budget not dispositioned | **Blocked (needs real photos):** the realistic synthetic page is well inside the budget (0.98 MB colour / 0.91 MB grey); a deliberately busy synthetic page is 3.25 MB, over the 3 MB budget. The budget can't be forced without lowering print quality, which CLAUDE.md §5 forbids. Real camera photos are USER-CHECKLIST §H4; the quality-vs-size choice is a decision row for the owner |
| N2 | A new engine process per preview page | **Fixed:** one connection per run of pages, closed 3 s after the last, on a newer plan, or when printing starts |
| N3 | Behind the WebView gate, Back or the app icon showed a blank page and could end the share early | **Fixed + verified (API 30):** the gate is shown again whenever MainActivity comes forward; Back leaves the app; 6/6 distinct files, 0 permission denials (`phase-4/2026-10-16/api30-gate-n3.md`) |
| N4 | One missing page hid all later pages; 200 MB floor for a 150 KB image | **Fixed + verified:** e2e (failed first); 20 MB floor for new preview images; existing images always shown |
| N5 | Two tests would pass with the fix reverted | **Fixed:** both mutation-checked (CSS `grayscale(1)` and the render hash guard each make a test fail) |
| N6 | Previews kept the engine busy during Android's print screen | **Fixed + verified:** e2e (failed first: 3 requests during the dialog; now ≤ 1) |
| R1 | API 30 (WebView 83): MainActivity finished at once behind the gate, ending the share's read permission mid-copy | **Fixed + verified:** 2/8 → 13/13 six-photo runs, 15/15 matrix, 0 denials (`phase-4/2026-10-03/api30-gate-share-fix/`) |
| R2 | The test sender made six identical photos and the matrix passed | **Fixed + verified:** distinct photos; `six-photos` now needs 6 different files (test failed first) |
| R3 | A device run used a stale web bundle (Ready called a removed method and quietly kept its drawings) | **Fixed + verified:** `regress.sh` refuses to run when a web source is newer than the bundle (`web-fresh.mjs`, 4 tests) |
| R4 | API 35 regression: one "Process crashed" during PlanRenderDeviceTest (test 34 of 37) | **Blocked (not reproducible), cause unknown:** the crash happened once, in 1 of 6 full API 35 runs. In the 20 runs since it hasn't come back (2 fresh-boot reruns, 3 full suites, 15 runs of the class). No log of the crash itself was kept. `regress.sh` now saves Android's crash buffer for every level. The reruns' buffers hold only the deliberate renderer crash (`chrome://crash` test) and two system apps. If it happens again, that buffer will show which process died and why |

## Coverage statement

**Proven (emulators, API 24/28/30/35/36):**
- B&W print files hold only grey pixels in every page image, and the print screen preselects Black & White (API 35).
- The Ready preview is the engine's render of the real print file. It agrees with an independent drawing of the plan (SSIM ≥ 0.98, upright and sideways), is grey for B&W, and is never shown for an older plan (e2e for both kinds of change).
- The colour file is deterministic across a B&W round trip.
- Shares are never cut short behind the WebView gate (slow sender, Back, app icon, double share).

**Not proven, and why:**
- **File size with real camera photos:** no real photos are allowed in the repo; USER-CHECKLIST §H4.
- **Grey output and preview-vs-paper on the shop Brother:** printer not available; USER-CHECKLIST §G3, §H2–H3. Ink use is the printer's choice (PLAN §R7).
- **PLAN §P "Choice → Ready ≤ 4 s / ≤ 8 s incl. render-back":** not measured with a stopwatch harness yet (Phase 10). Observed on API 35: 6 file pages within about 2 s of the print file.
- **A real phone with an old WebView:** none available; the gate was tested on the API 30 emulator image (WebView 83).
- **30+ page jobs:** pages load lazily in the WebView, but every page is still rendered in the engine (one at a time, stopping on change or PRINT); not measured on a 2 GB phone.
