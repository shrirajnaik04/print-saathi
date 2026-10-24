# Phase 23 — closure report (scanner-style crop with free corners)

**Spec:** `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`, Part 4.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-20-24-place-anywhere-scanner-crop.md`, Tasks 9–12.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md` rows 3 and 4.
**Commits:**
- c07cc5a straightened frames in the job and the plan;
- ba138d4 the engine straightens photos in every print style;
- 8025a44 scanner-style crop with free corners for photos, pages and cards;
- 82c52bf whole-branch review fixes (Phases 20–24).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: a document photographed at an angle,
straightened and printed on the shop's Brother (USER-CHECKLIST §Y4).

## What Phase 23 delivers
- **One crop screen** for photos, photo pages of documents and ID cards ("Fix corners"): the picture as it prints,
  dimmed outside a brand-blue frame with **four free corners** and **four side pills**, a **magnifier** while a handle
  is dragged, and "Corner 1 of 4: top left" with Next corner and ↑ ↓ ← → (1 % a tap).
- **Bottom bar:** Cancel · Whole photo · Turn left · Turn right · Done (ID cards: one Upside down button).
- **What Done keeps:** the whole picture → no crop; corners square within 0.5 % → a plain crop (the fast path);
  otherwise a **straightened frame** (four corners on the upright photo; crossed, folded or < 5 % frames refused).
- **Printing:** laid out with the straightened part's shape; the engine straightens it straight into its box at 300 dpi
  from the original photo, in every print style (OCV Black: straightened first, then 1-bit). Adjust shows
  engine-made straightened pictures; Ready shows the real print file.
- **Passport "Fit the face" is unchanged** (owner's answer).

## Acceptance (spec Part 4)

| Criterion | Result | Evidence |
|---|---|---|
| Unit: quad ↔ crop decisions; straightened shape; turning the frame with the photo (both ways, 4 turns = same); side moves; crossed / too-small frames refused; never a crop and a frame together | PASS | quad.test, job.test, plan.test |
| e2e: every handle drags; Next corner and arrows; magnifier while dragging; Whole photo, Turn left/right, Cancel (nothing saved), Done (saved); card result preview; 320 px at 200 % text | PASS | crop.spec 12, cards.spec, layout matrix |
| JVM: the engine refuses a bad quad; OCV Black with a quad accepted | PASS | RenderPlanContractTest (incl. `aStraightenedPhotoInOcvBlackIsAccepted`, seen failing first) |
| Device: a straightened photo renders at 300 dpi; OCV Black with a quad is 1-bit; `PlanRenderDeviceTest` covers a photo quad | PASS | PlanRenderDeviceTest `aStraightenedPhotoPrintsThePartInsideItsFrameAt300Dpi` (4 turns, 900 × 900 px), `ocvBlackOnAStraightenedPhotoIsOneBit`, `aWholeA4PageStraightenedFromABigPhotoRendersInColourAndOcvBlack` on API 24, 35, 36 (`regression/run3/`) |
| Device: pdf.js render check of a plan with a straightened photo matches the box | PASS | the web app's own plan `tests/fixtures/plan-v1-free.json` (a straightened, turned photo on top of another) — `regression/run3/render-check-free-*.json` |
| Device: a slanted frame drawn by finger is saved straightened | PASS | place-smoke step 3 API 35 (magnifier screenshot 05, frame 06, Ready 07) |
| A real document photo printed flat and sharp | PENDING (owner) | USER-CHECKLIST §Y4 |

## Whole-branch review
- **I3 (Important), fixed:** the "How it will print" picture was squashed for a photo turned a quarter (the main
  scanner case: a page photographed sideways). Test seen failing first.
- **I6 (Important), fixed:** memory for a whole-page straightened photo. Five full-size buffers were held at once; on
  Android 7 pictures live in the app's small memory. Each buffer is now let go as soon as it is used, and OCV Black is
  made straight from the pixels. Device test seen failing first on API 24 with a realistic 128 MB app cap (out of
  memory → the photo reported as damaged), passing after (`docs/evidence/phase-20-24/2026-10-24/review-fixes/`).
- **Ruling:** the frame keeps starting on the black edges found even after "Keep as they are" (Phase 9 behaviour).
- **Deferred minors:** straightened previews are made at ID-card shape (soft for tall pages on Adjust); thin
  straightened strips under 16 px fail the print.

## Rulings (build)
- One shared CropFrame for the two existing screens instead of a new screen with modes.
- Corner handles touched at 56 px (spec said 48): the project floor.
- "Start again" kept beside the arrows; corner buttons in reading order for screen readers.

All rulings: `docs/qa/phase-20-24-rulings.md`.

## Coverage statement
**Proven:** the frame rules and the homography on random and fixed frames; the screen in the browser at every size;
the engine on emulators at four turns, in colour and OCV, up to a whole A4 page from a 12 MP photo under a 128 MB cap.
**Not proven:** how the magnifier and dragging feel on the owner's phone; print sharpness of a real photographed
document on the Brother; photos larger than 12 MP straightened onto a whole page on a real 2 GB phone.
