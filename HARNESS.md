# HARNESS — the canonical way to build, test and verify PrintSaathi

Every npm command below runs `npm run preflight` first (repo-root guard). Never bypass these commands to obtain a green result.

| Command | What it proves |
|---|---|
| `npm run preflight` | No `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE`/`GIT_OBJECT_DIRECTORY` override; git top level is exactly the checkout the script lives in (on the maintainer's PC `D:/Projects/PrintSaathi`) and its git dir is `<root>/.git` (never a repository above it, such as the unrelated `D:\.git` there); Node ≥ 22.12; lockfile present; installed packages match the lockfile (`npm ls`) |
| `npm run verify` | lint + typecheck + Vitest + script tests in one command. **Enforced by `.githooks/pre-commit`** (`git config core.hooksPath .githooks`, set once per clone): a failing verify blocks the commit. Added after two commits slipped through (typecheck, then format) |
| `npm run test:scripts` | Unit tests for repo tooling (`scripts/**/*.test.mjs`) |
| `npm run lint` · `npm run typecheck` | Biome lint/format · TypeScript strict |
| `npm test` | Vitest unit/property tests |
| `npm run build` · `npm run size` | Production web build · bundle budgets (JS ≤ 60 KB gzip, CSS ≤ 15 KB gzip) |
| `npm run android:sync` | `vite build` + `cap sync android` (web assets into the APK). `android:build`, `android:release` and `android:connected` run it first, so an APK never ships stale web code |
| `npm run android:test` | Android lint + JVM unit tests (task closure runs this, not only the JVM tests) |
| `npm run android:build` · `npm run android:release` | Debug APK · release APK (debug-signed for spikes); `android:release` ends with the manifest check |
| `npm run android:check-manifest` | Reads the **built release APK's binary manifest** via `aapt2`: permission allowlist (no INTERNET), backup/transfer rules, not debuggable, no cleartext, only `MainActivity` exported, EngineService present + isolated, no exported service/provider/receiver; fails if the APK is older than its sources. `node scripts/check-manifest.mjs debug` checks the debug APK |
| `npm run android:write-locks` | Rewrites Gradle lock state. STRICT locking is on for `:app`, `:sharesender` and the buildscript classpath; after a dependency change run the full task set: `node scripts/android-env.mjs buildEnvironment :app:dependencies :sharesender:dependencies :app:assembleDebug :app:assembleRelease :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lint :sharesender:assembleDebug --write-locks` |
| `npm run android:connected` | Instrumentation tests (`:app` only; the cordova module's androidTest has a known duplicate-class clash) |
| `node scripts/device/share.mjs <serial>` | Share matrix via the debug-only sender app; each mode gets a PASS/FAIL verdict (`scripts/device/share-expect.mjs`), exit code 1 on any FAIL; `EVIDENCE=<file>` saves the rows |
| `node scripts/device/kill-matrix.mjs <serial> <out.json> [--dont-keep] [--only=a,b]` | PLAN §U Recovery: on each of 20 screens, HOME → `am kill` → reopen; PASS = same screen back and no job imported twice. `--dont-keep` turns on Android's "Don't keep activities" for the run (and off afterwards). Clears the app's data: test devices only |
| `node scripts/device/privacy.mjs <serial> <outDir>` | PLAN §Q: time-shifted retention (old job deleted, open job kept), Recents screenshots (live and stored), `bmgr` backup refused (debug and release), release build has no INTERNET / not debuggable / no ALLOW_BACKUP, app log lines free of paths, file names and passwords. Needs the debug build + test sender; leaves the release build installed |
| `node scripts/device/push-fixtures.mjs <serial>` | Copies generated fixtures (e.g. 108 MP) into the app's private `files/test-fixtures` |
| `node scripts/validate-pdf.mjs <file.pdf>` | Independent PDF parse with pdf.js: page count, page sizes, images drawn |
| `npm run test:e2e` | Playwright WebView matrix + axe |
| `node scripts/release-key.mjs` | Makes the release signing key once in `%USERPROFILE%\.printsaathi\` (or `PRINTSAATHI_SIGNING`); never overwrites; back the folder up |
| `npm run android:release` | Release build (R8, debug logs stripped, signed with the release key) + manifest check + `scripts/check-release.mjs` (signed by the PrintSaathi key, ≤ 10 MB) → `release/PrintSaathi-<version>.apk` |
| `node scripts/device/release-smoke.mjs <serial> <out.json>` | The release build on a test emulator: share → Ready → PRINT → print screen, PDF → Ready, no info/debug log lines, no crash (old images: the WebView update screen). Uninstalls the app first: test devices only |
| `node scripts/device/install.mjs --release [--serial <id>]` | Installs the release build on the shopkeeper's phone over USB (docs/INSTALL.md) |
| `npm run audit -- [report.txt]` | `npm audit --omit=dev` + osv-scanner over `package-lock.json` and the Android **release runtime classpath**; fails only on a known vulnerability in something the app ships (dev packages, and the build/test tool classpaths that run on the PC, are listed in the report for review). Needs the network and osv-scanner (`winget install Google.OSVScanner`) |

## Android toolchain
`scripts/android-env.mjs` sets `JAVA_HOME` (default: Android Studio's bundled JBR) and `ANDROID_HOME` (default: `%LOCALAPPDATA%\Android\Sdk`) for every Gradle call, so no machine-wide environment changes are needed.

Canonical emulator matrix (Phase 0): `ps_api24_2gb`, `ps_api28_2gb`, `ps_api30`, `Medium_Tablet` (API 35), `ps_api36`. Factory WebViews on the old images are below 92, so their UI shows the native "update WebView" gate; native behaviour is tested there through instrumentation and the sender app.

## Evidence
- Location: `docs/evidence/<phase>/<YYYY-MM-DD>/` (command output, screenshots, logcat excerpts, manifests, `dumpsys meminfo`, timings, PDF validation, reviewer reports, ruler photos).
- Never include customer data. Logcat excerpts are privacy-checked (no file names, paths or passwords) before saving.

## Full regression (phase gate)
`npm run preflight && npm run test:scripts && npm run lint && npm run typecheck && npm test && npm run build && npm run size && npm run android:test && npm run android:release && node scripts/check-manifest.mjs debug`, then the device suites listed in the phase plan.
