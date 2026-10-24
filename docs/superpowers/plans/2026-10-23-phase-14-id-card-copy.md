# Phase 14 — Aadhaar & ID card copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From two messy phone photos, one photo with both sides, a scan, or an e-Aadhaar PDF, print a straightened ID card copy:
- real size (85.6 × 54 mm);
- big size;
- many sets on one A4;
- or the whole e-Aadhaar page.

**Architecture:**
- **Engine (isolated, Kotlin):**
  - finds card quadrilaterals on a ≤ 1024 px grey copy (`CardDetect`, pure Kotlin on bytes);
  - counts faces (`android.media.FaceDetector`);
  - warps a quad from the full-resolution source into an exact output raster (`Homography` + `Warp`, pure Kotlin);
  - PDF quads are rendered straight from the vector page at the needed scale (no lossy intermediate).
- **Web:**
  - `job.layout = 'idCard'` with `job.idCard`;
  - `idCardPlan()` places cards in exact millimetres;
  - placements carry `quad` instead of `crop`;
  - the screens: Cards found, Fix corners, How big?
- **The PrintPlan** gains an optional `quad`; `RenderPlan` checks it and the renderer warps.

**Tech Stack:** Kotlin (JVM-testable pure code + Android engine), Preact/TypeScript, Vitest, Playwright, AndroidX instrumentation.

**Spec:** `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md` (Part 2).

## Global Constraints
- **Exact sizes:**
  - Real card: 85.6 × 54.0 mm (242.65 × 153.07 pt), aspect 1.5852.
  - Real-size layout: front and back centred, 10 mm gap, top at 20 mm, dashed cut lines.
  - Big: equal scale up to 2× (171.2 × 108 mm) that fits the printable width, 10 mm gap, no cut lines.
  - Sets: front left / back right, 5 mm gaps, rows as many as fit inside the printer's measured edges, count 1…max, cut lines.
  - All sizes on A4 portrait, `contentType: 'document'`.
- **Output pixels at 300 dpi:**
  - real 1011 × 638;
  - big up to 2022 × 1276;
  - a source with fewer pixels than the placement needs triggers the "may print blurry" note under 200 dpi (as passport photos).
- **Customer files only in the engine.** Card corners and face counts are the only data that leave it. Nothing about a card's content is logged.
- **Detection:**
  - auto-accept confidence ≥ 0.75;
  - aspect window 1.585 ± 20 % in the card flow;
  - Received suggests "ID card copy" first only with confidence ≥ 0.8 and aspect within ± 10 %.
- **Taps:** share → Card copy → size → PRINT = 3; Home tile + picker + the same 3 = 5; +1 per Fix corners.
- No new dependency. Plain English. Every screen in the e2e matrix.

## Review Focus
- **An A4 document photo shared for a card copy:** the page is a big quad but the wrong shape. The card flow must not straighten a whole page as "the card" when its aspect is outside the window. JVM: an A4-page-on-table image yields no card at the auto threshold.
- **Two cards touching or overlapping in one photo:** the detector must return two non-overlapping quads or one, never a quad spanning both. JVM: a touching-pair fixture.
- **A tiny card far away (< 6 % of the photo):** must not be accepted as found. Fix corners opens with a default frame. JVM + e2e.
- **A quad given by Fix corners that is concave or self-crossing:** the web refuses Done (corners re-ordered or a message). RenderPlan rejects a non-convex quad. JVM + vitest.
- **A locked e-Aadhaar never unlocked:** the card flow asks to unlock first (the existing Unlock), never prints a blank card. e2e.

---

### Task 1: Homography and warp (pure Kotlin)
**Files:** Create `android/app/src/main/java/in/printsaathi/app/engine/card/Homography.kt`, `.../card/Warp.kt`. Test `android/app/src/test/java/in/printsaathi/app/engine/card/WarpTest.kt`.

**Interfaces (Produces):**
- `Homography.fromRectToQuad(w: Double, h: Double, quad: DoubleArray /* x0,y0..x3,y3 TL,TR,BR,BL */): Homography`
- `fun map(x: Double, y: Double): Pair<Double, Double>`
- `Warp.warp(src: IntArray, sw: Int, sh: Int, quadPx: DoubleArray, outW: Int, outH: Int): IntArray` (ARGB, bilinear; outside the source = white)

**Tests:**
- `the rectangle's corners land exactly on the quad's corners` (error < 1e-9);
- `an axis-aligned quad is a plain scale`: a warp of a 4×4 checker equals the area sample within 1 level;
- `a known perspective quad maps the centre onto the diagonals' crossing point`;
- `a degenerate quad (three collinear corners) is refused` (`IllegalArgumentException`).

Commit: `feat(phase 14): homography and bilinear warp for straightening cards`.

### Task 2: Card detector (pure Kotlin) on a generated corpus
**Files:** Create `.../card/CardDetect.kt`. Test `.../card/CardDetectTest.kt` and `.../card/CardScenes.kt` (test-only scene generator).

**Interfaces (Produces):**
- `data class CardQuad(val corners: DoubleArray /* TL,TR,BR,BL fractions of the image */, val confidence: Double)`
- `CardDetect.find(grey: ByteArray, w: Int, h: Int, maxCards: Int = 2): List<CardQuad>`, sorted by confidence. Only quads with confidence ≥ 0.5 are returned; the caller applies 0.75.

**Algorithm (the decisions):**
1. Gaussian blur σ 1.4.
2. Sobel.
3. Canny NMS with hysteresis: high = max(30, 85th percentile of magnitude), low = 0.45 × high.
4. Hough: 1° θ, 1 px ρ; top 30 peaks with NMS (±8 px, ±4°).
5. Refine each line by a total-least-squares fit of edge pixels within 3 px.
6. Pair near-parallel lines (Δθ ≤ 14°, separation ≥ 8 % of the short side).
7. Cross two pairs at ≥ 45°: 4 intersections. A quad must:
   - be convex;
   - lie within the image (−2 % tolerance);
   - have an area of 6–95 %;
   - have an aspect estimate (mean long sides / mean short sides) within 1.585 ± 20 %.
8. Edge support = the fraction of 200 perimeter samples with an edge pixel within 2 px.
9. Score = support × aspectFit × √areaFrac.
10. Confidence = support × aspectFit.
11. Second card: the best remaining quad with IoU < 0.05 against the first.

**The corpus** is generated by `CardScenes` with fixed seeds, 1024 × 768:
- backgrounds: wood stripes, cloth noise, paper, dark, busy blobs;
- the card: light, with a photo block and text bars, the true aspect;
- perspective tilt up to 35°, any rotation, shadow gradient, Gaussian noise σ 6.

**Tests:**
- `finds the card on clear backgrounds`: 240 scenes (paper/dark/cloth/wood × 60). Corner error ≤ 1.5 % of the diagonal in ≥ 95 %. Report the rate.
- `finds both cards of a front+back photo`: 40 two-card scenes, ≥ 90 % both found and non-overlapping.
- `no card in card-free scenes`: 100 scenes (blobs, gradients, text-like pages with aspect 1.414 or 0.707), nothing at confidence ≥ 0.75.
- `a tiny card (4 % of the photo) is not accepted`: confidence < 0.75 or not found.
- `hostile input`: zero, constant or random bytes give no exception (fuzz 200).

Commit: `feat(phase 14): find ID cards' corners in photos (edges, lines, quads; generated corpus metrics)`.

### Task 3: Engine API: detect, faces, warp (photos and PDF pages)
**Files:** Modify `IEngine.aidl`, `EngineService.kt`, `EngineClient.kt`, `Decode.kt` (extract `encode(bmp, out, quality, style)`), `CustomerPdf.kt`. Device test `androidTest/.../engine/CardEngineDeviceTest.kt`.

**Interfaces (Produces):**
- AIDL `int[] detectCards(in PFD src, int maxLongSidePx)` → `[n, (x0..y3 × 10000, conf × 1000) × n]` on the upright image.
- AIDL `int faceCount(in PFD src, int maxLongSidePx)`.
- AIDL `int[] decodeWarped(in PFD src, in PFD dst, int outW, int outH, int quality, int style, in double[] quad)`: same return as `decodeStyled`. It region-decodes the quad's bounding box at the resolution needed, then warps.
- AIDL `int[] detectCardsInPage(in PFD pdf, String password, int page)`.
- AIDL `int[] renderPageWarped(in PFD pdf, String password, int page, in PFD dst, int outW, int outH, int quality, int style, in double[] quad)`: renders only the quad's bounding box of the vector page at the scale needed.
- `EngineClient`: the matching Kotlin methods.

**Device tests (API 24/35/36):**
- A synthetic card JPEG gives 1 quad within 1.5 % of the truth.
- `decodeWarped` output is exactly outW × outH; a solid-colour card comes out as that colour (±4).
- A synthetic e-Aadhaar-like PDF (generated: two bordered panels) gives 2 quads.
- `faceCount` on a blank image is 0.
- A hostile image fails contained (`EngineDiedException` or an error code), never crashing the app.

Commit: `feat(phase 14): engine finds cards, counts faces and straightens cards from photos and PDF pages`.

### Task 4: Plan contract and render
**Files:**
- Modify `src/core/job/job.ts`: `JobLayout` adds `'idCard'`; `job.idCard?: IdCard`; action `setIdCard`.
- Modify `src/core/plan/plan.ts`: `idCardPlan`; `Placement.quad?`.
- Modify `RenderPlan.kt` (parse `quad`: 8 fractions, convex, never with a non-full crop) and `PlanRenderer.kt` (warp path).
- Test: `src/core/plan/idcard.test.ts`, `RenderPlanContractTest` (fixture `plan-v1-idcard.json`), `PlanRendererTest` (quad placement → warp call with the box's px).

**Interfaces:**
- `type IdCard = { size: 'real' | 'big' | 'sets'; sets?: number; front: number; cards: { itemIndex: number; pdfPage?: number; quad: number[] /*8*/; turns: 0|1|2|3 }[] }`.
- `idCardPlan(job, paperEdgeMm): PrintPlan`.

**vitest:**
- Real: two boxes 242.65 × 153.07 pt, centred, a gap of 28.35 pt (10 mm), top 56.69 pt (20 mm), cut lines around each.
- Big: the scale is min(2, fit), both equal.
- Sets on A4 with 6 mm edges: 5 rows (front/back pairs), count clamps 1…5.
- One card: only the front placed.
- The quad is copied to each placement.

**JVM:** the fixture parses; a concave or out-of-range quad is refused; a quad with a non-full crop is refused.

Commit: `feat(phase 14): ID card plans in exact millimetres; plans carry card corners; the renderer straightens`.

### Task 5: Screens and flow
**Files:**
- Home (tile "Aadhaar & ID cards", tone `cards`; picker kind `cards`: photos + PDF, max 2).
- Received (choice "ID card copy"; first when suggested).
- Create `src/screens/cards/CardsFound.tsx`, `FixCorners.tsx`, `CardSize.tsx`.
- Ready (summary "ID card · real size · A4 · Colour · 1 copy"; Change row "Size").
- `src/i18n/en.ts`; `printEngine.ts` (+ mock) `cardsIn({ jobId })` → `{ cards: { itemIndex, pdfPage?, quad, confidence, face }[] , previews }`; `app.tsx` SCREENS.
- e2e tests.

**e2e:**
- `ID card: two photos → Card copy → Real size → PRINT in 3 taps`.
- `Swap front/back swaps the preview labels and the plan order`.
- `Fix corners: arrows move the selected corner by 1 %, Done returns with the new straightened preview`.
- `no card found opens Fix corners with a default frame`.
- `How big? shows 4 choices for a PDF, 3 for photos; the last size is remembered`.
- `a locked e-Aadhaar asks to unlock first`.
- Matrix entries for the 3 new screens.
- Tap-count rows: J-card 3, Home 5.

Commit: `feat(phase 14): Aadhaar & ID cards — Cards found, Fix corners, How big?, Home tile and Received choice`.

### Task 6: Device proof
- The test sender gains mode `card-photos`: two synthetic perspective card photos with backgrounds.
- `scripts/device/card-smoke.mjs`: share → Card copy → Real size → PRINT → the print file has 2 images at 85.6 × 54 mm ± 0.5 (pdf.js render check).
- Runs on API 24 (engine path via instrumentation) and API 35/36 (UI).
- Gate review, fixes, 5-level regression, closure `docs/qa/phase-14.md`, USER-CHECKLIST §S (real Aadhaar/PAN photos, ruler).
