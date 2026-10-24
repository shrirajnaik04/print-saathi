# PrintSaathi — Product & Implementation Plan · Revision 2 (for approval)
> **APPROVED by the owner on 2026-10-02 (Revision 2). This file is the binding spec; changes need an ADR or the owner's approval.**

> **Status: PLAN ONLY — nothing has been implemented.**
> R1 written 2026-10-02 · **R2 2026-10-02**, revised after two independent reviews:
> - the ChatGPT review you pasted;
> - my own adversarial reviewer (2 blockers, 19 major, 19 minor findings).
>
> Every contested claim was checked against primary sources (Android docs, AOSP and AndroidX source). Verdicts are in **"R2 — Review cross-check"** below.
> Process: superpowers brainstorming (architectural path) + UI-UX-PRO-MAX design system.
> North star: *a person who only knows WhatsApp can professionally prepare and print customer files without Word, WPS, Excel, image editors or printer knowledge.*

---

## Context

**Why this exists.** Customers send photos, screenshots, passport portraits and PDFs to the shop's WhatsApp. Only one family member has the skills (Word/WPS, resizing, grids, printer settings) to turn them into correct prints. When that person is away, the shopkeeper cannot finish those jobs, so the shop loses customers. PrintSaathi must let the shopkeeper do the common jobs alone, straight from WhatsApp, in a few taps after sharing.

**Current state of the folder (inspected).**
- `D:\Projects\PrintSaathi` is **empty**.
- It is *not* its own git repo. Git resolves to a stray **`D:\.git`** (remote `an unrelated project`, `core.worktree = E:/`).
- So the first implementation step is `git init` inside `PrintSaathi`, plus a permanent repo-root guard (T0). I will never touch `D:\.git`; cleaning it up is your call.

**Toolchain on this PC.**
- Node 24.17, npm 11.13, Python 3.11.
- Android Studio with bundled JDK 21.
- Android SDK: platforms 34/36/36.1, build-tools ≤ 37, emulator, AVDs `Pixel_7_2` and `Medium_Tablet`.
- `JAVA_HOME` / `ANDROID_HOME` are not set yet; CLI builds need them.

**Your answers.**
- The printer is on shop Wi-Fi, and a phone already prints to it.
- The shopkeeper's Android version is unknown.
- Unlocking password-locked PDFs (e-Aadhaar etc.) is a **V1 must-have**.

---

## R2 — Review cross-check: what changed and why

### ChatGPT's review: each point verified

| # | ChatGPT point | Verdict | Evidence / reasoning | Changed in |
|---|---|---|---|---|
| 1 | Locked-PDF fallback contradicts "no bytes over the bridge" | **Correct → fixed** | R1's old-phone fallback really did pass decrypted bytes across. R2 states the rule with **one explicit, bounded exception**: decrypted PDF ≤ 20 MB, 256 KB chunks, old-phone fallback only, built only if the shopkeeper's phone needs it. The acceptance criteria now match. The no-exception alternative (bundled PDF engine) is decided by ADR-002 in Phase 0 | B, G5, U |
| 2 | Untrusted PDFs need an isolated process | **Correct → adopted and extended** | Android's `PdfRenderer` / `PdfRendererPreV` reference: *"If the file is from an untrusted source it is recommended to run the renderer in a separate, isolated process with minimal permissions to limit the impact of security exploits."* R2 moves **all** parsing of customer files (PDFs *and* images) into an `isolatedProcess` engine that only receives file descriptors. This also contains crashes and out-of-memory errors | B, D, F, Q |
| 3 | Harden intake against hostile or broken providers | **Correct → adopted** | R1 trusted the declared size for the space check and had no streaming cap, timeout, `.part` file or crash cleanup | D2 |
| 4 | Races / idempotency / don't suppress re-shares by hash | **Correct → adopted.** One nuance | R1 never suppressed re-delivery by content hash; the hash only drives a "same photo" banner that defaults to *Keep both*. But R1's intent fingerprint *could* have blocked a legitimate re-share, so that is fixed. Added revision tokens, a single writer, stale-result rejection and a race test matrix | D2b, D2c, R |
| 5 | HARNESS.md + closure discipline + evidence matrix | **Adopted, one alteration** | The real-device step may be marked *N/A with a written reason* only for pure-logic work (e.g. layout maths). It is mandatory at every milestone | T0 |
| 6 | Playwright's Android API is experimental | **Correct → adopted** | Playwright docs label `_android` experimental. **AndroidX instrumentation + UiAutomator** become the authoritative native layer. Playwright stays for the WebView only | R |
| 7 | Custom PdfWriter needs an ADR | **Adopted** | ADR-001 is a Phase 0 spike against `android.graphics.pdf.PdfDocument` with measured criteria, not assumptions. Known risks to measure: platform images stored losslessly in RGB only, integer-point page sizes | G3, T |
| 8 | Hide customer documents in Android's Recents view in V1 | **Adopted, improved** | Android 13+: `setRecentsScreenshotEnabled(false)` (API 33) hides only the Recents thumbnail; normal screenshots still work. Android ≤ 12: `FLAG_SECURE` while customer content is on screen, plus a 15-minute "allow screenshots" support switch | D6, Q |
| 9 | Simplify the senior path | **Adopted** | Main screen = the real print preview + one summary line ("A4 · Colour · 1 copy — Change") + one PRINT button. Every option is its own one-decision screen | H, I, J |
| 10 | ₹10 per passport photo was invented | **Correct → fixed** | Only "5 photos = ₹50" is preconfigured. Other counts show no price until set in Settings | K, V |
| 11 | Smart-crop precision alone can be gamed | **Correct → fixed** | Added recall ≥ 90 % on a "clearly croppable" set, plus ≤ 2 % false suggestions | F5, U |
| 12 | B&W ink cannot be guaranteed | **Correct → fixed** | The app guarantees grey-only output data and requests monochrome mode. Ink use is the printer's decision | R, U |
| 13 | Exact versions + locking | **Adopted** | Exact versions, committed lockfile, `npm ci`, Gradle dependency locking, wrapper checksum | C |
| 14 | Repo-root guard | **Adopted** | `scripts/preflight` asserts git top-level = `D:/Projects/PrintSaathi` before every harness command. A repo `CLAUDE.md` forbids touching `D:\.git` | T0 |
| 15 | Don't add servers / DB / auth | **Agree** | Unchanged: offline, ₹0, no accounts | — |
| 16 | No "all scenarios tested" claims | **Adopted** | Each phase ends with a coverage statement that lists what could *not* be proven | T0 |

**Overall:** ChatGPT's review is accurate. Point 4 partly misread R1, but it pointed at a real neighbouring hole, which R2 fixes.

### My adversarial reviewer: what was adopted, rejected or altered

**Blockers (both verified, both fixed)**
1. **Paper-guard dead end.** Verified in AOSP `PrintActivity`: when a layout fails, the dialog disables paper, colour and copies, and **Retry** repeats the same failing layout, so the shopkeeper would be stuck. New guard (D4): preview layouts show a one-page "Wrong paper" warning instead of failing; only the final layout fails; Landscape counts as wrong.
2. **Crash loops after restore.** Added poison-file markers, a crash-loop breaker, and the isolated engine (D5).

**Major, adopted**
- 4×6 paper matched by exact size: calibrated from the test page, 4×6-class ± 3 mm accepted, automatic A4 fallback.
- "Save as PDF" detection.
- Older Android PDF engines drop form fields and stamps: warning banner + ADR-002.
- Owner-password PDFs open without the Unlock screen.
- Print-dialog lifecycle handling.
- Corrected locked-PDF matrix.
- The shopkeeper language check in Phase 0.
- One question per screen.
- A single batch black-edge question.
- Picker flows from Home.
- Intent-replay fix.
- Sideways pages shown upright.
- e-Aadhaar helper fields.
- Decoder traps: software bitmaps, sRGB, truncated files, white PDF background, one renderer thread.
- Android 7 heap-based budgets.
- Smaller grey files: PNG predictors + neutral JPEG.
- An honest V1 scope for document-photo borders.
- An early walking skeleton + effort estimates.

**Minor, adopted**
- Correct `am kill` test procedure.
- Absolute idle-memory and Ready-screen budgets.
- Persisted print status.
- App-controlled text scaling.
- `application/octet-stream` share type.
- CSP placement + `INTERNET` removal mechanics.
- Brand dark-mode off + WebView version gate.
- More than 100 files is consistently refused.
- One tap-counting rule.
- Passport slots computed from measured margins.
- JobScheduler cleanup.
- Lean CI + one Android version list.
- JVM-testable pixel code.
- Hostile-URI rejection.
- Strip-wise OCV maths + raw analysis bytes.
- Printer-side failure cases.
- Calibrated blur thresholds.
- Hash-named and grid thumbnails.
- Remembered per-job-type choices.
- Document reordering.
- Wording fixes.

**Rejected or altered**

| Reviewer suggestion | Decision | Reason / evidence |
|---|---|---|
| "`androidx.pdf` unlocks passwords on Android 9+ without the system update" | **Rejected** | AndroidX source `PdfRendererAdapterFactory.kt` uses `PdfRendererCompatAdapter(pfd)` there and passes **no password** |
| "Use androidx.pdf `SandboxedPdfLoader`" | **Altered** | Our own isolated engine covers Android 7+ *and* images. androidx.pdf is still beta (1.0.0-beta01, 26 Aug 2026), needs minSdk 28, and can't unlock on those phones anyway |
| "Send B&W PDFs untouched with the printer's mono setting" | **Rejected for V1** | It would break the guaranteed grey-only output (your review item 12). Revisit if measured job times hurt |
| "Add the Play-services Photo Picker backport" | **Rejected** | Keeps Google services out of the app; old phones use the system file picker |
| "Move styles / smart crop to V1.1" | **Not adopted without your approval** | Your brief lists them as required. Instead, a walking skeleton gives the shopkeeper a usable build early (Milestone A0) |
| "WorkManager cleanup" | **Altered** | Platform `JobScheduler` does the same with no new library |
| "Run the crop scan in Kotlin" | **Altered** | The detector stays in TS (fast unit tests) but reads raw grey bytes made by the engine (no PNG decoding) |
| R1's "PreV on Android 12–14" | **Corrected** | AndroidX enables PreV from **API 30** when SDK extension S ≥ 13 is present |

### Final self-review: every section of your brief → where R2 covers it

| Brief § | Topic | Covered in | Status |
|---|---|---|---|
| 1–3 | Problem, persona, 3–5 taps | Context, A, J (tap rule) | ✅ |
| 4 | WhatsApp share target, Choose from phone, no broad permissions | D1–D3, J0 | ✅ |
| 5 | Simple home | H3, I1 | ✅ (Previous job → contextual Continue card) |
| 6–7 | Senior UI rules, Simple mode first | H1–H4, I5–I7 | ✅ |
| 8–10 | One page / more pages (Best/1/2/3) / one per page | G0, J1–J3 | ✅ |
| 11 | A4 + 4×6, extensible, remembered per job type | G0, G1, D4 calibration | ✅ |
| 12–13 | Passport (preset, 5 copies, price config, no beautification), load-paper reminder | G0, J4, K4 | ✅ (reminder merged into PRINT button, no extra tap) |
| 14 | Documents (PDF, JPG, PNG, WebP…; pages, colour, copies; document photos) | G4, J5, F5 | ✅ (V1 doc-photo borders = uniform borders; table backgrounds → Phase 2, stated) |
| 15 | Office files investigated and staged | L11, M, N | ✅ |
| 16 | Six filters, non-destructive, thumbnails, no sliders | F4, J7 | ✅ |
| 17–19 | Smart crop, internal dividers, manual crop | F5, L1, I9, J6 | ✅ (dividers = Phase 2, allowed by brief) |
| 20–21 | Final summary, WYSIWYG preview | I5, G7 | ✅ |
| 22–23 | Android printing via local PDF, no base64, cleanup, printer-independent layers | B, D4, E, G6 | ✅ (one bounded, documented exception in G5) |
| 24–25 | Offline zero-backend, local storage, privacy, retention | B, E, Q | ✅ |
| 26–27 | Low-end performance, huge photos | F, P, R | ✅ |
| 28 | Background / resume / recreation | D2b, D5 | ✅ |
| 29–30 | Accessibility; optional voice + languages | H, U; L9–L10, H5 | ✅ |
| 31 | Shop settings | I15 | ✅ |
| 32–34 | Tech research, lightweight UI, visual style | C, H1 | ✅ |
| 35 | Responsiveness, font scale, landscape, safe areas, keyboard | D6, H2, R5 | ✅ |
| 36–37 | No over-engineering; AI not required | N, B (engine justified by Android guidance), M | ✅ |
| 38 | Failure handling list | J8 (every listed case + new ones) | ✅ |
| 39 | Quality priority order | A | ✅ |
| 40–43 | Testing, real devices, automation, adversarial QA | R, T0 | ✅ |
| 44 | Measurable performance criteria | P | ✅ |
| 45 | "Could the shopkeeper do this alone?" | H4 | ✅ |
| 46–48 | Example experiences | J1, J4, J6 | ✅ (J1: 2 taps, J4: 3, J6: 3 normal, 6 with Sharp Black) |
| 49–50 | Phases, sections A–V | T, whole document | ✅ |

**Not provable from a plan; proven only in Phase 0:**
- Exact print-service scaling on the shop's Brother.
- The print dialog's preview/final sequence.
- e-Aadhaar decryption on the old-phone fallback.
- Isolated-process overhead.
- The shopkeeper's language comfort.

These are go/no-go spikes, not assumptions.

---

## A. Product understanding

**The problem in my words.**
- Print requests now arrive as WhatsApp files, not paper.
- Turning a file into a *correct* print needs skills the shopkeeper lacks: fitting photos on a sheet, sizing passport photos exactly, cropping junk borders, choosing colour or B&W, picking pages, and driving printer settings.
- That knowledge lives in the owner's head and in Word/WPS. PrintSaathi moves it into the app.

**What PrintSaathi is.**
- A shop assistant that turns the customer's *spoken request* ("all on one page", "5 passport photos", "this PDF, black & white, 2 copies") into a print-ready file.
- It decides layout, size, orientation, margins and quality by itself.
- It shows exactly what the paper will look like, then hands over to Android's printer screen.

**What it is not.** An editor, a mini-Word, a cloud service or a printer driver.

**Users.**
- **Primary: The shopkeeper (55–75).** Knows WhatsApp, photos, A4, colour, copies. Does not know files, formats, DPI or margins.
- **Secondary: the owner.** One-time setup, settings, support through a problem report.

**Success (measurable)**
1. **The shopkeeper works alone.** In a moderated test they complete the 6 core jobs alone (≥ 5/6): photos on one page, photos over several pages, one photo per page, passport sheet, PDF, locked e-Aadhaar.
2. **Few taps.** Counted inside PrintSaathi from the first tap after *Share* up to and including **PRINT**. Android's own print button is counted separately, and the after-print question isn't counted. Targets:

   | Job | Taps |
   |---|---|
   | Photos on one page | 2 |
   | One photo per page | 2 |
   | Photos over more pages | 2 |
   | Passport | 3 |
   | Normal PDF | 1 |

3. **Zero surprises.** The printed sheet matches the *Ready to print* preview in layout, page count, colour and size. Passport photos measure 35 × 45 mm ± 0.5 mm.
4. **Customer files can't hurt the app or leak.** No customer file can crash the app (parsing is isolated). No file leaves the phone. Files are deleted on schedule.
5. **₹0/month.**

**When goals conflict, your §39 order decides:** simplicity → reliability → print correctness → senior UX → performance → privacy/security → low memory → offline → ₹0 → maintainability. A fancy feature never wins over these.

**Hard truths that shape everything**
- **Android's print screen is outside our control.** We cannot preset the printer, the copies field or the paper type (glossy). We *can* preset paper size and colour, detect wrong paper without trapping the shopkeeper, detect "Save as PDF", and train the shopkeeper once.
- **Customer files and the apps that share them are untrusted input.**
- **The hard part isn't the buttons.** It is automatic layout that looks skilled, exact physical size, and robustness when files are huge or broken, or when Android kills the app.
- **The shopkeeper's phone is unknown.** The design must hold from Android 7 (Capacitor 8's minimum) upwards.

---

## B. Recommended architecture

**Principle: TypeScript decides; an isolated engine does the heavy pixels; the app process only moves bytes and talks to Android.**

```
 WhatsApp / Photos / Files ── SEND / SEND_MULTIPLE, or "Choose from phone" pickers ──┐
                                                                                     ▼
┌───────────────── APP PROCESS (Kotlin, trusted; never parses customer content) ─────────────────┐
│ INTAKE  stream bytes → src/*.part (caps, timeouts, journal) → validate → atomic rename          │
│ JOBS    revision-checked job store · retention · crash markers · diagnostics                   │
│ WRITER  PdfWriter (ADR-001) assembles engine-made image streams → out/<planHash>/print.pdf     │
│ PRINT   PrintTarget = AndroidSystemPrint (paper guard · Save-as-PDF check · status · lifecycle)│
└──────┬──────────────────────────────────▲──────────────────────────────────────▲──────────────┘
       │ file descriptors + small params    │ metadata only                        │ small JSON:
       ▼ (AIDL)                             │                                      │ ids, paths, PrintPlan,
┌───── ENGINE (isolatedProcess: no permissions · no file system · no network) ─────┐  events; never image
│ decode-to-size (EXIF, HEIC) · thumbnails · raw analysis bytes · print styles       │  bytes (*)
│ placement rendering + encoding · PDF open / unlock / render (PdfRenderer tiers)     │       │
│ A crash or out-of-memory here = "this file can't be opened", never an app crash     │       │
└────────────────────────────────────────────────────────────────────────────────────┘       │
┌──────────────── WEBVIEW (TypeScript + Preact, Chromium-sandboxed renderer) ──────────────────┴──┐
│ Screens · job state machine (the ONLY writer of job choices) · LAYOUT ENGINE → PrintPlan        │
│ Smart-crop detector (Web Worker) · previews = engine thumbnails placed by the same plan         │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
 print.pdf ─► Android print framework ─► print service (Brother plugin / Mopria / Default) ─► printer
 (*) one documented exception: decrypted locked-PDF bytes in the old-phone fallback (G5), ≤ 20 MB
```

This is the layered chain you asked for: **imported content → processing → layout → print artifact → print adapter → Android print system**.

**Key decisions**
1. **One source of geometry.** The PrintPlan is computed once, in TS, in PDF points. The preview and the engine both follow it; the engine never decides layout.
2. **One implementation of pixel work** (the engine). Thumbnails, style samples and the final file come from the same code.
3. **Proof before printing.** *Ready to print* shows the real `print.pdf`, rendered back to images.
4. **Originals are never modified.** Edits are parameters, so everything is reversible.
5. **No image or page bytes over the JS↔native bridge.** The one documented exception is in G5.
6. **Customer files are hostile.** They are parsed only in the isolated engine (Android's own recommendation for untrusted PDFs, applied to images too).
7. **Privacy by construction.** No `INTERNET` in release builds, nothing backed up, Recents thumbnail hidden.
8. **One active job.** Nothing is ever silently discarded.
9. **Stale results can't win.** Every async result is tagged with job + revision; stale ones are thrown away.

**Why not do the image work in the WebView?**

| | WebView-only | Engine (recommended) |
|---|---|---|
| 100 MP photo | Full decode ≈ 432 MB in the WebView; out-of-memory kills the UI | Decode-to-size; region decode for crops |
| Large JPEGs in general | **WebView silently decodes big JPEGs smaller** (3 MP on ≤ 1 GB phones, else RAM ÷ 25 ≈ 16 MP on 2 GB), so print quality drops with no error | Full control of resolution |
| iPhone HEIC "sent as document" | Not decodable | Android 8+ |
| Writing the print file | base64 chunks through the Filesystem plugin | Streamed to disk |
| Customer PDFs | pdf.js ≈ 1.7 MB (514 KB gzip), needs Chrome 125+ | Android `PdfRenderer`, built in |
| Cost | Less native code | ≈ 4–6 k lines of Kotlin (honest estimate), JVM- and device-tested |

**Why an isolated engine process.**
- **Android recommends it.** Android's PDF docs say an untrusted PDF should be rendered in an isolated process with minimal permissions. Image decoders are also an attack surface.
- **What isolation means.** The engine gets only read/write file descriptors from the app process. It has no permissions, cannot open files itself, and has no network.
- **Free benefits.** A malformed file or an out-of-memory decode kills only the engine. The app shows "This file can't be opened" and carries on. The app process stays small.
- **Cost.** ≈ 500 lines (service + AIDL + reconnect), plus a first bind of ~100–300 ms, measured in spike (f).
- **Fallback.** If `isolatedProcess` proves impractical somewhere, a normal separate process (`android:process=":engine"`) keeps crash and memory containment, but not the permission isolation.

A fully native Jetpack Compose app was also considered. It is more native code for a web-developer maintainer, and you asked for Capacitor.

---

## C. Technology stack (versions verified 2026-10-02; **exact versions pinned**)

**Runtime (ships in the app)**

| Dependency | Purpose / why | Licence · cost | Size / complexity | Alternatives considered |
|---|---|---|---|---|
| **Capacitor 8.5.2** (`@capacitor/core`, `cli`, `android`) | Shell, bridge, local WebView server, **SystemBars** safe areas | MIT · free | minSdk 24, target/compile 36, Node ≥ 22, JDK 21, AGP 8.13, Kotlin 2.2. Capacitor 9 is still alpha (minSdk 26) | Native Compose (more native code); React Native (heavier); Cordova (legacy) |
| **@capacitor/app 8.1.1** | Back button (predictive-back safe), pause/resume, minimise | MIT | Tiny | Own code |
| **@capacitor/preferences 8.0.1** | Settings + remembered choices (versioned JSON) | MIT | Tiny | IndexedDB (more complex) |
| **PrintEngine** (ours): plugin + `isolatedProcess` engine service | Intake, pickers, decoding, thumbnails, styles, PDF read/unlock, PDF writing, printing, storage, diagnostics | Ours | ≈ 4–6 k lines. Only the Android SDK, the AndroidX that Capacitor already brings, and `androidx.exifinterface`. **No `.so` files** (unless ADR-002 picks a bundled PDF engine) | **Share:** `@capgo/capacitor-share-target` 8.0.54 (MPL-2.0; UI-thread copies into a purgeable cache; open file-name, path-escape and logging bugs); `@mindlib-capacitor/send-intent` 8.0.6 (its second activity closes during the print dialog). **Picker:** `@capawesome/capacitor-file-picker` 8.1.0 (good, but returns raw URIs). **Print:** `@capgo/capacitor-printer` 8.1.4, `@rdlabo/capacitor-printer` 8.0.1 (neither sets paper or colour; no guard) |
| **Preact 10** (latest 10.x, exact patch pinned in Phase 0) + **@preact/signals 2.11.3** | UI + state | MIT | ≈ 4.5 + 3.5 KB gzip. Preact 11.0.0 is two days old (2026-09-30); adopt it after it matures | React 19 (≈ 45 KB); Svelte 5; Solid; vanilla TS; Ionic UI kit |
| Plain CSS + design tokens + CSS Modules | Styling | — | 0 runtime | Tailwind 4; CSS-in-JS |
| **@phosphor-icons/core 2.1.1** (individual SVGs via `?raw`, ~25 icons) | Icons, always with labels | MIT | ≈ 0.5 KB each | `lucide-static`; icon fonts (147 KB) |
| **Atkinson Hyperlegible Next** (2 weights, Latin subset, bundled) | Low-vision-friendly type | SIL OFL | ≈ 60 KB | System Roboto |
| **@cantoo/pdf-lib 2.11.1**, *conditional* (ADR-002), lazy-loaded | Locked-PDF unlock on phones Android can't unlock | MIT, maintained | ≈ 222 KB gzip, on demand only | Bundled PDFium wrapper (ADR-002 option ii); pdf.js (514 KB gzip, Chrome 125+, can't hand back a decrypted file) |

**Build and test only**

| Tool | Purpose | Licence |
|---|---|---|
| TypeScript 5, **Vite 8.3.2** + `@preact/preset-vite` | Build. `build.target` = WebView floor (Chrome 92); Vite 8 defaults to Chrome 111 | Apache-2.0 / MIT |
| **Vitest 5.0.3** + **fast-check** | Unit, property and fuzz tests | MIT |
| **Playwright 1.63.0** + `@axe-core/playwright` | WebView UI flows (mocked native), viewport × text-size matrix, accessibility, visual snapshots. **Not** the authority for native behaviour | Apache-2.0 / MPL-2.0 |
| **AndroidX Test + UiAutomator**, JUnit 4 | **Authoritative** native and system tests: share intents, lifecycle, print dialog, pickers | Apache-2.0 |
| `jpeg-js`, `pngjs`, `pdfjs-dist` (dev), `qpdf` (CI) | Fixture decoding; independent PDF validation | MIT / Apache-2.0 |
| **Biome** | Lint + format | MIT |

**Versioning policy.**
- Exact versions only: no `^` or `~`.
- `package-lock.json` committed; installs use `npm ci`.
- Gradle version catalog + dependency locking + wrapper checksum verification.
- Every upgrade gets a short dependency-review note + full regression.

**Deliberately not used.**
- React, the Ionic UI kit, Tailwind, Redux/Zustand.
- `@capacitor/filesystem` (base64-only binary writes).
- `pdf-lib` (unmaintained since 2021), jsPDF.
- pdf.js in production; OpenCV.js.
- ML Kit / Google Play services (they send usage metrics).
- Firebase, Sentry, analytics.
- Any third-party share, print or picker plugin.

**Budgets.**
- Startup JS ≤ 60 KB gzip; CSS ≤ 15 KB gzip.
- APK ≤ 10 MB, or ≤ 16 MB if ADR-002 bundles a PDF engine.

---

## D. Android integration design (WhatsApp → PrintSaathi → Android Print)

**D1. Share target (manifest, `MainActivity`, `singleTask`)**
- **Actions:** `SEND` and `SEND_MULTIPLE`, category `DEFAULT`.
- **Types:**
  - `image/*`, `application/pdf`, `application/octet-stream`. Some apps send PDFs as octet-stream; type sniffing refuses junk politely.
  - Office types, received only to explain *"Word file — ask the customer for a PDF"*.
- **Mixed photo + PDF shares** arrive as `*/*`. Android matches those against any filter that lists types, which the reviewer confirmed. So `*/*` is not declared, which keeps PrintSaathi out of video and text share sheets.
- **One activity only.** Nothing like send-intent's second activity, which would close during the print dialog.
- **Setup step.** Pin PrintSaathi in the share sheet where the phone allows it.

**D2. Intake pipeline (app process; hostile-input safe)**
1. **Receive.** Replay rules are in D2b.
2. **Accept only `content://` URIs from other apps.** Reject `file://` and URIs of our *own* authorities (e.g. Capacitor's `…fileprovider`). This blocks tricks that make the app re-import its private files.
3. **Never trust the provider's file name, MIME type or declared length.** Declared length only drives the progress bar.
4. **Copy safely, on a background thread, immediately** (the read permission ends with the receiving task):
   - **Stream** into `jobs/<id>/src/0001.part`, computing SHA-256 on the way.
   - **Hard caps enforced while streaming:** 200 MB per file, 1 GB per job. Exceeding them stops the copy, deletes the `.part` file, and says *"This file is too big to print"*.
   - **Unknown length is fine.** Caps and a free-space check every 8 MB (always keeping ≥ 200 MB free) protect the phone.
   - **Stall timeout** after 20 s without bytes; 3 min overall per file; Cancel works at any moment.
   - **Atomic promotion.** On completion: fsync → magic-byte sniff → reject zero-byte files → rename `.part` → `0001.<ext>`. Only promoted files join a job.
   - **Journal.** `inbox/<intakeId>.json` records every file's state. After process death, leftover `.part` files are deleted. Unfinished files are resumed if the permission still works; otherwise: *"Couldn't finish receiving 3 files. Please share them again."*
5. **Sniff the real type** from magic bytes: JPEG, PNG, WebP, HEIC/HEIF, GIF, PDF, ZIP-Office, OLE-Office, video/audio. The engine validates deeply later, when it decodes.
6. **Hand over to JS.** JS *pulls* a pending-intake record on start (`getPendingIntake()`) and gets an `intakeReady` event when already running, so a share is never lost before JS is listening.
7. **Per-file failure ≠ job failure.** Failures are listed with reasons (J8); the rest carry on.

**D2b. Delivery, replay and duplicates**
- **When a share counts.** Only when delivered by `onNewIntent` (app already running) or on a **fresh** activity start: `savedInstanceState == null` and not `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`.
  - Capacitor replays the launch intent through `onNewIntent` on *every* activity creation, so restores and recreations are filtered out by these checks.
  - The intake journal resumes any interrupted copy.
- **Same URIs within 60 s** open the existing job instead of a second one. **No share is ever dropped silently.**
- **The same content shared again later is a new job.** The shopkeeper may intentionally print a file twice. Hashes only power the in-job banner *"These 2 photos are the same"* (default: Keep both).

**D2c. Concurrency, idempotency and stale results**
- **Single writer.** The TS job store is the only writer of job choices.
  - Every change increments `manifest.rev`.
  - Native persists it atomically (temp → fsync → rename) and **refuses a write whose `rev` is not newer**. A stale writer can never overwrite newer choices.
- **Tagged operations.** Every async operation (thumbnail, analysis, render, print) carries `{jobId, rev, opId}`.
  - Render outputs live in `out/<planHash>/`.
  - Results are applied only if the job still exists and its current `planHash` matches. Anything else is discarded and its files deleted.
- **Cancellation.** A new render cancels the previous one; Back cancels the running step; the engine checks the cancel token between strips and pages.
- **Per-job lock.** Deletion, retention sweeps and renders take the job lock; the sweeper skips active jobs.
- **One print at a time,** app-wide, with a persisted in-flight record (D4).
- **Race test matrix (R):**
  - Two shares within 1 s; a share during intake, render or the print dialog.
  - 10 rapid taps on Next, Back or PRINT; changing an option while a render finishes.
  - Process death during intake, render, PDF write and print.
  - Callbacks after cancel or delete; re-sharing identical content; a retention sweep during an active job.

**D3. "Choose from phone"**
- **Photos and Passport:** the Android **Photo Picker** (no permission). Phones without it (≤ Android 10) get the system document picker. No Play-services backport entry, to keep Google services out of the app.
- **Documents:** `OpenMultipleDocuments` (`application/pdf`, `image/*`).
- **Same pipeline.** Picker results go into the same intake journal, so they survive process death. Flows are in J0.
- **WhatsApp's own setting matters.** WhatsApp's *Media visibility* setting can hide WhatsApp photos from the gallery and Photo Picker. That is why Share is the main path, and Help says so.

**D4. Printing (`AndroidSystemPrint` behind a `PrintTarget` interface)**
- **Call.** `PrintManager.print(name, PdfFileAdapter, attrs)` with paper (A4, or the calibrated 4×6-class size, always portrait) and colour (`COLOR_MODE_MONOCHROME` for B&W).
- **Paper calibration (once, during setup).**
  - The test page records, from `onLayout`, the **exact** 4×6-class paper the shop's print service offers (4×6 in = 4000 × 6000 mils, or 10 × 15 cm = 3937 × 5906 mils) and the printer's minimum margins.
  - Later jobs request *that exact* size. Android's dialog preselects a requested size only when the mils match exactly.
  - If no 4×6-class paper exists, passport switches to A4 sheets automatically.
- **Paper guard, no dead end (R2).**
  - **Preview layouts** (`EXTRA_PRINT_PREVIEW = true`) **never fail.** If the paper is wrong (outside ± 3 mm of the planned size class, or Landscape chosen), we return a one-page **warning page**: *"Wrong paper — choose 4×6 photo paper in 'Paper size' above"*. The dialog stays fully usable; when the shopkeeper fixes the paper, the real pages appear.
  - **The final layout** (after the dialog's print button) fails if the paper is still wrong, so nothing prints. Our result screen says: *"Nothing was printed — the paper size was wrong. Tap PRINT again and don't change anything."*
  - Spike (b) confirms this preview → final sequence on the shopkeeper's actual dialog. If a dialog doesn't mark preview layouts, mismatched layouts simply fail and the result screen explains.
- **Content type and exact size.**
  - Android forwards our PDF unchanged; the *print service* decides any scaling. The research found Android's Default Print Service fits documents to the page, fills the page for photos (switching on borderless, which enlarges slightly), and prints 1 : 1 only for a single page that fits inside blank margins.
  - So: **photo layouts** use `PHOTO` (better paper and quality); **passport sheets and documents** use `DOCUMENT`.
  - Passport prints as **single-page parts** if the Phase 0 ruler test shows multi-page scaling.
- **Copies are built into the PDF:** collated, with image objects reused. The shopkeeper's one rule: *"Don't change anything on the next screen — just tap the print button."*
- **Result and status.**
  - **"Save as PDF" check.** After the dialog closes, the job's printer is checked. If it was Android's built-in **"Save as PDF"**: *"This was saved as a file, not printed. At the top of the print screen, choose the shop printer."*
  - **Status polling.** Status (queued, started, blocked, completed, failed, cancelled) is polled while the app is in front. The print-job id is **persisted** and re-checked via `PrintManager.getPrintJobs()` on resume.
  - **States shown:** *Sent ✓*, *Still printing*, *Couldn't check*. A job counts as *sent* once queued, so *Continue* never offers a printed job.
  - **Always asked afterwards:** **"Did it print correctly?"**
- **Lifecycle safety.** Android closes the print dialog if the activity that opened it is destroyed. So:
  - The in-flight print lives in an app-level object plus a persisted record.
  - WebView-crash recreation waits until the print finishes.
  - The engine is unbound (freeing memory) before the dialog opens.
  - If the dialog is lost (process killed, or a new WhatsApp share arrives — `singleTask` clears it): *"Printing was interrupted. Tap PRINT again."*
- **Double-tap protection.** JS disables the button at once; native rejects a second `print()`.
- **Big jobs** are split into parts (≤ 40 pages or ≤ 150 MB), shown as "Part 1 of 3".
- **"Print a test page"** (setup and Settings): a 50 mm ruler square and a 35 × 45 mm box. It picks the printer once, calibrates paper and margins, and lets us verify 100 % scale.
- **Print service present?** Android 8+ has a built-in service; **Android 7 has none.** Setup checks that the Brother Print Service Plugin or Mopria is installed and enabled. Help covers "only *Save as PDF* appears".

**D5. Lifecycle and crash safety**
- **Back.** Android Back = the in-app **Back** button, via `@capacitor/app`'s `backButton` (works with predictive back; no `onBackPressed` override, which Android 16 no longer calls). On Home, Back minimises the app.
- **Restore policy.** Returning within 30 min reopens the same screen with all choices. After that, the app opens on Home with the *Continue last job* card.
- **Poison files cannot cause crash loops.**
  - Before the engine touches an item, a "processing item X" marker is saved; it is cleared afterwards.
  - If the engine or the app dies mid-item, the marker turns that item into *"Couldn't open this file — ask the customer to send it again"*, and it is skipped from then on.
- **Crash-loop breaker.** Two app crashes within 60 s make the next start a **safe start**: Home with a Problem panel; the job is kept but not auto-opened.
- **WebView renderer crash.** A listener returns `true` and the activity is recreated, deferred while a print is in progress; the job is restored. Capacitor 8 does not handle this by itself.
- **Process death, rotation, screen lock.**
  - The manifest is saved at every step and rendering is re-runnable, so state survives.
  - `configChanges` avoid recreation on rotation.
  - If the shopkeeper switches to WhatsApp mid-preparation, Android may pause the app; preparation continues or re-runs when they return.
  - No foreground service.

**D6. System UI**
- **Safe areas.** SystemBars (`insetsHandling: 'css'`) + `viewport-fit=cover`; bars use `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))`. Android 16 enforces edge-to-edge.
- **Text size, app-controlled.** `setTextZoom(100)`; the phone's font scale is applied to the root `rem` size, capped at the tested maximum (2.0×) and updated live. CI therefore tests exactly what ships.
- **Display size** just changes the width the app sees, so the viewport test matrix covers it.
- **Keyboard.** Only *Unlock PDF* and some Settings fields use it. SystemBars' keyboard-inset handling keeps the field and its button visible (tested at 320 px width and 200 % text).
- **No surprise dark mode.** `forceDarkAllowed=false` and algorithmic darkening off, so brand "dark mode for apps" settings (MIUI, ColorOS, One UI) cannot invert the paper previews.
- **WebView version gate.** Checked natively at start. Below WebView 92, a native screen says *"Please update Android System WebView"* with a Play Store button.
- **Recents privacy (V1).**
  - **Android 13+:** `setRecentsScreenshotEnabled(false)`. The Recents thumbnail is blank; normal screenshots still work.
  - **Android ≤ 12:** `FLAG_SECURE` while a screen shows customer content. Settings → *"Allow screenshots for 15 minutes"* for support.

**D7. Permissions and manifest**
- **Runtime permissions:** none.
- **No internet.** `INTERNET` is removed from release builds (`tools:node="remove"`); debug builds keep it for live reload.
- **Exported components.** Only `MainActivity` is exported. `EngineService` is `exported=false` and `isolatedProcess=true`.
- **CSP.** The CSP `<meta>` sits *after* Capacitor's injected bridge script (keep `<head>` attribute-free, so the injection lands first).

---

## E. Local data & storage design

| Data | Where | Notes |
|---|---|---|
| Settings + remembered choices per job type | `@capacitor/preferences`, versioned JSON + migrations | Small |
| Job manifest (choices, crops, turns, style, copies, status, `rev`; **never** passwords) | `jobs/<id>/job.json` | Atomic, `rev`-checked writes |
| Intake journal | `inbox/<intakeId>.json` | Resumes or reports interrupted copies |
| Customer originals | `noBackupFilesDir/jobs/<id>/src/` | Promoted from `.part`; immutable |
| Thumbnails, grid thumbnails, analysis bytes, style samples, PDF page images | `jobs/<id>/thumbs/` | File names include a hash of their settings, so the WebView never shows a stale image |
| Print file + its page images | `jobs/<id>/out/<planHash>/` | `print.pdf.part` → `print.pdf`; deleted right after printing |
| Render scratch | `jobs/<id>/work/` | Cleared after each render and at app start |
| Crash markers, crash counter, in-flight print record | `noBackupFilesDir/state/` | Crash safety (D5) |
| Diagnostics (events, timings, error codes, crash stacks; **no** names, paths or content) | `diag/log.jsonl`, 1 MB ring buffer | Shared only via **Send problem report** |

**Retention and cleanup**
- **Setting:** *"Delete customer files after"*: 1 hour / **1 day (default)** / 7 days, counted from the last activity.
- **When it runs:**
  - At expiry, via one **platform `JobScheduler` job** (no extra library; Android may delay it).
  - **Always** at app start, on resume and after each print.
- **Same rule everywhere.** Pending intakes follow the same retention.
- **Extra cleanup:** orphan folders and stale `work/` and `.part` files are removed.
- **Storage cap: 1.5 GB.** Above it, the oldest *finished* jobs go first.
- **Delete all customer files now** is available, with confirmation.
- **The WebView cache is cleared** whenever jobs are deleted.

**Backup safety**
- **The job folder is never backed up.** `noBackupFilesDir` is never backed up, and unlike `cacheDir` Android never deletes it automatically.
- **Settings and preferences are excluded too,** via `allowBackup="false"` + `fullBackupContent` excluding everything.
- **Phone-to-phone transfer is blocked as well** (Android 12+), via `dataExtractionRules` excluding every domain in both `<cloud-backup>` and `<device-transfer>`.

**Privacy versus reliability.**
- **Kept until retention:** originals, for *Print again* and crash recovery.
- **Deleted straight after printing:** generated files, which may contain decrypted content.

---

## F. Image processing architecture & memory strategy (all inside the engine)

**F1. One coordinate convention.**
- **Order:** EXIF-upright → user quarter-turns → crop → style → resample.
- **Crop rectangles** are normalised (0–1) in the turned, upright space. So the same numbers work at 320 px, 512 px, 1280 px and 100 MP.

**F2. Decoding, memory-safe and trap-free**
- **Headers before pixels.** Size, type and EXIF are read first, with no pixel allocation.
- **Decode to the size needed:** the placement size at 300 dpi (full A4 ≈ 8.7 MP; a passport photo is 413 × 531 px).
  - Android 9+: `ImageDecoder.setTargetSize`.
  - Older phones: `BitmapFactory` `inSampleSize`.
  - Tight crops of huge photos: `BitmapRegionDecoder`, which supports JPEG and PNG, plus WebP and HEIF from Android 12.
- **Budgets.**
  - Android 8+: pixels live in native memory; budget by RAM (2 GB → 16 MP, 3 GB → 24 MP, ≥ 4 GB → 40 MP), halved on low-RAM phones.
  - **Android 7: pixels live in the Java heap,** so the budget comes from `memoryClass` (≤ ¼ of it per decode).
  - Budgets count **2×** the target, because a scaled or rotated decode briefly holds two bitmaps.
- **Decoder rules** (each has a test file):
  - `ImageDecoder` uses `ALLOCATOR_SOFTWARE` (its default hardware bitmaps can't be read) and `setTargetColorSpace(sRGB)` (iPhone P3 photos).
  - 16-bit PNG is reduced to 8-bit.
  - **EXIF is applied exactly once.** `ImageDecoder` applies it itself; `BitmapFactory` and `BitmapRegionDecoder` don't, so the engine rotates explicitly on those paths and maps region crops back to the stored orientation.
  - **Truncated files are detected** (`OnPartialImageListener`, or a missing JPEG end marker on old phones). They get the "damaged" message instead of printing a half-grey photo.
  - PDF pages are rendered onto a **white-filled** bitmap, so pages never come out black.
  - **One PdfRenderer per document, on one thread.**
- **Guards.** Refuse > 200 MP or any side > 30,000 px. Transparent images composite onto white. GIF / animated WebP use the first frame. HEIC on Android 8+, AVIF on Android 12+, otherwise a friendly message.
- **Concurrency.** One heavy task at a time; work runs in strips of ~256 rows. The engine unbinds when idle, and caches drop on `onTrimMemory`.

**F3. Images produced** (all files, all regenerable, all shown in the WebView by path)

| Image | Size | Used for |
|---|---|---|
| Grid thumbnail | ≤ 320 px, lazy-loaded | Photo lists (up to 100 items) |
| Preview thumbnail | ≤ 1280 px, JPEG q80 | Crop screens, mini layout previews |
| Analysis bytes | ≤ 512 px, **raw 8-bit grey** (tiny header + bytes, no PNG) | Smart-crop detector |
| Style samples | ≤ 360 px, made when the style screen opens | Print-style picker |
| PDF page thumbnail | ≤ 900 px | Pages-to-print screen |
| Placement image | Exact pixels at 300 dpi | `print.pdf` |

**F4. Print styles: exact algorithms.** Pure functions over plain integer/byte arrays, so they are testable on the JVM. Documented in `docs/print-styles.md`.

| Style | Group | Algorithm |
|---|---|---|
| **Original** | Colour | No colour change |
| **Vibrant** | Colour | Luma-preserving saturation × 1.25, contrast × 1.08 about mid-grey, clamp |
| **Soft Tone** | Colour | Contrast × 0.90, brightness + 6, saturation × 0.92 |
| **Black & White** | B&W | Y = 0.299R + 0.587G + 0.114B (Rec.601) |
| **Sharp Black** | B&W | Grey → auto-levels (black = 5th percentile ≤ 90, white = 90th percentile ≥ 160) → stretch → gamma 0.85 |
| **OCV Black** | B&W | Grey → background flattening (divide by a blurred 1/8-scale background) → adaptive threshold (Bradley–Roth: black if value < local mean × 0.85, window ≈ 1/16 of the shorter side, or value < 80) → 1-bit. Local means are computed **per strip with overlap** (no full-page sum table, no 32-bit overflow). Name and constants are configuration |

- **Coupling.** Picking a style sets the matching colour mode; the **Colour / Black & white** setting is the familiar shortcut.
- **Non-destructive.** Styles are applied only while rendering.
- **No sliders in V1.**
- **Delivery.** Plain *Black & White* ships in Phase 4; the other five in Phase 8.

**F5. Smart auto-crop**
- **When.** Runs in a Web Worker on the raw grey analysis bytes during *Preparing*, for every image.
- **One question per job, never per photo:** *"7 photos have black edges. [Remove black edges] [Keep as they are]."* Per-photo review lives in *Photo tools → Crop*.
- **Rules.**
  - Scan inward from each edge. A line is border if it is uniform (standard deviation < 8), within ± 12 of the edge reference colour, and either dark (< 45) or blank-white (> 225). Stop after 2 non-border lines.
  - Suggest only when confidence ≥ 0.9: removes ≥ 4 %, keeps ≥ 30 %, sharp boundary step, kept area not uniform.
  - White-edge cropping applies to documents and screenshots only, never photos.
  - Snap inward ≤ 0.5 %.
- **Never applied without consent.**
- **Metrics:**
  - Precision ≥ 98 % on suggestions.
  - **Recall ≥ 90 %** on a labelled "clearly croppable" set (uniform bars ≥ 4 % of the area).
  - ≤ 2 % suggestions on negatives (dark photos, night scenes, black backgrounds).
- **V1 scope, stated honestly.**
  - Covered: uniform black or blank borders (screenshots, letterbox bars, scan margins).
  - Not covered in V1: a document photographed on a table (uneven background). Manual crop handles it; paper-rectangle detection and straightening are Phase 2.

**F6. Big jobs and edge cases**
- **More than 100 files are refused:** *"Too many files at once (120). Please share up to 100 at a time."* That is safer than guessing which 100.
- **Big-job mode** (> 30 images or > 150 MP total): groups of 10, progress, working Cancel.
- **PDFs over 300 pages:** a notice, and the app opens on *Pages to print*.
- **Duplicates** get the banner (*Keep both* is the default).
- **Blurry-risk thresholds, calibrated on real prints:** photos < 100 dpi, documents < 120 dpi, passport < 200 dpi. A 1600 px WhatsApp photo on full A4 is ≈ 147 dpi, prints acceptably, and must not warn.

---

## G. PDF & print architecture

**G0. Layout engine** (pure TS, deterministic, property-tested)
- **Inputs:**
  - Photo shapes after crop and turn.
  - Paper (A4 or the calibrated 4×6-class size).
  - Edge space: 6 mm A4 / 4 mm 4×6, adjusted to the printer's measured margins.
  - Gap: 3 mm (2 mm for passport).
  - Mode.
- **Candidates,** each tried upright and sideways:
  - Uniform grids (last row centred).
  - Order-keeping **row layouts** (rows of similar width, each scaled to full width; dynamic programming).
- **Scoring:** maximise the smallest photo, then paper use; prefer a grid within 8 %; prefer upright within 3 %. Example: 2 portraits fit best side by side on a sideways A4.
- **Pages:**
  - **Best** = the fewest pages where every photo's shortest side is ≥ 40 mm.
  - **N pages** = balanced in-order groups using one shared arrangement.
  - **All on one page** warns below 25 mm.
  - **One per page** = the largest uncut fit, page direction per photo.
- **Passport.** Slots per sheet are **computed** from the calibrated paper and measured margins: 6 at 4 mm edges, 8 at ≤ 3 mm on 4×6, 30 on A4. Slots fill in reading order; sheets = ⌈photos ÷ slots⌉; cut lines run along the gaps.
- **Remembered choices.** The last paper and colour used per job type become that type's default. They always show in the summary, never hidden.

**G1. PrintPlan contract** (versioned; TS type + Kotlin data class; validated on both sides)

```ts
type PrintPlan = {
  v: 1; jobId: string; rev: number;                              // rev = manifest revision it was built from
  paper: { id: 'A4' | 'PHOTO_4x6'; wPt: number; hPt: number };  // registry → more sizes later
  colour: 'colour' | 'bw'; copies: number; contentType: 'photo' | 'document';
  pages: Array<{
    orientation: 'portrait' | 'landscape';                       // layout space; PDF page is always portrait
    placements: Array<{
      itemId: string; pdfPage?: number;
      crop: { x: number; y: number; w: number; h: number };      // normalised 0..1, upright + turned space
      turns: 0 | 1 | 2 | 3; style: StyleId;
      box: { x: number; y: number; w: number; h: number };       // points, top-left origin
    }>;
    guides?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  }>;
};
// planHash = hash of the canonical plan JSON → names out/<planHash>/ and tags every result
```

**G2. Rendering in the engine**
- Each unique (item, page, crop, turns, style, size) is decoded and encoded **once**; repeats and copies reuse it.
- **Encodings:**
  - **Colour:** JPEG q92, sRGB.
  - **Grey, text-like pages:** 8-bit DeviceGray Flate **with PNG predictors** (keeps scans small).
  - **Grey, photo-like pages:** *neutral-chroma* JPEG, encoded via `YuvImage` with constant chroma, so every decoded pixel has **R = G = B exactly**. *(Implemented as exact-grey RGB through the normal JPEG encoder, because `YuvImage` tinted edge blocks: ADR-005.)*
  - **OCV Black:** 1-bit DeviceGray Flate (rows padded to whole bytes; 0 = black).
- **Per-page size budgets** are in P.

**G3. PDF writer: ADR-001, decided in Phase 0 spike (g)**
- **Candidates:** platform `android.graphics.pdf.PdfDocument` vs our ≈ 300-line writer (images + cut lines only, no fonts, no text).
- **Measured on:**
  - File size (6-photo A4; 10-page grey scan).
  - Exact page size (PdfDocument takes integer points).
  - Grey and 1-bit support; image reuse for copies.
  - Memory, determinism, print-service compatibility, maintenance.
- **Decision rule:** prefer the platform unless it misses a hard requirement: exact physical size, grey-only data, or spool size within budget.
- **If the custom writer wins, it gets:**
  - Independent parsers: `qpdf --check`, pdf.js, PDFium via PdfRenderer.
  - Property and fuzz tests: random plans → valid PDFs.
  - Boundaries: 1×1 px image, 500 pages, huge dimensions; zero placements rejected.
  - Writing to `print.pdf.part` then atomic rename, so cancel or process death never leaves a half file.
  - A re-open check after writing (page count must match).
  - Print tests on Brother, Mopria, the Default service and Save-as-PDF.
- **Either way.** Writing happens in the app process, but it never parses customer content: it only frames engine-made image streams.

**G4. Documents: two paths, chosen automatically**
- **Exact path.** A single **unlocked** PDF with Original style, all pages, **Colour** and 1 copy prints the customer's own file untouched: vector-sharp and instant. Its pages may be landscape or rotated; the preview shows them as the PDF defines.
- **Processed path.** Everything else, including **every Black & white job**, so grey-only output is guaranteed.
  - Each page is rendered at 300 dpi (`RENDER_MODE_FOR_PRINT`) onto white, fitted to A4, turned if sideways, then styled.
  - Honest trade-off: slightly less crisp than vector text on a 600 dpi laser.
- **Known limit on older phones.** Android's PDF engine before Android 15 (or before the SDK-extension update) **does not draw form fields, stamps or annotations**. On those phones, PDFs containing them (best-effort byte scan for `/AcroForm` and `/Annots`) get a banner: *"This PDF has filled-in boxes or stamps that may not show — check the preview."* ADR-002 can remove this limit with a bundled PDF engine if the shopkeeper's phone needs it.

**G5. Locked PDFs (V1 must-have) — ADR-002**
- **Empty password first.** PDFs with only an owner password (common for bank and government files) open normally. *Unlock PDF* appears only on a real password error.
- **Native unlock tiers** (corrected):

| Phone | Engine | Extra size |
|---|---|---|
| Android 15+ (API 35+) | `PdfRenderer(fd, LoadParams.setPassword(..))`, updated through Play system updates | 0 |
| Android 11–14 (API 30–34) **with** SDK extension S ≥ 13 | `PdfRendererPreV` with password | 0 |
| Anything else | No native unlock → see below | — |

- **Phones without native unlock,** decided with the shopkeeper's phone facts in Phase 0:
  - **If the shopkeeper's phone has native unlock,** no fallback is built in V1 (YAGNI). Other phones say: *"This phone can't open locked PDFs. Ask the customer for an unlocked PDF."*
  - **Otherwise the spike picks between two options:**
    - **(i) `@cantoo/pdf-lib` in the WebView decrypts the file.** This is **the one documented bridge exception**:
      - The decrypted PDF (≤ 20 MB) goes once, in 256 KB chunks, to the app process.
      - It is written to `work/unlocked.pdf.part`, renamed, rendered by the engine, and deleted after printing.
      - Tested: size cap, chunk failure, process death mid-transfer, wrong password, unsupported encryption.
    - **(ii) A bundled, maintained PDFium wrapper inside the engine.** Unlock and annotations work on every phone, with no bridge exception, at +3–8 MB APK plus a duty to apply security updates.
- **Privacy.** The password stays in memory only. Decrypted data lives in `work/` and `out/` and is deleted after printing. The Unlock screen is in J5.

**G6. Printer independence.** `interface PrintTarget { print(req): Promise<PrintOutcome> }`. V1 ships `AndroidSystemPrint` (any printer Android can reach); a direct Brother SDK adapter can be added later without touching layout or rendering.

**G7. WYSIWYG guarantees**
1. **Same geometry.** Preview and print come from the same plan.
2. **Same pixel code.**
3. **The real file is previewed.**
4. **Fixed page and colour.** Page size and direction are fixed in the PDF; B&W data is grey.
5. **Paper guard** without dead ends.
6. **Sideways pages look normal.** They are *displayed* upright with a "Sideways page" badge; the file itself is unchanged.
7. **Tested.** Automated preview-vs-file comparison + ruler tests.

---

## H. Senior-citizen UX strategy (UI-UX-PRO-MAX; the shopkeeper's real usage overrides aesthetics)

**H1. Design system.** Produced with UI-UX-PRO-MAX (variance 2 / motion 2 / density 2) and adapted. Its landing-page "conversion" pattern was dropped.
- **Style.** Minimalism & Swiss: spacious, high contrast, functional. Avoid small text, complex navigation and gradients.
- **Light theme only**, so paper previews look like paper.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--text` | `#0F172A` | All text | 17.9 : 1 |
| `--text-muted` | `#475569` | Helper lines | 7.6 : 1 |
| `--bg` / `--surface` | `#F8FAFC` / `#FFFFFF` | Background / cards | — |
| `--primary` | `#075985` | Main buttons (white label), focus ring | 7.6 : 1 |
| `--print` | `#166534` | **PRINT** button only | 7.1 : 1 |
| `--warn-bg` / `--warn-text` | `#FEF3C7` / `#78350F` | Load-paper and warning panels (+ icon) | 8.2 : 1 |
| `--error-bg` / `--error-text` | `#FEF2F2` / `#991B1B` | Problem panels (+ icon) | 7.6 : 1 |
| `--border` | `#64748B` | Outlines, inputs | 4.8 : 1 |
| `--desk` | `#475569` | Behind paper previews | 7.6 : 1 |

- **Type.** Atkinson Hyperlegible Next, bundled.
  - Body 20 px (minimum 18 px, never below 16 px); buttons 22 px bold; titles 28 px bold.
  - Line height 1.4–1.5; all sizes in `rem`.
- **Icons.** Phosphor, bold, 28–32 px, **always with a text label**.
- **Touch targets, one rule:**
  - Anything the shopkeeper presses ≥ 56 dp; primary buttons 64–72 dp; choice tiles ≥ 88 dp.
  - Crop handles are 48 dp to see and 64 dp to touch.
  - Only Advanced-settings controls may be 48 dp.
  - Gaps 12–16 dp, 16 dp side gutter, 8 dp grid.
- **Motion.** 150–200 ms fades, pressed feedback within 100 ms. No carousels, auto-advance or decoration; reduced motion respected.

**H2. Interaction rules** (UI-UX-PRO-MAX rule names in brackets)
0. **Simple path first, customisation second.** Defaults decide. The main screen shows the paper and **one** primary action. Every option shows its current value compactly behind one big **Change** [`primary-action`, `progressive-disclosure`].
1. **One question per screen,** worded like the customer's request.
2. **The same top bar everywhere:** **‹ Back** · title · **Home**. Android Back = in-app Back [`back-behavior`, `escape-routes`].
3. **Bottom action bar** above the gesture area; content is padded so it never hides behind it [`fixed-element-offset`, `safe-area-awareness`]. In landscape, the action bar moves to the side.
4. **No hidden gestures.** No swipe-to-delete, long-press or swipe-only paging. Pinch-zoom is an extra; **Zoom / Previous page / Next page** buttons always exist [`gesture-alternative`, `dragging-alternative`].
5. **Crop without precision:** handles plus **Move ↑ ↓ ← →, Bigger, Smaller, Reset** [`no-precision-required`].
6. **Errors are panels in place, never toasts:** icon + *what happened* + *what to do* + button + `role="alert"` [`error-clarity`, `error-recovery`].
7. **Progress always has words:** *"Preparing 3 of 6 photos…"* + bar + **Cancel** [`loading-states`].
8. **Confirm only destructive actions.** Back and Home never lose work [`confirmation-dialogs`, `form-autosave`].
9. **Removals can be undone** with an inline banner [`undo-support`].
10. **No modals for navigation** [`modal-vs-navigation`].
11. **Colour is never the only signal:** ✓ icon + thick border + the word *Selected* [`color-not-only`].
12. **Plain English** (reading age 8–9). A **jargon lint** fails the build on *DPI, resolution, margin, MIME, format, aspect, render, EXIF, pixel, orientation*.

| Never say | Say instead |
|---|---|
| Unsupported MIME type | "This file can't be printed yet. Ask the customer to send it as a PDF or photo." |
| Low resolution | "This photo is small — it may print blurry." |
| Landscape orientation | "Sideways page" (with icon) |
| Filter | "Print style" |
| Grayscale | "Black & white" |
| Rendering | "Preparing pages…" |
| Margins | Never shown. Advanced: "Space at paper edges" |
| Auto | "Best" |

**H3. Home**
- **Three big tiles:**
  - **Photos**
  - **Passport photos**
  - **Documents & PDF**

  Each says *"Choose from phone"* underneath.
- **A permanent hint card:** *"Customer sent files on WhatsApp? Select them → tap Share → choose PrintSaathi"*, with a 3-step picture.
- **Continue last job** card, only when an unfinished job exists.
- **Recent jobs** button.
- **"For the shop owner"** (small, at the bottom): Settings, Help, Print test page.

**H4. "Could the shopkeeper do this alone?" gate.** Every screen must pass these checks before merge:
1. Is there exactly one obvious next button?
2. Does the title tell them what the screen is for?
3. Is there any word they wouldn't use at the counter?
4. Does it still work at 200 % text on the smallest phone?
5. If they tap the wrong thing, can they get back without losing anything?

The shopkeeper also does short task sessions at each milestone.

**H5. Language check (Phase 0).** Show the shopkeeper three paper mock-ups in English and in Marathi/Hindi. If they hesitate with English, their language ships in V1. The string catalogue and the phone's Devanagari font are already planned, so this costs translation only.

---

## I. Screen map

| # | Screen | What it is for | Primary button |
|---|---|---|---|
| 1 | **Home** | 3 tiles, WhatsApp hint, Continue card (conditional), Recent jobs, "For the shop owner" | — |
| 2 | **Received — "What did the customer ask?"** | Count + thumbnails + big choices. **Photos:** All on one page · One on each page · Use more pages · Passport photos (1–4 photos) · Print as document. **Any PDF or a mix:** this screen is skipped | (the choice) |
| 3 | **Black edges?** (only when found) | *"7 photos have black edges"* with a before/after example | Remove black edges / Keep as they are |
| 4 | **Working** | Progress with words, Cancel | Cancel |
| 5 | **Ready to print — "This is how it will print"** | **Real print-file preview** (big Previous/Next page buttons) + summary line (*"7 photos · 1 page · A4 · Colour · 1 copy"*) + **Change** + panels (load paper, tiny photos, blurry, locked-PDF note, annotation banner) | **PRINT** / **PAPER LOADED — PRINT** |
| 6 | **Change** | Big rows showing current values: Layout · Pages · Paper · Colour · Copies · Print style · Photos (or Pages to print). Each row opens one decision | Done |
| 7 | **One-decision setting screens** | Layout (with mini previews) · Pages (Best · 1 · 2 · 3 · More, with mini previews) · Paper (A4 / 4×6 pictures) · Colour · Copies (big −/+) · Print style (6 labelled thumbnails; applies to the whole job) · Pages to print (tick grid) · Photos (numbered strip; tap → tools) | (tap = choose) |
| 8 | **Photo tools** | Crop · Turn · Move earlier · Move later · Remove (with Undo); also for files in document jobs | Done |
| 9 | **Crop** | Manual crop (handles + nudge buttons) or *Original \| Cropped* review | Apply / Use cropped / Keep original |
| 10 | **Which photo?** | Passport mode when several photos arrived | (tap photo) |
| 11 | **Passport crop** | Fixed 35 × 45 frame, face-oval guide, Move / Bigger / Smaller / Reset | Next |
| 12 | **Unlock PDF** | e-Aadhaar helper (4 letters + birth year) or *Other password*; hint text | Unlock |
| 13 | **Print result** | Sent ✓ / Still printing / Saved as file / Cancelled / Interrupted / Failed, each with help. *"Did it print correctly?"* | Yes, done / Print again |
| 14 | **Recent jobs** | Big rows: thumbnail, what, when, printed or not | Open / Print again |
| 15 | **Settings** (for the shop owner) | Shop name, passport preset/count/price table, paper and colour defaults, photo-paper reminder, retention, Delete all, Print test page, Allow screenshots (15 min), Send problem report, *Advanced* | — |
| 16 | **Help & first-run** | Share from WhatsApp · pin in share sheet · pick printer + test page · "don't change anything on the print screen" · WhatsApp media visibility | Next / Done |
| 17 | **New files arrived** | Start new job · Add to this job · Keep working (new files saved to Recent) | (choice) |
| 18 | **Problem** | Full-screen explanations: nothing printable, storage full, file too big, safe start after crashes, no print service | (next step) |
| 19 | **Update WebView** (native) | Shown when the phone's WebView is too old | Open Play Store |

---

## J. User flows

**Tap rule.** Taps are counted inside PrintSaathi from the first tap after Share up to and including PRINT. Android's own print button is counted separately; the after-print question isn't counted.

**J0. Starting from Home (files already on the phone)**
- **Photos** ① → Photo Picker (select, **Add** ②) → *Received* → choice ③ → *Ready* → **PRINT** ④.
- **Passport photos** ① → Photo Picker (one photo ②) → *Passport crop* → **Next** ③ → *Ready* → **PAPER LOADED — PRINT** ④.
- **Documents & PDF** ① → document picker (**Open** ②) → *Ready* (PDFs), or *Received* (photos of documents) → **PRINT** ③.

**J1. Photos on one page.** *"7 photos, all on one page, colour."*
1. Share 7 photos.
2. *Received:* **All on one page** ①.
3. *(Black edges? — only if found.)*
4. *Working:* "Preparing your page…"
5. *Ready:* real A4 preview + *"7 photos · 1 page · A4 · Colour · 1 copy"*.
6. **PRINT** ②.
7. Android's print button.
8. *"Did it print correctly?"*

If photos would be tiny (< 25 mm), *Ready* shows: *"Photos will be very small (about 2 cm)."* **[Use 2 pages] [Keep 1 page]**.

**J2. Photos over more pages.**
- **Flow:** *Received* → **Use more pages** ① → *Ready* (Best, e.g. "2 pages") → **PRINT** ②.
- **"Exactly 3 pages":** **Change** → **Pages** → **3** → **PRINT** (4 taps).
- **How photos are shared out:** order kept, balanced counts, the same arrangement on every page.

**J3. One photo per page.** *Received* → **One on each page** ① → *Ready* (N pages) → **PRINT** ②. Each photo is the largest uncut fit, on a sideways page if needed.

**J4. Passport photos.** *"5 passport photos."*
1. Share 1 portrait.
2. **Passport photos** ①.
3. *Passport crop:* the frame starts centred; the shopkeeper adjusts only if needed.
4. **Next** ②.
5. *Ready:* *"5 passport photos · 4×6 glossy · Colour · 1 sheet · Charge ₹50"* + yellow panel *"Put 4×6 glossy photo paper in the printer."*
6. **PAPER LOADED — PRINT** ③. This is your *"Paper Loaded — Continue"* step merged into the print button, so it costs no extra tap.
7. Android's print button.

Variants:
- Another count: **Change → How many photos?** (4 · 5 · 6 · 8 · −/+). The price shows only if that count is set in Settings.
- Crop too small → blurry notice.
- 10 photos → "2 sheets".

**J5. Documents and PDFs.**
- **Normal PDF:** Share → *Working* → *Ready* (*"1 PDF · 4 pages · A4 · Black & white · 1 copy"*) → **PRINT** ①.
- **Some pages only:** **Change → Pages to print** → untick → **Done** → **PRINT**.
- **Locked PDF:** *Unlock PDF* first.
  - The **e-Aadhaar helper** has two big fields: *"First 4 letters of the name"* (the app makes them CAPITALS) and *"Year of birth"* (number pad). It builds the password (e.g. RAMA1965). **Other password** opens one field.
  - Keyboard suggestions, autocorrect and autofill are off. "Show" displays the typed text in large letters *below* the field rather than turning the field into plain text, so the keyboard never learns it.
  - Wrong password: *"That password didn't work. Check the letters and the year and try again."*
  - After an app restart the password is asked again (it is never stored).

**J6. Crop: a document photo with black edges.**
- **Normal path:** *Received* → **Print as document** ① → *Black edges?* → **Remove black edges** ② → *Ready* (Black & white) → **PRINT** ③.
- **With Sharp Black:** + **Change → Print style → Sharp Black** (6 taps; customisation beyond the normal path).
- **Manual crop:** **Change → Photos →** pick a photo **→ Crop** → handles/nudges → **Apply**. The original file never changes.

**J7. Print styles.** **Change → Print style** → 6 big samples (made by the real print code from the first photo/page; the style applies to the whole job) → tap one → *Ready* re-prepares → **PRINT**.

**J8. Failure handling** (no silent loss; no silent difference from the preview)

| Situation | How we know | What the shopkeeper sees | Next |
|---|---|---|---|
| Printer off / unreachable, or phone on mobile data | Android reports it; job blocked/failed | "The printer didn't take the job." + checklist (printer ON · shop Wi-Fi · paper · ink) | **Try again** |
| Paper not loaded / Brother panel shows "paper mismatch" | Job blocked, or the shopkeeper answers *No* | "Printer needs attention — check the paper and the printer screen." | **Print again** |
| Cancelled | Dialog closed / job cancelled | "Printing was cancelled. Nothing was printed." | **Try again** / Back |
| Wrong paper in Android's screen | Preview shows our warning page; final layout fails | Warning page inside Android's preview, then our result screen | Fix paper / **PRINT** again |
| Saved as PDF instead of printed | Job's printer = built-in "Save as PDF" | "This was saved as a file, not printed. Choose the shop printer at the top." | **Print again** |
| Printing interrupted (app killed, or new share during dialog) | Persisted in-flight record | "Printing was interrupted. Tap PRINT again." | **PRINT** |
| No print service (Android 7, or plugin disabled) | Only "Save as PDF" offered | Help screen: ask the owner to install/enable the Brother plugin | — |
| Damaged or truncated photo | Engine decode error / partial image | "Photo 3 is damaged. Ask the customer to send it again." | Others continue |
| File crashes the engine | Engine died; crash marker | Same "damaged" message; file skipped from then on | Others continue |
| Damaged PDF | Engine open error | "This PDF is damaged. Ask the customer to send it again." | Others continue |
| Locked PDF (real open password) | Empty-password open fails with a password error | *Unlock PDF* | Unlock / Skip file |
| Owner-password-only PDF | Opens with an empty password | Nothing special; prints normally | — |
| PDF with forms or stamps on an old phone | Byte scan | Banner: "may not show — check the preview" | Continue |
| Word / Excel / PowerPoint / video / audio / contact | Type sniffing | "This is a Word file. PrintSaathi can't print Word files yet. Ask the customer to send it as a PDF." | OK |
| Low storage / disk fills mid-copy | Free-space checks while streaming | "Phone storage is full. Delete old WhatsApp videos, then try again." + **Delete old PrintSaathi jobs** | Retry |
| Hostile or broken sharing app (lies about size, stalls, endless stream) | Caps, timeouts, `.part` | "Couldn't receive this file. Please share it again." | Share again |
| File over 200 MB | Streaming cap | "This file is too big to print." | — |
| More than 100 files | Count | "Too many files at once. Please share up to 100 at a time." | Share fewer |
| Very large job | Thresholds | "Big print job — preparing in small groups." | Automatic |
| Odd EXIF rotation | Handled once, explicitly | Photo appears upright | **Turn** always available |
| App killed mid-way | Manifest + journal + markers | Same screen (< 30 min) or Continue card | Continue |
| Repeated crashes | Crash-loop breaker | Safe start: Home + Problem panel | Continue manually |
| Share permission expired | `SecurityException` | "Couldn't open this file. Please share it again from WhatsApp." | Share again |
| Print tapped twice | Button disabled + native guard | Nothing extra prints | — |
| Back while processing | Cancel token | Stops, returns, nothing lost | — |
| Duplicate photos | Same hash | **Remove extra copy / Keep both** | Choose |
| Mixed PDFs + photos | Content check | All printed as pages in received order (reorderable); photo-sheet choices explain they need photos only | Continue |
| Unexpected order | Numbers on thumbnails | **Move earlier / later** | Reorder |
| New share while a job is open | Intake event | *New files arrived* | Choose |
| WebView crash | `onRenderProcessGone` | Reloads into the same job (after any print finishes) | — |
| Old WebView | Native version check | *Update WebView* screen | Play Store |
| Print looks wrong | The shopkeeper taps **No** | Likely causes + **Print again** + **Send problem report** | — |

---

## K. MVP scope (V1.0)

1. **Intake.**
   - Share (one, many, mixed; incl. `application/octet-stream`) + **Choose from phone**.
   - **Hardened copy:** caps, timeouts, `.part`, journal.
   - Type sniffing, duplicate banner, ≤ 100 files, guidance for unsupported files.
2. **Isolated engine.** Every customer file is parsed in an `isolatedProcess`. Poison-file markers + crash-loop breaker.
3. **Photos.**
   - All on one page · One on each page · Use more pages (Best/N).
   - A4 + calibrated 4×6; Colour/B&W; copies.
   - Photo tools (turn, crop, reorder, remove + undo).
   - Blurry and tiny-photo notices.
4. **Passport.**
   - Presets 35 × 45 (default), 20 × 25, 2 × 2 in.
   - Fixed-frame crop with oval guide and nudges.
   - Default 5 photos (quick 4/5/6/8); computed slots per sheet; cut lines.
   - Load-paper reminder; a configurable price table (only *5 = ₹50* preset).
5. **Documents.**
   - Exact + processed paths; page selection; reorder; turn; Colour/B&W; copies; mixed jobs.
   - **Locked PDFs** (ADR-002), empty-password first, e-Aadhaar helper.
6. **Print styles.** All six, with real samples.
7. **Smart auto-crop** (uniform borders, one batch question) + manual crop.
8. **Ready to print.**
   - Real-file preview + summary + **Change**.
   - Paper calibration + no-dead-end paper guard; Save-as-PDF detection.
   - Persisted print status; result screen.
9. **Job safety.**
   - Revision-checked single writer; stale-result rejection.
   - Continue / Recent / Print again; restore policy; *New files arrived*.
10. **Privacy.**
    - No `INTERNET` in release builds; no backups; Recents thumbnail hidden.
    - Auto-deletion (JobScheduler + on open); Delete all.
    - No analytics; **Send problem report** (text via the share sheet, no customer data).
11. **Accessibility.**
    - TalkBack, text to 200 % (app-controlled), AAA text contrast, ≥ 56 dp targets.
    - English + string catalogue; the shopkeeper's language if the Phase 0 check says so.
12. **Setup and help.** First-run help, share-sheet pin, printer check, test page (calibrates paper and margins).

## L. Phase 2 (after V1 is in daily use; ordered by shop value)

1. **Internal black dividers in screenshots.** Only full-width, perfectly uniform bands; preview + undo.
2. **ID card copy.** Front + back at real card size (85.6 × 54 mm) on one A4.
3. **Document photo on a table:** paper-rectangle detection + manual 4-corner straightening.
4. **Face-assisted passport framing** with built-in `android.media.FaceDetector` (offline, no metrics).
5. **Different people on one passport sheet.**
6. **Black & white "fast path"** (customer PDF untouched + printer mono mode), if measured job times hurt and grey-only output may be relaxed.
7. **Vector path for copies and page selection** (`@cantoo/pdf-lib`), if 300 dpi text disappoints.
8. **Both-sides printing.**
9. **Optional voice guidance** (Android text-to-speech, offline).
10. **Hindi / Marathi / Konkani**, unless already in V1 via H5.
11. **Office files, approximate preview, clearly labelled.** DOCX via `docx-preview` (no true pagination); XLSX via SheetJS CE from its CDN (npm `xlsx` is frozen with CVEs). Plus "open in another app". Only after a fidelity test on 30 real files.
12. **Borderless 4×6** once verified on the Brother.
13. **Price helper** (₹ per page/photo).
14. **Screenshot status/navigation-bar removal.**
15. **Android sharing shortcut** (PrintSaathi in the share sheet's top row).

## M. Future (only if real demand appears)

- **Office → PDF.**
  - Optional **Gotenberg** (MIT; LibreOffice image ≈ 422 MB; 0.5–1 GB RAM) on a shop PC or small server. Opt-in per job, with consent, because the file leaves the phone.
  - Or a paid on-device SDK (Apryse, custom pricing ≈ $1.5 k+).
  - Ruled out: MuPDF (AGPL, layout not preserved), LibreOffice/Collabora (≈ 70 MB, no SDK), ZetaOffice WASM (≈ 47 MB, no mobile).
- **Direct Brother SDK adapter** behind `PrintTarget`: paper type, tray, ink.
- **Optional AI helpers,** never required: document-edge model, style suggestion, passport background whitening only with explicit consent.
- Settings export for a second phone; Play Store distribution.

## N. What should NOT be built yet

- Office rendering in V1.
- Any server, cloud, database, accounts, login, RBAC or sync.
- Analytics, crash SaaS or remote config.
- Direct printer protocols.
- A free-form layout editor.
- Beautification or background removal.
- Per-photo styles.
- Dark theme; tablet layouts.
- Background services (beyond the one cleanup job).
- iOS; in-app camera scanning; saving outputs to Gallery or Downloads.

---

## O. Risks & trade-offs (honest)

| # | Risk | Impact | Mitigation | What remains |
|---|---|---|---|---|
| 1 | **Android's print screen is outside our control** (first-time "Save as PDF", copies field, no API for glossy or borderless) | High | Setup test page picks the printer; paper calibration; no-dead-end guard; Save-as-PDF detection; copies built into the file; coaching line | Glossy quality depends on the service and printer |
| 2 | **Print service changes physical size** (fit-to-page for multi-page, borderless enlargement for `PHOTO`) | **High for passport** | `DOCUMENT` for passport; Phase 0 ruler tests (1 vs 2 pages, PHOTO vs DOCUMENT); single-page parts if needed; last resort: calibration factor | Depends on the shop's service |
| 3 | **4×6 paper not preselected** (exact mils matching) | Medium | Calibrate the exact size from the test page; accept 4×6-class ± 3 mm; A4 fallback | — |
| 4 | **Paper-guard behaviour differs** on brand print dialogs (preview flag) | Medium | Spike on the shopkeeper's phone; fall back to fail-plus-explain | — |
| 5 | **The shopkeeper's phone unknown** | Medium | Phase 0 device facts; budgets adapt; tiers and fallbacks | Old phones are slower |
| 6 | **Isolated engine adds complexity** (AIDL, file descriptors, rebinding) | Medium | One small module with a clear contract; spike (f); a plain separate process as fallback | ≈ 500 more lines to maintain |
| 7 | Two languages (TS + Kotlin) for a solo maintainer | Medium | PrintPlan contract; tests on both sides; ADRs | Kotlin skills needed |
| 8 | Preview ≠ print | High | Single geometry and pixel code; real-file preview; automated comparisons; ruler | Printer-side quirks |
| 9 | **Older Android PDF engines drop form fields and stamps** | Medium | Banner + preview check; ADR-002 option (ii) removes it | Detection is best effort |
| 10 | Locked PDFs on old phones | Medium | Native tiers; ADR-002 fallback; real e-Aadhaar spike | Exotic encryption → friendly message |
| 11 | Sideloading rules (developer verification) | Medium | See below | — |
| 12 | Auto-crop false positives/negatives | Medium | Precision + recall + FP gates; one question; never auto-applied | — |
| 13 | "Best layout" is taste | Medium | Deterministic scoring reviewed by you; easy **Change** | — |
| 14 | Passport rules (head size, background) not validated | Medium | Oval guide; exact size; no beautification | Rejections for other reasons |
| 15 | Out of memory on low-end phones (incl. Android 7 heap) | High | Engine isolation; heap-aware budgets; sequential work; big-job mode; 2 GB API 24 profile | — |
| 16 | English-only V1 may confuse the shopkeeper | Medium | H5 language check in Phase 0 | — |
| 17 | Platform churn (Capacitor 9, target-SDK bumps) | Low | Exact pins; minimal plugins; regression suite | — |
| 18 | Real WhatsApp shares can't be fully automated | Medium | UiAutomator + test provider in device suites; manual WhatsApp checklist each milestone | — |
| 19 | Unlocked shop phone exposes files during retention | Low | 1-day default; Delete all; Recents hidden; screen lock advised | — |
| 20 | Scope vs one maintainer | Medium | Walking skeleton (A0); milestones; strict "not yet" list; estimates | — |

**Risk 11 in detail: sideloading.**
- Google's developer verification became mandatory on 30 Sep 2026 only for Brazil, Indonesia, Singapore and Thailand. Global rollout is "2027 and beyond", with **no India date**.
- **ADB installs are exempt.** A phone can also allow unverified apps via a one-time "advanced flow".
- A free limited-distribution account (≤ 20 devices) is meant for non-commercial apps; a full account costs $25.
- **Plan:** install by ADB from your PC (₹0), keep the signing key backed up, and revisit when an India date appears.

---

## P. Performance plan

**Reference devices.**
- **Low-end:** a 2 GB **API 24** emulator profile and a 2 GB API 28 profile, plus the oldest real phone available.
- **Mid:** a 4–6 GB phone on Android 13+.
- **The shopkeeper's phone** once identified.

| Metric | Mid | Low-end | Measured with |
|---|---|---|---|
| Cold start → Home usable | ≤ 1.5 s | ≤ 2.5 s | `am start -W` + JS mark |
| Share 6 WhatsApp photos → *Received* with thumbnails | ≤ 2 s | ≤ 4 s | Diagnostic timings |
| Choice → *Ready* visible (6 photos on A4, incl. render-back) | ≤ 4 s | ≤ 8 s | Diagnostic timings |
| Mini layout previews (≤ 20 photos) | ≤ 300 ms | ≤ 600 ms | `performance.now` |
| 10-page B&W PDF → *Ready* | ≤ 8 s | ≤ 15 s | Diagnostic timings |
| One 108 MP photo, one per page | ≤ 8 s, no OOM | ≤ 15 s, no OOM | Timings + `dumpsys meminfo` |
| 20 × 12 MP photos on 2 pages | ≤ 12 s | ≤ 25 s | Diagnostic timings |
| First engine bind | ≤ 300 ms | ≤ 600 ms | Diagnostic timings |
| Peak memory (20 × 12 MP job, app + engine + WebView PSS) | ≤ 350 MB | ≤ 250 MB | `dumpsys meminfo` sampling |
| **Idle memory on Home** (app + WebView PSS) | **≤ 150 MB** | **≤ 130 MB** | `dumpsys meminfo` (re-baselined in Phase 0 with evidence) |
| Memory after 20 jobs in a row | ≤ idle + 10 % | same | Leak check |
| Print-file size per page | Colour photo ≤ 3 MB; grey text ≤ 1.5 MB; 1-bit ≤ 0.3 MB | — | Measured on real scans |
| Startup JS / CSS | ≤ 60 / 15 KB gzip | — | CI size check |
| APK | ≤ 10 MB (≤ 16 MB if PDFium is bundled) | — | `apkanalyzer` |
| Tap → feedback | ≤ 100 ms | ≤ 100 ms | Trace |
| JS long tasks while processing | none > 50 ms | — | `PerformanceObserver` |
| Crashes / ANRs in the adversarial suite | 0 | 0 | logcat + diagnostics |

**How we stay within budget.**
- **Heavy work stays out of the UI.** It runs in the engine, one task at a time, in strips.
- **The UI stays light.** Plain `<img>` elements; only visible pages mounted; grid thumbnails for long lists.
- **Waste is cut.** Cancel tokens, plan-hash caches, and the engine unbinds when idle.
- **Profile before optimising.** Android Studio Profiler, Perfetto, `chrome://inspect`. The same devices are re-measured at every milestone.

---

## Q. Security & privacy plan (threat model)

| Threat | Controls |
|---|---|
| **Malicious or corrupt customer file** (exploit, decompression bomb, absurd sizes, zero pages) | All parsing happens in the **isolated engine** (no permissions, no files, no network). Size, pixel and page caps. Type sniffing. Crash markers; the app never crashes because of a file |
| **Hostile or broken sharing app** (lying length, stalls, endless stream, `file://` tricks, our own URIs) | `content://` only; own authorities rejected; streaming caps; timeouts; `.part` + atomic promotion; journal cleanup |
| **Upload or leakage over the network** | No network code; **no `INTERNET` permission in release builds** (Android enforces it); CSP `default-src 'self'`; no analytics or SDKs that phone home |
| **Backups and phone-to-phone transfer** | `noBackupFilesDir`; `allowBackup=false`; `dataExtractionRules` exclude everything |
| **Shoulder-surfing via Recents** | `setRecentsScreenshotEnabled(false)` (13+); `FLAG_SECURE` on screens with customer content (≤ 12), with a timed support switch |
| **Files lingering** | Retention via JobScheduler + on open; Delete all; generated and decrypted files deleted after printing |
| **Password exposure** | Memory only; never in manifests, logs or reports; autofill, suggestions and autocorrect off; "Show" never makes the field plain text |
| **Logs and diagnostics** | No names, paths, content or passwords; release builds strip debug logs; report = counts, timings, error codes, versions, RAM; sent only by the shopkeeper's tap |
| **Other apps on the device** | Only `MainActivity` exported; engine not exported; no content provider exposing job files |
| **Supply chain** | Few dependencies; exact pins + lockfile + Gradle locking; `npm audit` / osv-scanner + the `security-audit` skill before releases |
| **Release integrity** | Keystore outside the repo, with a backup; WebView debugging off in release |

---

## R. Testing strategy

**Rules.**
- **Prove; don't claim.** Maximise practical coverage with equivalence classes, boundaries, property and fuzz tests, state-transition coverage, device matrices, real shop files, real-printer tests and adversarial testing.
- **Name the gaps.** Anything not proven is listed in the phase's coverage statement (T0).
- **One Android version list everywhere:** API **24** (2 GB low-RAM), **28**, **30** (without extension 13), **33**, **35**, **36**.

| Level | Tools | What it proves | When |
|---|---|---|---|
| **1. TS unit, property and fuzz** | Vitest + fast-check | Layout invariants over thousands of random jobs (each photo once, no overlap, inside printable area, aspect error ≤ 0.1 %, order, page count, deterministic). Crop detector precision/recall on synthetic + labelled real sets. Plan builder; job state machine incl. **all state transitions and stale-result rejection**; retention rules; migrations; jargon lint; catalogue completeness | Every commit (CI) |
| **2. Kotlin JVM tests** | JUnit 4 | Style and threshold maths on plain arrays (golden pixels). PdfWriter structure from **pre-encoded image fixtures** (byte-identical goldens possible because no device encoder is involved). Plan → matrices. Sniffer. Paper-guard matching. Retention. Manifest revision rules | Every commit |
| **3. Independent PDF checks** | `qpdf --check`, pdf.js (Node), PDFium (device) | Every generated PDF parses; sizes and placements match the plan within 0.1 pt | Every commit + device suite |
| **4. Android instrumentation** (authoritative native) | AndroidX Test + **UiAutomator** on the API list | **Decoding:** 8 EXIF orientations, HEIC, P3, 16-bit PNG, transparent PNG, CMYK JPEG, truncated files, a 100 MP photo generated on-device. **PDFs:** normal, scanned, landscape, mixed sizes, owner-password, locked (each tier), forms/stamps, malformed. **Engine:** crash containment (kill engine mid-render), rebind. **Share intents** via a **hostile test provider** (lying length, unknown length, stall, mid-stream exception, zero bytes, over cap, endless stream, `file://`, own-authority URIs). **Lifecycle:** replay filtering, process death at every write boundary, picker/print dialog killed, rotation, "Don't keep activities". **Print dialog:** paper guard preview/final, Save-as-PDF detection, interruption | Per milestone (locally) |
| **5. WebView UI** | Playwright (Chromium) + axe, mocked engine | Flows J0–J8. Screens 320×640, 360×800, 412×915, 480×1040, 800×360 landscape. Text 100/130/160/200 % (exactly what ships, because scaling is app-controlled). No horizontal scroll, no clipped text, primary button visible ≥ 56 px, focus order. Visual snapshots | Every commit |
| **6. On-device end-to-end** | UiAutomator scripts + adb share intents; Playwright `_android` only as a WebView helper; mobile-mcp for exploratory sessions with screenshots | Share → Ready → print to *Save as PDF* (file compared) on emulator and phone | Per milestone |
| **7. Print correctness** | Golden plans; preview vs real-file renders; **real Brother** | SSIM ≥ 0.98 at 1:4; placements ± 0.5 mm. On paper: test page and passport **ruler test ± 0.5 mm**. B&W: every decoded pixel R = G = B (or 1-bit/DeviceGray) **and** monochrome requested. *Physical ink use is the printer's choice and is not claimed* | Per milestone + release |
| **8. Concurrency and races** | Instrumentation + unit | The D2c race matrix; 10-tap storms; stale callbacks; identical re-shares become new jobs | Per milestone |
| **9. Performance** | Scripted device runs | Section P budgets, incl. 20-job leak check | Per milestone |
| **10. Security / privacy** | Merged-manifest test, backup dry-run, network monitor, logcat grep, time-shifted retention, Recents check | No upload, no backup, no leakage, deletion on schedule | Release |
| **11. UX** | The shopkeeper + 1–2 other seniors: tasks, no help, think-aloud | Comprehension; tap counts | Phase 0 (language) + milestones |
| **12. Adversarial QA** | Scripted checklist | 30–100 photos; same photo ×10; rotate and background during processing; cancel at every stage; low disk during a write; giant panorama; 100 MP; transparent PNG; CMYK and odd PDFs; **mutated/corrupt PDFs and images, truncated streams, deceptive headers/extensions, decompression bombs, absurd page boxes, zero-page and empty files**; rapid PRINT taps; Back mid-processing; new share during intake/render/dialog; **kill on every screen (HOME → `am kill` → reopen from Recents; also "Don't keep activities")**; 20+ repeated jobs | Before every release |
| **13. Regression** | CI (GitHub Actions free tier, kept lean: lint, typecheck, levels 1–3, 5, build, size budgets) + local device suites per milestone | Old flows keep working; every bug gets a failing test first | Continuous |

**Test fixtures.**
- A small committed set (< 10 MB); large fixtures are generated at test time.
- **Real customer files are never committed.** Use synthetic or consented samples, such as your own e-Aadhaar.

---

## S. Proposed folder / project structure

```
PrintSaathi/
├─ CLAUDE.md                        project rules for future sessions (repo-root guard, harness, closure)
├─ HARNESS.md                       canonical commands + evidence locations (T0)
├─ scripts/ preflight.mjs (repo-root + toolchain guard) · device/ (share, perf, privacy, kill-matrix)
├─ android/app/src/
│  ├─ main/java/in/printsaathi/app/
│  │  ├─ MainActivity.kt            WebView-crash recovery, replay filtering, Recents privacy, text scale
│  │  └─ engine/
│  │     ├─ PrintEnginePlugin.kt    thin bridge: methods, events, cancel tokens
│  │     ├─ intake/   ShareIntake · Pickers · Importer (caps, .part, journal) · Sniffer · UriPolicy
│  │     ├─ jobs/     JobStore (rev-checked atomic writes) · Locks · CrashMarkers · Retention (+JobService)
│  │     ├─ isolated/ EngineService (isolatedProcess) · IEngine.aidl · EngineClient (bind, rebind, FDs)
│  │     │   ├─ image/  Decoder · Thumbnails · Styles · Threshold · Budget      (run inside the engine)
│  │     │   └─ pdf/    PdfInput (tiers, unlock, render)                         (run inside the engine)
│  │     ├─ render/   PrintPlan · PlanRenderer (orchestrates engine) · Geometry
│  │     ├─ pdf/      PdfWriter (ADR-001)
│  │     ├─ print/    PrintTarget · AndroidSystemPrint (guard, calibration, status, lifecycle)
│  │     └─ diag/     Diagnostics · ProblemReport
│  ├─ test/          JVM tests            └─ androidTest/  instrumentation + UiAutomator + hostile provider
├─ src/                             web app (TypeScript + Preact)
│  ├─ main.tsx · app.tsx            bootstrap, screen stack, back handling
│  ├─ screens/  home/ received/ black-edges/ working/ ready/ change/ settings-pickers/ photo-tools/
│  │            crop/ which-photo/ passport-crop/ unlock/ result/ recent/ settings/ help/ new-files/ problem/
│  ├─ ui/       Button · Tile · TopBar · ActionBar · Panel · Stepper · Segmented · PaperPreview ·
│  │            PageStrip · SummaryLine · ChangeRow · ProgressScreen · Icon
│  ├─ core/     layout/ · crop/ · plan/ (buildPlan, schema, planHash) · job/ (machine, manifest, rev) · units.ts
│  ├─ native/   printEngine.ts (typed API) · printEngine.mock.ts (browser + Playwright)
│  ├─ workers/  crop.worker.ts      i18n/ en.ts (+ jargon test)     settings/     styles/ tokens.css
├─ tests/ e2e/ · fixtures/ (small) · generate/ (large-fixture generators)
├─ design-system/printsaathi/MASTER.md
├─ docs/ PLAN.md · ARCHITECTURE.md · decisions/ (ADR-001 writer, ADR-002 PDF engine, ADR-003 engine process,
│        ADR-004 dependencies) · print-styles.md · smart-crop.md · spikes.md · qa/ (traceability.md,
│        phase reports, checklists) · evidence/<phase>/<date>/
├─ .github/workflows/ci.yml
└─ capacitor.config.ts · vite.config.ts · tsconfig.json · biome.json · package.json (exact versions) · package-lock.json
```

---

## T. Implementation phases

### T0. How every phase is run and closed (engineering discipline)

**HARNESS.md** is created in Phase 0. It lists the canonical commands, which are never bypassed to get a green result:

| Command | Purpose |
|---|---|
| `npm run preflight` | Repo-root guard: git top-level must be `D:/Projects/PrintSaathi`. Also checks toolchain versions and lockfile integrity. It runs before every other command |
| `npm run lint` · `npm run typecheck` | Static checks |
| `npm test` · `npm run test:property` · `npm run test:fuzz` | TS unit, property and fuzz tests |
| `npm run test:e2e` | Playwright WebView matrix + axe |
| `npm run build` · `npm run size` | Build + budgets |
| `cd android && ./gradlew lint test` | Kotlin lint + JVM tests |
| `./gradlew connectedAndroidTest` | Instrumentation + UiAutomator on the API list |
| `./gradlew assembleRelease` + `apkanalyzer` | Release build + size |
| `npm run audit` | `npm audit` + osv-scanner |
| `scripts/device/share.*` · `perf.*` · `privacy.*` · `kill-matrix.*` | Device scripts |

**Evidence** goes to `docs/evidence/<phase>/<date>/`: test outputs, screenshots, device logs, `dumpsys` captures, photos of ruler measurements.

**Closure sequence per phase (mandatory):**
1. Requirement
2. Plan
3. Implement
4. Automated verification
5. Real-device test (N/A only with a written reason, for pure-logic steps; mandatory at milestones)
6. Evidence
7. Adversarial challenge
8. Fix findings
9. Focused re-test
10. Full regression
11. Self-audit
12. Explicit closure: `docs/qa/phase-N.md`

**Traceability.** `docs/qa/traceability.md` maps every brief requirement (§1–§50) and every review item through: Requirement → Implementation → Automated evidence → Real-device evidence → Adversarial evidence → Regression evidence → **PASS / FAIL / Blocked**.

**Findings never disappear.**
- Lifecycle: Found → reproduce → root cause → fix → focused re-test → full regression.
- Final status must be one of: **Fixed + verified**, **Proven intentional** (with evidence), **Blocked** (with evidence), or **Deferred** (only with your explicit approval).

**Coverage statement per phase.** What was proven, by which method, and **what could not be proven**. No "all scenarios tested" claims.

**Git hygiene.**
- Feature branches; commits only inside the PrintSaathi repo.
- The repo `CLAUDE.md` forbids any operation on `D:\.git`.

### T1. Phases

Rough effort is in focused working days, as estimates.

| Phase | Scope | Exit criteria (all must pass) | Effort |
|---|---|---|---|
| **0 · Spikes, harness & go/no-go** | `git init`, preflight, HARNESS.md, CLAUDE.md, exact pins, CI. Device-facts screen on the shopkeeper's phone. **Spikes (a)–(i)** listed below. ADR-001/002/003 written | `docs/spikes.md` with evidence; each spike PASS or the plan is changed **before Phase 1**; you approve the ADRs | 5–8 d |
| **1 · Design system & shell** | MASTER.md (+ adaptations), tokens, primitives, screen stack + Back, safe areas, app-controlled text scale, force-dark off, WebView gate, Recents privacy, Home/Settings/Help skeletons, jargon lint, Playwright matrix + axe | Every screen passes H4 at 200 % text on 320 px | 3–5 d |
| **2 · Intake, job safety, engine + walking skeleton → Milestone A0** | Hardened intake (caps, `.part`, journal, URI policy), replay filtering, revision-checked job store, locks, crash markers + breaker, isolated engine (decode + thumbnails), *Received*, unsupported guidance, duplicates, *New files arrived*, Recent/Continue, retention (JobScheduler). **Thin end-to-end slice:** share → *One on each page* (A4) → simple PDF → Android print → result | Hostile-provider suite green; kill-matrix restore green; zero duplicate imports; **The shopkeeper prints the first WhatsApp photos (A0)** | 8–11 d |
| **3 · Layout engine + Change screens** | Paper registry, Best/N/one-per-page/all-on-one, scoring, warnings, mini previews, Change hub + one-decision screens, Photo tools, remembered choices | 10 k property cases green; you review layout fixtures for 1–30 photos; screens correct at every viewport | 5–7 d |
| **4 · Renderer, writer (ADR-001), Ready screen, B&W** | PlanRenderer in the engine, chosen writer, grey encodings, real-file preview (upright display), summary line, plan-hash cache, cancel | Independent PDF checks clean; preview-vs-file SSIM ≥ 0.98; size budgets met | 5–7 d |
| **5 · Printing hardening → Milestone A** | Calibration, no-dead-end guard, content types, Save-as-PDF detection, status persistence, lifecycle safety, parts, test page, setup help | **Real Brother:** photo jobs print correctly; guard and interruption cases behave; Shopkeeper session | 4–6 d |
| **6 · Passport → Milestone B** | Presets, crop (frame, oval, nudges), computed slots, cut lines, count, price table, paper reminder | **Ruler 35.0 × 45.0 mm ± 0.5 mm on the real printer**; the shopkeeper completes J4 alone | 4–6 d |
| **7 · Documents & locked PDFs → Milestone C** | PDF tiers in the engine, empty-password first, Unlock (helper), ADR-002 path for old phones (if needed), exact vs processed path, pages to print, reordering, mixed jobs, annotation banner | Real-PDF matrix (forms, scans, landscape, mixed sizes, owner-password, e-Aadhaar) prints correctly; password never on disk | 6–9 d |
| **8 · Print styles** | The other five styles, samples, docs | Golden pixels; real prints reviewed by you | 3–5 d |
| **9 · Smart crop + manual crop → Milestone D** | Detector + worker, labelled corpus (≥ 150 incl. negatives), batch question, manual crop | Precision ≥ 98 %, recall ≥ 90 %, FP ≤ 2 %; source hash unchanged | 5–7 d |
| **10 · Robustness, performance & security** | Big-job mode, budgets per device, full adversarial + fuzz suite, leak check, security review (`security-audit` skill), privacy tests | Section P met; adversarial suite: 0 crashes, 0 silent losses, 0 mismatches | 5–8 d |
| **11 · Accessibility & UX validation** | TalkBack, 200 % text, contrast audit, sessions with the shopkeeper + 2 seniors, wording fixes | The shopkeeper ≥ 5/6 tasks alone; tap counts in A2 met | 3–5 d |
| **12 · Real-world rollout → V1.0** | Release signing, ADB install on the shopkeeper's phone, setup (print service, share-sheet pin, printer + test-page calibration), 2 weeks of supervised use with an issue log, fixes | 2 weeks with no blocking issue; traceability matrix complete; no open findings except approved deferrals | 2 weeks + 2–3 d |

**Total:** ≈ 57–84 focused days + the 2-week field trial. The shopkeeper can use photo printing from Milestone A0.

**Phase 0 spikes (go/no-go):**
- **(a) WhatsApp share matrix.** Single, multiple and mixed shares, `octet-stream`; copy → thumbnail via `convertFileSrc` with no base64. Confirms `*/*` matching.
- **(b) Real printing on the shop Brother** through the shopkeeper's actual print service:
  - What the dialog preselects, and the exact 4×6-class sizes (mils) and margins the service reports.
  - **The preview → final layout sequence with the warning-page guard.**
  - Save-as-PDF detection.
  - **Ruler tests:** 1-page vs 2-page passport sheets, `PHOTO` vs `DOCUMENT`.
  - Whether mono mode is honoured; what the Brother panel does on a paper mismatch.
- **(c) Release build without `INTERNET`.** Fonts, Web Worker, `convertFileSrc` images, fetch from the worker; CSP placement.
- **(d) Locked PDFs.** A real e-Aadhaar on API 35, on API 30–34 with extension 13, and on old-phone candidates for ADR-002 (i) and (ii).
- **(e) Huge photos.** 108 MP decode-to-size on the 2 GB API 24 and API 28 profiles, with memory measured.
- **(f) Isolated engine.** Bind time, file-descriptor passing, ImageDecoder/PdfRenderer inside `isolatedProcess` on API 24 and 36, crash containment.
- **(g) ADR-001 writer.** PdfDocument vs custom writer: sizes, page-size precision, grey/1-bit, copies.
- **(h) the shopkeeper language check** (H5).
- **(i) Device facts** on the shopkeeper's phone: Android version, RAM, WebView, extension level, print service.

---

## U. Acceptance criteria (PASS only if every point holds; anything else is FAIL)

| Feature | PASS criteria |
|---|---|
| **Share intake** | Sharing 1, 6, 30 photos, 1–3 PDFs, a mixed set and an `octet-stream` PDF from WhatsApp on a real phone shows the correct count and thumbnails in order (6 photos ≤ 2 s mid). Works from cold start and when already running. Restores, rotation and Recents never import twice. Same URIs within 60 s open the existing job. Identical content shared later becomes a new job. Unsupported types show guidance. **No image or page bytes cross the bridge** (the only exception is the G5 fallback, ≤ 20 MB, if built) |
| **Hostile intake** | The test provider's lying length, unknown length, stall, mid-stream error, zero bytes, over-cap and endless stream each end with the right message. No `.part` file survives; no crash; the cap is never exceeded on disk. `file://` and own-authority URIs are rejected |
| **Choose from phone** | Photos and PDFs import with zero permission prompts; J0 tap counts met |
| **All on one page / More pages / One per page** | For N = 1…30 mixed shapes on A4 and 4×6: each photo exactly once, gaps respected, inside the printable area, aspect error ≤ 0.1 %, order kept, deterministic. Best = fewest pages with every shortest side ≥ 40 mm. N pages balanced. One-per-page never cuts. Tiny-photo warning below 25 mm |
| **Passport** | **35.0 × 45.0 mm ± 0.5 mm** by ruler on 4×6 and A4. Slots per sheet match the computed value for the measured margins. Default 5. Cut lines present. Paper reminder shown. Price shown only for configured counts. Nothing changed except crop and scale |
| **Documents** | Page order and selection respected; reordering works; copies collated. Exact path prints the customer's PDF byte-identical. **B&W: every decoded pixel R = G = B (or 1-bit / DeviceGray) and monochrome requested.** Owner-password PDFs open without Unlock. The forms/stamps banner appears on old phones when detected |
| **Locked PDFs** | A real e-Aadhaar unlocks with the right password on the shopkeeper's phone (and on each tier tested in Phase 0). The wrong password shows the message. The password never reaches disk, logs or reports (grep check). If the G5 fallback exists: the 20 MB cap and process-death tests pass |
| **Print styles** | Six golden outputs; samples come from the same functions; Original changes nothing beyond resampling (PSNR ≥ 40 dB); reversible |
| **Smart crop** | Precision ≥ 98 %, **recall ≥ 90 %** on the clearly-croppable set, ≤ 2 % suggestions on negatives. Never applied without consent. One batch question per job. Source hash unchanged |
| **Manual crop** | Handles 48 dp visible / 64 dp touch; nudges work; Reset restores; Apply shows in preview and print |
| **Ready / WYSIWYG** | Preview images are renders of the actual `print.pdf` (sideways pages displayed upright with a badge). Summary equals the plan. Preview-vs-file SSIM ≥ 0.98 |
| **Printing** | Correct paper (calibrated) and colour preselected on the Brother. Wrong paper → warning page in preview, nothing printed on final, our explanation shown; **no dead end**. Save-as-PDF detected. Interruption detected. Status survives app restarts. Double-taps never create two jobs |
| **Crash safety** | A crafted file that crashes the decoder shows "damaged" **without the app crashing**, and is skipped afterwards. Two crashes in 60 s → safe start |
| **Concurrency** | The whole D2c race matrix passes. No stale result is ever shown or printed. Manifest revisions never go backwards |
| **Recovery** | HOME → `am kill` → reopen from Recents on every screen (and with "Don't keep activities"): same job, same step (< 30 min) or Continue card; no file lost; no duplicate |
| **Privacy** | Release manifest has no `INTERNET`. Backups and transfer exclude everything. Recents thumbnail hidden (13+) / secure flag on customer screens (≤ 12). Files deleted after the chosen period (time-shifted test). Delete all empties jobs. Logs hold no names |
| **Performance** | Every Section P target met on the low-end and mid references |
| **Accessibility** | Every control has an accessible name. TalkBack completes J1 and J5. At 200 % text on 320 px: no clipping, no horizontal scroll, primary button visible. Contrast ≥ token table. The shopkeeper's controls ≥ 56 dp |
| **UX** | The shopkeeper ≥ 5/6 core tasks alone. Taps (A2 rule): J1 = 2, J2 = 2, J3 = 2, **J4 = 3**, J5 = 1 |
| **Robustness** | Full adversarial checklist: 0 crashes or ANRs, 0 silent losses, 0 preview/print mismatches |
| **Process** | Traceability matrix complete. Every finding closed as Fixed + verified / Proven intentional / Blocked / Deferred-with-your-approval. A coverage statement exists for every phase |

---

## V. Questions & assumptions

**Answered:** printer on Wi-Fi and a phone already prints · the shopkeeper's Android version unknown (design for 7+, measure in Phase 0) · locked PDFs are V1.

**Assumptions** (tell me if any is wrong; none blocks Phase 0):
1. **Passport.** 35 × 45 mm on 4×6 glossy. **Only known price preconfigured: 5 photos = ₹50.** Other counts show no price until you add them in Settings.
2. **Paper.** Photos and documents on A4; passport on 4×6. If the Brother can't feed 4×6 (or the service offers no 4×6-class paper), passport uses A4 (30 per sheet).
3. **Colour.** Documents default to Black & white, photos to Colour; the last-used choice per job type is remembered.
4. **"OCV Black"** = the threshold mode in F4; renameable and retunable.
5. **Retention.** Default 1 day.
6. **Language.** English plus string catalogue; the shopkeeper's language ships in V1 if the Phase 0 check shows they need it.
7. **Identity and install.** App id `in.printsaathi.app`, name PrintSaathi, installed by ADB (see Risk 11).
8. **Test files.** Synthetic or consented only. Please collect ~20 typical jobs (your own e-Aadhaar, screenshots with black bars, document photos, a filled PDF form).
9. **GitHub.** A private repo + lean Actions CI. I'll create it only with your OK.
10. **Printer model.** Helpful but not blocking.

---

## Verification (how the finished work will be proven end-to-end)

1. **Every commit (CI).**
   - `npm run preflight && npm run lint && npm run typecheck && npm test && npm run test:property && npm run test:e2e && npm run build && npm run size`
   - `cd android && ./gradlew lint test`
2. **Every milestone (local devices).**
   - `./gradlew connectedAndroidTest` on API 24 (2 GB) / 28 / 30 / 33 / 35 / 36.
   - Device scripts: hostile provider, kill matrix, race matrix, performance, privacy.
   - mobile-mcp exploratory sessions with screenshots in `docs/evidence/`.
3. **Real world.**
   - WhatsApp → Share → PrintSaathi → Brother on the shopkeeper's phone.
   - Ruler-measure the test page and passport sheets.
   - Compare each printed sheet with its *Ready* screen.
4. **People.** The shopkeeper's sessions (Phase 0 language check, every milestone) recorded in `docs/qa/`.
5. **Closure.** Phase reports + traceability matrix + coverage statements. Nothing is reported as passing without evidence.
