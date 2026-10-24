# Phase 0 — Foundation, Harness & Go/No-Go Spikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a safe, reproducible PrintSaathi repository and toolchain. Then prove or disprove, with evidence, the assumptions that the R2 architecture rests on, before any product feature is built.

**Architecture:** This phase sets up the repository, verification harness, Android project and spike code:
- **Repository.** A nested git repo in `D:\Projects\PrintSaathi`, guarded against the unrelated `D:\.git`.
- **Harness.** One verification harness (`HARNESS.md` + npm scripts).
- **Web scaffold.** Vite 8 + Preact 10 + TypeScript, exactly pinned.
- **Android project.** Capacitor 8.5.2 with an in-app Kotlin plugin, `PrintEngine`, and an `isolatedProcess` `EngineService`.
- **Spikes.** Throwaway-quality code is acceptable, but every result is recorded with evidence in `docs/spikes.md`. Spike code that survives must be hardened in later phases.

**Tech Stack:**
- **Web:** Node 24.17 / npm 11.13, TypeScript 5.9.3, Vite 8.3.2, `@preact/preset-vite` 2.10.6, Preact 10.29.8, `@preact/signals` 2.11.3, Vitest 5.0.3, fast-check 4.10.2, Biome 2.5.15, Playwright 1.63.0.
- **Capacitor:** `@capacitor/core`, `cli` and `android` 8.5.2; `@capacitor/app` 8.1.2; `@capacitor/preferences` 8.0.1.
- **Android/Kotlin:** Android Studio JBR (JDK 21), AGP 8.13 / Gradle 8.14.3 / Kotlin 2.2.20 (Capacitor 8.5.2 template values).

**Spec:** `docs/PLAN.md` (copy of the approved R2 plan; sections referenced as §X below).

## Global Constraints

- **Repo root.** It must be exactly `D:/Projects/PrintSaathi`. Never run any git command whose top level is `D:/` (the stray `D:\.git`, worktree `E:/`).
- **Exact versions.** No `^` or `~` in `package.json`. `package-lock.json` is committed, and installs use `npm ci` after the first install.
- **Android.** `appId` = `in.printsaathi.app`, app name `PrintSaathi`, minSdk 24, compile/target SDK 36.
- **No base64 for image or PDF bytes on the Capacitor bridge.** JS shows files with `Capacitor.convertFileSrc(path)`.
- **Customer-file parsing** (image decode, PDF open/render) happens only inside `EngineService` (`android:isolatedProcess="true"`, `exported="false"`).
- **Release manifest:** no `android.permission.INTERNET`, `allowBackup="false"`, `dataExtractionRules` excluding everything.
- **Customer files** live only under `noBackupFilesDir/jobs/`. Never in shared storage, and never logged by name or path.
- **Evidence** for every spike goes in `docs/evidence/phase-0/2026-10-02/` (or the run date), summarised in `docs/spikes.md` as PASS / FAIL / BLOCKED with the reason.
- **User-facing copy:** plain English, no jargon (§H2.12 list), even in spike screens.

## Review Focus

1. **Running a harness command outside the repo** (e.g. from `D:\Projects`) must fail loudly, not resolve to `D:\.git`. → Task 1 test `preflight rejects a different top level`.
2. **Spike share intake receiving a `file://` URI or a URI from our own authority** must be rejected, not copied. → Task 5 test `UriPolicy rejects file scheme and own authority`.
3. **The engine dying mid-decode** (crash or out-of-memory) must surface as an error result, with the app alive. → Task 6 instrumentation test `engineCrashDoesNotKillApp`.
4. **The print adapter being asked for the wrong paper** during a *preview* layout must still complete layout (warning page), not fail. → Task 7 JVM test `previewMismatchReturnsWarningPage`.
5. **A locked PDF opened with an empty password** must report `PASSWORD_REQUIRED`, while an owner-password-only PDF must open. → Task 9 tests `ownerOnlyPdfOpensWithoutPassword`, `userPasswordPdfRequiresPassword`.

---

### Task 1: Repository, repo-root guard, harness and project rules

**Files:**
- Create: `.gitignore`, `README.md`, `CLAUDE.md`, `HARNESS.md`, `docs/PLAN.md` (verbatim copy of the approved plan), `docs/spikes.md` (empty results table for spikes a–i), `docs/qa/traceability.md` (seeded with brief §1–§50 rows, status `NOT STARTED`)
- Create: `scripts/preflight.mjs`, `scripts/preflight.test.mjs`

**Interfaces:**
- Produces: `checkRepoRoot(actualTopLevel: string, expected: string): { ok: boolean, message: string }`. It normalises slashes and case on Windows.
- Produces CLI: `node scripts/preflight.mjs`, which exits 1 with a message unless `git rev-parse --show-toplevel` equals the expected root.
  - Expected root = env `PS_REPO_ROOT`, or default `D:/Projects/PrintSaathi`.
  - It also checks `node --version` ≥ 22.12 and that `package-lock.json` exists (once Task 2 creates it).

- [ ] **Step 1:** `git init` inside `D:\Projects\PrintSaathi`.
  - Then run `git -C D:\Projects\PrintSaathi rev-parse --show-toplevel`. Expected output: `D:/Projects/PrintSaathi`, *not* `E:/`.
  - Set the local identity only if missing (`git config user.name/user.email` already global).
  - Default branch `main`.
- [ ] **Step 2:** Write the failing tests in `scripts/preflight.test.mjs` (`node:test`):
  - `preflight accepts the expected top level`: `checkRepoRoot('D:/Projects/PrintSaathi','D:/Projects/PrintSaathi').ok === true`; also `'d:\\projects\\printsaathi'` → true.
  - `preflight rejects a different top level`: `checkRepoRoot('E:/','D:/Projects/PrintSaathi').ok === false`, and the message contains `D:\.git`.
  - `preflight rejects a parent directory`: `checkRepoRoot('D:/Projects','D:/Projects/PrintSaathi').ok === false`.
- [ ] **Step 3:** Run `node --test scripts/` → FAIL (module missing).
- [ ] **Step 4:** Implement `scripts/preflight.mjs` (exports `checkRepoRoot`; CLI branch runs git and node checks).
- [ ] **Step 5:** Run `node --test scripts/` → PASS. Run `node scripts/preflight.mjs` from the repo → exit 0. Run it from `D:\Projects` → exit 1. Paste both outputs into `docs/evidence/phase-0/<date>/preflight.txt`.
- [ ] **Step 6:** Write `CLAUDE.md`:
  - The repo-root rule.
  - "Run `npm run preflight` first".
  - The closure sequence and evidence rules (§T0).
  - Never `--no-verify`.
  - The exact-version policy.
  - Customer-data rules.
- [ ] **Step 7:** Write `HARNESS.md` with the §T0 command table. Commands not yet implemented are marked `(arrives in Task N)`.
- [ ] **Step 8:** Commit: `chore: initialise PrintSaathi repo with repo-root guard and harness docs`.

### Task 2: Web scaffold (exact pins) + first core module

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `index.html`, `src/main.tsx`, `src/app.tsx`, `src/styles/tokens.css`
- Create: `src/core/units.ts`, `src/core/units.test.ts`

**Interfaces:**
- Produces in `src/core/units.ts`:
  - `MM_PER_INCH = 25.4`, `PT_PER_INCH = 72`.
  - `mmToPt(mm: number): number`, `ptToMm(pt: number): number`, `mmToPx(mm: number, dpi: number): number` (rounded to the nearest integer).
- Produces npm scripts: `preflight`, `lint` (`biome check .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `build` (`vite build`), `size` (Node script asserting gzip(main JS) ≤ 60 KB and CSS ≤ 15 KB). Every script except `preflight` has a `pre<script>` hook running preflight.

- [ ] **Step 1:** Create `package.json` with the exact versions from the Tech Stack line (no `^`/`~`). `"type": "module"`, `"engines": { "node": ">=22.12" }`. Run `npm install` once to produce the lockfile.
- [ ] **Step 2:** Write the failing test `src/core/units.test.ts`:
  - `mmToPt(210)` ≈ `595.2756` (± 1e-4).
  - `mmToPt(101.6)` = `288`.
  - `ptToMm(841.8898)` ≈ `297` (± 1e-3).
  - `mmToPx(35, 300)` = `413`; `mmToPx(45, 300)` = `531`; `mmToPx(210, 300)` = `2480`.
- [ ] **Step 3:** `npm test` → FAIL.
- [ ] **Step 4:** Implement `src/core/units.ts`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Set up the minimal app and `tsconfig.json`:
  - `tokens.css` holds the §H1 colour tokens.
  - `index.html` has a `<head>` **without attributes**, `viewport-fit=cover`, and `color-scheme: light`.
  - `app.tsx` renders the title "PrintSaathi".
  - `vite.config.ts` sets `build.target: 'chrome92'`.
  - `tsconfig.json`: strict mode on.
- [ ] **Step 7:** `npm run lint && npm run typecheck && npm test && npm run build && npm run size` → all exit 0. Save the output to evidence.
- [ ] **Step 8:** Commit: `feat: scaffold Vite + Preact + TypeScript with exact pins and units module`.

### Task 3: Android toolchain + Capacitor Android project + hardened manifest

**Files:**
- Create: `capacitor.config.ts`, `scripts/android-env.mjs`, `scripts/check-manifest.mjs`, `scripts/check-manifest.test.mjs`, `scripts/fixtures/manifest-good.xml`, `scripts/fixtures/manifest-bad.xml`
- Create (generated by `npx cap add android`, then edited): `android/**`. Edits:
  - `android/app/src/main/AndroidManifest.xml`
  - `android/app/src/main/res/xml/data_extraction_rules.xml`, `backup_rules.xml`
  - `android/app/src/release/AndroidManifest.xml` (removes INTERNET with `tools:node="remove"`)
  - `android/app/build.gradle` (Kotlin plugin, dependency locking)
  - `android/build.gradle` (Kotlin classpath)
  - `android/gradle.properties`

**Interfaces:**
- Produces: `node scripts/android-env.mjs <gradle args…>`. It resolves the environment, then runs `android/gradlew(.bat)` with the given args:
  - `JAVA_HOME`: env, else `C:\Program Files\Android\Android Studio\jbr`.
  - `ANDROID_HOME`: env, else `%LOCALAPPDATA%\Android\Sdk`.
- Produces: `checkManifest(xml: string, variant: 'release'|'debug'): string[]` (a list of violations).
  - Release rules: no `android.permission.INTERNET`; `application@android:allowBackup="false"`; `application@android:dataExtractionRules` present; only `MainActivity` has `exported="true"`; any `EngineService` has `isolatedProcess="true"` and `exported="false"`.
- Produces npm scripts:
  - `android:build` → `assembleDebug`
  - `android:release` → `assembleRelease`, signed with the debug key for spikes only
  - `android:test` → `lint test`
  - `android:check-manifest` → runs `checkManifest` on `android/app/build/intermediates/merged_manifests/release/**/AndroidManifest.xml`

- [ ] **Step 1: Install SDK command-line tools and system images** (large downloads; record what was installed in evidence).
  - Command-line tools "latest" into `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`.
  - Then `sdkmanager` for these system images:
    - `system-images;android-24;google_apis;x86_64`
    - `system-images;android-28;google_apis;x86_64`
    - `system-images;android-30;google_apis;x86_64`
    - `system-images;android-36;google_apis;x86_64`
  - Plus `platforms;android-36` and `build-tools;36.0.0`.
  - Create AVDs:
    - `ps_api24_2gb` (RAM 2048)
    - `ps_api28_2gb` (RAM 2048)
    - `ps_api30`
    - `ps_api36`
  - Reuse the existing `Medium_Tablet` (API 35) for API 35.
- [ ] **Step 2:** Write the failing tests `scripts/check-manifest.test.mjs` against the fixtures:
  - `release manifest with INTERNET is rejected` (bad fixture → violations include `INTERNET`).
  - `release manifest without allowBackup=false is rejected`.
  - `exported engine service is rejected`.
  - `good release manifest passes` (empty array).
- [ ] **Step 3:** `node --test scripts/` → FAIL; implement `scripts/check-manifest.mjs` (a regex/DOM-free parser is fine: use a small XML attribute scan); → PASS.
- [ ] **Step 4: Create the Capacitor project.** `npx cap init PrintSaathi in.printsaathi.app --web-dir dist`, then `npx cap add android`.
  - Enable Kotlin (`org.jetbrains.kotlin.android` 2.2.20).
  - Enable Gradle dependency locking (`dependencyLocking { lockAllConfigurations() }`, then `./gradlew dependencies --write-locks` through `android-env.mjs`).
  - Add the backup/extraction rule XMLs and the release-manifest INTERNET removal.
  - Set `android:forceDarkAllowed="false"` in the theme.
- [ ] **Step 5:** `npm run build && npx cap sync android && npm run android:release && npm run android:check-manifest` → exit 0 with no violations.
  - Also run `npm run android:build` (debug) and confirm the debug merged manifest *does* contain INTERNET (live reload).
  - Save both manifests and the APK size (`apkanalyzer apk file-size`) to evidence.
- [ ] **Step 6:** Commit: `feat: add Capacitor 8.5.2 Android project with hardened release manifest`.

### Task 4: PrintEngine plugin skeleton + device-facts screen (spike i, part 1)

**Files:**
- Create: `android/app/src/main/java/in/printsaathi/app/engine/PrintEnginePlugin.kt`, `.../engine/DeviceFacts.kt`, `.../engine/PdfTier.kt`
- Create: `android/app/src/test/java/in/printsaathi/app/engine/PdfTierTest.kt`
- Modify: `android/app/src/main/java/in/printsaathi/app/MainActivity.kt` (register plugin; Kotlin)
- Create: `src/native/printEngine.ts`, `src/native/printEngine.mock.ts`, `src/screens/device-facts/DeviceFacts.tsx`
- Modify: `src/app.tsx` (debug route shows device facts)

**Interfaces:**
- Produces in Kotlin: `enum class PdfUnlockTier { NATIVE_35, PRE_V, NONE }` and `fun pdfUnlockTier(sdkInt: Int, sExtensionLevel: Int): PdfUnlockTier`:
  - `NATIVE_35` if `sdkInt >= 35`;
  - `PRE_V` if `sdkInt in 30..34 && sExtensionLevel >= 13`;
  - otherwise `NONE`.
- Produces plugin method `getDeviceFacts(): Promise<DeviceFacts>` (TS type in `printEngine.ts`):
  - `{ androidRelease: string; sdkInt: number; sExtensionLevel: number | null; totalRamMb: number; isLowRamDevice: boolean; memoryClassMb: number; largeMemoryClassMb: number; webViewPackage: string; webViewVersion: string; pdfUnlockTier: 'NATIVE_35'|'PRE_V'|'NONE'; manufacturer: string; model: string; fontScale: number }`
  - `sExtensionLevel` comes from `SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S)` on API ≥ 30, else null.
  - `webViewPackage` / `webViewVersion` come from `WebView.getCurrentWebViewPackage()` on API 26+.
- Produces `printEngine.mock.ts`: returns a fixed `DeviceFacts` for browser development and Playwright.

- [ ] **Step 1:** Write the failing JVM test `PdfTierTest`:
  - `(36, 0)` → `NATIVE_35`; `(35, 0)` → `NATIVE_35`.
  - `(34, 13)` → `PRE_V`; `(30, 13)` → `PRE_V`.
  - `(34, 12)` → `NONE`; `(29, 99)` → `NONE`; `(24, 0)` → `NONE`.
- [ ] **Step 2:** `npm run android:test` → FAIL; implement `PdfTier.kt`; → PASS.
- [ ] **Step 3:** Implement `DeviceFacts.kt` + the plugin method.
  - The screen lists every fact in large text, with a plain-language line for the unlock tier ("This phone can unlock e-Aadhaar PDFs by itself: Yes/No").
- [ ] **Step 4:** Run the debug build on `ps_api24_2gb`, `ps_api30` and `Medium_Tablet` (API 35) via `npx cap run android --target <avd>`.
  - Screenshot each with mobile-mcp; save to evidence.
  - Expected tiers: `NONE`, `NONE` or `PRE_V` (depending on the image's extension level), `NATIVE_35`.
- [ ] **Step 5:** Commit: `feat: add PrintEngine plugin with device facts and PDF unlock tier`.

### Task 5: Spike (a) — share intake, copy-on-receipt, thumbnails by path

**Files:**
- Create: `.../engine/intake/UriPolicy.kt`, `.../engine/intake/ShareIntake.kt`, `.../engine/intake/Importer.kt`
- Create: `android/app/src/test/.../intake/UriPolicyTest.kt`
- Create: `scripts/device/share.mjs` (adb helper)
- Modify: `AndroidManifest.xml` (SEND / SEND_MULTIPLE intent-filters: `image/*`, `application/pdf`, `application/octet-stream`, Office MIME list from §D1), `PrintEnginePlugin.kt` (`getPendingIntake`, `intakeReady` event), `src/app.tsx` (spike screen: count + thumbnails)

**Interfaces:**
- Produces: `fun isAcceptableShareUri(scheme: String?, authority: String?, ownAuthorities: Set<String>): Boolean`. It returns true only for `content` URIs whose authority is not ours.
- Produces plugin method `getPendingIntake(): Promise<{ intakeId: string; files: { index: number; path: string; sniffedType: 'jpeg'|'png'|'webp'|'heif'|'gif'|'pdf'|'office'|'video'|'other'; bytes: number }[] } | null>`.
  - It returns **paths only**; JS displays them via `Capacitor.convertFileSrc(path)`.
- Spike behaviour:
  - Copy runs on a background thread into `noBackupFilesDir/jobs/<id>/src/0001.part`, then is renamed.
  - Fresh-start vs restore filtering: process only when `onNewIntent`, or `savedInstanceState == null` and not `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`.
  - Caps, journal and timeouts are Phase 2 work, not this spike.

- [ ] **Step 1:** Write the failing JVM test `UriPolicyTest`:
  - `UriPolicy rejects file scheme and own authority`: `("file", null, …)` → false; `("content","in.printsaathi.app.fileprovider",{that})` → false.
  - `accepts foreign content uri`: `("content","com.whatsapp.provider.media", own)` → true.
  - `rejects null scheme` → false.
- [ ] **Step 2:** `npm run android:test` → FAIL; implement; → PASS.
- [ ] **Step 3:** Implement the intake + intent-filters + JS spike screen.
- [ ] **Step 4: Emulator verification** with `scripts/device/share.mjs`.
  - It pushes 6 JPEGs + 1 PDF to the emulator, inserts them into MediaStore, and fires `am start -a android.intent.action.SEND_MULTIPLE -t "*/*"` with their content URIs.
  - Check: the screen shows "7 files received" and 6 thumbnails + 1 PDF row.
  - Repeat with the app already running (warm) and from cold.
  - Then rotate the screen and press HOME → `am kill` → reopen from Recents. Expect **no second import**.
  - Screenshots and logcat (filtered to the app tag, which must contain no file names) go to evidence.
  - **Also verify the `*/*` mixed share lists PrintSaathi without declaring `*/*`** (`adb shell cmd package query-activities` for the intent).
- [ ] **Step 5:** Commit: `spike(a): share intake with copy-on-receipt and path-only thumbnails`.
- [ ] **Step 6 (USER, real phone):** Follow `docs/spikes/USER-CHECKLIST.md` §A (written in Task 10): WhatsApp single, multiple and mixed shares, plus a PDF sent "as document". Record PASS/FAIL per row.

### Task 6: Spikes (f) + (e) — isolated engine, crash containment, 108 MP decode

**Files:**
- Create: `android/app/src/main/aidl/in/printsaathi/app/engine/IEngine.aidl`, `.../engine/isolated/EngineService.kt`, `.../engine/isolated/EngineClient.kt`, `.../engine/isolated/Decode.kt`
- Create: `android/app/src/androidTest/java/in/printsaathi/app/engine/EngineSpikeTest.kt`
- Modify: `AndroidManifest.xml` (`<service android:name=".engine.isolated.EngineService" android:isolatedProcess="true" android:exported="false"/>`), `android/app/build.gradle` (`buildFeatures { aidl true }`, AndroidX Test + UiAutomator deps, exact versions, locked)

**Interfaces:**
- Produces AIDL:
  - `int[] decodeToJpeg(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxLongSidePx, int quality)` returns `{width, height}` of the output.
  - `void crashForTest()` (debug builds only).
- Produces Kotlin: `class EngineClient(context: Context)` with `suspend fun decodeToJpeg(src: File, dst: File, maxLongSidePx: Int): Result<IntArray>`. It handles binding, `DeadObjectException` → `Result.failure(EngineDiedException)`, and rebind on the next call.
- Decode rules for the spike:
  - API ≥ 28: `ImageDecoder` with `ALLOCATOR_SOFTWARE`, `setTargetColorSpace(SRGB)` and `setTargetSize`.
  - Below API 28: `BitmapFactory` `inSampleSize` + `ExifInterface(FileDescriptor)` rotation.

- [ ] **Step 1:** Write the failing instrumentation tests `EngineSpikeTest`:
  - `decodesLargeJpegWithinBudget`:
    - Input: the pre-made 108 MP fixture (Step 2), pushed beforehand to the test app's files dir by `scripts/device/push-fixtures.mjs`.
    - Assert output long side = 2048, and the **app** process's `Debug.getPss()` delta < 60 MB (the decode memory lives in the engine).
  - `engineCrashDoesNotKillApp`: call `crashForTest()`, assert `EngineDiedException`, then assert a following `decodeToJpeg` succeeds (rebind) and the app process is alive.
  - `engineCannotOpenAppFiles`: inside the engine, an attempt to open `context.filesDir` path fails. Exposed through a debug-only AIDL `boolean canReadPath(String)` → expect `false`.
- [ ] **Step 2:** Create the fixture generator and push script.
  - `tests/generate/make-108mp.mjs` (Node, dev dependency `jpeg-js` pinned) fills a 12000×9000 RGBA buffer (≈ 432 MB, fine on the PC) with gradient strips plus a 200 px border marker, then `jpeg.encode(…, 85)`.
  - Run it with `node --max-old-space-size=4096`. Output: `tests/fixtures-large/108mp.jpg` (git-ignored).
  - `scripts/device/push-fixtures.mjs` does `adb push` + `run-as in.printsaathi.app cp` into `files/test-fixtures/`.
- [ ] **Step 3:** `./gradlew connectedAndroidTest` (via `android-env.mjs`) on `ps_api24_2gb` and `ps_api36` → FAIL; implement the service, client and decode; → PASS on both.
- [ ] **Step 4: Measure and record in evidence** for each AVD:
  - First-bind time (target ≤ 300 ms mid / ≤ 600 ms low).
  - Decode time for the 108 MP image.
  - Peak engine-process PSS (`dumpsys meminfo in.printsaathi.app:engine…` sampled every 250 ms by `scripts/device/perf.mjs`).
  - App-process PSS.
- [ ] **Step 5:** Commit: `spike(e,f): isolated engine service with crash containment and decode-to-size`.

### Task 7: Spikes (g) + (b-prep) — PDF writer comparison and print adapter with paper guard

**Files:**
- Create: `.../engine/pdf/MiniPdfWriter.kt` (spike: JPEG pages + grey Flate page), `.../engine/pdf/PlatformPdfSpike.kt` (same pages via `android.graphics.pdf.PdfDocument`)
- Create: `.../engine/print/PaperMatch.kt`, `.../engine/print/SpikePrintAdapter.kt`, `.../engine/print/PrintSpike.kt`
- Create: `android/app/src/test/.../print/PaperMatchTest.kt`, `.../pdf/MiniPdfWriterTest.kt`
- Modify: `PrintEnginePlugin.kt` (`printSpike({ paper, colour, contentType, pages })`, `lastPrintReport()`)

**Interfaces:**
- Produces: `fun paperMatches(plannedMils: Pair<Int,Int>, selectedMils: Pair<Int,Int>, selectedIsPortrait: Boolean, toleranceMm: Double = 3.0): Boolean`.
  - It compares each dimension within tolerance, in portrait orientation only.
  - Landscape → false.
- Produces: `fun layoutDecision(isPreview: Boolean, matches: Boolean): LayoutDecision`, where `LayoutDecision { REAL_DOCUMENT, WARNING_PAGE, FAIL }`:
  - matches → `REAL_DOCUMENT`
  - !matches && isPreview → `WARNING_PAGE`
  - !matches && !isPreview → `FAIL`
- Produces: `class MiniPdfWriter(out: OutputStream)` with:
  - `fun addPage(widthPt: Double, heightPt: Double, images: List<PlacedImage>)`
  - `fun finish(): Int` (byte count)
  - `PlacedImage(bytes: ByteArray, kind: JPEG_RGB | GREY8_FLATE, pxW: Int, pxH: Int, boxPt: RectD)`
- `lastPrintReport()` returns JSON with:
  - every `onLayout` call: preview flag, selected media id and mils, min margins, colour mode;
  - the final `PrintJobInfo` state and printer id (service package + local id);
  - `savedAsPdf: Boolean`.

- [ ] **Step 1:** Write the failing JVM tests:
  - **`PaperMatchTest`:**
    - 4×6 in (4000×6000) vs 10×15 cm (3937×5906) → true.
    - 4×6 vs A4 (8268×11693) → false.
    - Portrait 4×6 vs landscape-selected → false.
    - A4 vs Letter (8500×11000) → false.
    - `previewMismatchReturnsWarningPage`: `layoutDecision(true,false) == WARNING_PAGE`; `layoutDecision(false,false) == FAIL`; `layoutDecision(false,true) == REAL_DOCUMENT`.
  - **`MiniPdfWriterTest`:**
    - One A4 page with one 2×2 JPEG fixture (bytes from `src/test/resources/2x2.jpg`).
    - The output starts with `%PDF-1.4` and ends with `%%EOF\n`.
    - The xref offsets point at `n 0 obj`.
    - The MediaBox is `[0 0 595.2756 841.8898]`.
    - Writing the same input twice gives byte-identical output.
- [ ] **Step 2:** `npm run android:test` → FAIL; implement `PaperMatch.kt`, `MiniPdfWriter.kt`; → PASS. Validate the test output PDF with `npx pdfjs-dist`-based script `scripts/validate-pdf.mjs` (dev dependency `pdfjs-dist` pinned) → reports 1 page, 595.28×841.89.
- [ ] **Step 3: Implement the print spike.**
  - `SpikePrintAdapter` reads `PrintDocumentAdapter.EXTRA_PRINT_PREVIEW`, applies `layoutDecision`, writes the warning page (MiniPdfWriter with a pre-rendered warning bitmap) or the real file, and logs everything into the report.
  - `PrintSpike` exposes an app-level in-flight record.
- [ ] **Step 4:** Emulator verification on `ps_api36` with the built-in **Save as PDF**.
  - Print a 4×6 spike; change the paper to A4 in the dialog; confirm the warning page appears in the dialog preview and the options stay enabled (screenshots).
  - Switch back to 4×6 → real page appears.
  - Save → `lastPrintReport().savedAsPdf == true`.
  - Save all reports to evidence.
- [ ] **Step 5: Writer comparison.** Generate, with both writers, (1) 6 photos on A4 and (2) a 10-page grey 300 dpi scan-like document.
  - Record file sizes, page-size precision (PdfDocument integer points), and whether grey is preserved (inspect with `scripts/validate-pdf.mjs`).
  - Write `docs/decisions/ADR-001-pdf-writer.md` with the measured table and the decision rule from §G3.
- [ ] **Step 6:** Commit: `spike(b-prep,g): paper guard decision, print report, writer comparison`.
- [ ] **Step 7 (USER, Brother printer):** `docs/spikes/USER-CHECKLIST.md` §B:
  - Print the spike test page and the 1-page / 2-page passport sheets with `PHOTO` and `DOCUMENT`.
  - Measure the 50 mm square and the 35×45 boxes with a ruler.
  - Note what the dialog preselects and what the Brother panel shows on a wrong paper size.
  - Send the `lastPrintReport()` JSON (copy button on the spike screen).

### Task 8: Spike (c) — release build without INTERNET

**Files:**
- Create: `src/workers/ping.worker.ts` (spike worker: fetches a `convertFileSrc` URL, returns its byte length), `public/fonts/` (Atkinson Hyperlegible Next woff2, 400/700, OFL licence file)
- Modify: `index.html` and `src/app.tsx`.
  - **CSP placement.** Capacitor injects its inline bridge script immediately after `<head>`. So the CSP `<meta>` is our first element inside `<head>`, which lands *after* the injected script.
  - **CSP value:** `default-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'`.
  - **`src/app.tsx`:** a spike panel showing font loaded, the worker fetch result, and a displayed thumbnail.

- [ ] **Step 1:** `npm run android:release`, install the debug-signed release APK on `ps_api36`.
  - Confirm the spike panel shows: Atkinson font active (`document.fonts.check`), a thumbnail shown via `convertFileSrc`, and the worker fetch returning the file's byte length.
  - Logcat shows no CSP violation and no `ERR_` network errors for local URLs.
  - Screenshot + logcat to evidence.
- [ ] **Step 2:** Confirm an attempt to `fetch('https://example.com')` from the panel fails, and record the error text.
- [ ] **Step 3:** Commit: `spike(c): release build works without INTERNET permission`.

### Task 9: Spike (d) — locked PDFs across tiers (ADR-002 input)

**Files:**
- Create: `tests/generate/make-locked-pdfs.mjs` (dev dependency `@cantoo/pdf-lib` 2.11.1 pinned). It writes `owner-only.pdf` (empty user password, owner password set), `user-aes256.pdf`, `user-aes128.pdf`, `user-rc4.pdf` (user password `RAMA1965`) into `tests/fixtures/pdf/`.
- Create: `.../engine/isolated/PdfOpen.kt`; AIDL method `int openPdf(in ParcelFileDescriptor pdf, String password)` → page count ≥ 1, or negative codes `-1 PASSWORD_REQUIRED`, `-2 UNSUPPORTED_SECURITY`, `-3 DAMAGED`
- Create: `android/app/src/androidTest/.../PdfOpenSpikeTest.kt`
- Create: `src/spikes/unlock-fallback.test.ts` (Vitest, Node: `@cantoo/pdf-lib` loads each fixture with the password and saves an unencrypted copy that loads without a password)

**Interfaces:**
- `openPdf` per tier:
  - `NATIVE_35`: `PdfRenderer(pfd, LoadParams.Builder().setPassword(pw).build())`.
  - `PRE_V`: `PdfRendererPreV(pfd, LoadParams…)`.
  - `NONE`: classic `PdfRenderer(pfd)`; a password other than "" → `PASSWORD_REQUIRED` if the open throws `SecurityException`.

- [ ] **Step 1:** Run `node tests/generate/make-locked-pdfs.mjs` → 4 fixtures. Commit the fixtures (they contain no personal data).
- [ ] **Step 2:** Write the failing tests:
  - Vitest `unlock-fallback.test.ts`: each user-password fixture decrypts with `RAMA1965` and fails with `WRONG1234`; the owner-only one loads with no password.
  - Instrumentation `PdfOpenSpikeTest` on each AVD:
    - `ownerOnlyPdfOpensWithoutPassword` → page count 1.
    - `userPasswordPdfRequiresPassword` → `openPdf(…, "") == -1`.
    - `unlocksWithCorrectPasswordWhenTierAllows`: tier ≠ NONE → page count 1; tier NONE → -1, and the test records "fallback needed".
- [ ] **Step 3:** Run and implement until the tests reflect real behaviour on `ps_api24_2gb`, `ps_api28_2gb`, `ps_api30`, `Medium_Tablet` (35), `ps_api36`. Record a tier × fixture result matrix in evidence.
- [ ] **Step 4:** Write `docs/decisions/ADR-002-pdf-engine.md`:
  - The matrix.
  - Whether `@cantoo/pdf-lib` handled every encryption type.
  - The decision rule from §G5, filled in with the shopkeeper's tier once Task 10's device facts arrive.
  - Option (ii) (bundled PDFium) is evaluated only if (i) fails a fixture, or the shopkeeper's tier is NONE and annotation rendering matters.
- [ ] **Step 5:** Commit: `spike(d): locked-PDF tier matrix and fallback decryption`.
- [ ] **Step 6 (USER):** Real e-Aadhaar (your own) on your phone and the shopkeeper's phone via the spike screen's "Open locked PDF" field. Result only, no file kept: the app deletes the job afterwards.

### Task 10: User-run spikes (h, i, real-device a/b/d) — checklist, mock-ups, debug APK hand-off

**Files:**
- Create: `docs/spikes/USER-CHECKLIST.md`, with numbered steps and PASS/FAIL boxes. Sections:
  - **§A** WhatsApp shares.
  - **§B** Brother print and ruler tests (incl. printing the 50 mm square, the measuring method, and what to photograph).
  - **§C** The shopkeeper's phone device facts (install with `adb install`, open Device facts, screenshot).
  - **§D** e-Aadhaar.
  - **§E** The shopkeeper language check.
  - **§F** print-service check (Settings → Connected devices → Printing: which services are on).
- Create: `docs/spikes/language-mockups.html`. Three static screens (Received, Ready to print, Passport ready) side by side in English, Marathi and Hindi, printable on A4. The Marathi and Hindi copy is marked "draft — please correct", and is shown to the shopkeeper on paper.
- Create: `scripts/device/install.mjs` (builds debug APK, `adb install -r`, prints the device's Android version).

- [ ] **Step 1:** Write the checklist and mock-ups. Self-check that every step names exactly what to tap and what to record.
- [ ] **Step 2:** Build the debug APK. Verify `scripts/device/install.mjs` installs it on `ps_api36`.
- [ ] **Step 3:** Commit: `docs: user-run Phase 0 checklist, language mock-ups, install script`.
- [ ] **Step 4 (USER):** Run §A–§F and return results, photos and screenshots. They go into `docs/evidence/phase-0/<date>/user/`.

### Task 11: Phase 0 closure — go/no-go

**Files:**
- Modify: `docs/spikes.md` (results a–i), `docs/decisions/ADR-001…ADR-002`
- Create: `docs/decisions/ADR-003-engine-process.md`, `docs/decisions/ADR-004-dependencies.md` (exact versions + why)
- Modify: `docs/qa/traceability.md`
- Create: `docs/qa/phase-0.md`: closure report with the §T0 sequence, findings and statuses, coverage statement, explicit list of what was *not* proven, and plan changes required before Phase 1.

- [ ] **Step 1:** Fill `docs/spikes.md` from the evidence; each spike gets PASS / FAIL / BLOCKED with links.
- [ ] **Step 2:** Adversarial self-challenge: for each PASS, name the weakest point of its evidence and either add a check or record it as unproven.
- [ ] **Step 3:** Full regression from HARNESS.md. Paste the outputs.
- [ ] **Step 4:** Write `phase-0.md`. If any spike FAILED, write the exact plan amendment and **stop for your approval before Phase 1**.
- [ ] **Step 5:** Commit: `docs: Phase 0 closure report and go/no-go`.
