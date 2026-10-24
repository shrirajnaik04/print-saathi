# Phase 10 performance budgets (PLAN §P) — API 35 emulator, 2026-10-17

**Device:** Medium_Tablet emulator (API 35, 1.9 GB RAM, 4 x86 cores, software GPU "swiftshader").
- Not a phone. Its CPU is a desktop's, so times flatter a low-end phone; its software GPU inflates WebView memory.
- Every row stays **PENDING REAL-WORLD VALIDATION** on the shopkeeper's phone and a real low-end phone.

**Method:**
- `scripts/device/perf.mjs` drives the real app; `perf-api35.json` holds the raw numbers.
- Timings come from the app's own marks (`ps-home`, `ps-choice`, `ps-ready`, `ps-ready-file`, `ps-ready-shown`, `ps-edges-*`; names only, no data), read through WebView debugging (debug builds). Rows marked "polled" use screen polling, about ±1 s.
- Memory: `dumpsys meminfo`, "Total PSS by process" only.

| PLAN §P row | Measured | Mid | Low-end | Verdict (emulator) |
|---|---|---|---|---|
| Cold start → Home usable | 2.16 s (Android TotalTime 1.39 s) | ≤ 1.5 s | ≤ 2.5 s | Low-end ✓, mid ✗ (WebView start-up is most of it) |
| Share 6 photos → Received with thumbnails | 2.24 s (polled) | ≤ 2 s | ≤ 4 s | Low-end ✓, mid marginal |
| Choice → Ready visible (6 photos, A4, with the real file) | Ready 0.09 s; real page shown 2.59 s | ≤ 4 s | ≤ 8 s | ✓ |
| 10-page B&W PDF → Ready | 40 pages in 9.4 s (Phase 7) ≈ 2.4 s / 10 pages | ≤ 8 s | ≤ 15 s | ✓ |
| One 108 MP photo, one per page | 3508 px crop decodes on every level in the regression (Phase 6); engine peak 154–175 MB | ≤ 8 s | ≤ 15 s | No out of memory ✓; time on a phone pending |
| 20 × 12 MP photos → Ready (Best) | Real page shown 8.1 s with a pause on Received; 12.2 s when tapped the moment the thumbnails appear | — | — | — |
| 20 × 12 MP on 2 pages | 2.2 s after choosing 2 pages (polled) | ≤ 12 s | ≤ 25 s | ✓ |
| Peak memory, 20 × 12 MP job (app + engine + WebView) | 284 MB (app 120, engine 40, WebView 124) | ≤ 350 MB | ≤ 250 MB | Mid ✓, low-end ✗ (WebView renderer on the software GPU) |
| Idle memory on Home (app + WebView) | 220 MB (app 120 = Java 19 + native 20 + code 23 + shared system 36 + other 20; WebView 101) | ≤ 150 MB | ≤ 130 MB | ✗. PLAN asked for a Phase 0 re-baseline that was never done; WebView and system pages dominate |
| Memory after 20 jobs | 144 → 134 MB (Phase 7) | ≤ idle + 10 % | same | ✓ |
| Print-file size per page | Colour photo ≤ 3 MB (busy synthetic 3.25 MB: owner-approved exception); grey text 14 KB–0.41 MB; 1-bit 0.1 MB | — | — | ✓ |
| Startup JS / CSS | 44.9 KB / 3.2 KB gzip | ≤ 60 / 15 KB | — | ✓ |
| APK | 3.74 MB (release) | ≤ 10 MB | — | ✓ |
| First engine bind | 0.24–0.31 s (Phase 7 probe) | ≤ 300 ms | ≤ 600 ms | ✓ |

## Fixed in this pass
**The black-edge check sat between the shopkeeper's choice and Ready.** For 20 × 12 MP it took 6 s and hit its budget, so some photos went unchecked. The analysis files are now made on the preview thread while Received is on screen (`prepareBlackEdges`), so the check at the tap takes 0.05–0.1 s once they are ready.

## Not fixed, and why
- **Cold start, idle and low-end peak memory** are dominated by Android System WebView's start-up and memory on a software GPU. Nothing in the app's own code at Home is large (Java heap 19 MB).
- **These need a real phone before any change** (USER-CHECKLIST performance row). PLAN's "≤ 150 MB idle" was never re-baselined.
- **Hard stop:** shrinking the WebView would be an architecture change.

## Final build (after the gate fixes, `perf-api35-final.json`)
Same emulator, same script (it now answers "New files arrived" with Start a new job: the 6-photo job is restored on
screen when the 20 photos are shared).

| Row | First run | Final build |
|---|---|---|
| Cold start → Home | 2.16 s | 2.52 s (PC also building; within run-to-run spread) |
| Share 6 → thumbnails (polled) | 2.24 s | 2.84 s |
| 6 photos: choice → real page shown | 2.59 s | 2.44 s |
| 20 × 12 MP tapped as soon as the thumbnails show: black-edge check | 4.0 s | 3.7 s (waits ≤ 6 s for the early run, then stops it and checks the photos done) |
| 20 × 12 MP: choice → real page shown | 12.2 s | 11.7 s |
| 20 × 12 MP on 2 pages | 2.2 s | 2.1 s |
| Peak memory (20 × 12 MP) | 284 MB | 291 MB |
| Idle on Home | 220 MB | 223 MB |

Verdicts unchanged: low-end peak, idle and mid cold start are WebView on a software GPU, pending a real phone.
