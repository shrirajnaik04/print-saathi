# Phase 48 (round 10): some pages in colour Implementation Plan

> Executed inline, test first, as in rounds 4–9. Steps use checkboxes.

**Goal:** a job's pages can be Colour or Black & white one by one, printed in order in one print; plus the pinned page bar fix.
**Architecture:** marks `job.pageColour` keyed "item:page"; the plan gives each placement its own style and a colour plan with grey placements; the Kotlin renderer accepts grey styles inside a colour plan; Ready gets a per-page switch and a lazy grid with a first guess made from the page pictures.
**Spec:** `docs/superpowers/specs/2026-10-29-round-10-mixed-colour-design.md`

## Global Constraints
- Startup JS ≤ 61,440 B gzip (133 B spare at the start): new words, the grid and the guess load on demand (`lazyPart`).
- Controls ≥ 56 px; plain English; jargon and wording tests cover new words.
- No image bytes over the bridge; no new native call (the guess reads the page pictures in the web view).
- Print resolution never lowered; B&W pages are exactly grey (R = G = B).

## Review Focus
1. Marks after Pages to print, page order, turns, Adjust moves: they stay with their pages.
2. Mixed job + the exact (untouched) PDF path, copies, big jobs in parts, passport and ID cards: never an untouched file with a grey page; no marks shown where they do not apply.
3. A page with several photos where marks differ (after a layout change).
4. Locked or failed page pictures: the guess must not mark wrongly or hang.
5. Back and Undo: the top switch clears the marks; the job's saved state survives a restart.

### Task 1: job marks (pure)
- [ ] RED `src/core/job/pagecolour.test.ts`: `setPageColours` sets/clears marks (a mark equal to the job's colour is dropped), `setColour` clears marks even when the colour is the same, `effectiveColour`, `normalizeJob` keeps good marks and drops marks of pages not in the job, `styleOfPage` per page (BW group for grey pages, job style kept when it fits).
- [ ] GREEN `job.ts`: `pageColour?: Record<string, 'colour'|'bw'>`, `effectiveColour(job,key)`, `styleOfPage(job,key)`, actions `setPageColours {marks}` (null removes a mark) and `someColour {marks}` (base colour 'colour', marks of grey pages), normalise.

### Task 2: plan (pure)
- [ ] RED `src/core/plan/pagecolour.plan.test.ts`: a document plan with marks has `colour: 'colour'`, grey pages' placements `bw`, others `original`; all pages grey → plan `bw`; untouched path off when any page is grey; photo layouts per photo; summary "N colour, M black & white".
- [ ] GREEN `plan.ts` (documentPlan, photo plan), `summary.ts` (colourWords with counts).

### Task 3: renderer (Kotlin)
- [ ] RED `RenderPlanTest`: a colour plan accepts placements styled "bw", "sharp", "ocv"; a grey plan still refuses colour styles; the exact path refuses a grey page. Device `PlanRenderDeviceTest`: a colour page next to a "bw" page: the grey page's pixels are R = G = B, the colour page keeps its colour.
- [ ] GREEN `RenderPlan.kt`.

### Task 4: the guess (web)
- [ ] RED `src/core/colour/chroma.test.ts`: share of coloured pixels; grey text with JPEG noise is not colour; a small red stamp is colour.
- [ ] GREEN `chroma.ts` and the loader that reads the page pictures (canvas, same origin).

### Task 5: Ready (web)
- [ ] RED `tests/e2e/colourpages.spec.ts`: This page Colour/B&W changes the picture and the summary; Choose pages in colour grid; first guess; All colour / All black & white; the top switch clears marks; not shown for one page, passport, ID cards; 320 px at 200 % text; axe.
- [ ] GREEN `screens/colour/ColourPages.tsx` (lazy), Ready wiring, `i18n/colour.ts` (lazy words), mock engine (`?mockColourPages=2,4`), jargon/wording tests.

### Task 6: device proof and closure
- [ ] Device smoke `round10-smoke.mjs` (API 35): a 4-page PDF with a coloured page, mark pages, print file read back: grey pages exactly grey, the colour page in colour, page count and order.
- [ ] Full verify, e2e, size, regression API 35/24/36, release smokes, fresh review (one fix pass), docs (phase-48 report, rulings, traceability, checklist §AG, evidence), public export, memory.
