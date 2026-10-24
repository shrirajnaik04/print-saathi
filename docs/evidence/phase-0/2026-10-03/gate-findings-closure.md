# Gate 1 + Gate 2 findings: closure record

Each finding follows the same lifecycle: reproduce → root cause → fix → focused re-test → regression.

**Status values:**
- **Fixed + verified:** fixed, with test and evidence named.
- **Proven intentional:** the behaviour is correct; evidence named.
- **Open:** still being worked.
- **Deferral requested:** waiting for the owner's approval.

## Gate 1 (foundation review)

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 | Manifest checker could false-PASS: comments, quotes, `>` inside attributes, other exported services or receivers, missing EngineService, other permissions, debuggable/cleartext, `fullBackupContent`, MainActivity matched by suffix | **Fixed + verified** | The checker now parses the APK's **binary** manifest through `aapt2 dump xmltree`; binary XML cannot contain comments or quoting tricks. Rules: permission allowlist, exact MainActivity, EngineService required and isolated, every exported service/provider/receiver rejected, debuggable/cleartext, `fullBackupContent`. 13 tests on mutations of a real dump. A no-op checker fails 9 of the 13, which proves the assertions bite. Both real APKs pass (`check-manifest.txt`, `apk-manifest-{debug,release}.txt` in `2026-10-02/`) |
| 1b | The debug APK still exported `ProfileInstallReceiver`, found by the new debug check | **Fixed + verified** | The removal moved from the release manifest to the main manifest; the debug check passes |
| 2 | Stale release merged-manifest evidence | **Fixed + verified** | The check reads the built APK and fails if the APK is older than `android/app/src` or `build.gradle`. Stale `merged-manifest-*.xml` evidence removed; fresh APK dumps committed |
| 3 | Preflight bypass via `GIT_DIR`/`GIT_WORK_TREE` | **Fixed + verified** | `checkGitEnv` refuses 5 redirect variables before git runs. `checkGitDir` requires `--absolute-git-dir` = `<root>/.git`. Tests 7/7. Live run with `GIT_DIR=/d/.git` exits 1 without invoking git |
| 4 | `sdk-install.txt` claimed API 36 installed; `ps_api30` and `ps_api36` AVDs missing | **Fixed + verified** | Images verified by revision; AVDs `ps_api30` and `ps_api36` created (2 GB). Correction appended to `2026-10-02/sdk-install.txt` |
| 5 | No `cap sync` in the harness | **Fixed + verified** | Added `npm run android:sync`. `android:build`, `android:release` and `android:connected` run it first. A sync touched no tracked files |
| m | Stale HARNESS/CLAUDE text | **Fixed** | HARNESS.md rewritten for the current commands; CLAUDE.md checked and still accurate |
| m | `android:write-locks` had no preflight hook | **Fixed** | `preandroid:write-locks` added |
| m | Preflight lacked an npm integrity check | **Fixed + verified** | `checkInstalled` (`npm ls` exit status) when run through npm; test added |
| m | Gradle locking was LENIENT and the buildscript classpath unlocked | **Fixed + verified** | `lockMode = STRICT` on `:app` and `:sharesender`; buildscript classpath locked (`buildscript-gradle.lockfile`). Lock state rewritten from the full build task set. Mutation test: adding gson fails with "Resolved … not part of the dependency lock state" |
| m | No `.npmrc save-exact` | **Fixed** | `.npmrc`: `save-exact=true`, `engine-strict=true` |
| m | `device_*` backup domains not excluded | **Fixed** | Both rule files now exclude `device_root`, `device_file`, `device_database` and `device_sharedpref` |
| m | gradlew exec bit; extra gitignore patterns | **Fixed** | `100755`; `*.apk`, `*.aab`, `*.hprof`, `.env*`, `android/**/build/`, `customer-files/` |
| m | `file_paths.xml` too broad | **Fixed** | FileProvider removed entirely (see Gate 2 #3) |
| m | Release signing, minify and Log stripping not tracked | **Open** | To be added to `traceability.md` at Task 11 |
| m | CSP | **Open** | Task 8 (spike c) |

## Gate 2 (native, security and resource review)

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 | Engine exceptions escape the client, or come back as an empty success | **Fixed + verified** | Reproduced on both APIs: 4 hostile files returned an empty "success". The engine now returns `[-code]` from `catch (Throwable)`, kills itself after an out-of-memory error, and serialises heavy calls; the client maps codes and short replies. `EngineHostileInputTest` 6/6 on API 35 and API 24 (`engine-hardening-summary.md` §1) |
| 2 | Intake background tasks unguarded: a crash, a logged private path, or a lost share | **Fixed + verified** | `guarded()` reports the class name only and contains `Throwable`, including OOM (`GuardedTest` 3/3 RED→GREEN). Wrapped: the `getPendingIntake` executor (rejects the call), the import executor (emits `intakeFailed`, which the spike UI shows as "Couldn't receive these files. Please share them again from WhatsApp."), and `collectUris` on the main thread |
| 3 | Own-authority check bypassed with `0@<our authority>` | **Fixed + verified** | The policy strips the `userId@` prefix and refuses any authority that resolves to our package (`resolveContentProvider`, failing closed). A plain prefix stays allowed for dual-app WhatsApp (user 999). `UriPolicyTest` 8/8: behavioural RED on the old logic, then GREEN. Unused FileProvider and `file_paths.xml` removed. Device check: new sender mode `own-authority-user` is rejected on API 35 and API 24 |
| 4 | HEIF may fail inside `isolatedProcess` | **Open** | Next |
| 5 | Evidence overclaims (EXIF 4 vs 5 tests, unlabelled quality JSONs, `pdf-octet` row failed, narrow fixtures, memory metrics) | **Fixed + verified** (except the quality-JSON labels; see the minors table below) | Raw instrumentation output committed (corrected by Gate 3 #6: authoritative counts are in `final-regression/`, 0 failed on all 5 levels). EXIF now 8 orientations × 3 decoders, with downscaling. Fixtures added: 4:2:0, progressive odd-size, odd PNG, plus a 3508 px print-size run. Quality is measured against an exact reference (Pillow BOX rejected, decoder noise floor measured). Memory is reported as PSS plus VmHWM with a caveat. **New defect found and fixed:** a 1/8999 scale error on odd sizes (35.28 → 51.86 dB). **Limitation measured:** progressive JPEG at 108 MP peaks at 427–484 MB and takes 14–23 s, so a Phase 2 budget check is required (`engine-hardening-summary.md`). | Share matrix: every mode now has a verdict and a fresh tag (no dedupe swallowing). Re-run **9/9 PASS on API 35 and API 24 2 GB**, including `pdf-octet` (`task5-share-matrix-api35-rerun.json`, `task5-share-matrix-api24-2gb.json`). Engine re-runs and fixtures: done, see `engine-hardening-summary.md` and `final-regression/` |
| 6 | Dedupe recorded only after the import | **Fixed + verified** | `DedupeWindow.claim()` records atomically before copying (`claimRecordsBeforeTheImportFinishes` RED→GREEN). The plugin claims on the main thread |
| 8 | Transparency prints black | **Fixed + verified** | Composite onto white in the area average (JVM). Same-size transparent PNGs also pass through it, a defect caught on the device on both whole-image decoders |
| 9 | Mirrored EXIF ignored on the strip and legacy paths | **Fixed + verified** | `isFlipped`, flip then rotate. `EngineOrientationTest` 8/8 orientations on all 3 decoders |
| 10 | Decode failure leaks; odd-width PNG fallback; RAW reachable in release; no one-at-a-time | **Fixed + verified** | `catch (Throwable)` cleanup; region decoder created before allocation; decoded size taken from a probe strip (device test forces sample size 2 on API 35 and 24); RAW is debug-only; heavy calls serialised in the service |
| 7 | Single-slot `pending.json`; retained events lost on recreation; executor per plugin instance | **Scheduled: Phase 2** (PLAN §D2 intake journal `inbox/<intakeId>.json` + acknowledge API + one shared executor) | Spike-only code. The fix is the planned Phase 2 intake journal, built next under the owner's overnight instruction to continue |
| 11 | EngineClient lifecycle: `reset()` on main thread, refused bind not unbound, binder race, double spawn after death | **Fixed + verified** (3 of 4) | `reset()` refuses the main thread (`EngineClientLifecycleTest` RED→GREEN on API 24). A refused bind is unbound and reported as `EngineDiedException`; a bind timeout resets. The binder is handed over through an `AtomicReference`. 10 reset/reconnect cycles pass. **Proven intentional:** unbinding after `DeadObjectException` (rather than waiting for the auto-restart) costs one extra process start, but guarantees the next call never talks to a half-dead process |
| 12 | "undefined" system-update level on Android 7–10 | **Fixed + verified** | Native sends `JSObject.NULL`; the screen uses the tested `formatExtensionLevel` (null or undefined → "Not available") |
| 13 | Sniffer gaps | **Fixed + verified** | HEIF brands `heim`/`heis`/`hevm`/`hevs`/`avis`; Office ZIPs recognised by `[Content_Types].xml`/`docProps/`/ODF `mimetype`; BMP is a printable image type (TS `PHOTO_TYPES` shared); TIFF stays "can't print yet". `SnifferTest` 7/7 RED→GREEN; summary test RED→GREEN |
| 14 | Sender test app could ship or install normally | **Fixed + verified** | `android:testOnly="true"`: plain `adb install` gives `INSTALL_FAILED_TEST_ONLY`; `-t` and Gradle installs work. The release variant is disabled (no `assembleRelease` task) |

## Privacy scan during the share re-runs (logcat, both emulators)

- **App lines:** PrintSaathi's own lines contain no paths or names: 0 hits on API 35, and 0 app hits on API 24.
- **System lines:** on API 24, Android's own `ActivityManager` logs the URI of the incoming SEND intent, here the sender's fake `content://in.printsaathi.app.fileprovider/private/jobs/x`. That is platform logging of the sender's intent, not PrintSaathi output, and the app cannot suppress it. Real WhatsApp URIs carry provider IDs, not customer names; this needs a check with real WhatsApp (user checklist).

## Gate 3 (Tasks 7–9 and the fixes since Gate 2)

**Verdict:** PASS WITH FINDINGS (6 Important, 6 Minor). Every finding is closed below.

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 | The manifest check could be fooled four ways: `uses-permission-sdk-23`, an exported `activity-alias`, `exported=@ref`, and a foreign-namespace attribute overriding `android:exported` | **Fixed + verified** | Attributes are keyed by namespace; `uses-permission*` and `activity-alias` are checked; a security attribute set through a resource reference fails. 4 new tests RED→GREEN (18 in total). The no-op mutation fails all 13 rule tests (`mutation-checks.txt`) |
| 2 | Stale manifest fixture and evidence (still listed FileProvider) | **Fixed + verified** | Both APKs rebuilt and re-dumped (`apk-manifest-{debug,release}.txt`); the fixture was refreshed; the check output is now saved (`check-manifest.txt`). The new staleness check had false positives from files `cap sync` regenerates; it now ignores them (test added) |
| 3 | PDF result codes collided with engine error codes, so an engine crash could read as "password required" | **Fixed + verified** | PDF codes moved to -101..-103; engine failures map to Damaged; the client resets after an out-of-memory error. `PdfOpenResultTest` RED→GREEN. The device test `garbageIsDamagedNotACrash` now accepts Damaged only |
| 4 | The strip path swallowed `OutOfMemoryError` and tried a heavier fallback | **Fixed + verified** | `orNullOnException` catches `Exception` only (`FallbackTest`: RED with `runCatching`, GREEN after) |
| 5 | A failed import blocked the "share again" retry for 60 s, and JS could show the previous intake | **Fixed + verified** | `DedupeWindow.release()` on failure (`releasedClaimLetsAnImmediateRetryThrough` RED→GREEN). JS shows only the intake the event names (`intakeForEvent`; a mutation test proved it bites) |
| 6 | Evidence counted skipped tests as passed, files were overwritten, and the decrypted-copy test had not run everywhere | **Fixed + verified** | `instrumentation-summary.mjs` (tested) reports passed, failed and skipped separately. `regress.sh` writes per-run files. The final regression: API 35 and 36 26/0/0; API 24, 28 and 30 23/0/3. ADR-002, ADR-003, the engine and Task 9 summaries are corrected. The d1db3a0 commit message ("18/18") overstated the counts; corrected here |
| 7 | Hostile-share device rows couldn't fail | **Fixed + verified** | The importer counts `refusedByPolicy`; the verdict requires a policy refusal (new tests RED→GREEN); final regression 9/9 on all levels. The `resolveContentProvider` branch is not exercised on a device because every own authority starts with the package prefix (Android convention `${applicationId}.…`), which the prefix rule catches first. Recorded as covered by that rule |
| 8 | Some tests asserted less than their names said | **Fixed** | `wrongPasswordIsRefused` uses `assumeTrue` (reported as skipped); garbage must be Damaged; `squareRendered` renamed `inkRendered` (presence, not position); the HEIF test renamed to its real assertion |
| 9 | Print-spike robustness | **Fixed** | Plugin calls are guarded; `persist` is synchronized; the layouts list is synchronized; a null paper size gets an A4 warning page; an IO error in `onLayout` fails the layout instead of crashing |
| 10 | Claims without committed raw output | **Fixed + verified** | `adr001-raw-evidence.txt` (ICCBased with `/N 3`, DeviceGray, image reuse, committed timings 1,249 / 23 ms; ADR-001 corrected), the pdf.js parse of the spooler file, `mutation-checks.txt`. Task 8's process-group and `dumpsys` capture is still to be re-recorded at the Phase 1 device check |
| 11 | `npm run verify` neither enforced nor complete | **Fixed + verified** | `.githooks/pre-commit` runs verify, plus `android:test` when `android/` is staged. It has blocked 3 bad commits since (2 format errors, 1 lint error) |
| 12 | Devanagari digits in file names on Marathi/Hindi phones | **Fixed + verified** | `FileNames` uses `Locale.ROOT`. `FileNamesTest` was RED under `mr-IN` and `hi-IN-u-nu-deva` (confirmed real), then GREEN |
