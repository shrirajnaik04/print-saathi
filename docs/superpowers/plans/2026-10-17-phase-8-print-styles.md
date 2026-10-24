# Phase 8 — Print styles: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, as Phases 2–7). Steps use checkbox (`- [ ]`) syntax.

**Goal:** add the five remaining print styles (Vibrant, Soft Tone, Sharp Black, OCV Black; Black & White already exists, Original is "no change"). Each style shows a real sample and applies to the whole job, in the print file and in the preview.

**Architecture:**
- **Engine:** the styles are pure functions over plain pixel rows, JVM-tested with golden values. The engine applies them at its output stage (the same place Rec.601 grey is applied today), so samples, previews and the print file come from one code path.
- **Output kinds:**
  - colour styles → colour JPEG q92;
  - Black & White / Sharp Black → exact-grey JPEG, or lossless grey for PDF pages;
  - OCV Black → raw 1-bit rows that the app compresses with Flate into a new `GREY1_FLATE` image.
- **Job:** the job gains `style`, coupled to Colour / Black & white. The plan carries it on every placement; the native side checks it again.

**Tech stack:** Kotlin (engine, writer), TypeScript/Preact (job, plan, screens). No new dependency.

**Spec:** `docs/PLAN.md`, sections:
- §F4 (exact algorithms), §G2 (encodings), §G4 (untouched path only when unchanged);
- §I-6/§I-7 (Change → Print style: 6 labelled samples), §J6/§J7 (flows);
- §U "Print styles" (six golden outputs, samples from the same functions, Original PSNR ≥ 40 dB, reversible), §H2.11/§H2.12.

## Global constraints
- Exact algorithms from PLAN §F4 (Vibrant: luma-preserving saturation × 1.25, contrast × 1.08 about mid-grey; Soft Tone: contrast × 0.90, brightness + 6, saturation × 0.92; Sharp Black: auto-levels black = 5th percentile ≤ 90, white = 90th percentile ≥ 160, stretch, gamma 0.85; OCV Black: background flattening by a blurred 1/8-scale background, Bradley–Roth threshold value < local mean × 0.85 with window ≈ 1/16 of the shorter side, or value < 80 → 1-bit; local means per strip with overlap, no full-page sum table, no 32-bit overflow).
- Never lower print resolution or reuse thumbnails as print sources (CLAUDE.md §5). Samples are ≤ 360 px and only for the picker.
- Black & white styles: every printed pixel R = G = B (or DeviceGray / 1-bit), plus monochrome requested.
- Style applies to the whole job; no sliders; non-destructive (the customer's file never changes).
- **Passport:** Original or Black & White only. PLAN §U says "nothing changed except crop and scale", and B&W is the existing Colour row.
- **Untouched document path:** only with Original.
- No image bytes over the bridge; samples are files shown by path.
- User-facing names exactly: Original, Vibrant, Soft Tone, Black & White, Sharp Black, OCV Black (PLAN §F4; "OCV Black" renameable later).

## Review focus
1. **Sharp Black on a blank or flat page:** a white page or a single grey must not divide by zero, and must not turn grey noise into black blotches. The percentile rule's limits (≤ 90 / ≥ 160) must hold.
2. **OCV Black:**
   - Polarity: 0 = black in the PDF, so check the read-back.
   - Strip seams: no visible line where strips meet.
   - Memory on a 2 GB phone at A4 300 dpi.
   - A photo-heavy page must not become a solid black block.
3. **Style ↔ Colour coupling:**
   - Picking Sharp Black sets Black & white.
   - Picking Colour afterwards returns to Original, never to "Vibrant in grey".
   - Old jobs without `style` load as Original or Black & White from their colour.
4. **Untouched path and passport:** neither may ever carry a style other than Original (B&W for passport is the existing grey path).
5. **The sample matches the print:** the sample on the Print style screen comes from the same function as the print file (compare a sample with the same region of the print render).

---

### Task 1: Style maths (pure Kotlin, JVM)
- **Files:** `engine/isolated/Styles.kt`, `test/.../isolated/StylesTest.kt`.
- **API:** `object Styles { fun vibrant(row: IntArray, n: Int); fun soft(row: IntArray, n: Int); fun levels(hist: IntArray): Levels?; fun sharp(row: IntArray, n: Int, l: Levels?); class Ocv(w: Int, h: Int) { fun background(grey: ByteArray): ByteArray /* 1/8 scale, blurred */; fun threshold(grey: ByteArray, bg: ByteArray, out: ByteArray /* packed rows, 0 = black */) } }`.
- **Golden tests (exact values written in the test):**
  - Vibrant and Soft Tone on 8 reference colours.
  - Sharp Black: histogram limits, a flat page gives `null` (no change), a ramp gives an exact output.
  - OCV:
    - a 1200 × 900 synthetic page (text on a shaded background) matches a golden packed bitmap;
    - strips of 64 and 256 rows give bit-identical output;
    - a white page gives all white, a black photo region does not exceed a set black share.
  - Original PSNR is ∞.
- **Commit.**

### Task 2: Engine and writer
- **AIDL:** `decodeToJpeg`, `decodeCropToJpeg` and `renderCustomerPage` take `style: Int` (0 Original, 1 Vibrant, 2 Soft, 3 B&W, 4 Sharp, 5 OCV) instead of the grey flag/mode. Old grey callers map to 3.
- **Output:**
  - styles 0–2: colour JPEG;
  - styles 3–4: exact grey (JPEG, or raw grey for PDF pages);
  - style 5: raw packed 1-bit rows (the reply says so).
- **Writer:** `MiniPdfWriter` gets `ImageKind.GREY1_FLATE` (`/BitsPerComponent 1 /ColorSpace /DeviceGray`, Flate, rows padded to bytes).
- **PlanRenderer:** `ImageKey` includes the style.
- **Tests:**
  - JVM: writer structure for 1-bit; PlanRenderer picks the kind per style.
  - Device (CustomerPdf / Decode):
    - B&W styles are grey only;
    - OCV pages read back as 1-bit with black text where the fixture has text;
    - Vibrant changes saturation in the expected direction;
    - Original is unchanged.
- **Commit.**

### Task 3: Job and plan
- **Job:** `job.style?: StyleId`. Reducer `setStyle` (sets colour from the style's group) and `setColour` (Colour → Original; Black & white → Black & White).
- **Old jobs:** `normalizeJob` infers the style from the colour.
- **Plan:**
  - passport is always Original/B&W;
  - the untouched path requires Original;
  - placements carry the style;
  - `planHash` covers it.
- **Native:** `RenderPlan.parse` accepts the six styles and still refuses unknown ones.
- **Contract fixture:** `plan-v1-styles.json`.
- **Tests:**
  - vitest for coupling, old jobs, passport, untouched;
  - JVM contract.
- **Commit.**

### Task 4: Samples
- **Plugin:** `styleSamples({jobId})` makes the job's first photo or first PDF page (password in memory if locked) in all six styles at ≤ 360 px.
  - Files go to `thumbs/` with hash-named files, or to `work/page-thumbs` for a locked PDF (decrypted mark).
  - One engine turn per sample; poison markers as for thumbnails.
- **Device test:** a sample equals the same region of a print render of that style (SSIM ≥ 0.98 after scaling).
- **Commit.**

### Task 5: Screens
- **Change → "Print style":**
  - The row shows the current name.
  - Hidden for passport; documents and photos have it.
- **Print style screen:**
  - Two groups (Colour: Original, Vibrant, Soft Tone; Black & white: Black & White, Sharp Black, OCV Black).
  - Each is a big tile with its real sample and name.
  - The selected tile has a ✓, a thick border and the word "Selected".
  - Tap → Ready.
- **Summary line:** adds the style name when it is not Original / Black & White.
- **Strings:** in en.ts, through the jargon lint.
- **Tests:**
  - e2e: choose Sharp Black → summary says Black & white · Sharp Black; Colour → Original; passport has no row; the untouched PDF path is lost with Vibrant.
  - Matrix + axe for the new screen.
- **Commit.**

### Task 6: Docs, closure
- **Docs:** `docs/print-styles.md` (exact algorithms and constants as built).
- **Regression:** 5-level device regression.
- **Reviews:** independent gate + re-reviews.
- **Closure documents:**
  - `docs/qa/phase-8.md`;
  - traceability §16;
  - USER-CHECKLIST §L: the six styles printed on the shop printer from a real photo and a real scan, reviewed by the owner (PENDING REAL-WORLD VALIDATION).
