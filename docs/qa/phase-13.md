# Phase 13 — closure report (Office / Fluent look and motion)

**Spec:** `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md` Part 1 (approved by the
owner: direction "A · Office (Fluent)").
**Plan:** `docs/superpowers/plans/2026-10-23-phase-13-office-look.md`.
**Commits:** ee89605 tokens, d7a1902 components, 0a14f56 motion, 6ad692d device evidence, 1ad64e3 gate-review fixes,
0638751 in-app Received mark, 7605fb6 fair performance A/B.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION** (the look and motion on the shopkeeper's real phone: USER-CHECKLIST
§U; the print-file time with motion on: §N1).

## What Phase 13 delivers
- **Look (Office / Fluent):** light grey background, white cards with depth and a visible 1 px edge (measured ≥ 3:1),
  coloured icon badges per job on Home, indigo primary actions, the paper previews on a light stage. Every text pair
  at AAA (≥ 7:1) and every non-text pair ≥ 3:1, measured from the stylesheet by `tokens.test.ts`; no raw colour in any
  screen.
- **Motion:** screens slide the way the shopkeeper moves (forward from the right, back from the left, a fade otherwise and for
  Back on Home); short choice lists rise in a wave (first six, all within 400 ms); buttons press; busy buttons show a
  small spinner; the Result check mark draws. Everything is a compositor animation (transform/opacity) inside
  `prefers-reduced-motion: no-preference`: with "Remove animations" on, nothing moves.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement | spec Part 1; owner chose direction A |
| Plan | phase-13 plan; ledger rulings (wave 240/40 ms, opt-in rise, reduced motion in the layout matrix) |
| Implement | commits above |
| Automated | tokens.test (32 pairs + raw-colour guards), primitives tests, e2e motion tests (direction, ≤ 400 ms on the main screens, reduced motion, no replayed entrance), the whole layout + axe matrix |
| Device | API 35 screenshots (`docs/evidence/phase-13/2026-10-23/device-api35/`) |
| Performance | fair A/B against the Phase 12 web app on the same emulator (`perf-ab/`, README there) |
| Adversarial | gate review: 0 Critical, I1–I7 and M1–M10 (ledger); all Important fixed with tests seen failing (I1 mutation-checked) |
| Final regression | phase-15/2026-10-23/regression (Phases 13–15 together) |

## Performance (honest reading, `docs/evidence/phase-13/2026-10-23/README.md`)
- Choices on screen after a share: 0.29–0.33 s (Phase 12: 0.29–0.59 s), by the app's own mark.
- uiautomator sees moving screens ~1 s later (it waits for a still screen); not what people see.
- **Measured cost:** the 6-photo print file takes ≈ 0.25 s longer with motion on (2.40–2.45 s vs 2.13–2.41 s; motion
  off 2.14 s) on the software-rendered emulator. PENDING a real phone; the fallback (pause the spinner while the
  engine renders) is ready if a phone shows it.

## Rulings (ledger)
- No exit animation and no true crossfade (one screen mounted: a late tap can never land on the old one).
- Progress bars stay the native element; bottom bars use an upward shadow.
- Tap feedback ≤ 100 ms rests on CSS `:active` (no JS) and compositor-only motion; not measured on a phone (§N).
- The look's screenshots on API 36 at 2.0× text come from the final regression run.

## Deferred minors (owner's call)
- M2/M3/M10 partly done (motion test coverage, token clean-up); details in the ledger.

## Final regression and release (Phases 13–15 together, `docs/evidence/phase-15/2026-10-23/regression/`, `release/`)
- **Device, debug build:** API 24 (2 GB) instrumentation 65 passed / 0 failed / 6 skipped (by design on that image),
  API 35 71 / 0 / 0, API 36 at 2.0× text 71 / 0 / 0; share matrix 15/15 on each; pdf.js render check PASS; privacy
  hits 0; no PrintSaathi crash in the crash buffers. (API 35/36 ran at c5559ac; the Phase 15 review fixes after it
  were re-checked by the card/face device test on API 24, the card and rotation smokes on API 35 and the release run.)
- **PC:** lint (0 errors), typecheck, vitest 354, script tests, build, size (JS 60.7 KB gzip of a 60 KB budget:
  under 1 KB to spare), Android lint + JVM, full e2e on the final code 1273 passed / 0 failed (earlier runs found 28
  failures, all fixed: see the ledger).
- **Release:** `apk/PrintSaathi-1.0.176-8bcaf35.apk` (1.5 MB, the pinned PrintSaathi key, no INTERNET, not
  debuggable, no backup): release-smoke on API 35 PASS; the card flow and auto-rotation on the release build PASS.

## Coverage statement
Proven on the PC (Chromium) and the Android 15 emulator WebView: contrast by measurement, layout at 320–480 px and
800×360 at 100–200 % text, motion timing and reduced motion, no change to the print path. **Not proven:** how the
motion feels and costs on the shopkeeper's real phone and GPU; TalkBack with motion on a real phone.
