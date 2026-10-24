# Phases 16–18 (owner's phone feedback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medium-size look with wider side space, a gallery/file choice for ID cards, picked photos never auto-turned
(Phase 16); WhatsApp-style passport fitting, passport border and custom size (Phase 17); an Adjust screen on every
preview with Word-like "Square" flow and auto new pages (Phase 18).

**Architecture:** TS keeps deciding geometry: a new flow layout (`src/core/layout/flow.ts`) places photos at sizes the shopkeeper
chose (stored in the job as long-side mm); documents, ID cards and passport sheets get size factors in the job; the
plan carries boxes as before plus an optional passport `border` that the engine draws as a black inset rectangle.
New screens load lazily so startup JS stays in budget.

**Tech Stack:** Preact 10 + signals, TypeScript, Vitest + fast-check, Playwright (+ CDP touch), Kotlin (JVM tests,
AndroidX instrumentation), the existing MiniPdfWriter.

**Spec:** `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`

## Global Constraints
- No new dependency; exact versions unchanged; no network, no analytics.
- Customer files parsed only in the isolated engine; no image bytes over the bridge.
- One geometry: the plan's boxes are what both preview and print use; physical sizes exact to ± 0.5 mm.
- Never lower print resolution (placement px = box at 300 dpi, as now).
- Every control the shopkeeper presses ≥ 56 px tall; text contrast ≥ 7:1; no word from the jargon list (DPI, resolution, margin,
  MIME, format, aspect, render, EXIF, pixel, orientation) in user text — say "Border", never "picture format".
- Every gesture has buttons that do the same; motion only under `prefers-reduced-motion: no-preference`.
- Medium scale: body 1.0625rem, buttons 1.125rem / min-height 3.5rem, PRINT 1.25rem / 3.75rem, h1 1.5rem, tile grid
  min-height 6.5rem, tile title 1.125rem, helper 1rem, `--gutter: 24px`.
- Startup JS ≤ 60 KB gzip, CSS ≤ 15 KB gzip (`npm run size`).
- Old saved jobs and settings (without the new fields) load unchanged (normalizeJob / normalizeSettings).

## Review Focus
1. A frozen photo that no longer fits after Turn or Crop (a wide photo turned upright on a sideways sheet) — the plan
   shrinks it to fit; the engine never refuses a box outside the page (Task 9 test `turned photo that no longer fits`).
2. Photos added to an arranged job ("Add to this job", Undo of Remove) have no size yet — they get the median size of
   the others and flow on (Task 9 test `a photo without a size gets the median size`).
3. 100 photos all at the smallest size — the flow stays fast (< 50 ms) and never makes more pages than photos (Task 8).
4. A pinch that loses a finger (pointercancel, third finger, capture lost) — the gesture ends cleanly and the next drag
   works (Task 5 test `gesture survives cancel and extra fingers`).
5. A custom passport size that does not fit the 4×6 photo paper — the sheet goes on A4 and says so; a size that does
   not fit A4 is refused in Settings (Task 7 tests).

---

## Phase 16 — medium size, side space, card source, photos as they are

### Task 1: Startup code split (lazy screens)

**Files:** Create `src/ui/lazyScreen.tsx`, test `src/ui/lazyScreen.test.tsx`; modify `src/app.tsx` (SCREENS).

**Interfaces:**
- Produces: `lazyScreen(load: () => Promise<(p: ScreenProps) => preact.JSX.Element>): (p: ScreenProps) => preact.JSX.Element`
  — renders `<main class="screen" aria-busy="true" />` until loaded, then the screen with the same props; hooks always
  called in the same order; a failed load shows a Panel "Couldn't open this screen" with Try again.

- [ ] Step 1: test `renders the placeholder, then the screen with its props` and `a failed load offers Try again` (fake
  loader promise; @testing-library/preact as the existing primitives tests use).
- [ ] Step 2: run `npx vitest run src/ui/lazyScreen.test.tsx` → FAIL (module missing).
- [ ] Step 3: implement; in `src/app.tsx` load lazily: cards screens, passport screens, CropPhoto, Docs screens,
  PrintStyle, settings groups/choice/shop name/delete all, TestPage, Tests (Home, Received, Receiving, Ready, Change,
  Choices, Result, Recent, Photos, Help, Welcome, NewFiles, Problem, BlackEdges stay eager).
- [ ] Step 4: `npx vitest run src/ui/lazyScreen.test.tsx` PASS; `npm run build && npm run size` → js under 60 KB with
  room (record the number in the ledger); `npm run test:e2e` green (full run).
- [ ] Step 5: commit `perf(phase 16): screens off the start path load when first opened`.

### Task 2: Medium size and 24 px side space

**Files:** `src/styles/tokens.css`, `src/styles/ui.css`, `src/styles/tokens.test.ts`, `tests/e2e/shell.spec.ts`.

- [ ] Step 1: tokens.test `medium scale (owner 2026-10-23)`: body font-size `1.0625rem`, h1 `1.5rem`, `.btn` font-size
  `1.125rem` + min-height `3.5rem`, `.btn-print` `1.25rem`/`3.75rem`, `.tile-grid .tile` min-height `6.5rem`,
  `--gutter: 24px`. shell.spec `layoutProblems`: the side floor `8` becomes `20` (stricter).
- [ ] Step 2: run → FAIL on the values.
- [ ] Step 3: change the tokens and rules (screen titles, tile titles/helpers, panel and row text, icons 24–28 px,
  spacing tokens ~15 % tighter); keep every pressable ≥ 3.5rem.
- [ ] Step 4: `npx vitest run src/styles` PASS; `npx playwright test tests/e2e/shell.spec.ts` PASS (all viewports and
  text sizes, axe); screenshots of Home/Ready/Change at 360×800 into `docs/evidence/phase-16/2026-10-23/look/`.
- [ ] Step 5: commit `feat(phase 16): medium size and a 24 px side space (owner's phone)`.

### Task 3: "Where is the card?" (gallery or file manager)

**Files:** create `src/screens/cards/CardSource.tsx`; modify `src/screens/home/Home.tsx`, `src/app.tsx`,
`src/i18n/en.ts`, `src/native/printEngine.ts` + `.mock.ts`, `PrintEnginePlugin.kt` (`pickFiles`), tests
`tests/e2e/cards.spec.ts`, `tests/e2e/shell.spec.ts` (JOURNEYS, SCREENS).

**Interfaces:** Produces `pickFiles(o: { kind: PickKind; from?: 'gallery' | 'files' })`; native: `kind == "cards" &&
from == "gallery"` → photo picker with `EXTRA_PICK_IMAGES_MAX = 2` (fallback ACTION_OPEN_DOCUMENT `image/*`, multiple);
otherwise as now. Screen name `cardsource`; copy: title "Where is the card?", choices "Photos of the card" / "From the
gallery" and "e-Aadhaar PDF or file" / "From the file manager".

- [ ] Step 1: e2e `Aadhaar tile asks where the card is; gallery opens photos, file manager opens files` (mock records
  `from`), tap count from Home 5 → 6 in JOURNEYS.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: PASS + `node scripts/android-env.mjs :app:compileDebugKotlin`.
- [ ] Step 5: commit `feat(phase 16): the ID card tile asks gallery or file manager first`.

### Task 4: Picked photos are never turned by the app

**Files:** `src/core/job/job.ts` (`picked?: true`, normalizeJob), `src/app.tsx` (set it when the intake came from a pick),
`src/screens/rotate.ts` (`turnsFor` → `{}` for picked jobs), tests `src/screens/rotate.test.ts` (or the existing
rotate tests file), `tests/e2e/cards.spec.ts` (rotation block).

- [ ] Step 1: unit `a job made from picked photos is never turned`; e2e `photos chosen from the phone are shown as they
  are (no Turned note) while the same photo shared is turned`.
- [ ] Step 2: FAIL. Step 3: implement (the flag survives normalizeJob; "Add to this job" from a share keeps it picked —
  ruling: the job's first source decides). Step 4: PASS.
- [ ] Step 5: commit `fix(phase 16): photos picked from the phone show as they are, never turned by the app`.

### Task 4b: The PS printer logo everywhere and the splash

**Files:** create `assets/brand/` (v3 masters + README), `scripts/brand/render.mjs` (Playwright renders the PNGs from the
masters), `scripts/brand/brand.test.mjs`, `src/ui/BrandMark.tsx`, `public/favicon.ico`; modify `index.html` (static
splash markup + favicon), `src/main.tsx` (ends the splash), `src/styles/tokens.css` (brand tokens), `src/styles/ui.css`
(splash), `src/screens/home/Home.tsx` (mark beside the name), Android `res/` (adaptive + round + monochrome icons,
`drawable/ic_launcher_foreground.xml`, `drawable/splash_mark.xml`, `drawable/splash.xml`, theme attributes; the
Capacitor sample `splash.png` files and foreground PNGs removed), `biome.json` (skip `assets/brand`).

- [ ] Step 1: tests — `brand.test.mjs`: every mipmap density has ic_launcher, ic_launcher_round and
  ic_launcher_monochrome PNGs of the right size, the adaptive icons name the vector foreground and the monochrome layer,
  the launch theme sets windowSplashScreenBackground/AnimatedIcon, no `splash.png` remains; e2e: `?splash=1` shows the
  splash and it is gone within 1.5 s with Home usable; with reduced motion there is none; Home's mark is aria-hidden.
- [ ] Step 2–4: FAIL → implement → PASS (+ `:app:lintDebug` for the resources).
- [ ] Step 5: commit `feat(phase 16): the PS printer logo everywhere and a short printing splash`.

## Phase 17 — passport

### Task 5: Pan and zoom maths + gesture tracker

**Files:** create `src/core/layout/panZoom.ts` + test; create `src/ui/gestures.ts` + test.

**Interfaces:**
- `panPhoto(r: Rect, dxFrac: number, dyFrac: number, shown: number, frame: number): Rect` — the photo moves by dx, dy
  frames-widths/heights (positive = photo moves right/down, so the crop moves left/up), result via `fitFrame`.
- `zoomPhoto(r: Rect, factor: number, shown: number, frame: number, at?: { x: number; y: number }): Rect` — factor > 1
  = photo bigger = crop smaller, keeping the point `at` (fractions of the frame, default centre) still; via `fitFrame`.
- `trackGesture()` → `{ down(e), move(e): GestureStep | null, up(e) }`, `GestureStep = { kind: 'pan'; dx; dy } |
  { kind: 'pinch'; factor; cx; cy }` in screen px; ignores a third finger; `up`/`cancel` of either finger ends the pinch
  and the remaining finger pans on from where it is.

- [ ] Step 1: tests: `pan keeps the frame inside the photo`, `zoom in keeps the pinch point still`, `zoom stops at the
  smallest frame (20 % of the photo) and at the whole photo`, `gesture survives cancel and extra fingers`.
- [ ] Step 2–4: FAIL → implement → PASS (`npx vitest run src/core/layout/panZoom.test.ts src/ui/gestures.test.ts`).
- [ ] Step 5: commit `feat(phase 17): pan and zoom under a still frame`.

### Task 6: Fit the face, the WhatsApp way; Crop gets drag and pinch

**Files:** `src/screens/passport/Passport.tsx` (PassportCrop), `src/screens/photos/CropPhoto.tsx`, `src/styles/ui.css`,
`src/i18n/en.ts`, `tests/e2e/passport*.spec.ts` (existing passport spec file), `tests/e2e/crop` spec.

Stage: aspect 3:4 box, `--desk` backdrop, the frame (preset shape) centred at 70 % of the stage's limiting side; the
photo drawn so the crop maps onto the frame, dimmed outside it (`.face-stage`). Buttons: Zoom in, Zoom out, Move photo
up/down/left/right (5 % of the frame per tap), Turn, Start again. CropPhoto: pointer down inside the frame (not on a
handle) pans the frame; two fingers scale it about its centre (`scaleBox`).

- [ ] Step 1: e2e (context `hasTouch`, CDP `Input.dispatchTouchEvent` for two fingers): `drag moves the photo under the
  frame`, `pinch zooms`, `buttons zoom and move`, `the saved frame prints` (plan crop changes), crop `drag inside moves
  the frame`, `pinch resizes it`.
- [ ] Step 2–4: FAIL → implement → PASS + layout matrix for `passportcrop`/`cropphoto`.
- [ ] Step 5: commit `feat(phase 17): fit the face by dragging and pinching the photo`.

### Task 7: Passport border and custom size

**Files:** `src/core/settings/settings.ts` (`passport.border: 0|0.5|1|1.5|2.25|3` default 1.5; `passport.custom?:
{ wMm; hMm }` 15–100 mm; preset `'custom'`), `src/core/layout/passport.ts` (`passportSize(choice, settings?)`),
`src/core/job/job.ts` (`PassportChoice.border?`, `sizeMm?`, preset `'custom'`; actions `setPassportBorder {border}`,
`setPassportSize {preset, sizeMm?}`), `src/core/plan/plan.ts` (placements `border`, guides dropped when border > 0;
photo paper only when ≥ 1 photo fits, else A4), `src/ui/PaperPreview.tsx` (SVG overlay for borders and cut lines),
settings screens (`SettingChoice` key `passportBorder`, a `PassportCustom` screen with two cm fields), Change rows
(Size, Border), `RenderPlan.kt` (`border` 0.25–6 pt → `StrokeRect` inset by half the width, sheet coords),
`PlanRenderer.kt` (rects to `addPage`), JVM tests, `android/app/src/test/resources/plan-v1-passport-border.json`.

- [ ] Step 1: tests — vitest: `border 1½ pt by default on new passport jobs`, `border inside the box: plan box unchanged,
  border 1.5`, `no cut lines with a border`, `custom 34.4 × 42.3 mm prints exactly`, `a size too big for 4×6 goes on A4`,
  `settings refuse a custom size that fits no A4`, old settings/jobs load; JVM: `border draws an inset black rectangle
  of that width` (content stream `1.5 w 0 G` and the rectangle inside the box), `border out of range refused`; e2e:
  Change → Border → 3 pt shows on the preview (SVG rect stroke) and Size → custom.
- [ ] Step 2–4: FAIL → implement → PASS (`npx vitest run`, `node scripts/android-env.mjs :app:testDebugUnitTest`, e2e).
- [ ] Step 5: commit `feat(phase 17): passport border (½–3 pt, 1½ default) and a custom size`.

### Task 7b: Paper direction (portrait by default, landscape on request)

**Files:** `src/core/job/job.ts` (`direction?: 'portrait' | 'landscape'`, missing = portrait; action `setDirection`),
`src/core/layout/layouts.ts`, `onePerPage.ts`, `passport.ts` (a `direction` parameter instead of trying both),
`src/core/plan/plan.ts`, `summary.ts` ("Landscape" in the line when chosen), `src/screens/change/Change.tsx` +
`Choices.tsx` (screen `direction`, two picture choices), `src/i18n/en.ts`, layout/plan tests, `tests/e2e`.

- [ ] Step 1: tests `a new job prints on upright paper`, `a wide photo alone stays on upright paper`, `Landscape puts
  every page sideways (all layouts, documents, passport)`, `Best counts pages in the chosen direction`; existing tests
  that expected the automatic sideways choice pass the direction explicitly (ruling: owner override, not weakening);
  e2e `Change → Paper direction → Landscape`.
- [ ] Step 2–4: FAIL → implement → PASS. Step 5: commit `feat(phase 18): paper direction, portrait unless the shopkeeper chooses landscape`.

## Phase 18 — Adjust on every preview

### Task 8: Flow layout ("Square" wrap)

**Files:** create `src/core/layout/flow.ts` + `flow.test.ts`.

**Interfaces:** (orientation = the job's direction, Task 7b) `flowPages(items: { index: number; aspect: number; longMm: number }[], paper: Paper, orientation:
'portrait' | 'landscape'): LayoutPage[]`; `fitLongMm(aspect, paper, orientation): number` (largest long side inside the
edges); `MIN_LONG_MM = 20`. Rules: sizes clamped to [MIN_LONG_MM, fitLongMm]; rows left to right with `GAP_MM` (3);
a photo that overflows the row starts a new row; a row that overflows the page starts a new page; rows centred across,
photos centred on the row's middle line, the block centred down the page.

- [ ] Step 1: fast-check properties (1–40 photos, sizes 20–300 mm, both papers and directions): each photo once, order
  kept, no overlap (≥ gap − 1e-6), inside the edges, size kept to 0.1 % unless clamped, every page but the last would
  not take the next photo's row, page count minimal for the row breaks; examples: `three 60 mm photos share a row`,
  `growing one photo pushes the last photo to page 2`; perf: 100 photos at 20 mm < 50 ms, pages ≤ 100.
- [ ] Step 2–4: FAIL → implement → PASS. Step 5: commit `feat(phase 18): photos flow in rows and spill onto new pages`.

### Task 9: Sizes in the job and the plan

**Files:** `src/core/job/job.ts`, `src/core/plan/plan.ts`, `src/core/plan/summary.ts`, tests `plan.test.ts`,
`idcard.test.ts`, `document.test.ts`, `src/core/job/job.test.ts`.

**Interfaces:**
- `Job.arranged?: { orientation: 'portrait' | 'landscape'; sizes: Record<number, number> }` (long side mm);
  `Job.docScale?: Record<string, number>` (`"item:page"`, 0.5–1, 0.05 steps); `IdCardSize` gains `'custom'`,
  `IdCardChoice.scale?: number` (0.7–2.0, 0.1 steps).
- Actions: `setArranged { arranged: Arranged | null }`, `setDocScale { item; page; scale }`, `setIdCardScale { scale }`.
  `setLayout`, `setPages`, `setPaper` clear `arranged`.
- `freezeSizes(plan: PrintPlan): Arranged` in `src/core/layout/flow.ts` (orientation of page 1, long sides in mm).
- buildPlan: allOnOne/morePages with `arranged` → `flowPages`; onePerPage with `arranged` → each photo on its page at
  its size, centred; documentPlan scales boxes about their centre and leaves the untouched path when any scale < 1;
  idCardPlan `'custom'` stacks both cards at `scale` × real (clamped to fit) with cut lines; summary "ID card · 120 %".
- [ ] Step 1: tests `arranged sizes print exactly`, `turned photo that no longer fits is shrunk to fit`, `a photo
  without a size gets the median size`, `choosing a layout goes back to automatic sizes`, `one on each page keeps its
  page and centres the smaller photo`, `a scaled document page is not the untouched file`, `ID card at 120 %`, old jobs
  load; native contract: an arranged plan's JSON parses in `RenderPlanContractTest` (fixture `plan-v1-arranged.json`).
- [ ] Step 2–4: FAIL → implement → PASS. Step 5: commit `feat(phase 18): sizes the shopkeeper chose are kept in the job and the plan`.

### Task 10: The Adjust screen (photos) and its entry on Ready

**Files:** create `src/screens/adjust/Adjust.tsx` (+ `adjust.ts` pure helpers: `selectAt(plan, page, x, y)`,
`resizeStep`), modify `src/screens/ready/Ready.tsx` (Adjust button under Change; a tap on a sheet opens Adjust with that
photo), `src/app.tsx` (`adjust`, lazy), `src/ui/PaperPreview.tsx` (`selected?: number`, `onPick?(itemIndex)`, a corner
handle `onResizeStart`), `src/styles/ui.css`, `src/i18n/en.ts`, `tests/e2e/adjust.spec.ts`, shell matrix entry.

Screen: TopBar "Photo N of M"; the live sheet of the chosen photo (PaperPreview from `buildPlan`), "Page k of n";
"8.4 × 6.3 cm"; buttons Smaller, Bigger (disabled at the limits), Turn, Crop (→ `cropphoto`), Move earlier, Move
later, Remove (Undo panel on this screen), Previous photo, Next photo, Automatic sizes; Done → `backTo ready`. The first
size change saves `setArranged(freezeSizes(currentPlan))` with the new size in one action. Corner drag: live local
sizes, saved on release.
- [ ] Step 1: e2e `Adjust from Ready, Bigger three times adds a page`, `drag the corner resizes`, `Turn turns the chosen
  photo`, `tap another photo chooses it`, `Automatic sizes goes back`, `Back keeps the sizes`; unit `selectAt`.
- [ ] Step 2–4: FAIL → implement → PASS (+ matrix for `adjust`).
- [ ] Step 5: commit `feat(phase 18): Adjust photos on the preview`.

### Task 11: Adjust for documents, passport sheets and ID cards

**Files:** `src/screens/adjust/Adjust.tsx` (per-kind buttons), Ready labels, `src/i18n/en.ts`, `tests/e2e/adjust.spec.ts`.

Documents: Smaller/Bigger (`setDocScale`, 50–100 %), Turn (`turnDocPage`), Crop (photo pages), Move (`moveDocPage`),
Remove (docPages without it), Previous/Next page, "Page 2 · 90 %". Passport: Smaller/Bigger (`setPassportSize` custom,
± 1 mm width, shape kept), Fit the face, Turn, Border, Size, How many; "3.5 × 4.5 cm · 1½ pt border". ID cards:
Smaller/Bigger (`setIdCardScale`, from `real` = 1.0), Turn (`turnIdCard`), Fix corners, Swap, Previous/Next card.
- [ ] Step 1: e2e one test per kind (resize + turn reach the plan/preview).
- [ ] Step 2–4: FAIL → implement → PASS. Step 5: commit `feat(phase 18): Adjust pages, passport photos and ID cards`.

## Phase 19 — print speed and photos "as is"

### Task 11b: Every job as a document; Best photo quality on request; original JPEGs untouched

**Files:** `src/core/job/job.ts` (`quality?: 'normal' | 'photo'`, action `setQuality`), `src/core/plan/plan.ts`
(`contentType: 'document'` unless quality is photo on a photo layout), Change row + choice screen, `src/i18n/en.ts`;
engine: `isolated/Decode.kt` / `IEngine.aidl` (a `jpegAsIs` header check: baseline/progressive, 8 bit, 1 or 3
components, not Adobe CMYK; size), `render/PlanRenderer.kt` (when a placement qualifies: the file's own bytes as a
`DCTDecode` image, turned by the page matrix for EXIF 3/6/8), `pdf/MiniPdfWriter.kt` if needed; tests in
`PlanRendererTest`, `RenderPlanContractTest`, a device test, plan/e2e tests.

- [ ] Step 1: tests — vitest `photo layouts are sent as documents unless Best photo quality`; JVM `an untouched
  WhatsApp-sized JPEG goes into the print file byte for byte`, `a cropped, styled, mirrored, CMYK or too-big JPEG is
  drawn as before`; device `the print file holds the original JPEG bytes`.
- [ ] Step 2–4: FAIL → implement → PASS. Step 5: commit `feat(phase 19): every job prints as a document; original
  photos go in untouched`.

### Task 12: Device evidence, review, regression, release (Phases 16–19)

**Files:** create `scripts/device/adjust-smoke.mjs`; evidence under `docs/evidence/phase-16|17|18/2026-10-23/`; closure
docs `docs/qa/phase-16.md`, `phase-17.md`, `phase-18.md`; `docs/qa/traceability.md`; `docs/spikes/USER-CHECKLIST.md`
(§V, §W, §X); `docs/decisions/owner-decisions-2026-10-23.md` (the three overridden rules).

- [ ] Step 1: adjust-smoke on API 35 (checks asserted, exits 1 on failure): share photos → All on one page → Adjust →
  Bigger ×3 → the print file has the photo at the size the screen showed (± 0.5 mm) and one more page; passport →
  border 1½ pt in the file (`1.5 w`, inside the box), custom size exact; card tile → "Where is the card?" → gallery
  opens the photo picker; a picked EXIF-6 photo shows upright and no "Turned" note.
- [ ] Step 2: fresh reviewer (most capable model) on the branch diff with the spec, plan, Review Focus and ledger
  rulings; fix Critical/Important with failing tests first; minors ledgered.
- [ ] Step 3: full regression (vitest, e2e, size, lint, Android lint + JVM, regress.sh API 24 / 35 / 36, share matrix,
  privacy), release build `apk/PrintSaathi-<version>.apk` with check-release + release-smoke on API 35.
- [ ] Step 4: closure docs (TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION), commit, report.
