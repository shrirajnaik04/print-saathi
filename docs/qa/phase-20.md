# Phase 20 — closure report (the splash shows the whole logo)

**Spec:** `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`, Part 1.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-20-24-place-anywhere-scanner-crop.md`, Tasks 1–2.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md` row 5.
**Commits:**
- ff36788 the splash shows the whole logo from its first frame;
- 75a4426 Android's splash hands over to the page's without a dip (closure finding).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: the splash on the owner's phone
(USER-CHECKLIST §Y1).

## Cause
Android's splash (`splash_mark.xml`) drew the v3 mark without its paper and tray, and the page's splash fed the paper
in from nothing and printed the tray from nothing, but left as soon as Home was ready. On a fast phone only
half-built logos showed.

## What Phase 20 delivers
- **Android's splash** (Android 12+ splash icon; Android 7–11 window picture) draws the **complete** v3 mark: paper
  (white outline, tangerine sheet, folded corner), the cobalt printer with P and S, and the white tray with its
  tangerine line, at the same size and centre, inside the 192 dp circle Android keeps.
- **The page's splash** draws the same complete mark from its first frame; the only motion is a small 4 % feed nudge
  of the sheet; with "Remove animations" nothing moves.
- Nothing else changed: the splash still leaves as soon as Home is up.
- **Closure finding, fixed:** Android 12+'s splash faded out on its own before the page had drawn its splash, so the
  logo dipped to almost nothing for about 0.2 s between the two (screen recordings on API 35: 1.0.203 in 4 of 4 runs,
  this phase's first build in 2 of 2). Android's splash is now held until the page says its own splash is on screen
  (with "Remove animations": until the first screen; never more than 5 s) and removed without a fade. The first frame
  is not held back.

## Acceptance (spec Part 1)

| Criterion | Result | Evidence |
|---|---|---|
| Brand test: `splash_mark.xml` has all parts of `assets/brand/mark.svg` (same path data); every point inside the 192 dp circle | PASS | brand.test.mjs 7 |
| e2e: at the first frame every splash layer is fully opaque and the sheet within 5 % of its place | PASS | shell.spec "the splash shows the whole logo at every moment of its motion" (seen failing first) |
| e2e: the page tells the phone when its splash is on screen, before it goes (none with Remove animations) | PASS | shell.spec (seen failing first) |
| Device: API 35 frames of Android's splash and the page's splash with the whole logo, and no dip between them | PASS | `docs/evidence/phase-20/2026-10-24/splash-handover-api35/`: before (1.0.203 and 82c52bf: the logo fades to ~0 between the two) and after (steady, lowest frame 84–93 % of full, at Android's own first frame or the fade to Home) |
| Device: API 24 launch window shows the whole logo | PASS | `docs/evidence/phase-20/2026-10-24/launch-window-api24/` (release 1.0.224) |
| Cold start within 10 % of 1.0.176 (`am start -W`, alternating, 20 runs each) | PASS | final release: −13 % and +7.1 % in two runs (a busy PC; wide spread); against 1.0.203 −0.1 % (`docs/evidence/phase-20/2026-10-24/README.md`) |
| The owner's phone | PENDING (owner) | USER-CHECKLIST §Y1 |

## Rulings
- The device frames and the cold start were taken with the final release APK (Task 2 ruling): the splash files did not
  change after ff36788, and the cold start must be measured on the release build anyway.

## Coverage statement
**Proven:** the drawable's path data and bounds by test; the page splash's frames in the browser; the device frames
and cold start on emulators (below).
**Not proven:** the owner's phone's own launcher animation and its splash timing.
