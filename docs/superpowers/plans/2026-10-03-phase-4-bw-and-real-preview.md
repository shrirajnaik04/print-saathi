# Phase 4 — Black & white, real-file preview, size budgets: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:**
- **Black & white:** prints from data that is grey and nothing else, and asks the printer for monochrome.
- **Ready:** shows the real print file (pages rendered back from `print.pdf` by the engine), so the preview is exactly what prints.
- **File sizes:** measured against the budgets.

**Spec:** PLAN §G2 (encodings: colour JPEG q92; grey photo-like = neutral-chroma JPEG, so every decoded pixel has R = G = B), §G7 (WYSIWYG: real-file preview, sideways pages shown upright), §F4 (Black & White = Rec.601 grey), §D4 (`COLOR_MODE_MONOCHROME`), §P (per-page budget: colour photo ≤ 3 MB, grey ≤ 1.5 MB), §U "Documents/B&W" and "Ready / WYSIWYG".

**Exit (PLAN §T1, Phase 4):**
- Independent PDF checks are clean.
- The preview is a render of the print file (equal by construction; the device test compares pixels).
- The size budgets are met on a realistic photo.

## Global constraints
- **Grey:** Y = 0.299R + 0.587G + 0.114B (Rec.601), rounded. Encoded as a JPEG with constant chroma (Cb = Cr = 128), so decoders give R = G = B exactly. B&W is never colour data in disguise.
- **Resolution:** print resolution is never lowered. B&W uses the same 300 dpi targets.
- **Preview:**
  - preview images are engine renders of `print.pdf` (≤ 1280 px long side, JPEG q80); a sideways page is rotated for display only;
  - the plan drawing stays as the placeholder while the file is being made;
  - customer content is shown only on screens that already block screenshots.
- **Bridge:** no image bytes over the bridge (paths only).

## Review focus
1. A B&W print must contain no pixel with R ≠ G ≠ B. Check every page image of the file on the device.
2. The preview must never show a stale file. Each new plan hash invalidates the preview.
3. Colour → B&W → Colour must give a byte-identical colour file again (deterministic).
4. A sideways page's preview must be upright and the right way round (not upside down).
5. A 30-page job must not hold 30 full images in memory in the WebView; images load lazily.

---

### Task 1: Grey encoding in the engine
- **Pure (JVM-tested) `isolated/Grey.kt`:**
  - `luma(argb)` (Rec.601, rounded);
  - `nv21Grey(width, height, lumaRow)` fills NV21 with Y = luma and VU = 128 (even sizes; odd sizes padded by repeating the edge).
- **`Decode.toJpeg(..., grey)`:** when grey, writes the decoded bitmap as an NV21 JPEG (`YuvImage.compressToJpeg`, q92); otherwise as today.
- **AIDL:** `decodeToGreyJpeg(src, dst, maxLongSidePx, quality)`. `EngineClient.decodeToJpeg(..., grey)`.
- **Tests:**
  - JVM: luma values, NV21 layout, odd sizes;
  - device: decode a colourful photo as grey and decode the JPEG back → every pixel R = G = B (± 0) and luma within ±2 of Rec.601.

### Task 2: B&W through plan, renderer and print
- **`RenderPlan`:** accepts `colour: 'bw'`. `PlanRenderer` asks the decoder for grey for bw plans, and the work-file key includes it.
- **`PrintFlow.start(..., monochrome)`:** `COLOR_MODE_MONOCHROME` for bw plans; `printFile` passes the colour.
- **Tests:**
  - JVM: plan parse for bw; renderer calls grey;
  - device: a bw plan → every pixel of the page images R = G = B; pdf.js check;
  - contract fixture 3 (bw).

### Task 3: Colour choice in Change
- **Change hub:** a **Colour** row (Colour / Black & white) → the Colour screen, two ChoiceCards with mini previews.
- **Preview drawings:** grey when B&W (CSS `grayscale(1)`); the summary line says "Black & white".
- **Tests:** e2e flow; the matrix includes the Colour screen.

### Task 4: Real-file preview
- **Engine:** `renderPdfPage(pdf, pageIndex, dst, maxLongSidePx)` → JPEG of the page on white, via the tiers in `PdfOpen`.
- **Plugin:** `previewPages({jobId, planHash})` → paths `out/<planHash>/preview/<n>.jpg`, made once and cached with the print file (deleted with it).
- **Ready:** after the file is done, each sheet shows its rendered page. A sideways plan page's image is rotated 90° clockwise for display, and the badge stays. The plan drawing remains the placeholder until the preview is ready. Images are lazy-loaded.
- **Tests:**
  - device: preview page 1 pixels match the photo colours at the plan boxes (red/blue test), sideways upright;
  - e2e (mock): Ready swaps to file images once ready, and a stale hash is ignored.

### Task 5: Size budgets
- **Device test:** a realistic 12 MP photo-like fixture, generated with noise and gradients.
  - Colour A4 one-per-page: page image bytes ≤ 3 MB.
  - Grey: ≤ 1.5 MB.
- **Evidence:** sizes recorded per API level.

### Task 6: Phase 4 closure
- **Device regression:** 5 levels.
- **End to end on API 35:** B&W via Save as PDF; pixels checked in the saved file.
- **Gate:** independent review.
- **Docs:** `docs/qa/phase-4.md`; traceability.
