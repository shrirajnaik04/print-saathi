# Phase 8 — closure report (print styles, emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-8-print-styles.md` (Tasks 1–6). Rules as built: `docs/print-styles.md`.

**Commits:**
- `767f7df` style maths;
- `4c04c29` engine + writer;
- `252ec07` job/plan;
- `436d4ba` examples;
- `8643ac3` screen;
- `44e0245` docs;
- gate fixes `1a3d23f`;
- re-review fixes `745881d`.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** The printed styles still need the owner's review on the shop printer (USER-CHECKLIST §L).

## What Phase 8 delivers
- **The other five styles of PLAN §F4,** as pure functions inside the isolated engine:
  - Vibrant;
  - Soft Tone;
  - Sharp Black (percentile levels held at ≤ 90 / ≥ 160, gamma 0.85);
  - OCV Black (paper flattening + Bradley–Roth, 1-bit);
  - the existing Black & White.
- **One output stage for everything:** the print file, the real-file previews and the examples.
- **Print file:**
  - colour styles → JPEG q92;
  - Black & White / Sharp Black → exact grey (lossless for PDF pages);
  - OCV Black → 1-bit DeviceGray Flate.
  - Print resolution is never lowered.
- **Job:**
  - The style is for the whole job, coupled to Colour / Black & white. Choosing Colour or Black & white returns to the plain style, never "Vibrant in grey".
  - Passport photos are never styled.
  - The untouched PDF path is used only with Original. This is enforced in TS and natively.
- **Change → Print style:**
  - Six big cards in two groups, each with an example of the job's own first photo or page: same crop and turn as the print, ≤ 360 px.
  - OCV Black's example is made at 3× and averaged down.
  - A plain helper line, and ✓ + border + "Selected" on the current card.
  - The summary names a non-plain style ("… · Black & white · Sharp Black · 1 copy").

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Requirement → plan | PLAN §F4, §G2, §G4, §I-6/7, §J7, §U; phase plan with Review focus 1–5 |
| Automated verification | <ul><li>**vitest 216:** styles 6, summary</li><li>**JVM:** StylesTest 11 (golden values from an independent Python reference for Vibrant/Soft/Sharp and OCV bit for bit, mutation-checked; edge cases), MiniPdfWriter 1-bit, PlanRenderer +3, RenderPlanContract +3, OneBit 2, Crop +1</li><li>**Playwright 694:** 6 style journeys + matrix/axe for the new screen</li></ul> |
| Real-device test | **Emulators:** <ul><li>StylesDeviceTest 6: colourfulness, grey only, 1-bit sizes, sample ≈ print, whole A4 OCV pages, including on API 24 / 2 GB.</li><li>API 35 through the app: real examples on the Print style screen, an OCV Black print file read back as DeviceGray 1-bit (`phase-8/2026-10-17/`).</li></ul> |
| Adversarial challenge | <ul><li>**Gate:** I1 (OCV memory on Android 7), I2 (no OCV golden), M1–M6 → fixed.</li><li>**Re-review:** one Important regression, which also exposed a crop bug latent since Phase 6, + 3 minors → fixed.</li></ul> |
| Final regression | **`1a3d23f`, sequential:** <ul><li>Instrumentation: API 24/28/30 52 passed, 0 failed, 4 skipped; API 35/36 56/0/0.</li><li>share 15/15, render PASS, privacy 0.</li><li>Whole A4 OCV pages: 2.0–7.7 s per page on every level, no out of memory.</li><li>Crash buffers: only the contained Android 7 libpdfium hostile fixture and the API 36 deliberate/HEIC entries, as in Phase 7.</li></ul> **Then `745881d`** (crop mapping + example minors): JVM, vitest, e2e 694 and the full API 35 instrumentation 56/0/0 |

## Findings and status

| # | Finding | Status |
|---|---|---|
| I1 | OCV Black at A4 300 dpi on a 2 GB Android 7 phone: memory unproven; out of memory would say "damaged" | **Fixed + verified:** page bitmap recycled after its grey copy; device test on API 24 / 2 GB |
| I2 | No OCV golden; docs claimed more than tests | **Fixed + verified:** Python reference, bit-for-bit golden, 0.85 mutation caught, edge cases |
| M1 | Native side did not refuse a style on the untouched path / passport sheets | **Fixed + verified** (contract test failed first) |
| M2 | Examples ignored crop and turns; OCV example made at 360 px looked unlike the print | **Fixed + verified** (OneBit downscale test, e2e turned examples) |
| M3–M6 | Example file writes, stale example work, area check, wrong request called "damaged" | **Fixed** (code + device suite; M6 via BadRequest → not the file's fault) |
| R-I1 | The area check refused a passport frame against an edge of a turned photo (latent since Phase 6, where it said "damaged") | **Fixed + verified:** `Crop.uprightOf` keeps crops inside (CropTest failed first); device suite 56/0/0 |
| R-m1–m3 | Old OCV examples reused; thin pages; loading text | **Fixed** |

## Coverage statement
**Proven (emulators, synthetic images):**
- Exact style maths against an independent reference.
- Grey-only output for every B&W style on every path.
- 1-bit OCV images.
- Examples equal the print-size images scaled down.
- Whole A4 OCV pages within memory on a 2 GB Android 7 phone.
- Style ↔ colour coupling; passport and untouched path unstyled.

**Not proven, and why:**
- **How the styles look on paper from the shop printer** (owner's review, USER-CHECKLIST §L).
- **Whether "OCV Black" is the right name for the shopkeeper** (renameable; PLAN §V4).
- **Real customer photos and scans** (synthetic tests only).
