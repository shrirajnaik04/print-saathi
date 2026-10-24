# Engine hardening after Gate 2: spike (e)/(f) evidence, re-run

**Devices:** API 35 tablet emulator (`Medium_Tablet`) and API 24 with 2 GB RAM (`ps_api24_2gb`).

**Raw output:**
- **Correction (Gate 3 #6):** the `instrumentation-all-*.txt` files were overwritten by later runs, and runner "OK (n tests)" lines count skipped tests as passed. The authoritative counts are the final regression, `docs/evidence/phase-0/2026-10-03/final-regression/` (26 passed on API 35 and 36; 23 passed + 3 honest skips on API 24, 28 and 30; 0 failed anywhere), summarised by `scripts/device/instrumentation-summary.mjs`.
  - 5 `EngineSpikeTest`, 6 `EngineHostileInputTest`, 3 `EngineOrientationTest`, 1 `EngineFixtureMatrixTest`, 1 `PdfWriterComparisonTest`.
- `fixture-matrix-*.txt`: per-fixture time and memory.
- `fixture-quality.jsonl`: quality against the reference.

## 1. Hostile input (Gate 2 #1)

**Before the fix**, reproduced on both devices: garbage bytes, an empty file, a PDF and a JPEG header followed by garbage each returned an **empty "success"**. The binder dropped the uncaught exception and the proxy read an empty reply.

**Fix:**
- The engine returns `[-code]` (`EngineErrors`: 1 unreadable, 2 out of memory, 3 not allowed) from inside `catch (Throwable)`.
- After an out-of-memory error the engine kills itself once the reply is sent.
- One heavy call runs at a time.
- Lossless RAW output is debug-only.
- The client maps `[-code]` to `EngineFileException` and treats any non-6-length reply as unreadable. Any other binder `RuntimeException` drops the connection instead of crashing.

(`ServiceSpecificException` was the first choice, but it is a hidden API and absent from the public `android.jar`.)

**After:** all four hostile files return `EngineFileException`; the engine decodes a good file right afterwards. 6/6 on both APIs.

**Recorded, not fixed (planned PLAN §F2 rule, Phase 2):** a JPEG truncated at 50 % still "succeeds" on the strip path, with a partly grey image.

## 2. EXIF orientations (Gate 2 #5, #9)

The old test used one orientation with no scaling. `EngineOrientationTest` now runs **all 8 orientations with 4× downscaling on both paths**:
- the region-strip path;
- the whole-image path (ImageDecoder on API 35, BitmapFactory on API 24).

**Before:** orientation 2 was mirrored on the strip path (both APIs).

**Fix:** use `ExifInterface.isFlipped`. AndroidX's convention is *flip first, then rotate* (TRANSPOSE = 270 + flip). The first attempt (rotate, then flip) failed on orientation 5, which the test caught.

**After:** 8/8 orientations on all three decoders.

## 3. Transparency (Gate 2 #8)

The area average now composites non-premultiplied ARGB onto white (JVM test). One defect remained, caught on the device: a **same-size** transparent PNG skipped the resize, so it never reached the composite. It came out black on ImageDecoder (API 35) and BitmapFactory (API 24).

**Fix:** images with alpha always pass through the averaging step. Device test passes on both paths.

## 4. Odd sizes and sampling (Gate 2 #10, #5)

1. **PNG at an odd width with sample size 2 fell back** to the whole-image path (strip width check). The reviewer's claim reproduced on both APIs once the test forced sample size 2. The decoded size is now measured from a probe of the last strip.
2. **Non-JPEG sampling just skips pixels.** It aliases fine detail; the reviewer's point that "the quality claim holds for JPEG only" is correct. The strip path now reads non-JPEG formats at full resolution (sample size 1). Memory stays bounded by the 16 MB strip cap.
3. **New defect found by the new fixtures:** a baseline JPEG at odd size (11999 × 8999) decoded to 2048 px scored only **35.28 dB, with 17 dB rows**.
   - Diagnosis: a progressive file at even size scored 50.81 (fine), while the baseline file at odd size reproduced the drop. The vertical offset at each checkerboard edge grows exactly as y / 8999.
   - Root cause: Android's region decoder rounds a sampled **sub-region down** (807 rows → 403). The decoded rows therefore cover 8998 of the 8999 source rows, and the average stretched them over the full height.
   - Fix: the area average takes the true fractional extent (8999 / 2 = 4499.5). A decoded count that rounds down repeats the edge for the missing fraction; one that rounds up weights its last pixel by overlap. JVM tests cover all three cases.
   - **After: 51.86 dB.**

## 5. Quality against an exact reference (Gate 2 #5)

**Reference method:** Pillow decodes the file to full-resolution RGBA, then `areaDownscale` from `metrics.mjs` (unit-tested) makes an exact area average.

**Two rejected or checked alternatives:**
- **Pillow's own BOX resize was rejected.** It samples its weights instead of integrating partial pixel coverage, and was measured 36.8 dB away from the exact average on hard edges.
- **Decoder noise floor:** two exact references built from different decoders (Pillow vs jpeg-js) agree at 52.5 dB.

| Fixture | Device | 2048 px PSNR / SSIM | 3508 px (A4 at 300 dpi) PSNR / SSIM |
|---|---|---|---|
| 108 MP, 4:4:4 baseline | API 35 = API 24 | 54.28 / 0.9977 | 88.66 / 1.0000 |
| 108 MP, 4:2:0 baseline | API 35 = API 24 | 50.81 / 0.9977 | 86.44 / 1.0000 |
| 108 MP, progressive 4:2:0, odd 11999 × 8999 | API 35 = API 24 | 51.86 / 0.9977 | bit-identical |
| 48 MP PNG, odd 7999 × 5999 | API 35 = API 24 | bit-identical | bit-identical |

- **Worst single rows** (35–56 dB) sit on content edges, not strip seams: row 512 is the source y = 3000 band edge, and row 1502 is the magenta border.
- **Both APIs gave identical output** for every fixture.

## 6. Time and engine memory (Gate 2 #5: print size measured)

Times are from emulators on this PC (x86), not phone timings. "Peak" is the kernel high-water mark (VmHWM), which includes shared zygote and mapped pages; PSS after the decode is the better estimate of the decode's own cost.

| Fixture → 3508 px | API 35: time / peak / PSS | API 24 2 GB: time / peak / PSS |
|---|---|---|
| 108 MP baseline | 5.7–7.1 s / 175 MB / 64 MB | 4.5 s / 119 MB / 74 MB |
| 108 MP 4:2:0 | 5.4–7.1 s / 169 MB / 65 MB | 3.6 s / 112 MB / 67 MB |
| 48 MP PNG | 5.0–5.7 s / 176 MB / 64 MB | 4.6 s / 120 MB / 76 MB |
| **108 MP progressive** | **19–23 s / 484 MB** | **14.4 s / 427 MB** |

**Measured limitation: very large progressive JPEGs.**
- libjpeg keeps the whole progressive coefficient buffer (about 324 MB at 108 MP, 4:2:0), and the region decoder re-scans it for each strip.
- The engine survived on the 2 GB emulator and the app is protected by isolation, so **the architecture stands**.
- But it misses the low-end time budget (≤ 15 s mid to just at the limit; 23 s on API 35), and the memory is unsafe on a real 2 GB phone.
- Phone cameras and WhatsApp write baseline JPEGs; large progressive files come from the web.
- **Required in Phase 2 (PLAN §F2 budgets):** read the progressive flag and pixel count before decoding, and refuse with a friendly message above the phone's budget instead of attempting it. Added to the Phase 1/2 requirement list.

## Not proven here

- **Real phones:** speed and memory are emulator figures.
- **HEIC inside the isolated process:** Gate 2 #4, next.
- **Truncated-file detection:** Phase 2.
- **WebP and HEIF region decoding:** API-dependent, not yet in the fixture matrix.
