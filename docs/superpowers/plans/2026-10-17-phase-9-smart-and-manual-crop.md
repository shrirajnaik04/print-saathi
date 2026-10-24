# Phase 9 — Smart auto-crop + manual crop (Milestone D): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, as Phases 2–8). Steps use checkbox (`- [ ]`) syntax.

**Goal:**
- Uniform black or blank borders (screenshots, letterbox bars, scan margins) are found automatically, and the shopkeeper answers one question per job.
- Any photo can be cropped by hand with big buttons.
- The customer's file never changes.

**Architecture:**
- **Analysis bytes (engine):** the isolated engine makes ≤ 512 px raw 8-bit grey "analysis bytes" per photo: a tiny header plus bytes, in `thumbs/`, hash-named.
- **Detector (TS, Web Worker):** a pure function over those bytes that suggests a crop with a confidence. It reads the file by path like an image, so no bytes cross the bridge.
- **Job:** keeps per-photo crops (normalised, in the photo as shown, PLAN §F1) and the job's black-edges answer.
- **Plan:** layouts use the cropped shapes; placements carry the crops; the engine's crop decode (Phase 6) prints them.

**Tech stack:** TypeScript (detector, worker, job, screens), Kotlin (analysis bytes). No new dependency.

**Spec:** `docs/PLAN.md`:
- §F1 (crops normalised in the turned upright photo);
- §F3 (analysis bytes ≤ 512 px raw grey);
- §F5 (rules, metrics, V1 scope);
- §H2.5 (crop without precision: handles plus Move ↑ ↓ ← →, Bigger, Smaller, Reset);
- §I-3 (Black edges? screen), §I-8 (Photo tools → Crop), §I-9 (Crop screen);
- §J1, §J6 (flows), §U "Smart crop" and "Manual crop", §T Phase 9 exit.

## Global constraints
- **Detector rules (PLAN §F5):**
  - Scan inward from each edge. A line is border if it is uniform (std dev < 8), within ± 12 of the edge's reference colour, and either dark (< 45) or blank-white (> 225). Stop after 2 non-border lines.
  - Suggest only when confidence ≥ 0.9: removes ≥ 4 %, keeps ≥ 30 %, sharp boundary step, kept area not uniform.
  - White edges only for documents and screenshots, never photos.
  - Snap inward ≤ 0.5 %.
- **Never applied without consent.** One question per job. Per-photo review in Photo tools → Crop.
- **Metrics:** precision ≥ 98 % on suggestions; recall ≥ 90 % on a "clearly croppable" set (uniform bars ≥ 4 % of the area); ≤ 2 % suggestions on negatives.
- **Corpus:** synthetic only, generated (no customer files in the repo). A real-photo corpus is PENDING REAL-WORLD VALIDATION (the owner's consented samples).
- **Manual crop:** handles 48 dp to see / 64 dp to touch; Move ↑ ↓ ← →, Bigger, Smaller, Reset; Apply. The source hash never changes.
- **Passport keeps its own frame (Phase 6).** Documents: crops on photo pages only (PDF pages are not cropped in V1).

## Review focus
1. **Dark photos and night scenes must not be cropped.** False suggestions ≤ 2 %, including a black sky at the top edge.
2. **A crop survives every turn** (stored in the shown space, re-mapped like the passport frame) and every layout. The print matches the preview.
3. **One question per job:**
   - a re-share or a re-render never asks again;
   - "Keep as they are" is remembered;
   - a photo added later is not cropped silently.
4. **Analysis bytes for 100 MP / truncated / poisoned photos:** contained, no stuck "Preparing".
5. **Manual crop at 320 px and 200 % text:** every control reachable; Reset restores the stored crop or the full photo.

---

### Task 1: Analysis bytes (engine)
- **AIDL `analysisGrey(src, dst, maxLongSidePx)`:** the decode path at ≤ 512 px writes `{w, h}` and Rec.601 grey rows.
- **Plugin `analysisBytes({jobId})`:** one per photo, hash-named in `thumbs/`, with poison markers and the engine turn.
- **Tests:** JVM header; device test (EXIF-turned photo upright, 100 MP within budget).

### Task 2: Detector + worker (TS)
- **Detector:** `core/crop/detect.ts` `detectBorders(grey, w, h, kind: 'photo' | 'document' | 'screenshot'): { crop, confidence } | null` as specified.
- **Worker:** `workers/crop.worker.ts`.
- **Corpus:** generated `tests/generate/crop-corpus.mjs`, ≥ 150 labelled images:
  - letterbox bars, screenshot bars, scan margins at several widths;
  - noise and JPEG-like blur;
  - negatives (dark photos, night scenes, black backgrounds, vignettes).
- **Metric test:** fails if precision < 98 %, recall < 90 % or false suggestions > 2 %.
- **Property tests:** never removes more than 70 %, deterministic, turned input gives a turned answer.

### Task 3: Job, plan, Black edges? screen
- **Job:**
  - `job.crops: Record<item, Crop>` (shown space, stamped with turns like the passport frame);
  - `job.edges: 'ask' | 'removed' | 'kept'`;
  - `job.suggested: Record<item, Crop>`.
- **Actions:** `setCrop`, `resetCrop`, `answerEdges`.
- **Plan:** layouts use the cropped shapes; placements carry the crops; untouched documents are unaffected.
- **Screen:** Black edges? (only when suggestions exist, after the layout choice):
  - "N photos have black edges" with one before/after example;
  - Remove black edges / Keep as they are.

### Task 4: Manual crop
- **Photo tools → Crop:**
  - handles + Move / Bigger / Smaller / Reset;
  - the Original | Cropped review for a suggested crop;
  - Apply.
- **Crop and preview:** reuse the passport frame code (`fitFrame`-like clamping) with a free shape. Phase 6's engine crop decode prints it.
- **Tests:** e2e and the matrix.

### Task 5: Closure
- **Device:** a share with black bars → question → print file boxes match the cropped shapes (pdf.js); source SHA unchanged.
- **Regression:** 5-level.
- **Reviews:** gate + re-reviews.
- **Closure documents:** `docs/qa/phase-9.md`; traceability §17–19; USER-CHECKLIST §M (real screenshots / scans / dark photos).
