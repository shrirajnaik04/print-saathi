# Phase 20 device evidence — 2026-10-24

All on emulators with software graphics (swiftshader), release builds, cold starts (force-stop, then start).

## Cold start: `am start -W` TotalTime (the app's first frame), APKs alternated in rounds of 5, 20 runs each (API 35)

| File | A | B | Median A → B |
|---|---|---|---|
| `first-frame-alternating-20-each.json` | 1.0.176 | **1.0.224-9c1b253 (final)** | 1,206 → 1,049 ms (−13 %) |
| `first-frame-alternating-20-each-rerun.json` | 1.0.176 | **1.0.224-9c1b253 (final)** | 817 → 875 ms (+7.1 %) |
| `run-82c52bf/first-frame-alternating-20-each.json` | 1.0.176 | 1.0.221-82c52bf | 767 → 840 ms (+9.5 %) |
| `run-82c52bf/first-frame-vs-1.0.203-alternating-20-each.json` | 1.0.203 | 1.0.221-82c52bf | 849 → 848 ms (−0.1 %) |

The spec's limit is ±10 % of 1.0.176: every run is inside it. The PC was busy during the two final runs (single runs of
1.6–2.1 s on both APKs), so their spread is wide; the change against 1.0.203 (−0.1 %) shows this release adds nothing to
the first frame. Holding Android's splash (75a4426) does not hold the first frame back by design.

## Splash hand-over (API 35): `splash-handover-api35/`

Screen recordings, 10 frames a second; the logo's strength is counted per frame in the middle of the screen
(`dip.json`: the lowest frame between the first and the last frame showing the logo at ≥ 80 %, as a share of the
peak — the page splash's own fade into Home at the end is not counted).

| Build | Runs | Lowest between the two splashes |
|---|---|---|
| 1.0.203 | 7 | 0.0 in every run (the logo fades out and comes back) |
| 82c52bf (this phase's first build) | 2 | 0.0 (`before-82c52bf-gap-f022-f026.png`) |
| fix experiment (75a4426 code) | 4 | 0.84–0.98 (`dip-splashfix-experiment.json`) |
| **1.0.224-9c1b253 (final)** | 3 | **0.99** (`final-9c1b253/dip.json`, strip `B-run1-f018-f030.png`) |

Home on screen in the same recordings: final f043–f045, 1.0.203 f033–f077 (`final-9c1b253/homevideo.json`).

## API 24 launch window: `launch-window-api24/`
The whole logo from the first app frame (then this image's WebView gate, as documented).
