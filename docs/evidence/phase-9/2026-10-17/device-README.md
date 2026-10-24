# Phase 9 device run — API 35 (Medium_Tablet emulator, port 5580) — 2026-10-17

Synthetic photo only: `tests/generate/make-bars-photo.mjs` (1600 × 1000 JPEG, black bars 120 px top and bottom). It was shared by the test sender's `pushed` mode as `image/jpeg`.

| Step | Result |
|---|---|
| Share → Received → One on each page | The engine made the analysis file; the worker found the bars; **Black edges?** "This photo has black edges.", with the photo now and without its edges (`api35-black-edges.png`) |
| Remove black edges | Ready: "1 photo · 1 page · A4 · Colour · 1 copy" |
| Print file (pdf.js) | 1 page, 595.28 × 841.89 pt; one image of 1600 × 758 px (the 760 content rows minus the ≤ 0.5 % snap), on a sideways sheet, box 807.87 × 381.85 pt = 2.116 : 1 (cut photo 2.111 : 1) |
| Customer's file | Unchanged: `src/0001.jpg` SHA-256 108d023e…0f46bb7 = the pushed file |

Earlier on the same emulator: `AnalysisDeviceTest` (1600 × 800 → 512 × 256 grey, bars black, Rec.601 middle).
