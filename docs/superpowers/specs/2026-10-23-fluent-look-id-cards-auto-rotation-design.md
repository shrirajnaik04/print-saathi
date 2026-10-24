# PrintSaathi V1.1: Office look, Aadhaar & ID card copy, auto-rotation (design spec)

**Status:** approved in conversation (2026-10-22/23); this written spec awaits the owner's review.

**Extends:** `docs/PLAN.md` (R2). The owner moves PLAN §L2 (ID card copy) and §L3 (document on a table: edge detection and straightening) from Phase 2 into this release, and replaces the "big, calm, still" motion rule with the motion system below.

**Visual decisions:**
- the look: direction **A · Office (Fluent)**;
- the card flow: the 4-screen flow.

Both were chosen on the visual companion; mockups are in `.superpowers/brainstorm/4610-1792693529/content/`.

**Order** (the owner approved it):
1. new look;
2. ID card copy;
3. auto-rotation.

Each is its own phase with the usual closure (§T0).

## Unchanged rules (they bind every part below)
- **Accessibility and plain words:**
  - one question per screen;
  - plain English (jargon lint, ≤ 20-word sentences);
  - The shopkeeper's controls ≥ 56 px, primary buttons ≥ 64 px;
  - text contrast ≥ 7:1 (AAA);
  - one title per screen, with focus on it;
  - nothing hidden under pinned bars;
  - the layout matrix (320–480 px, 800×360, text 100–200 %).
- **Privacy and engine:**
  - offline;
  - no new dependency (CSS and Kotlin only);
  - customer files parsed only in the isolated engine;
  - nothing about a card's content (name, number, photo) is ever logged, stored outside `jobs/`, or sent anywhere.
- **Print correctness:**
  - print quality is never lowered;
  - the preview is the real print file;
  - exact physical sizes (ruler-checked by the owner).

---

## Part 1 — The Office (Fluent) look

### Tokens

Replace `tokens.css` values. `tokens.test.ts` keeps measuring every pair; a shade is darkened until the pair passes.

| Token | Value | Use / rule |
|---|---|---|
| `--bg` | `#F3F4F6` | App background (cool grey) |
| `--surface` | `#FFFFFF` | Cards, tiles, sheets |
| `--text` | `#111827` | ≥ 7:1 on bg and surface |
| `--text-muted` | `#3F4B5B` | 8.1:1 on bg, 8.9:1 on surface, 7.2:1 on primary-soft (today's `#475569` is 6.9:1 on the new bg) |
| `--primary` | `#3730A3` (indigo 800) | Buttons (white label ≥ 7:1), links, focus ring, selected outline |
| `--primary-soft` | `#E0E7FF` | Selected tile background (with outline + "Selected" word, never colour alone) |
| `--print` | = `--primary` | PRINT is the screen's one primary button (the mockup) |
| `--warn-*`, `--error-*`, `--info-bg` | as today | ≥ 7:1 |
| Badge pairs (bg / glyph) | photos `#DBEAFE`/`#1D4ED8`; passport `#EDE9FE`/`#6D28D9`; cards `#FFEDD5`/`#9A3412`; documents `#DCFCE7`/`#166534` | Glyph ≥ 3:1 on its badge (non-text) |
| `--elev-1` | `0 1px 2px rgb(17 24 39/6%), 0 4px 12px rgb(17 24 39/7%)` | Cards, tiles |
| `--elev-2` | `0 2px 4px rgb(17 24 39/8%), 0 8px 24px rgb(17 24 39/10%)` | Pinned bars, the paper sheet |
| `--radius` / `--radius-sm` | `0.75rem` / `0.625rem` | Cards / buttons |
| Font | Atkinson Hyperlegible Next (kept) | Chosen for low vision; the sizes stay |

Outlines stay where they carry meaning: inputs, secondary buttons, and the selected state. Plain cards get depth instead of a 2 px border.

### Motion system

CSS only, all transform/opacity. Every rule sits under `@media (prefers-reduced-motion: no-preference)`; with reduced motion everything is instant.

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 120 ms | Press feedback: scale 0.97 + `--elev-1` → none, release restores |
| `--dur-screen` | 240 ms enter / 160 ms exit | Screen change |
| `--dur-rise` | 360 ms, stagger 50 ms, at most 6 items | Home tiles, choice cards, Received thumbnails on first show |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Arriving |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | Leaving |

- **Screen changes follow the navigation direction** (app.tsx knows it):
  - push: the new screen enters from 24 px right + fade;
  - back: from 24 px left;
  - Home: fade only;
  - replace: crossfade.
- **Rules for motion:**
  - It never blocks a tap.
  - It never delays focus moving to the title.
  - It never moves layout (no width/height animation).
- **Success:** the Result "Sent ✓" check mark draws in once (stroke animation, 400 ms).
- **Progress:** bars fill smoothly (width via `transform: scaleX`).

### Components (restyled, the same API)
- **Tile:**
  - a white card with `--elev-1` and a 44 px coloured icon badge;
  - title and helper text on the right, or below in the 2×2 grid;
  - press feedback.
- **Home:**
  - "What should we print?" title;
  - the Continue card with the job's first photo;
  - four tiles in a 2×2 grid: Photos, Passport photos, **Aadhaar & ID cards**, Documents & PDF. The grid becomes one column when a tile would be narrower than 9 rem;
  - the WhatsApp hint card, then the owner section.
- **ChoiceCard:**
  - white card with a mini picture;
  - when selected: indigo outline, `--primary-soft` background, ✓ and "Selected".
- **Buttons:**
  - primary indigo (white text);
  - secondary white with indigo outline;
  - danger as today;
  - all with press feedback;
  - the busy state shows a small spinner and the busy words.
- **TopBar:** indigo Back/Home text with icons, the title below; pinned bars get `--elev-2`.
- **Paper preview:** the white sheet on a light-grey stage (`#E5E7EB`, rounded) instead of the dark desk. White text on the stage is replaced by `--text` (`tokens.test` pairs updated).
- **Panels** (info/warn/error): rounded cards with an icon, the same roles (alert/status).

### Acceptance (Part 1)
- **Every screen in the e2e matrix still passes:**
  - layout;
  - targets;
  - axe AAA;
  - screen reader and keyboard (two sizes);
  - tap counts.
- **`tokens.test`** covers every new pair.
- **A reduced-motion e2e test:** with `prefers-reduced-motion: reduce`, no element has a running animation or transition on any screen.
- **A motion e2e test:**
  - a push adds the "enter-forward" class and a back adds "enter-back";
  - no animation lasts longer than 400 ms.
- **On a device (API 35/36):** screenshots of Home, Received, Ready, Result and Settings; the owner reviews the look.
- **Performance:** cold start → Home and tap → feedback stay within PLAN §P (≤ 100 ms feedback; no long task > 50 ms from motion).

---

## Part 2 — Aadhaar & ID card copy

### Inputs (all supported)
1. **Two photos** (front and back), each a card on any background, at any angle, with perspective.
2. **One photo** with both sides in it.
3. **A scan or screenshot** of one or both sides.
4. **The e-Aadhaar PDF** (often locked: the existing unlock comes first).
5. **Other ID-1 cards** (85.6 × 54 mm): PAN, voter ID, driving licence. Treated the same.

### Entry points
- **Home tile "Aadhaar & ID cards":** the phone's picker (photos and PDFs, up to 2 photos or 1 PDF), then straight to screen 1.
- **Received:** a new choice, **"ID card copy"**, for 1–2 photos or one PDF. It is shown first when the detector finds card-shaped areas (it runs with the existing analysis during "Preparing").

### Flow (the approved mockup)

**Screen 1, "2 ID cards found":**
- Each detected card is shown straightened, labelled Front/Back, with "✓ Straightened".
- Front = the card with a face (Android's built-in `android.media.FaceDetector`, offline). If both or neither have a face, received order decides.
- Buttons: **Swap front/back**, **Fix corners** (per card), primary **Card copy**.
- One card found: "1 ID card found" with "Add the other side" (picker) and **Card copy** (it prints one side).
- No card found: "Couldn't find the card's edges" and the Fix corners screen opens with a default frame.

**Fix corners** (only when needed):
- 4 corner dots, 56 px touch area. Drag, or select a corner ("Next corner (k of 4)") and move it with ◀ ▲ ▼ ▶ (1 % per tap). Done.
- The straightened result updates live (a preview-size warp).

**"How big?"** One question, four picture choices. Tapping one continues to Ready. The last one used is remembered (settings) and shown first.

| Choice | Layout on A4 portrait (printer edge space respected) |
|---|---|
| **Real card size** | Front and back, each exactly 85.6 × 54.0 mm, centred horizontally, stacked with a 10 mm gap, starting 20 mm from the top; dashed cut lines around each |
| **Big size** | Both scaled up equally to the largest width that fits (at most 2× = 171.2 × 108 mm), stacked with a 10 mm gap; no cut lines |
| **Many copies** | Real-size sets (front left, back right) in rows, 5 mm between cards, as many rows as fit (computed from the paper's measured edges, like passport slots; 5 on A4 with 6 mm edges); a count stepper 1…max; cut lines |
| **Whole e-Aadhaar page** | Only for a PDF: the existing document path (the full letter) |

**Ready:** the real print-file preview, and the summary "ID card · real size · A4 · Colour · 1 copy". Change offers Colour, Copies and Size. Colour defaults to Colour.

**Taps** (counted as PLAN §A2): share → **Card copy** (1) → **size** (2) → **PRINT** (3). +1 for each Fix corners. From Home: tile (1) + picker (1) + 3 = 5. The e2e tap table adds both.

### Engine work (isolated process, Kotlin, no library)

**Card detection:**
1. Decode to ≤ 1024 px on the long side, grey. Gaussian blur σ≈1.5.
2. Gradient magnitude (Sobel), then non-maximum suppression and two-level hysteresis (Canny-style).
3. Straight-line segments (probabilistic Hough on the edge map).
4. Candidate quadrilaterals from pairs of near-parallel line pairs. A candidate must:
   - be convex;
   - have an area ≥ 6 % of the image;
   - have a straightened aspect ratio within 1.586 ± 18 %;
   - have strong edges along ≥ 70 % of its perimeter.
5. Score = edge support × aspect fit × area.
6. Keep the best non-overlapping 1–2 candidates. Corners are returned in fractions of the upright image, with a confidence 0–1.
7. Auto-accept at ≥ 0.75; otherwise Fix corners opens.

**Straightening:**
- A homography from the 4 corners onto the card rectangle, sampled from the **full-resolution** original with bicubic interpolation.
- Only the corners' bounding box is region-decoded, under the same memory budgets as today.
- Output pixels = the placement size at 300 dpi:
  - 1011 × 638 px for real size;
  - up to 2022 × 1276 px for big size.
- If the source has fewer pixels than that, the existing "may print blurry" note appears (at most 200 dpi for cards, like passport photos).

**The e-Aadhaar PDF:**
- The page is rendered at 300 dpi.
- The detector looks for the two bordered card panels in the bottom half. Here the panels are axis-aligned with sharp borders, so confidence is high.
- If fewer than 2 are found, it falls back to Fix corners on the rendered page.

**Card orientation:**
- The output is landscape.
- If the face sits on the right half of the front of an Aadhaar (it belongs on the left), the card is turned 180°.
- Otherwise no change. **Turn** stays available on screen 1 (per card).

### Plan contract
- **`job.layout = 'idCard'`, with `job.idCard`:**
  - `size: 'real' | 'big' | 'sets'`;
  - `sets?: number`;
  - `front: itemIndex`;
  - `cards: [{ itemIndex, pdfPage?, quad: [x,y]×4, turns }]`.
- **PrintPlan v1, optional extension:**
  - a placement may carry `quad` (4 corners, fractions of the upright source) instead of `crop`;
  - RenderPlan rejects a plan that has both;
  - the contract fixture `plan-v1-idcard.json` is shared by vitest and JVM.
- **`contentType: 'document'`:** exact size, never borderless.

### Acceptance (Part 2)
- **JVM, on a generated corpus** (≥ 300 images): synthetic cards with known corners, rendered with perspective (up to 35° tilt), rotation (any angle), noise, wood/cloth/paper/dark backgrounds, shadows, JPEG artefacts.
  - On images labelled "clear background": the corner error is ≤ 1.5 % of the image diagonal in ≥ 95 % of cases.
  - No false card on 100 card-free photos (people, documents, screenshots) at the auto-accept threshold.
- **Real photos:** the same metrics on the owner's own Aadhaar/PAN photos. Kept outside the repo; only the numbers are recorded; PENDING until provided.
- **Exact size:**
  - the real-size card measures 85.6 × 54.0 mm ± 0.5 mm in the print file (pdf.js check);
  - on paper with a ruler: owner checklist.
- **e-Aadhaar:** the bundled synthetic e-Aadhaar-like PDF (generated: a letter page with two bordered panels) gives 2 cards, with front = the face panel.
- **Device:** a share of two synthetic card photos → Card copy → Real size → PRINT → print file checked. Run on API 24 (engine) and API 35/36 (UI).
- **Tests:**
  - e2e: the flow, Swap, Fix corners, the four sizes, tap counts, matrix screens;
  - fuzz: hostile images through the detector (no crash, a contained failure → Fix corners).

---

## Part 3 — Auto-rotation (a suggestion that is applied, with Undo)

### Signals, in order (computed in the engine on the ≤ 512 px analysis image)
1. **EXIF orientation:** already applied; unchanged.
2. **Faces (photos):** `FaceDetector` on the four turns.
   - It auto-turns only when exactly one turn yields a face with confidence ≥ 0.4, and the other turns yield none.
3. **Text direction (documents, screenshots, cards):**
   1. Binarise (Bradley, like OCV Black).
   2. Horizontal vs vertical projection-profile energy: if one axis is ≥ 1.8× the other, the text lines run along it.
   3. Which end the lines start at: the aligned line-start margin (left-aligned text has a straight start edge and a ragged end). This decides 90° vs 270° and 0° vs 180°.
   4. It auto-turns only when both ratios pass their thresholds. Otherwise it abstains.

### Behaviour
- **When applied:**
  - the turn goes into the job's existing `turns` (so print, preview and Undo all already work);
  - Received/Ready show an info note: "Turned 3 photos upright · Undo";
  - Undo restores the received turns.
- **Never:** for a passport photo after the shopkeeper has framed it, or for a photo the shopkeeper already turned by hand.

### Acceptance (Part 3)
- **On a labelled generated set** (documents in 4 orientations, photos with faces in 4 orientations, ≥ 400 images), for the turns it applies:
  - precision ≥ 98 %;
  - it abstains rather than guessing;
  - the abstain rate is reported.
- **No turn applied** to images whose EXIF already made them upright, or to images without enough signal (blank, abstract).
- **e2e:** the note and Undo; the turns flow to the print file.
- **On real photos:** owner checklist, PENDING.

---

## Out of scope
- Dark theme.
- Tablet-specific layouts.
- Reading the text or number on a card (no OCR).
- Background removal or beautifying.
- Different people's cards on one sheet.
- Laminating marks.
- Languages other than English (PLAN §H5 still decides).

## Risks
- **Card on a same-coloured background:** low edge contrast means low confidence, so Fix corners opens. The cost is one extra tap.
- **Generated corpora under- or over-state real-world accuracy.** Real numbers are recorded only when the owner provides photos, and the phase status says so.
- **FaceDetector quality varies by phone.** Rotation by faces is skipped when nothing is detected; it is never forced.
- **Motion on very old phones (Android 7, 2 GB).** Transform/opacity only; checked by the existing performance budgets.
