# Device regression, Phases 20–24 — 2026-10-24

`sh scripts/device/regress.sh <avd> <port> <label> <dir>` on each level, one at a time: full instrumentation suite,
share matrix (15 hostile and normal shares), the pdf.js render check of the sample plan, the pdf.js render check of
the web app's own hand-placed plan (`tests/fixtures/plan-v1-free.json`: Narrow margins, overlapping photos placed by
hand, one straightened and turned), the privacy grep of the app's log lines and the crash buffer.

## run3 — final, HEAD 9c1b253 (release 1.0.224)

| Level | Instrumentation (passed / failed / skipped) | Share matrix | Render check | Render check (placed by hand) | Privacy hits | Crash buffer |
|---|---|---|---|---|---|---|
| api24 | 74 / 0 / 6 | 15/15 PASS | PASS | PASS | 0 | 16× in.printsaathi.app:engine |
| api35 | 80 / 0 / 0 | 15/15 PASS | PASS | PASS | 0 | 1× com.google.android.webview:sandboxed_process0 |
| api36 | 80 / 0 / 0 | 15/15 PASS | PASS | PASS | 0 | 1× com.google.android.webview:sandboxed_process0, 2× in.printsaathi.app:engine |

## run2 — after the review fixes, HEAD 82c52bf

| Level | Instrumentation (passed / failed / skipped) | Share matrix | Render check | Render check (placed by hand) | Privacy hits | Crash buffer |
|---|---|---|---|---|---|---|
| api24 | 74 / 0 / 6 | 15/15 PASS | PASS | PASS | 0 | 16× in.printsaathi.app:engine |
| api35 | 80 / 0 / 0 | 15/15 PASS | PASS | PASS | 0 | 1× com.google.android.webview:sandboxed_process0 |
| api36 | 80 / 0 / 0 | 15/15 PASS | PASS | PASS | 0 | 1× com.google.android.webview:sandboxed_process0, 2× in.printsaathi.app:engine |

**Skipped on API 24 (6, by design on that image):** the two TalkBack journeys, the dead-renderer test, the two HEIC
tests and one locked-PDF tier test (no native unlock on Android 7).

**Crash buffers:** the engine entries are the hostile-input tests (malformed PDFs and images), contained in the
isolated engine as designed; the WebView sandboxed-process entry on API 35/36 is the test that kills the web renderer
on purpose. The app process has none.

**Also on the final build (API 35):** place-smoke 8/8 (`docs/evidence/phase-24/2026-10-24/place-smoke-api35-final/`),
adjust-smoke 11/11 (`../adjust-smoke-api35/`), privacy.mjs PASS, release-smoke PASS, release card check PASS
(`../release/`), cold start and splash recordings (`docs/evidence/phase-20/2026-10-24/`).

**PC (HEAD 9c1b253):** vitest 476 passed; lint 0 errors; typecheck clean; script tests; full e2e 1636 passed, 0
failed, 24 skipped (opt-in screenshot tests); Android lint + JVM tests 310/310 (pre-commit hooks); startup JS 61,072 B
gzip (budget 61,440 B), CSS 5,948 B gzip (budget 15,360 B).
