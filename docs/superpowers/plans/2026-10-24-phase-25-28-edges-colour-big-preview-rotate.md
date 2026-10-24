# Phases 25–28: edges, back side, side-bar crop, passport count, colour, big preview, rotate handle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner chose inline, "build it all").
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the owner's round-3 requests after testing 1.0.224 (spec Parts 25a–28).

**Architecture:** web-side changes in the screens, `src/ui` and `src/core` (job, plan, layout); the rotate handle
also adds a tilt to the PrintPlan contract, the Kotlin plan check, the renderer's decode size, the PDF writer's
drawing matrix and the pdf.js render check. Everything else is TypeScript + CSS.

**Tech Stack:** Preact + TypeScript (Vite, Vitest, Playwright), Kotlin (JUnit, AndroidX instrumentation), pdf.js.

**Spec:** `docs/superpowers/specs/2026-10-24-round-3-edges-colour-big-preview-rotate-design.md`

## Global Constraints
- Offline, ₹0, no new dependency; exact versions; never `--no-verify`.
- Customer files parsed only in the isolated engine; no image bytes over the bridge.
- One geometry (the plan) for preview and print; 300 dpi of the photo's own printed size, never lower.
- Plain English (jargon lint); anything pressed ≥ 56 px; every gesture has a button; "Remove animations" respected.
- Device scripts only on emulators 5580 / 5560 / 5566; never emulator-5554. No real customer files (the owner's
  screenshots show a real Aadhaar card: never copied into the repo, evidence or tests).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. Old saved jobs and settings from 1.0.224 (no tilts; Settings saying documents in B&W): they load, start in colour
   only for new jobs, and nothing crashes — Task 5 (settings migration test) and Task 8 (normalizeJob drops a bad tilt).
2. A tilted photo near the page edge or made big: its turned outline stays inside the margins on every layout, never
   overlaps a flowing neighbour, and the engine never refuses the plan — Task 8 (property test over random tilts).
3. Typed passport counts that are not plain numbers ("", "007", "1e3", " 12 ", "-4", pasted text): clamped or refused
   with the message, never NaN in the job — Task 4.
4. A side bar dragged across the opposite side or off the photo (also on a slanted, auto-straightened frame): the move
   is not taken — Task 3.
5. The ring after the clip moves to the page: a screen sliding in never scrolls the page sideways and the pinned
   PRINT / Done bars still stick — Task 1 (existing tests run in the same step).

---

### Task 1: Card edges drawn on every side (25a)

**Files:** Modify `src/styles/ui.css` (`.screen-host`, root `html`); Test `tests/e2e/shell.spec.ts`.

- [ ] **Step 1: Write the failing test** `every card's edge is painted on its left, right and top (owner: "left borders
  are being hidden")`: for each screen in `SCREENS` at 360 × 800 and 412 × 915 (text 100 %, reduced motion): collect
  elements whose computed `box-shadow` contains the `--edge` colour (rgb(115, 123, 138)) and that are fully inside the
  viewport; take one page screenshot; for each, read the pixel 1 px outside the middle of the left, right and top sides
  (`Math.floor(x) - 1`, `Math.ceil(x + w)`, `Math.floor(y) - 1`); each channel within 30 of (115, 123, 138). Failures
  list `screen: selector side rgb`.
- [ ] **Step 2: Run** `npm run test:e2e -- shell.spec.ts -g "painted"` — Expected: FAIL (left / right sides of tiles,
  rows and cards in the outer columns).
- [ ] **Step 3:** `.screen-host` stops clipping (`overflow-x` removed, its clip-margin removed); `html { overflow-x:
  clip }` keeps a sliding screen from scrolling the page sideways (comment why: Chromium ignores
  `overflow-clip-margin` unless both axes clip).
- [ ] **Step 4: Run** the new test, then `npm run test:e2e -- shell.spec.ts` — Expected: PASS, including the existing
  "no sideways scroll", motion and pinned-bar tests.
- [ ] **Step 5: Commit** `fix(phase 25): card edges are drawn on every side`.

### Task 2: The ID card's back side is added (25b)

**Files:** Modify `src/screens/cards/Cards.tsx:107-138`, `src/native/printEngine.mock.ts` (`mockSlowCards`);
Test `tests/e2e/cards.spec.ts`.

- [ ] **Step 1: Write the failing test** `one side found: Add the back side works when the card finder is as slow as a
  phone's (owner: "not working after we select photo from the gallery")`: `/?mockIntake=1&mockSlowCards=600`, the
  existing one-side flow → Add the back side → From the gallery → expect two cards (Front, Back) and "Only the front
  will print." gone.
- [ ] **Step 2:** mock `findCards` waits `mockSlowCards` ms when the URL has it. Run — Expected: FAIL (one card).
- [ ] **Step 3:** the look for the back card is abandoned only when the screen closes (an unmount ref), never when the
  "just added" note is cleared.
- [ ] **Step 4: Run** `npm run test:e2e -- cards.spec.ts add.spec.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(phase 25): the ID card's back side is added on a real phone`.

### Task 3: Crop with the middle bars only (25c)

**Files:** Modify `src/ui/CropFrame.tsx`, `src/screens/photos/CropPhoto.tsx`, `src/screens/cards/Cards.tsx`
(FixCorners), `src/i18n/en.ts` (`crop`, `cards.fix*`), `src/styles/ui.css` (scan-side states); Tests
`tests/e2e/crop.spec.ts`, `tests/e2e/cards.spec.ts`, `src/core/layout/quad.test.ts`.

**Interfaces:** Produces `CropFrame` props `{ src, turns, aspect, quad, onChange, side: 0|1|2|3, onChooseSide,
label, sideLabel, sideNames }` (side s runs from corner s to s + 1: 0 top, 1 right, 2 bottom, 3 left);
`moveSideStraight(q: number[], s: 0|1|2|3, d: number): number[]` in `src/core/layout/quad.ts` (top/bottom move by d
in y, right/left by d in x; returns `q` unchanged when the result is not a valid frame).

- [ ] **Step 1: Write the failing tests:** quad.test `moveSideStraight moves only along its axis, keeps a slant,
  refuses crossing and leaving the photo`; crop.spec `the frame has no corner handles; four side bars in reading order
  (top, left, right, bottom)`, `a side bar drags its side straight: the top only up or down` (drag diagonally, only y
  changes), `Next side and the arrows move the chosen side; the other arrows are greyed`, `a slanted frame keeps its
  slant when a side moves` (FixCorners on an auto-found tilted card); cards.spec: the button reads "Fix edges".
  Update the existing crop/cards tests that drive corners to the bar equivalents (same proofs).
- [ ] **Step 2: Run** `npx vitest run src/core/layout/quad.test.ts` and `npm run test:e2e -- crop.spec.ts cards.spec.ts`
  — Expected: FAIL.
- [ ] **Step 3:** CropFrame: corner buttons removed; the four bars are `<button>`s (aria-label `The top side`,
  `aria-pressed` for the chosen one, reading order [0, 3, 1, 2]); a bar drag uses `moveSideStraight`; magnifier on the
  bar's middle. CropPhoto / FixCorners: "Side 1 of 4: top", **Next side**, Up/Down enabled for sides 0 and 2,
  Left/Right for 1 and 3 (others disabled), 1 % a tap. Copy: `crop.side: 'Side {k} of 4: {name}'`, `nextSide: 'Next
  side'`, `sideLabel: 'The {name} side'`, `sideNames: ['top', 'right', 'bottom', 'left']`; cards `fix: 'Fix edges'`,
  `fixTitle: 'Fix the edges'`, hint `Drag a side bar onto the card's edge, or choose a side and move it with the
  arrows.`; photo crop hint `Drag a side bar. The part inside the frame prints.`
- [ ] **Step 4: Run** the Step 2 commands and `npm run test:e2e -- shell.spec.ts -g "crop|fixcorners"` — Expected: PASS
  (56 px, 200 % text at 320 px).
- [ ] **Step 5: Commit** `feat(phase 25): crop with the middle bars only, everywhere`.

### Task 4: Passport: type how many (25d)

**Files:** Modify `src/core/job/job.ts` (`MAX_PASSPORT_COUNT` 100), `src/screens/passport/Passport.tsx`
(PassportCount), `src/i18n/en.ts`; Tests `src/core/job/job.test.ts`, `tests/e2e/passport.spec.ts` (or the spec file
that holds the count tests).

- [ ] **Step 1: Write the failing tests:** job.test `the passport count is 1–100`; e2e `typing 37 photos gives 37 on as
  many sheets as needed` (A4 and 4×6: count placements across pages = 37, every box inside its page, Ready shows the
  sheet count); `the number box refuses 0, 101 and non-numbers with "Type a number from 1 to 100."` (inputs "", "0",
  "101", "abc", "1e3", "-4"); `" 12 "` and `"007"` are taken as 12 and 7.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3:** a labelled text input (`inputmode="numeric"`, label "Or type a number") under − / +, saving on a
  valid number (debounced on input and on Enter / blur); the message as a field error (`aria-describedby`).
- [ ] **Step 4: Run** `npx vitest run src/core/job` and the passport e2e file — Expected: PASS.
- [ ] **Step 5: Commit** `feat(phase 25): type how many passport photos (1–100)`.

### Task 5: Colour by default for every job (26)

**Files:** Modify `src/core/settings/settings.ts` (defaults: no colour per kind; old files' colour ignored),
`src/core/job/job.ts` (`setDocument` without colour → `'colour'`), `src/core/intake/flow.ts`, `src/app.tsx`,
`src/screens/received/Received.tsx`, `src/screens/settings/SettingsGroups.tsx`, `src/screens/settings/Settings.tsx`;
Tests `src/core/settings/settings.test.ts`, `src/core/job/job.test.ts`, e2e touched by B&W defaults.

- [ ] **Step 1: Write the failing tests:** settings.test `an old settings file with documents in B&W loads, and new
  jobs still start in colour`; job.test `every new job starts in colour: photos, a PDF made a document, passport, ID
  cards`; e2e `a shared PDF arrives in colour on Ready`.
- [ ] **Step 2: Run** — Expected: FAIL (documents start B&W).
- [ ] **Step 3:** implement; remove the two Settings colour rows; update tests that asserted B&W documents by default
  to the new rule (owner's requirement change, ledgered).
- [ ] **Step 4: Run** `npm test` and `npm run test:e2e` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(phase 26): every print starts in colour`.

### Task 6: Colour | Black & white switch on Ready (26)

**Files:** Create `src/ui/ColourSwitch.tsx`; Modify `src/screens/ready/Ready.tsx`, `src/styles/ui.css`,
`src/i18n/en.ts`; Test `tests/e2e/ready.spec.ts` (new) or the Ready spec in use.

**Interfaces:** Produces `ColourSwitch({ value: 'colour' | 'bw', onChange: (c) => void, disabled?: boolean })`: a
`role="group"` named "Print in", two `aria-pressed` buttons "Colour" and "Black & white", the pressed one filled with
a ✓.

- [ ] **Step 1: Write the failing tests:** `Ready has a Colour | Black & white switch under the preview; one tap prints
  this job in grey, another back in colour` for photos, a PDF, passport and ID cards (`__lastPlan.colour`); `the
  switch is a named group of two pressed buttons, 56 px, and fits 320 px at 200 % text`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3:** implement; the switch calls `change({ type: 'setColour', colour })`.
- [ ] **Step 4: Run** the new tests and `npm run test:e2e -- shell.spec.ts -g "ready"` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(phase 26): a Colour | Black & white switch on Ready`.

### Task 7: A big preview with one row of tools (27)

**Files:** Modify `src/screens/adjust/Adjust.tsx`, `src/styles/ui.css` (`.adjust-*`, new `.tool-row`); Tests
`tests/e2e/adjust.spec.ts`, `tests/e2e/shell.spec.ts` (matrix).

- [ ] **Step 1: Write the failing tests:** `Adjust shows the page across the screen on a phone` (photos, pages,
  passport, cards at 360 × 800: the page ≥ 90 % of the viewport width); `the tools are one row above Done that slides
  sideways; its last visible tool is cut at the edge` (all tool buttons share one top; the row's scrollWidth >
  clientWidth; every tool reachable by Tab and by scrolling); `held sideways (800 × 360) the tools sit beside the page`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3:** the page's width cap goes on phones in portrait (`min(100%, …)` by the space left above the tool
  row); the tools render in a `.tool-row` (flex, `overflow-x: auto`, buttons `flex: none`, 56 px) pinned above Done in
  portrait; the wide side-by-side layout keeps the grid beside the page. The status lines stay overlaid.
- [ ] **Step 4: Run** `npm run test:e2e -- adjust.spec.ts place.spec.ts shell.spec.ts` — Expected: PASS (matrix +
  axe; a ruling if a matrix rule needs the row treated as one scrolling control).
- [ ] **Step 5: Commit** `feat(phase 27): a big preview with one row of tools on every Adjust screen`.

### Task 8: Tilt in the job, the layout and the plan (28)

**Files:** Create `src/core/layout/tilt.ts` (+ test); Modify `src/core/job/job.ts` (`tilts`, `rotateItem`,
normalizeJob, removeItem keeps for Undo), `src/core/plan/plan.ts` (outline aspect/size for tilted photos,
`Placement.tilt`), `src/core/layout/free.ts` (pinnedPages via outlines), `src/core/layout/flow.ts`
(`freezeSizes` uses the photo's own size); Tests `tilt.test.ts`, `job.test.ts`, `plan.test.ts`, `free.test.ts`.

**Interfaces:** Produces
- `Job.tilts?: Record<number, number>` — degrees clockwise, −45 < t ≤ 45, 0.1° steps, never 0 stored.
- action `{ type: 'rotateItem'; index: number; angle: number }` (absolute angle, degrees clockwise; sets
  `turns = round(angle / 90) mod 4` and the tilt); `turnItem` keeps the tilt.
- `tilt.ts`: `angleOf(turns: number, tilt: number): number`, `partsOf(angle: number): { turns: 0|1|2|3; tilt: number }`,
  `outline(w: number, h: number, deg: number): { w: number; h: number }`, `innerOf(box: { w: number; h: number },
  aspect: number, deg: number): { w: number; h: number }`, `snap(angle: number, within = 3): number`.
- `Placement.tilt?: { deg: number; w: number; h: number }` (the photo's own size in points, centred in `box`, which is
  its turned outline).
- `ownLongMm(p: Placement): number` in `src/screens/adjust/place.ts` (own size when tilted, else the box).

- [ ] **Step 1: Write the failing tests:** tilt.test round trips (`partsOf(angleOf(t, d))`), outline/innerOf inverse,
  snap within 3°; job.test rotateItem/turnItem/normalizeJob (bad tilt dropped); plan.test `a tilted photo is laid out
  by its turned outline and carries its own size`; property `random tilts on every photo layout: every outline inside
  the margins, flowing outlines never overlap, own size fits the outline`; free.test pinned tilted photo clamps its
  outline inside the margins. Contract fixture `plan-v1-free.json` gains a tilted photo (UPDATE_CONTRACT).
- [ ] **Step 2: Run** `npx vitest run src/core` — Expected: FAIL.
- [ ] **Step 3:** implement. Sizes stay the photo's own long side (Word keeps a picture's size when it turns); the
  layout works on outline aspect and outline long side, then each tilted placement gets `tilt` from `innerOf`.
- [ ] **Step 4: Run** `npx vitest run src/core` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(phase 28): photos turned to any angle in the job, the layout and the plan`.

### Task 9: The engine prints a tilted photo (28)

**Files:** Modify `android/.../render/RenderPlan.kt` (parse `tilt`: −45..45, w/h > 0, own size's outline ≈ box within
0.5 pt, not with `pdfPage`; decode size from the own size), `render/PlanRenderer.kt` (passes tilt and own size),
`pdf/MiniPdfWriter.kt` (`PlacedImage.tiltCw`, `inner`; one composed `cm`), `scripts/validate-pdf.mjs` (`angle`),
`scripts/device/render-check.mjs` (compares `angle` when expected); Tests `RenderPlanContractTest`,
`MiniPdfWriterTest`, `PlanRendererTest`, `scripts/device/render-check.test.mjs`, `PlanRenderDeviceTest`.

- [ ] **Step 1: Write the failing tests:** JVM `a tilted photo is accepted; its decode size is 300 dpi of its own size`,
  `a tilt over 45°, an own size that does not fit its outline, or a tilt on a PDF page is refused`; MiniPdfWriterTest
  `a tilted image's matrix turns it about its box's centre` (the unit square's corners land on the rotated own box);
  render-check.test `angles are compared within 0.1°`; device `a tilted photo prints at its angle` (red top / blue
  bottom along the turned axis; the outline's corners stay white) and the free-plan check carries the angle.
- [ ] **Step 2: Run** `node scripts/android-env.mjs :app:testDebugUnitTest` and `npm run test:scripts` — Expected: FAIL.
- [ ] **Step 3:** implement (PDF angle anticlockwise = quarterTurnsCcw × 90 − tiltCw; a sideways page swaps the own
  size and keeps the tilt).
- [ ] **Step 4: Run** the Step 2 commands — Expected: PASS; device tests run in the closure session.
- [ ] **Step 5: Commit** `feat(phase 28): the engine prints a photo at any angle`.

### Task 10: The rotate handle on Adjust (28)

**Files:** Modify `src/ui/PaperPreview.tsx` (draws `tilt`), `src/screens/adjust/Adjust.tsx` (handle, angle label,
Tilt left / Tilt right, side bars hidden when tilted, sizes via `ownLongMm`), `src/styles/ui.css`, `src/i18n/en.ts`;
Test `tests/e2e/place.spec.ts` (or `rotate.spec.ts`).

- [ ] **Step 1: Write the failing tests:** `the rotate handle above the chosen photo turns it to any angle, shows the
  degrees and saves on release` (drag around the centre by ~20° → label "20°", plan tilt ≈ 20 ± 1, preview element
  rotated); `within 3° of straight it clicks straight` (drag to 88° → turns 1, no tilt); `Tilt left / Tilt right turn
  it 1° a tap`; `Turn keeps the tilt`; `a tilted photo has no side bars; its round corner still resizes it`; the
  handle is 56 px to touch.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3:** implement; the handle sits above the outline's top centre on a short stick; angle from the pointer
  around the photo's centre (`atan2`), relative to where the press began; `snap`; saved with `rotateItem` (placed by
  hand: also on top, as other changes).
- [ ] **Step 4: Run** `npm run test:e2e` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(phase 28): turn a photo to any angle from the photo itself`.

### Task 11: Closure

- [ ] Device: `npm run android:sync`; `regress.sh` on API 24 / 35 / 36 (render checks incl. the tilted photo);
  place-smoke + adjust-smoke on API 35 with new steps (back side via the real photo picker; a side bar crop; the switch
  on Ready; the rotate handle); privacy; release build, release-smoke, release-cards, cold start vs 1.0.224.
- [ ] Whole-branch review (fresh reviewer), fix pass, regression; reports `docs/qa/phase-25.md` … `phase-28.md`,
  rulings file, traceability P25–P28, USER-CHECKLIST §Z, evidence; APK in `apk/`; security scan; public commit.
