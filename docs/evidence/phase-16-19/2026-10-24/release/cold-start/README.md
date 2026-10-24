# Cold start: 1.0.176 (before Phases 16–19) against this version — 2026-10-24

All runs were on emulator Medium_Tablet, API 35, with software graphics (swiftshader), one after another on the same
boot. Every run is a cold start: the app was force-stopped, then started from the launcher with a job-free Home.

## 1. The spec's measure: `am start -W` TotalTime (the app's first frame)

| Build | Median of 5 |
|---|---|
| 1.0.176 release | 943 ms |
| 1.0.201 release | 1,006 ms |

That is +6.7 %. **PASS:** the spec allows ±10 % (Part 5).

## 2. When Home can be used: screen recordings (release builds, 10 frames/s)

| Build | Median: first app frame → Home on screen |
|---|---|
| 1.0.176 | 2.6 s (blank grey until Home) |
| 1.0.201: the splash waited for its animation | 4.0 s |
| Fixed: the splash goes when Home is up, animated on the compositor, preload after the splash | 3.9 s |
| Experiment: opaque page, no splash picture under it | 4.2 s (so the see-through page is not the cost) |

**The 1.4 s gap is mostly the recording's own cost.** Recording an animated screen loads this emulator; a blank screen
does not. Section 3 traces the same builds without recording. Traced while recording, the new build's Home moves from
2.27 s to 2.58 s (`trace-new-debug-while-recording.txt`). The video method also counts Home only once its cards are
visible: after the splash's fade and Home's own entrance.

## 3. Traced inside the page, no recording (debug builds, WebView debugging; medians of 6)

| Build | First paint (after the page starts) | Home ready (after the page starts) | Home ready after launch |
|---|---|---|---|
| 1.0.176 (the old code, rebuilt at 8bcaf35) | 1,016 ms (nothing before Home) | 1,018 ms | **1.99 s** |
| This version | 788 ms (the printer splash) | 1,281 ms | **2.27 s** (range 1.89–2.49) |
| This version without the web splash (experiment) | 1,120 ms | 1,109 ms | 2.07 s |

## What this means

- **The printer appears sooner.** It shows about 0.23 s earlier than the old app showed anything: 788 ms against
  1,016 ms after the page starts.
- **Home is about 0.28 s later** (median) on this emulator. Without the web splash the difference is 0.08 s, within
  the noise. So the animated splash itself costs about 0.2 s here.
- **That cost is drawing the splash in software** (the emulator has no GPU), while the app's code loads. A phone's GPU
  draws it far more cheaply. This is not proven: USER-CHECKLIST §V2 asks whether it feels slower than before.

**What was fixed after the first measurement:**
- The splash no longer waits for its animation: it goes as soon as Home is up, and taps reach Home during its fade.
- It is animated on the compositor: HTML boxes around the drawings, not the `<svg>` elements, which froze while the
  code loaded.
- The other screens load only after the splash has gone.

**If the owner finds it slower:** "Remove animations" on the phone removes the web splash entirely. Or the splash can
be dropped from `index.html`, which keeps Android's own still splash.

## Files

- `video-*-release.json`: the screen-recording runs (TotalTime and the timeline of each).
- `trace-*.txt`: the in-page traces.

## 4. The final APK (1.0.203-1353ebf): first frame, alternating the two APKs, no recording

20 cold starts of each, in rounds A B A B so that drift between rounds cancels out
(`../final-1.0.203/first-frame-alternating-20-each.json`):

| Build | Median | Mean |
|---|---|---|
| 1.0.176 | 780 ms | 779 ms |
| 1.0.203 | 852 ms | 847 ms |

That is **+9.2 %, within the spec's 10 %, but close to it.** The cause of the extra ~70 ms was not isolated. The first
frame now draws a picture behind a see-through page, but the opaque-page experiment in section 2 showed no clear
difference within the noise. Other native changes since 1.0.176 (new icons, splash theme, startup code) are untested
candidates.

Single rounds varied by 4–8 % for the same APK. For that reason this alternating measure is the one quoted; the
5-run video rounds gave +6.7 % and +11 %.
