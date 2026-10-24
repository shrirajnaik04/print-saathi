# Phase 9 — closure report (smart auto-crop + manual crop, emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-9-smart-and-manual-crop.md` (Tasks 1–5). Rules as built: `docs/smart-crop.md`.

**Commits:**
- `87e7b66` analysis bytes;
- `48327c6` detector + worker;
- `6ecbc70` Black edges? + crops + Print as document;
- `e391038` manual crop;
- `7f93d59` device run;
- gate fixes `a8c33ff`;
- re-review fixes `c786e6b`, `f7c4566`, `9e457cf`, `9e0dff7`.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Milestone D on real pictures, and the shopkeeper cropping alone, are USER-CHECKLIST §M.

## What Phase 9 delivers
- **Analysis bytes:** for each photo, upright at ≤ 512 px as exact grey, made in the isolated engine within a time budget and read by a Web Worker by URL. No bytes cross the bridge.
- **Black-edge detector (PLAN §F5):**
  - Uniform black borders, plus white borders for documents and PNG screenshots.
  - Suggested only with confidence ≥ 0.9, including a sharp-step rule that keeps night skies and objects on black from being cropped.
  - Never applied without the shopkeeper's yes.
- **Black edges? / Edges to remove?:**
  - One question per job, right after the choice, with the photo now and without the edges.
  - Remove (the shopkeeper's own crops win) or Keep as they are.
  - Never asked again; never left with stale suggestions.
- **Crop:**
  - Photo tools → Crop, and a document's page tools → Crop for photo pages.
  - Big buttons: Move ↑ ↓ ← →, Bigger, Smaller, Whole photo, Reset.
  - Corner handles to drag (an extra).
  - Starts on the photo's crop, else on the edges found.
- **Crops in the job and the plan:**
  - Kept on the photo as stored upright, so they survive Turn.
  - Laid out with their cut shape and printed through the engine's crop decode.
  - The customer's file never changes.
- **Print as document** now works for photo shares (black & white pages, PLAN §J6).
- **Navigation hardening (all screens):**
  - Each stack entry is its own screen.
  - A screen that is no longer on top cannot navigate (late saves after Back, Home or a new share).
  - Safe start leaves only Home under its notice.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §F1, §F3, §F5, §H2.5, §I-3/8/9, §J1, §J6, §U; phase plan with Review focus 1–5 |
| Automated verification | <ul><li>**vitest 232:** detector on a seeded synthetic corpus of 160 — 100/100 bars found within 1 %, 0/60 suggestions on negatives; turned-input property; crops 6; crop frame 3</li><li>**JVM:** AnalysisGrey 2</li><li>**Playwright 749:** black edges, keep, J6, no edges, never reused, leave early, manual crop, Reset, the corner drag after the switch, same page after Crop, a late save after Home, Back then the same screen again, safe start; matrix + axe for 3 new screens</li></ul> |
| Real-device test | **Emulators, API 35:** <ul><li>AnalysisDeviceTest 2 (bars; EXIF-turned photo analysed upright).</li><li>Through the app: a bars photo → the question → a print image of 1600 × 758 px in a 2.116 : 1 box on a sideways sheet; the customer's file SHA-256 unchanged (`phase-9/2026-10-17/device-README.md`).</li></ul> |
| Adversarial challenge | <ul><li>**Gate:** 3 Important + 7 Minor.</li><li>**Re-review 1:** 3 Important (incl. a new one) + 3 Minor.</li><li>**Re-review 2:** 1 Important.</li><li>**Re-review 3:** 1 Important + an older safe-start bug.</li><li>All fixed, each with a test seen failing first (except where noted in the ledger).</li><li>**Found while testing:** the browser cancelled corner drags after one move.</li></ul> |

**Final regression (`9e0dff7`, sequential; also green at `7f93d59`, `a8c33ff`, `c786e6b`, `f7c4566` and `9e457cf`):**
- **Instrumentation:**
  - API 24 / 28 / 30: 54 passed, 0 failed, 4 skipped (by design on those images);
  - API 35 / 36: 58 / 0 / 0.
- **Every level:** share 15/15, render check PASS, privacy hits 0.
- **Crash buffers:** only the contained Android 7 libpdfium hostile fixture and the API 36 deliberate/HEIC entries, as in Phases 7–8.
- **Evidence:** `docs/evidence/phase-9/2026-10-17/regression-final/`.

## Findings and status

| # | Finding | Status |
|---|---|---|
| G I-1 | A screen opened after the shopkeeper left Received; the native analysis had no time limit | **Fixed + verified:** time budget + deadline; now covered by the stack-entry guard (e2e) |
| G I-2 | An earlier choice's (white-edge) suggestion was reused | **Fixed + verified** (e2e failed first) |
| G I-3 | No crop review for photo pages of documents | **Fixed + verified:** Crop on the page tools (e2e) |
| G M-1–M-7 | Whole photo not sticking, no Reset, pointer edge cases, unknown shape, wording, docs, test gaps | **Fixed + verified** (e2e / vitest / device EXIF test) |
| R1 I-A | A same-screen reuse kept the old job's state and late work | **Fixed + verified:** screens keyed and guarded by stack entry |
| R1 I-B | A corner removed mid-drag could leave dragging stuck | **Fixed + verified:** handles never removed; the cancelled pointer (browser drag) found and fixed (e2e failed first) |
| R1 I-C | A document's photo page was squashed | **Fixed:** drawn like Ready (PaperPreview), grey for B&W |
| R1 m-1–m-3 | Page tools lost the page after Crop; late suggestions after an answer; wording, title and count | **Fixed + verified** (e2e, vitest) |
| R2 | Late `go()` from screens no longer on top (page tools, Black edges, Crop) | **Fixed + verified:** `go` does nothing for a screen off the top (e2e failed first) |
| R3 | The string key repeated after Back + same screen; safe start kept the old screen under the notice (older) | **Fixed + verified:** entry-object identity, stack updated at once (both e2e failed first) |
| R4 | Keying by entry made the page tools reload on every move (flash, PDF read again, focus lost) | **Fixed + verified:** a same-screen replace keeps its identity (e2e focus test failed first) |
| R3 m | A stale drag after the photo area is redrawn; "style" in the page preview has no visible effect (same as Ready) | **Fixed** / **Proven intentional** (PaperPreview draws the plan's images; the print file carries the style) |
| known limit | A dark area ending in a straight full-width line looks like a bar | **Proven intentional / documented:** The shopkeeper is asked first; Keep, Whole photo or Crop undo it (`docs/smart-crop.md`) |

## Coverage statement
**Proven (emulators, synthetic pictures):**
- Detector metrics on the seeded synthetic corpus.
- One question per job across Back, re-choices and leaving.
- Crops survive turns and print in their cut shape.
- The source file stays unchanged.
- Manual crop with buttons and with handles.
- Late work never navigates behind the shopkeeper.

**Not proven, and why:**
- **Real screenshots, scans, dark photos and black-background photos** (USER-CHECKLIST §M; the owner's own pictures).
- **The shopkeeper doing it alone** (§M5).
- **Time to analyse 100 real photos on a real phone** (the budget makes it fail safe).
- **Paper-rectangle detection / straightening and internal dividers:** Phase 2 (PLAN §L1, §L3), not V1.
