# Phases 20–24: whole-logo splash, Word margins, Add photos, scanner crop, place anywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner chose inline, "build it all").
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the owner's 2026-10-24 phone feedback:
- the splash shows the whole v3 logo;
- photo pages use Word's Narrow margins and fill from the top-left;
- Add photos;
- a scanner-style crop with free corners that straighten;
- press-and-hold to place a photo anywhere, plus side handles that crop on Adjust.

**Architecture:**
- Everything stays plan-driven (TS decides, the engine renders the plan):
  - free placement adds `job.spots` (centre, page, z) that `buildPlan` turns into fixed boxes;
  - straightening adds `job.quads` that become `Placement.quad`, which the engine already warps (the ID-card path);
  - margins are a settings value passed into `buildPlan`.
- The new screens reuse the existing gesture, navigation and engine-image hooks.

**Tech Stack:** Preact + TypeScript (Vitest, Playwright), Kotlin engine (JUnit, AndroidX instrumentation).

**Spec:** `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`

## Global Constraints
- **Dependencies:** no new dependency; exact versions only. Run `npm run preflight` first; never `--no-verify`.
- **Customer files:** parsed only in the isolated engine; no image bytes over the bridge; never log names, paths or
  passwords.
- **Print accuracy:**
  - the plan is the one geometry for preview and print;
  - boxes stay inside the page;
  - 300 dpi in the box from the original file, never from a thumbnail; never lower print resolution.
- **Wording:** plain English; `npm run lint` includes the jargon lint (no "margin" in shopkeeper text except the
  Settings row's Word names, which are allowed there).
- **Accessibility:** controls ≥ 56 px (handles: drawn 24 px, touched 48 px); every gesture has a button doing the
  same; "Remove animations" stops motion.
- **Margins** (mm): Narrow 12.7 (default), Normal 25.4, Small 6. A4 photo layouts only; never below the measured A4
  edge (`a4EdgeMm`). "More" still adds 3 mm.
- **Crop rules:**
  - square-quad tolerance 0.005 (a fraction of the picture);
  - minimum frame 5 % of the picture (`MIN_SIDE` 0.05).
- **Press-and-hold rules:** hold 450 ms, slop 8 px, snap 2 mm, arrow step 2 mm, side handles only when the frame on
  screen is ≥ 96 px on that side.
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The pre-commit hook runs verify,
  plus Android lint/JVM when `android/` is staged (~6 min): commit in the background.
- **Repository root:** never run git outside `D:/Projects/PrintSaathi`; never touch `D:\.git`; never touch
  emulator-5554.

## Review Focus
1. **A drag interrupted by the system** (WebView pointercancel, a second finger, the app paused mid-lift): the lift ends,
   the photo stays at its last saved place, the next press works. Test: `adjust.spec` "a cancelled lift saves nothing
   and the next hold works" (Task 14).
2. **Jobs from 1.0.203 with sizes too big for Narrow margins:** every box still lies inside the margins (the engine
   refuses boxes outside the page). Test: `plan.test` "sizes larger than fit at Narrow are clamped inside the margins"
   (Task 3).
3. **Turning a photo after straightening it:** the frame stays on the same part of the photo, and the shape swaps.
   Test: `plan.test` "a straightened photo keeps its corners through Turn" (Task 9).
4. **Add photos when the job is full, gone or printed while the picker was open:** the cap panel; a gone job → the
   files become their own job and the normal route runs (nothing lost). Test: `addInto.test` +
   `shell.spec` "Add photos into a job that was deleted meanwhile opens the new files as their own job" (Task 6/7).
5. **A hand-placed job whose paper, direction or layout changes:** spots are cleared, and no box falls outside the
   page. Test: `job.test` "paper/direction/layout change clears spots" (Task 13).

---

## Phase 20 — the whole logo

### Task 1: Splash shows the complete v3 mark

**Files:**
- Modify: `android/app/src/main/res/drawable/splash_mark.xml`
- Modify: `index.html` (splash layers)
- Modify: `src/styles/ui.css` (splash keyframes)
- Test: `scripts/brand/brand.test.mjs`, `tests/e2e/shell.spec.ts`

**Interfaces:** none (static assets).

- [ ] **Step 1: Write the brand test.**
  - `test('the splash mark is the whole v3 mark: paper, printer, P and S, tray, inside the 192 dp circle')`: read
    `splash_mark.xml` and assert it contains each `pathData` of `assets/brand/mark.svg`: the 2 paper paths + fold, slot,
    body, P, S, tray, tray line. The body is converted from `<rect>` as now.
  - Parse every coordinate pair of every path through the group transform (translate 56.96, scale 0.34) and assert
    `hypot(x-144, y-144) <= 96`.
- [ ] **Step 2: Write the e2e test.**
  - `test('the splash shows the whole logo from its first frame')`: `page.goto('/?splash=1')`, then at once read
    `getComputedStyle` of `.splash-paper` and `.splash-page`.
  - Assert opacity `1` and transform scale ≥ 0.999 (no `scaleY(0)`).
  - Assert the paper's translateY magnitude ≤ 5 % of the stage.
- [ ] **Step 3: Run both; expect FAIL.** The paths are missing from the XML; `splash-print` starts at `scaleY(0)`.
- [ ] **Step 4: Implement.**
  - Add the paper (white outline path, tangerine sheet, fold), tray (white fill, cobalt stroke 22) and tray line
    (tangerine stroke 20) to `splash_mark.xml` in mark order. Use `#FF304BEE` / `#FFFF854A` / `#FFFFFFFF`.
  - Keyframes: `splash-feed` = `0%,100% {transform:none} 40% {transform: translateY(4%)}` (no opacity);
    `.splash-page` has no animation; `splash-word` unchanged.
  - Update the XML's comment (the whole mark; nothing feeds in from nothing).
- [ ] **Step 5: Run `node --test scripts/brand/brand.test.mjs` and `npm run test:e2e -- shell.spec.ts -g splash`;
  expect PASS.**
- [ ] **Step 6: Commit:** `fix(phase 20): the splash shows the whole logo from its first frame`.

### Task 2: Phase 20 closure
- [ ] **Release APK screenshots (API 35):**
  - screen-record a cold start of a release APK;
  - extract a frame of Android's splash and one of the page's splash;
  - save them under `docs/evidence/phase-20/2026-10-24/`.
- [ ] **API 24:** a screencap during launch (launch window).
- [ ] **Cold start:** `totaltime.mjs` (scratchpad) alternating 1.0.176 vs the new release, 2 rounds × 10; the first
  frame within +10 % of 1.0.176. Save the JSON.
- [ ] **Report:** `docs/qa/phase-20.md` (closure sequence, coverage, pending: the owner's phone), traceability row
  P20, USER-CHECKLIST §Y1. Commit.

---

## Phase 21 — Word margins, top-left

### Task 3: Margins in settings and in the plan

**Files:**
- Modify: `src/core/settings/settings.ts` (field `margins`), `src/core/plan/plan.ts` (`buildPlan` param, photo
  sheet), `src/screens/usePlanPaper.ts`, `src/screens/ready/Ready.tsx`, `src/screens/settings/SettingsGroups.tsx`,
  `src/i18n/en.ts`
- Test: `src/core/settings/settings.test.ts`, `src/core/plan/plan.test.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces:
  - `export type Margins = 'narrow' | 'normal' | 'small'`;
  - `export const MARGIN_MM: Record<Margins, number> = { narrow: 12.7, normal: 25.4, small: 6 }` (settings.ts);
  - `Settings.margins: Margins` (default `'narrow'`; an unknown or missing value reads as `'narrow'`);
  - `buildPlan(job, aspects, photoPaper?, a4EdgeMm?, docs?, extraEdgeMm = 0, margins: Margins = 'narrow')`;
  - the photo A4 sheet's `edgeMm = Math.max(MARGIN_MM[margins], a4EdgeMm ?? 0) + extraEdgeMm`;
  - 4×6, passport, ID card and document plans are untouched.

- [ ] **Step 1: Tests.**
  - settings: "Margins: Narrow by default, the three Word choices, old settings read as Narrow".
  - plan:
    - "photos on A4 keep 12.7 mm at Narrow" (every box ≥ 12.7 mm from each edge, ±0.01);
    - "Normal 25.4";
    - "Small 6";
    - "never below the printer's measured edge" (a4EdgeMm 15 at Narrow → 15);
    - "4×6, passport, ID cards and documents unchanged by margins" (deep-equal plans for every margins value);
    - "sizes larger than fit at Narrow are clamped inside the margins" (Review Focus 2).
- [ ] **Step 2: Run `npx vitest run src/core/settings src/core/plan`; expect FAIL** (no `margins`).
- [ ] **Step 3: Implement.**
  - Settings field + sanitize.
  - A `buildPlan` param.
  - `usePlanPaper` (its key includes margins) and `Ready` pass `settings.margins`.
  - Settings → "For the shop owner": a new choice row "Margins" with "Narrow (1.27 cm), like Word" /
    "Normal (2.54 cm)" / "Small (0.6 cm)". Help: "Space kept blank around photos on A4 paper."
  - en.ts strings; whitelist "Margins" in the jargon lint only for these keys.
- [ ] **Step 4: Tests PASS; add e2e** "Settings → Margins offers Narrow, Normal and Small; Narrow is chosen".
- [ ] **Step 5: Commit** `feat(phase 21): Word margins for photo pages, Narrow by default`.

### Task 4: Photos fill from the top-left

**Files:** Modify `src/core/layout/flow.ts`, `src/core/layout/layouts.ts`, `src/core/layout/onePerPage.ts`. Test:
`src/core/layout/*.test.ts`.

**Interfaces:**
- Produces: `onePerPage(items, paper, direction?, align: 'centre' | 'topLeft' = 'centre')`. Photo layouts pass
  `'topLeft'`; `documentPlan` keeps the default (documents stay centred).
- Changes: `flowPages`, `onePerPageAt`, `allOnOne`, `onPages`, `bestPages` are top-left (photo-only functions).

- [ ] **Step 1: Tests.**
  - Replace the centring assertions (layouts.test "last row centred", "centred top to bottom", flow.test centring) with
    top-left ones: "first row at the top margin", "each row starts at the left margin", "photos top-aligned in their
    row", "grid photos at their cell's top-left, last row from the left", "one on each page at the top-left".
  - Property test (existing fast-check suite): all invariants plus "min box.x == edge and min box.y == edge on every
    page".
  - `plan.test`: "documents stay centred".
- [ ] **Step 2: Run `npx vitest run src/core/layout src/core/plan`; expect FAIL.**
- [ ] **Step 3: Implement.**
  - `flowPages`: `y = e`, `x = e`, the photo's `y` = row top.
  - `grid`: `fitBox` at the cell's top-left; `shift = 0`; `down = 0`.
  - `rowsLayout`: `x = e`, `y = e`.
  - `onePerPage` with `align`.
  - `onePerPageAt`: keep `b.x`, `b.y`.
- [ ] **Step 4: PASS.** Regenerate the owner layout gallery if a script exists (`tests/generate/*gallery*`).
- [ ] **Step 5: Commit** `feat(phase 21): photos fill pages from the top-left, like Word`.

**Ruling** (ledger): the old centring tests are replaced, not weakened, because the owner overrode PLAN §G0 (spec
Part 2). Their invariants (inside, no overlap, order) stay.

### Task 5: Phase 21 closure
- [ ] **Device:** `PlanRenderDeviceTest` gets "a Narrow A4 photo plan prints its first photo 12.7 mm from the top-left"
  (pdf.js/PdfRenderer image bbox ±0.5 mm) on API 35.
- [ ] **Evidence:** emulator screenshots of Ready at Narrow / Normal / Small → `docs/evidence/phase-21/2026-10-24/`.
- [ ] **Report:** `docs/qa/phase-21.md`, P21, USER-CHECKLIST §Y2 (ruler: 12.7 mm on paper). Commit.

---

## Phase 22 — Add photos

### Task 6: Picker source and "add into this job"

**Files:**
- Modify: `PrintEnginePlugin.kt` (`pickFiles`), `src/native/printEngine.ts` (+ mock), `src/core/intake/merge.ts`,
  `src/app.tsx`, `src/screens/useJob.ts`
- Create: `src/core/intake/addInto.ts`
- Test: `src/core/intake/addInto.test.ts`, `src/core/intake/merge.test.ts`

**Interfaces:**
- Produces:
  - `pickFiles({ kind, from?: 'gallery' | 'files', max?: number })`. `from` now applies to photos and documents:
    'gallery' = photo picker (images); 'files' = document picker (photos: `image/*`; documents: pdf + images).
    `max` caps the photo picker (`EXTRA_PICK_IMAGES_MAX`).
  - `rememberAddInto(store: Storage, jobId: string, nowMs: number): void`;
    `takeAddInto(store: Storage, nowMs: number): string | null` (valid 10 min, consumed once; key `ps.addInto`, value
    `{jobId, at}`).
  - `addToJob(engine, intoId, fromId, nowMs, room = 100)`: adds the first `room` items and returns
    `{ job, added, dropped }` (callers: NewFiles updated).
  - `window` event `ps-job-changed` (detail `{jobId}`); `useJob` reloads (bumps `attempt`) on its own job id.
- [ ] **Step 1: Tests.**
  - `addInto.test`: "kept 10 minutes then forgotten", "taken once".
  - `merge.test`: "room caps the files added and reports the rest", "room 0 adds nothing and keeps the job".
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**
  - Native `from` / `max` branches (keep the existing card behaviour and the photo-picker fallback).
  - In `app.tsx`'s intake runner, before routing: `const into = takeAddInto(localStorage, Date.now())`. If set, the job
    exists and is not printed, and every new job came from a pick:
    1. `addToJob` each, with `room = 100 - into.items.length`;
    2. dispatch `ps-job-changed`;
    3. if Receiving is on top, `go back`; stay on the screen;
    4. if `dropped > 0`, set a one-shot notice read by the screen (`sessionStorage ps.addNotice = {jobId, added}`).

    Otherwise, the existing route.
- [ ] **Step 4: PASS;** `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(phase 22): files chosen to add join the open job`.

### Task 7: Add photos / Add files buttons and the source screen

**Files:**
- Create: `src/screens/add/AddSource.tsx` (route `addsource`, params `{jobId, kind: 'photos' | 'documents'}`)
- Modify: `src/app.tsx` (route), `src/screens/photos/Photos.tsx`, `src/screens/docs/Docs.tsx`,
  `src/screens/adjust/Adjust.tsx`, `src/i18n/en.ts`
- Test: `tests/e2e/shell.spec.ts` (or a new `tests/e2e/add.spec.ts`)

**Interfaces:**
- Consumes: Task 6 (`pickFiles from/max`, `rememberAddInto`, `ps-job-changed`, the notice).
- [ ] **Step 1: e2e tests** (the mock's `pickFiles` delivers fixture files as an intake):
  - "Add photos from the photo list: gallery and file manager, the new photos at the end, no New files question,
    back lands on the list";
  - "Add photos on Adjust chooses the first new photo";
  - "Add files on a document job takes a PDF";
  - "closing the picker changes nothing";
  - "a job near 100 files adds what fits and says so";
  - "Add photos into a job that was deleted meanwhile opens the new files as their own job";
  - "no Add on passport or ID card jobs".
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**
  - `AddSource`: two `Tile`s ("From the gallery" / "From the file manager", helpers as in the spec) with one picker at
    a time. Before calling `pickFiles({kind, from, max: room})`, call `rememberAddInto`. Show the error panel on
    reject.
  - Buttons: "Add photos" (icon `plus`) on Photos above the grid; "Add files" on Docs; in the Adjust tool grid for
    photos/pages.
  - The screens read the notice panel.
- [ ] **Step 4: PASS;** `npm run test:e2e` (full), `npm run size` (startup JS ≤ 60 KB: lazy-load `AddSource` with the
  other screens).
- [ ] **Step 5: Commit** `feat(phase 22): Add photos and Add files`.

### Task 8: Phase 22 closure
- [ ] **Device test** `AddPhotosDeviceTest` (or a UiAutomator smoke in `scripts/device/adjust-smoke.mjs`, API 35):
  - open a photo job, then Add photos → File manager → choose 2 fixture images in the DocumentsUI picker;
  - the job's item count +2, and no new job in Recent.
- [ ] **Evidence:** screenshots under `docs/evidence/phase-22/2026-10-24/`.
- [ ] **Report:** `docs/qa/phase-22.md`, P22, §Y3. Commit.

---

## Phase 23 — scanner crop with free corners

### Task 9: Quad maths and the job/plan model

**Files:**
- Create: `src/core/layout/quad.ts`
- Modify: `src/core/job/job.ts`, `src/core/plan/plan.ts`
- Test: `src/core/layout/quad.test.ts`, `src/core/job/job.test.ts`, `src/core/plan/plan.test.ts`

**Interfaces:**
- Produces (quad = 8 fractions TL, TR, BR, BL on the **upright** photo, clockwise on screen):
  - `quadOfBox(b: CropBox): number[]`;
  - `boxOfSquareQuad(q, tol = 0.005): CropBox | null` (null unless axis-aligned within tol);
  - `straightAspect(q, photoAspect): number` (avg top/bottom ÷ avg left/right, x scaled by photoAspect);
  - `shownQuad(q, turns): number[]` and `uprightQuad(q, turns): number[]`: the same four corners in shown (turned)
    space and back, re-labelled so index 0 is the shown top-left;
  - `moveCorner(q, k, x, y)`, `moveSide(q, side: 0 | 1 | 2 | 3, dx, dy)`, `moveQuad(q, dx, dy)`, `scaleQuad(q, f)`:
    each returns the new quad, or the old one if the result is not `validQuad` or its bounding box is < 5 %;
  - `homography(q)`: `(u, v) => [x, y]` mapping the unit square onto the quad (Heckbert), and `inverse`.
  - Job: `quads?: Record<number, number[]>`, and action `{ type: 'setQuad'; item: number; quad: number[] | null }`:
    - setting a quad deletes `crops[item]`; `setCrop` deletes `quads[item]`;
    - `normalizeJob` keeps only valid quads;
    - `addItems`' used numbers include the `quads` keys.
  - Plan: a photo with a quad: `crop: FULL`, `quad`, `turns`, laid out with `straightAspect` (turned). The same
    applies to photo pages in `documentPlan`.
- [ ] **Step 1: Tests.**
  - quad.test:
    - "square quad → crop within 0.005, else null";
    - "shownQuad/uprightQuad round trip for 0–3 turns";
    - "four turns = same";
    - "moveSide moves both corners";
    - "crossed or < 5 % refused";
    - "straightAspect of a 2:1 rectangle on a 4:3 photo";
    - "homography maps corners and the inverse round-trips (1e-9)".
  - job.test:
    - "setQuad clears the crop and setCrop clears the quad";
    - "invalid quads dropped on load";
    - "Add after a removed straightened photo never reuses its number".
  - plan.test:
    - "a straightened photo prints with its quad, full crop and straightened shape";
    - "a straightened photo keeps its corners through Turn" (Review Focus 3);
    - "a document photo page can be straightened".
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** to those signatures.
- [ ] **Step 4: PASS** (`npx vitest run src/core`).
- [ ] **Step 5: Commit** `feat(phase 23): straightened frames in the job and the plan`.

### Task 10: Engine: straightened photos in every style

**Files:**
- Modify: `engine/render/RenderPlan.kt` (drop the "quad in OCV Black" refusal), `engine/isolated/Cards.kt` (OCV output
  1-bit), the decode reply/mode plumbing in `EngineRenderer.kt` / `PlanRenderer.kt`
- Test: `android/app/src/test/.../RenderPlanTest.kt`, `PlanRenderDeviceTest.kt`

**Interfaces:**
- Produces:
  - `Cards.warped(..., style = OCV)` writes 1-bit rows (MSB first, padded, 0 = black). It applies `Styles` OCV to the
    warped grey and reports mode `ONE_BIT_RAW`.
  - `PlanRenderer` maps that mode to `ImageKind.GREY1_RAW`.
  - ID cards keep mapping OCV → bw in `idCardPlan` (unchanged).
- [ ] **Step 1: Tests.**
  - JVM: "a quad with OCV Black is accepted"; "a quad with a crop is still refused".
  - Device:
    - "a straightened photo prints at 300 dpi inside its box" (image size = box × 300/72 ±1 px; a pdf.js render check
      of a test plan);
    - "OCV Black on a straightened photo is 1-bit".
- [ ] **Step 2: FAIL** (`node scripts/android-env.mjs :app:testDebugUnitTest --tests '*RenderPlan*'`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS:**
  - JVM;
  - `connectedDebugAndroidTest` filtered to `PlanRenderDeviceTest` on `emulator-5580` (start it if needed; never
    5554).
- [ ] **Step 5: Commit (background)** `feat(phase 23): the engine straightens photos in every print style`.

### Task 11: The scanner-style crop screen

**Files:**
- Create: `src/screens/crop/ScannerCrop.tsx`, `src/ui/Magnifier.tsx`, `src/ui/CropBar.tsx`
- Modify:
  - `src/app.tsx`: routes `cropphoto` and `fixcorners` → `ScannerCrop` with `mode: 'photo' | 'card'`; CropPhoto and
    FixCorners removed or reduced to the route;
  - `src/screens/cards/Cards.tsx`: generalise `useCardImages` → `useStraightImages(jobId, sides: {item; page?; quad}[])`;
  - `src/screens/adjust/Adjust.tsx` + `src/ui/PaperPreview.tsx`: straightened photos drawn from `useStraightImages` via
    `srcOfPlacement`;
  - `src/styles/ui.css`, `src/i18n/en.ts`.
- Test: `tests/e2e/crop.spec.ts` (new), existing card/crop specs updated.

**Interfaces:**
- Consumes: Task 9 quad functions; `change({type:'setQuad'|'setCrop'|'turnItem'|'setIdCardQuad'|'turnIdCard'})`.
- Behaviour (spec Part 4):
  - **Handles:** corners and sides; drag inside = move; pinch = scale (`trackGesture`).
  - **Magnifier:** shown while a handle is held: 112 px, ×2.5, top-left, or top-right when the finger is in the
    top-left third. It is a turned `<img>` inside a round clip.
  - **Arrows:** Next corner + ↑ ↓ ← → (0.01).
  - **CropBar:** Cancel · Whole photo · Turn left · Turn right (card: Upside down) · Done.
  - **Done:** whole → `setCrop null` + `setQuad null`; square → `setCrop`; else `setQuad` (photo) /
    `setIdCardQuad(landscapeQuad)` (card).
  - **Preview:** under the buttons when not square, via `useStraightImages`.
- [ ] **Step 1: e2e tests** in crop.spec:
  - "every corner and side handle drags; the frame never crosses";
  - "the magnifier shows while dragging and goes after";
  - "Whole photo; Turn left and right turn the photo and the frame";
  - "Cancel saves nothing";
  - "Done keeps a square frame as a crop and a slanted one as a straightened frame";
  - "Adjust shows the straightened photo";
  - "the card screen: Upside down and the result preview";
  - "fits 320 px at 200 % text, controls ≥ 56 px";
  - existing crop/card tests are kept and pass against the new screen (selectors updated, not assertions weakened).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS:** full `npm run test:e2e`, `npm test`, `npm run size`.
- [ ] **Step 5: Commit** `feat(phase 23): scanner-style crop with free corners for photos, pages and cards`.

### Task 12: Phase 23 closure
- [ ] **adjust-smoke** steps (API 35): open crop, drag a corner (adb motionevent), Done, Ready shows straightened.
  Screenshots.
- [ ] **Render check:** a plan with a straightened photo, pdf.js check.
- [ ] **Report:** `docs/qa/phase-23.md`, P23, §Y4 (a slanted document photo printed flat). Commit.

---

## Phase 24 — on the page: place anywhere, sides crop

### Task 13: Spots in the job and the plan

**Files:**
- Create: `src/core/layout/free.ts`
- Modify: `src/core/job/job.ts`, `src/core/plan/plan.ts`
- Test: `src/core/layout/free.test.ts`, `job.test.ts`, `plan.test.ts`

**Interfaces:**
- Produces:
  - `export type Spot = { page: number; x: number; y: number; z: number }` (centre, mm, in the page's direction).
  - Job:
    - `spots?: Record<number, Spot>`;
    - actions `{type:'setSpots'; spots; sizes}` (pin all), `{type:'placeItem'; item; page; x; y; size?: number}`
      (z = max + 1; size sets `sizes[item]`), and `{type:'all'; actions: JobAction[]}` (applied in order, one rev);
    - `setSizes null`, `setLayout`, `setPaper` and `setDirection` clear `spots`;
    - `addItems`' used numbers include the spots keys;
    - removed items keep their spot (Undo returns it, like crops).
  - `free.ts`:
    - `pinnedPages(items: {index; aspect; longMm}[], spots, paper: Paper, direction): { pages: LayoutPage[]; rest: number[] }`:
      pages = the distinct used spot pages in ascending order, empty ones dropped; boxes from centre and size (long ≤
      `fitLongMm`), clamped inside the margins; placements sorted by z. `rest` = items without a spot.
    - `clampCentre(box, paper, direction): {x, y}`.
    - `snapBox(box: Box, others: Box[], page: {w; h; e}, tolPt): { box; guides: {x1; y1; x2; y2}[] }`: snaps the left,
      centre and right edges in x and the top, middle and bottom in y to the page middles, the margins, and the other
      boxes' edges and middles.
    - `overlaps(plan): [number, number][]`: pairs whose shared area is > 1 mm².
    - `sideCrop(crop: CropBox, box: Box, side: 'l' | 'r' | 't' | 'b', dPt): { crop; box }` (shown space; keeps the
      scale; ≥ 5 %; within the photo).
    - `sideCropQuad(quad, turns, box, side, dPt): { quad; box }`: via `homography`, trimming in the straightened square.
  - Plan: when `job.spots` is non-empty (photo layouts), pages = `pinnedPages`, followed by the existing layout of
    `rest`.
- [ ] **Step 1: Tests.**
  - free.test:
    - "boxes from centre and size inside the margins";
    - "z order";
    - "empty pinned pages dropped";
    - "rest flows after";
    - "snap to the page middle and to another photo's edge within 2 mm, with a guide";
    - "no snap beyond 2 mm";
    - "overlap pairs";
    - "sideCrop keeps the scale and moves only that side";
    - "sideCrop stops at 5 % and at the photo edge";
    - "sideCropQuad round trip".
  - job.test:
    - "paper/direction/layout change clears spots" (Review Focus 5);
    - "Automatic clears spots and sizes";
    - "placeItem raises z";
    - "all applies in order with one rev";
    - "Undo of Remove keeps the spot".
  - plan.test:
    - "hand-placed photos print at their spots";
    - "new photos flow on pages after the placed ones".
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(phase 24): photos placed by hand stay where they are put`.

### Task 14: Adjust: press and hold, move buttons, overlap notes

**Files:** Modify `src/screens/adjust/Adjust.tsx`, `src/screens/ready/Ready.tsx`, `src/styles/ui.css`,
`src/i18n/en.ts`. Test: `tests/e2e/adjust.spec.ts`.

**Interfaces:**
- Consumes: Task 13 (`snapBox`, `clampCentre`, `overlaps`, the actions).
- Behaviour:
  - **Lift:** pointerdown on a photo starts a 450 ms timer, cancelled by a move > 8 px, pointerup or pointercancel. On
    firing, the photo is chosen and lifted (class `adjust-lifted`, the status text in `role="status"`).
  - **Touch:** a non-passive `touchmove` listener on the paper calls `preventDefault` only while lifted.
  - **Drag and drop:** the draft centre follows the pointer, snapped, with guides drawn as 1 px lines. Pointerup →
    `setSpots` (first time: from the current plan, sizes = `freezeSizes`) or `placeItem`. pointercancel → drop nothing.
  - **Context menu:** blocked on the paper.
  - **Free mode** (spots present):
    - Move ↑ ↓ ← → (2 mm);
    - To previous page / To next page;
    - Bigger / Smaller / Turn send `all[...change, placeItem(clamped centre)]`;
    - Move earlier / later are hidden.
  - **Overlap notes:** Adjust names the first pair ("Photo 2 covers part of photo 4."); Ready shows "Some photos cover
    part of another. Check the preview." while any pair exists.
- [ ] **Step 1: e2e tests:**
  - "hold and drag places a photo; the others stay" (mouse);
  - "the same with touch" (CDP `Input.dispatchTouchEvent`);
  - "a quick move does not lift (the page scrolls)";
  - "a cancelled lift saves nothing and the next hold works" (Review Focus 1);
  - "snaps to the page middle with a guide";
  - "Move buttons, To next page makes a new page";
  - "Bigger keeps the centre";
  - "overlap notes on Adjust and Ready";
  - "Automatic puts the rows back".
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS** (full e2e, size).
- [ ] **Step 5: Commit** `feat(phase 24): press and hold to place a photo anywhere on its page`.

### Task 15: Adjust: side handles crop

**Files:** Modify `src/screens/adjust/Adjust.tsx`, `src/styles/ui.css`. Test: `tests/e2e/adjust.spec.ts`.

**Interfaces:**
- Consumes: `sideCrop`, `sideCropQuad`.
- Behaviour:
  - Four side pills on the selected photo (drawn 24 × 8, touched 48 px), only where the frame is ≥ 96 px on screen.
  - Dragging one drafts the crop and box; on release:
    - flow: `all[setCrop|setQuad, setSizes(new long)]`;
    - free: `all[setCrop|setQuad, placeItem(new centre, size)]`.
- [ ] **Step 1: e2e tests:**
  - "dragging the left side in cuts the left off and keeps the size of what is left";
  - "outward brings it back up to the photo edge";
  - "no side handles on a small photo";
  - "a straightened photo's side crop".
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(phase 24): drag a photo's side on Adjust to crop it`.

### Task 16: Phase 24 closure
- [ ] **Device:** `PlanRenderDeviceTest` "hand-placed overlapping photos print at their boxes, the last on top" (pdf.js
  image order and bbox).
- [ ] **adjust-smoke:** hold and drag (`input motionevent DOWN/MOVE/UP`), side crop, screenshots (API 35).
- [ ] **Privacy:** `scripts/device/privacy.mjs` on API 35: 0 findings.
- [ ] **Report:** `docs/qa/phase-24.md`, P24, §Y5–Y6. Commit.

---

## Task 17: Release closure (all phases)
- [ ] **Decisions:** `docs/decisions/owner-decisions-2026-10-24.md` (the owner's answers).
- [ ] **Review:** the whole-branch review by a fresh reviewer (most capable model), with this Review Focus and the
  ledger rulings. Critical/Important → one fix pass (test RED→GREEN, suite green); minors → ledger + report.
- [ ] **Full regression:** `npm run verify` (lint, typecheck, vitest, e2e, build, size), Android lint + JVM, device
  regression API 24 / 35 / 36 (`scripts/device/regress.sh`), render check, share 15/15.
- [ ] **Release:** release APK (`npm run android:release` per HARNESS.md), check-release, release-smoke, privacy, cold
  start vs 1.0.176; copy to `apk/PrintSaathi-<version>-<sha>.apk` with its sha256.
- [ ] **Publish:** a security scan of the public export (gitleaks, trivy, personal-data grep, no family mentions).
  Then one new commit on the public repository, authored as the first public commit was (the owner's choice), pushed.
- [ ] **Report:** the final report to the owner.

## Task 18 (added 2026-10-24, spec Part 6): card edges you can see

**Files:**
- Modify: `src/styles/tokens.css` (`--ring: 0 0 0 2px var(--edge)`), `src/styles/ui.css` (tile, change-row, choice,
  card-found, hint-card, thumb)
- Test: `tests/e2e/shell.spec.ts` "cards show their edges: <screen>" for every screen in SCREENS

- [ ] **Step 1:** write the test; run it; expect FAIL on Home (the hint card) and on the 1 px rings.
- [ ] **Step 2:** add the token and use it on every card style.
- [ ] **Step 3:** the test passes on every screen; full e2e.
- [ ] **Step 4:** commit `fix: card edges you can see (2 px), on every screen`.

## Task 19 (added 2026-10-24, spec Part 7 items 1–3): no set-up panel, Home's logo bar fixed, zoom buttons swapped

**Files:**
- Modify: `src/screens/home/Home.tsx` (drop the notSetUp panel and its check), `src/i18n/en.ts` (notSetUp, setUp),
  `src/styles/ui.css` (Home's title bar `position: sticky; top: 0` with the page background),
  `src/screens/passport/Passport.tsx` (Zoom out first, then Zoom in)
- Test: `tests/e2e/shell.spec.ts`:
  - "Home never shows a printer set-up panel";
  - "Home's logo bar stays at the top while Home scrolls; another screen's top bar scrolls away";
  - "Fit the face: Zoom out is left of Zoom in".

Steps: tests RED → implement → tests GREEN → full e2e → commit.

## Task 20 (added 2026-10-24, spec Part 7 item 4): the back side of an ID card, optional

**Files:**
- Modify: `src/screens/cards/Cards.tsx` (Add the back side; Print front only + Undo), `src/core/job/job.ts` (an
  action to drop or add a side: `setIdCards` already takes the cards), `src/app.tsx` (an added photo for a card job
  goes back to the cards screen, which finds its card)
- Consumes: Task 6/7 (`AddSource`, `rememberAddInto`, `ps-job-changed`).
- Test: `tests/e2e/cards.spec.ts`:
  - "one side: Add the back side → gallery → two cards, front then back, on one page";
  - "two sides: Print front only → one card; Undo → two".

Steps: tests RED → implement → GREEN → full e2e → commit.
