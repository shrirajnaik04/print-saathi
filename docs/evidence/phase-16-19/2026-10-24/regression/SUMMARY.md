# Final regression, HEAD 5c6390a (review fixes), 2026-10-24

## Device (regress.sh: full instrumentation suite, share matrix, privacy grep, crash buffer)
instrumentation-api24.txt: 70 passed, 0 failed, 6 skipped (6 skipped by design on this image: TalkBack journeys, renderer-crash test, HEIC, one locked-PDF tier)
api24 share:      15 "verdict": "PASS" 
privacy hits in app log lines: 0
instrumentation-api35.txt: 76 passed, 0 failed, 0 skipped
api35 share:      15 "verdict": "PASS" 
privacy hits in app log lines: 0
instrumentation-api36.txt: 76 passed, 0 failed, 0 skipped
api36 share:      15 "verdict": "PASS" 
privacy hits in app log lines: 0

## pdf.js render check (independent read of the device's print file)
First pass: FAIL on all three levels - the expectation PlanRenderDeviceTest wrote for pdf.js still had the camera-turned photo drawn without a turn (owner decision 8: it goes in as stored). Expectation fixed; re-run of that test and the check:
api24: "verdict": "PASS"
api35: "verdict": "PASS"
api36: "verdict": "PASS"

## Crash buffers
crash-log-api24.txt:      16 >>> in.printsaathi.app:engine <<<  (app process: 0)
crash-log-api35.txt:  (app process: 0)
crash-log-api36.txt:       2 >>> in.printsaathi.app:engine:in.printsaathi.app.engine.isolated.EngineService <<<  (app process: 0)

The engine-process crashes are the hostile-input tests (malformed PDFs and images): contained in the isolated engine, as designed; none in the app process.

## PC
npm run test:e2e after the review fixes, 2026-10-24 02:09
  24 skipped
  1529 passed (2.8m)
vitest 410 passed; lint 0 errors; typecheck clean; script tests 92; Android lint + JVM (pre-commit hook of 5c6390a)
Size after the review fixes (production build):
ok   js: 56611 B gzip (budget 61440 B)
ok   css: 5353 B gzip (budget 15360 B)
