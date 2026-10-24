# Phase 6 — Passport photos (emulator scope) → Milestone B: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:** "5 passport photos" in 3 taps (PLAN §J4): share one portrait → **Passport photos** → (crop if needed) →
**Next** → *Ready* "5 passport photos · 4×6 photo paper · Colour · 1 sheet · Charge ₹50" with the yellow
"Put 4×6 photo paper in the printer" panel → **PAPER LOADED — PRINT**. Exactly 35 × 45 mm on paper.

**Spec:** PLAN §G0 (passport slots computed from paper and margins: 6 at 4 mm edges on 4×6, 8 at ≤ 3 mm, 30 on A4;
reading order; sheets = ⌈photos ÷ slots⌉; cut lines along the gaps; gap 2 mm), §F1 (crop is normalised in the
upright, turned space), §F2 (decode-to-size, memory budgets), §I-10/11 (Which photo?, Passport crop), §J4, §K4
(presets 35×45 default, 20×25, 2×2 in; quick 4/5/6/8; price only for configured counts: 5 = ₹50), §D4 (DOCUMENT
content type for passport sheets; calibrated 4×6 paper or A4 fallback), §U "Passport".

**Exit (PLAN §T1):** ruler 35.0 × 45.0 mm ± 0.5 mm on the real printer; the shopkeeper completes J4 alone — owner checks
(USER-CHECKLIST §J). Emulator exit: Save-as-PDF file read back with boxes 35.00 × 45.00 mm ± 0.1 mm, regression, gate.

## Global constraints
- Never lower print resolution: a passport photo is placed at ≥ 300 dpi from the original (35 × 45 mm = 413 × 531 px).
- Nothing changed except crop and scale (no beautification, PLAN §N).
- Crop never touches the original file; it is a job parameter (normalised rectangle) applied in the engine.
- Plain words: "passport photos", "photo paper", "cut lines" (no "slots", "margins", "crop" on the shopkeeper's screens except
  the screen title "Fit the face in the frame").

## Review focus
1. The printed box must be exactly 35 × 45 mm on both 4 × 6 in and 10 × 15 cm paper (no print-service scaling:
   DOCUMENT type, exact media size, page = paper size).
2. A crop on a turned or EXIF-rotated photo must cut the part the shopkeeper saw in the frame (not a mirrored or rotated region).
3. Changing the count (4/5/6/8/−/+) must recompute sheets; 7 photos at 6 per sheet = 2 sheets, never a cut-off
   seventh.
4. Without a saved 4×6 paper the job must fall back to A4 (30 per sheet) and say so, never ask for paper the printer
   lacks.
5. A huge photo with a tight crop must stay within the decode memory budget on a 2 GB API 24 phone.

---

### Task 1: Crop in the engine
- `RenderPlan` accepts crops (`0 ≤ x, y; w, h > 0; x + w ≤ 1; y + h ≤ 1`), in the upright turned space.
- `PlanRenderer`/`EngineRenderer`: maps the crop back through the quarter turns to the upright image, asks the
  engine for that region decoded to the box's 300 dpi size (`decodeRegionToJpeg`, AIDL), never more than the budget.
- Tests: JVM crop mapping for turns 0..3 (corners land where expected), plan validation; device: a red/blue/green
  quadrant photo, crop each quadrant (with turns and EXIF 6) → page pixels show only that quadrant's colour.

### Task 2: Passport sheet layout (TS)
- `core/layout/passport.ts`: `passportSheets(count, paper, edgeMm, preset)` → pages of boxes in reading order + cut
  lines; paper = calibrated 4×6 (mils from `paperSetup`) else A4; edge = max(4 mm, printer margin).
- Tests: 6 / 8 / 30 slots per sheet per PLAN; 7 → 2 sheets; boxes exactly preset size; inside the paper; cut lines
  only along gaps.

### Task 3: Plan, writer and print for passport
- `buildPlan` for `layout: 'passport'` (one item, count, preset, crop); `PrintPlan.paper` 4×6 with exact pts;
  `guides` drawn as thin grey lines by MiniPdfWriter; `printFile` asks for the plan's paper (calibrated MediaSize) and
  DOCUMENT content type.
- Tests: JVM writer lines; contract fixture 4 (passport) TS+JVM; device: Save as PDF → pdf.js boxes 35.00 × 45.00 mm.

### Task 4: Received → Which photo? → Passport crop
- "Passport photos" on Received (1–4 photos); several → *Which photo?*; *Passport crop*: fixed 35:45 frame, face
  oval guide, **Move ↑ ↓ ← →, Bigger, Smaller, Reset**, **Next**. Starts centred, largest frame that fits.
- Tests: e2e tap counts (J4 = 3 taps), nudges move the frame and stay inside the photo, Reset, matrix.

### Task 5: Ready for passport
- Summary "5 passport photos · 4×6 photo paper · Colour · 1 sheet · Charge ₹50" (price only for configured counts);
  yellow panel; **PAPER LOADED — PRINT**; Change → **How many photos?** (4 · 5 · 6 · 8 and − / +); A4 fallback note
  when no 4×6 is saved; blurry note when the crop is under 300 dpi.
- Tests: e2e summary/price/count/fallback; vitest summary.

### Task 6: Closure
- API 35 end to end to Save as PDF (boxes measured), 5-level regression, independent gate + re-review,
  `docs/qa/phase-6.md`, traceability §12–13, USER-CHECKLIST §J (ruler on the Brother, the shopkeeper does J4 alone).
