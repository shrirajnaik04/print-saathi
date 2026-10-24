# Phase 13 evidence (Office / Fluent look and motion), 2026-10-23

- **`look/`, `look-v2/`:** PC screenshots (Playwright, reduced motion = the final state) of the main screens:
  - at 412×915 with 100 % text;
  - at 320×640 with 200 % text.

  Reviewed against the approved mockup (direction A). At 200 % the job tiles fall to one column. `look-v2/` is after
  the gate review's fixes (visible card and paper edges, smaller check mark).
- **`device-api35/`:** the real Android 15 WebView (Medium_Tablet emulator), from a synthetic share: Welcome, Home,
  Received, Ready, Change, Result, Settings (`scripts/device/look-shots.mjs`).

## Performance: Phase 13 against Phase 12, same script, same emulator (`perf-ab/`)

Method (review I3: a fair baseline):
- `scripts/device/perf.mjs` on the Medium_Tablet API 35 emulator (software GPU, 2 cores), nothing else running.
- **Phase 12** = the web app of commit 41c1069 built into the same native app; **Phase 13** = this phase.
- Two runs each (`perf-phase12-*`, `perf-phase13-*`), then two more of each with the app's own timing mark for
  Received (`*-mark-*`), and one Phase 13 run with Android's animations off (`perf-phase13-still-1`, so the
  WebView's reduced motion is on). All numbers: `perf-ab/summary.tsv`.
- Run-to-run spread on this emulator is large: the same build differed by up to 1.6 s on the 20-photo job
  (marks20 3.7–4.9 s on Phase 12).
- The cold-start method changed in this phase (perf.mjs now opens the app once to pass Welcome before measuring),
  so cold-start numbers before Phase 13 are not comparable; the A/B above uses the same method for both.

| What (ms) | Phase 12 | Phase 13 | Reading |
|---|---|---|---|
| Share 6 photos → choices on screen (the app's own mark) | 593, 292 | 287, 328 | Same |
| Share 6 → Received seen by uiautomator | 2793–3075 | 3603–3933 | **Slower as measured, not as shown:** uiautomator reads a screen only after it has been still for a second, and the slide and rise keep it moving. With animations off: 3423 |
| Choice → Ready (app mark) | 92–122 | 102–168 | Same (noise) |
| Choice → Ready seen by uiautomator | 6188–6336 | 6535–6688 | Same reason as above; animations off: 6263 |
| Choice → 6-photo print file made (app mark) | 2129–2409 | 2403–2454 | **About 0.25 s slower with motion on**; with it off 2136 (as Phase 12). Likely the busy spinner turning while the engine renders, on a software-rendered emulator. PENDING a real-phone check (USER-CHECKLIST §N1) |
| Cold start → Home | 2260–2355 | 2120–2268 | Same or better |
| Idle memory, app + WebView (MB) | 217–219 | 219–220 | Same |
| 20 × 12 MP peak, all processes (MB) | 274–279 | 271–289 | Same (noise) |
| 20 big photos: choice → Ready (app mark) | 3706–4892 | 3674–3785 | Same (noise) |

**Conclusion (honest):** the look adds no measurable cost. Motion makes the screens look later to uiautomator but
not to people (the app's marks show the choices on screen at the same time). One real cost was measured on this
emulator: about 0.25 s (≈ 11 %) more to make a 6-photo print file while the spinner turns. Whether a phone's GPU
removes it is PENDING (§N1); if it doesn't, the spinner can pause while the engine renders.

Earlier single runs (kept for the record, superseded by the A/B): `perf-api35.json` (run 1, the user's own emulator
running at the same time) and `perf-api35-run2.json`.
