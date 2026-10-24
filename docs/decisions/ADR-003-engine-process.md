# ADR-003 — Engine process: `isolatedProcess` for everything except HEIC (owner decision needed)

- **Status:** Option **C** in force (2026-10-17). A weakens isolation and B adds an LGPL licence and APK size: both are owner hard stops (`owner-decisions-2026-10-17.md`).
- **Spikes:** (e), (f), (d). Evidence: `docs/evidence/phase-0/2026-10-03/` (`engine-hardening-summary.md`, `instrumentation-all-api{24-2gb,28-2gb,30,35,36}.txt`).

## Proven (emulators, API 24, 28, 30, 35, 36; raw counts in `docs/evidence/phase-0/2026-10-03/final-regression/` (26 passed on API 35 and 36; 23 passed + 3 honest skips on API 24, 28 and 30; 0 failed anywhere))

**The isolated engine works on every tested level**, with no permissions, no file system access, and file descriptors only. Inside it:
- 108 MP JPEG decode to size;
- 4:2:0, progressive, odd-size and PNG fixtures;
- EXIF orientations 1–8;
- PdfRenderer open and render, including locked PDFs on API 35+;
- hostile files return error codes.

Further results:
- **Isolation:** the engine cannot read app files (`canReadPath` = false).
- **Containment:** a killed or crashed engine never takes the app down, and it rebinds in 18–450 ms.
- **First bind:** 20–394 ms (emulators).
- **Exception:** HEIC cannot be decoded in an isolated process:
  - **API 35:** a clean failure. SELinux denies `media.player` to isolated processes (`HeifDecoderImpl: failed to set data source`).
  - **API 36:** the HEIF decoder **aborts the engine** ("Hardware service manager is not running"). It is contained; the app survives.
  - **API 28 and 30:** the emulator images have no HEVC encoder to create a fixture, so this is untested there.

## HEIC options

iPhone photos sent "as document" stay HEIC. Sent "as photo", WhatsApp converts them to JPEG.

| Option | What | Security | Cost | Status |
|---|---|---|---|---|
| **A** | Decode HEIC (only files sniffed as HEIF) in a separate, **non-isolated** `:heif` process with the same engine code | Crash and memory containment are kept. It runs with the app's identity, so an exploited HEIF parser could read or alter local job files. There is no network in release builds, so nothing can be sent out. **Measured:** `canReadAppFiles = true` | ~0 KB; already built as a debug-only spike (`HeifEngineService`); decodes upright on API 35 and 36 | Spike passes |
| **B** | Bundle a HEIF decoder (libheif + libde265) inside the isolated engine | Full isolation kept | +2–4 MB APK; LGPL; native security updates become our duty; HEVC patent questions | Not built |
| **C** | Don't open HEIC: "This is an iPhone photo saved as a file. Ask the customer to send it as a photo (not as a document)." | Nothing new to attack | None | **Default until decided** |

**Recommendation: A.** It keeps a promised feature (PLAN §B, §D2) with crash containment and no network exposure, at no size cost.
- Risk is limited: a single-purpose process that only ever receives HEIF files.
- Fall back to C if the owner prefers strict isolation over iPhone documents.

## Also recorded

- **Very large progressive JPEGs** peak at 427–484 MB and take 14–23 s at 108 MP in the engine (emulators). Phase 2 must refuse them before decoding when they exceed the phone's budget (PLAN §F2).
- **Android 9's ImageDecoder crashes** (SIGFPE) with a sample size plus EXIF 5–8, so the engine uses ImageDecoder only on API 29+.
