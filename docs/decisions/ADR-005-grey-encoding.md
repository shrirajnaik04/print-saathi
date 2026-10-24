# ADR-005: How black & white photo pages are encoded

**Status:** Accepted (implementation detail of PLAN §G2; no owner decision needed). **Date:** 2026-10-03.

## Context
PLAN §G2 requires black & white pages to carry grey data only: every decoded pixel R = G = B. The plan proposed a
neutral-chroma JPEG made with Android's `YuvImage` (NV21 with Cb = Cr = 128).

## What was found
On the API 35 emulator, `YuvImage.compressToJpeg` produced chroma 129–131 in the last partial 16-pixel block when the
picture width is not a multiple of 16 (952 tinted pixels in a 1201 × 801 test). Padding the NV21 buffer to whole
blocks did not help. Pillow on the PC confirmed the tint is in the file itself (`EngineGreyTest`, evidence in the
Phase 4 ledger).

## Decision
Make every pixel exact Rec.601 grey (R = G = B = round(0.299 R + 0.587 G + 0.114 B)) and use the normal
`Bitmap.compress` JPEG encoder. libjpeg's fixed-point RGB → YCbCr chroma weights sum to exactly zero
(−11059 − 21709 + 32768 = 0; 32768 − 27439 − 5329 = 0), so grey input gives chroma exactly 128 and decoders return
R = G = B. The same encoder handles odd sizes and edge blocks correctly.

## Proof
- JVM `GreyTest` (luma, rows to grey, the weight sums).
- Device: `EngineGreyTest` (0 non-grey pixels, tones within 3) and `PlanRenderDeviceTest` (every pixel of every
  image in a B&W print file).
- Pillow on a saved file (`scripts/quality/check-grey-pdf.py`).

## Consequences
- The JPEG keeps three components with flat chroma. It is about 5–10 % bigger than a true one-component grey JPEG;
  Android cannot write that.
- If a future Android encoder changed its colour maths, the device tests on every regression level would catch it.
