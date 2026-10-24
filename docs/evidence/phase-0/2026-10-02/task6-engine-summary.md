# Spikes (e) + (f) — isolated engine, crash containment, 108 MP decode (2026-10-02)

Fixture: `tests/generate/make-108mp.mjs` → 12000×9000 baseline sRGB JPEG, EXIF orientation 1, 18 083 168 bytes
(gradients, saturated strips, photo-like noise band, 64 px checkerboard, 200 px magenta border). Target: 2048 px long side.
Reference: exact area-average downscale of the jpeg-js-decoded source at the SAME 2048×1536 size (`scripts/quality/compare-108mp.mjs`).

## Decode strategy, measured (API 35 emulator; lossless raw output vs reference)
| Strategy | Overall PSNR / SSIM | Noise band SSIM | Engine peak RSS | Decode time |
|---|---|---|---|---|
| ImageDecoder.setTargetSize (platform default) | 27.96 dB / 0.883 (JPEG out) | 0.34 | 153 MB | 0.45 s |
| ImageDecoder 1/4 DCT + exact area average | 42.90 / 0.9785 | 0.91 | 163 MB | 1.1–1.3 s |
| ImageDecoder 1/2 DCT + exact area average | 50.57 / 0.9973 | 0.987 | **242 MB** | 1.6–1.8 s |
| **Region strips at ≥2× (512 rows, ≤16 MB) + exact area average (CHOSEN)** | **50.57 / 0.9973** | **0.987** | **148 MB** | **2.0 s** |
| Same, 64-row strips | identical | identical | 139 MB | 5.1 s |

Chosen path output as JPEG q92: 43.64 dB / 0.9911 vs encoding floor of the perfect reference at q92: 44.05 / 0.9929 → no loss beyond the unavoidable encode.
Border marker (34 px at this scale) intact; gradients 51.2 dB, strips 52.0 dB, checkerboard 67.7 dB / SSIM 1.0.

## Device results
| | API 35 (Medium_Tablet, 3.8 GB) | API 24 (ps_api24_2gb, 2 GB, Java-heap bitmaps) |
|---|---|---|
| Tests | 5/5 pass (incl. EXIF) | 5/5 pass (incl. EXIF) |
| Decode path | RegionStrips | RegionStrips |
| 108 MP → 2048×1536 | 2.05 s | 1.6 s |
| Engine peak RSS (VmHWM) | 148 MB (full-res would be ~432 MB) | 98 MB |
| App PSS change during decode | −1.2 MB (none) | −0.8 MB (none) |
| First bind / rebind after crash | 150 ms / 194 ms | 20 ms / 20 ms |
| Engine reads app-private file by path | refused | refused |
| EXIF orientation 6 | rotated once, upright 200×400 | same |
| Lossless quality | 50.57 dB / 0.9973 | 50.57 dB / 0.9973 (bit-identical metrics) |
| After unbind | engine process gone | engine process gone |

## Findings
- **Fixed + verified:** platform target-size scaling aliased fine texture (noise band SSIM 0.34, overall 27.96 dB) — silent print-quality loss. Replaced by tiled region decode at ≥2× + exact area averaging (JVM-tested `areaDownscaleRows`); quality now at the encode floor with the LOWEST memory of all variants.
- **Fixed + verified:** 64-row strips re-scan the JPEG per strip (5.1 s); adaptive 512-row strips capped at 16 MB (`stripRowsFor`, JVM-tested) → 2.0 s.
- **Fixed + verified:** AIDL cannot use a package starting with `in` (AIDL keyword) → interface lives in `app.printsaathi.engine`.

## Not proven here (explicit)
- Real ARM phones (timings are x86 emulators on a fast PC; the shopkeeper's phone measured in USER-CHECKLIST §C).
- Formats the region decoder cannot read (HEIF/WebP before Android 12, GIF) use the whole-image fallback, whose quality is the lower 1/4-DCT row above — Phase 2 must apply ≥2× oversampling there within the memory budget.
- UI responsiveness during a decode is guaranteed by construction (engine is a separate process; EngineClient refuses the main thread) but was not measured from the WebView — Phase 2 measures it end-to-end.
- PNG/transparent, CMYK, truncated files, decompression bombs → Phase 2 decoder-rules suite.
