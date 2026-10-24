# Device regression, Phases 25–28: 2026-10-24

## How each level was run

`sh scripts/device/regress.sh <avd> <port> <label> <dir>` ran on each level, one at a time. It covers:
- the full instrumentation suite;
- the share matrix (15 hostile and normal shares);
- three pdf.js render checks, read independently of our writer:
  - the sample plan;
  - the web app's own hand-placed plan (`tests/fixtures/plan-v1-free.json`), whose photo 1 is now turned 10°;
  - a photo turned 20° on an upright page and −15° on a sideways page (each outline and its angle within 0.1°);
- the privacy grep of the app's log lines, and the crash buffer.

## run2: final code after the whole-branch review fixes (HEAD 6137032)

| Level | Instrumentation (passed / failed / skipped) | Share matrix | Render check | Placed by hand | Any angle | Privacy hits |
|---|---|---|---|---|---|---|
| api24 | 75 / 0 / 6 | 15/15 PASS | PASS | PASS | PASS | 0 |
| api35 | 81 / 0 / 0 | 15/15 PASS | PASS | PASS | PASS | 0 |
| api36 | 81 / 0 / 0 | 15/15 PASS | PASS | PASS | PASS | 0 |

## run3-api35-after-size-fix (HEAD b34bbe7: two screens load when needed)

| Level | Instrumentation | Share matrix | Render checks | Privacy hits |
|---|---|---|---|---|
| api35 | 81 / 0 / 0 | 15/15 PASS | 3/3 PASS | 0 |

## run1: before the review fixes (HEAD 16d7c90)

Same results as run2 on all three levels (API 24 75 / 0 / 6; API 35 and API 36 81 / 0 / 0). It is kept as the first device evidence of Phase 28's printing.

## Notes

**Skipped on API 24 (6, by design on that image):**
- the two TalkBack journeys;
- the dead-renderer test;
- the two HEIC tests;
- one locked-PDF test (Android 7 has no native unlock).

These are the same six as in round 2.

**Crash buffers:** the only entries are `com.google.android.gms` on the API 35 emulator image itself (run2, run3). The app process has none.

## Also on the final build (API 35)

- **round3-smoke 4/4** (`../round3-smoke-api35/`):
  - the ID card back side through Android's photo picker;
  - starts in colour, and the switch prints black & white and back;
  - 40 typed passport photos on 2 sheets;
  - the round handle turned by touch: the print file draws the photo at 344°.

  "New files arrived" (now loaded when needed) was passed through twice.
- **place-smoke 8/8** (`../place-smoke-api35/`): Narrow margin, hold and drop, top-bar crop, side crop, Add from the file manager, and the passport round corner.
- **adjust-smoke 11/11** (`../adjust-smoke-api35/`).
- **privacy.mjs 5/5 PASS** (`../privacy-api35.log`).
- **Release 1.0.239-b34bbe7** (sha256 `93ee3db5298e1ad57c1f5fd02ec9536f72017be4456315989911c81a5599f80e`, 1.4 MB, signed with the pinned key, manifest check and debug-log strip OK). Its checks are in `../release/`:
  - release-smoke PASS;
  - release ID-card check PASS;
  - cold start against 1.0.224, alternated 20 launches each: median 867 → 853 ms (−1.6 %), mean 933 → 879 ms. An earlier run at 6137032 gave 797 → 794 ms.
- **Startup JS:** 61,105 B gzip (budget 61,440 B). CSS: 6,377 B.
