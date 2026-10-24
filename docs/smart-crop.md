# Smart auto-crop: rules as built (PLAN §F5, Phase 9)

**Code:**
- `src/core/crop/detect.ts` (pure, tested);
- `src/workers/crop.worker.ts` (runs it off the screen's thread);
- the engine's analysis bytes: `AnalysisGrey.kt`, the photo upright at ≤ 512 px as Rec.601 grey.

## Rules
1. **Scan inward from each edge.** A line (row or column) is border when all three hold:
   - uniform: standard deviation < 8;
   - within ± 12 of its edge's reference colour (the outermost line);
   - dark (< 45), or, for documents and screenshots only, blank white (> 225).

   The scan stops after 2 non-border lines in a row, and never goes deeper than 70 % of the side.
2. **Snap inward:** the crop goes past the border's last line by ⌊0.5 % of the side⌋ px, at least 1, to clear a soft resized edge.
3. **Suggest only when all hold:**
   - it removes ≥ 4 % of the area and keeps ≥ 30 %;
   - the kept area is not uniform (std dev ≥ 8, sampled every 4 px);
   - confidence ≥ 0.9, where confidence = 1 − (share of the kept pixels in the 2 lines just past each border that are within ± 20 of that border's colour) ÷ 4. That is, at most 40 % may still look like the border.
4. **Never applied without the shopkeeper's yes:** one question per job; per-photo review in Photo tools → Crop.

## Why the 40 % step rule
It is what tells a straight bar from a scene that is dark at its edge.

**Measured on the synthetic corpus:**
- The clear bars that the first draft (10 %) missed had at most 38 % of near-border pixels just past the border (dark film content next to a black bar).
- Every negative that reached this check had at least 61 %: a black sky fading into a lit city, an object on a black studio background.

## Corpus and metrics (synthetic; `src/core/crop/corpus.ts`, seeded)
**Contents:**
- **100 positives:** letterbox, pillarbox, status bar only, all four sides; dark and white bars; 6–20 % bars; soft 1 px edges; 4 sizes, landscape and portrait.
- **60 negatives:** dark photos, night scenes, objects on black, vignettes, ordinary photos.

**Result:**
- 100 / 100 suggested, every one within 1 % of each side.
- 0 / 60 suggestions on negatives.
- PLAN targets: precision ≥ 98 %, recall ≥ 90 %, ≤ 2 % on negatives.

**Not proven:** real screenshots, scans and dark photos. That needs the owner's own consented samples (USER-CHECKLIST §M), and stays PENDING REAL-WORLD VALIDATION.

## What counts as a screenshot
A PNG file is treated as a screenshot, so white edges are allowed for it. WhatsApp often sends screenshots as JPEG; those get only dark-edge suggestions (fails safe). A PNG photo with a white frame may get a white-edge suggestion. The shopkeeper is asked first, and the words then say "black or white edges".

## Known limits (the shopkeeper is always asked first)
- **Time:** the phone makes analysis files for at most 6 s per choice (8 s in all with the worker), counted from the tap. A choice tapped while the photos are still being prepared, or a very big job, may go to Ready without the question. That fails safe: Photo tools → Crop is always there.
- **A dark area ending in a sharp straight line across the whole picture looks exactly like a letterbox bar,** for example a black ceiling above a lit stage. It will be suggested. "Keep as they are", Photo tools → Crop → Whole photo, or a document's page tools → Crop all undo it.
- **Bars over a very dark scene may be missed:** more than 40 % of the pixels next to the bar are near black.

## V1 scope
- **Covered:** uniform black or blank borders.
- **Not covered:** a document photographed on a table (uneven background). Manual crop handles it; detecting and straightening the paper is Phase 2 (PLAN §L3).
