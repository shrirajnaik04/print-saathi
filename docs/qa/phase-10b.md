# Phase 10b — closure report (Settings, problem report, Choose from phone; emulator scope)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-10b-settings-and-problem-report.md`.

**Why this phase:** Phase 10 finding F8 (Settings was still the Phase 1 skeleton). It then found a second MVP gap, Choose from phone, which the Home tiles said was "coming in the next update".

**Commits:**
- 83a8d87 Settings + diagnostics + problem report;
- a6c5aee "open job gone" guard + device checks;
- 9eb9f92 Choose from phone;
- 7edb9c1 gate-review fixes;
- closure commit.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION** (USER-CHECKLIST §O).

## What Phase 10b delivers
- **Settings (PLAN §I-15):** every row shows its value and opens one decision.
  - Shop name.
  - Passport photos and prices: size, how many, a price table; Ready charges these.
  - Paper and colour: the colours new photo and document jobs start in. Printing a job also remembers its colour for that job type (PLAN §G0).
  - Photo paper reminder.
  - Delete customer files after: 1 hour, 1 day or 7 days. The phone's own cleanup follows it, including the cold daily job.
  - Delete all; Print a test page.
  - Allow screenshots for 15 minutes: Android ≤ 12, capped at 15 minutes, re-checked when the window ends.
  - Space at paper edges (More: 3 mm more at every edge).
  - Send problem report.
- **Settings store:** one small file, written only by the web app and normalised field by field (a broken file reads as defaults; unknown fields are kept). A change waits for the first read, is never saved over an unread file, and changes run one at a time.
- **Diagnostics and the problem report (PLAN §E, §K10, §Q):**
  - The log holds fixed events with numbers and yes/no values only (text is dropped), so a file name, path, text or password cannot get in.
  - Crashes are recorded as kind + code frames, never the message.
  - At most 1 MB.
  - The report (versions, phone, RAM, WebView, unlock tier, shop, settings, last 200 events) leaves only through Android's share sheet, on the owner's tap.
- **Choose from phone (PLAN §D3, §J0):**
  - Photos: Android's Photo Picker (photos only; no permission), else the system file picker.
  - Passport photos: one photo, straight on to the frame.
  - Documents & PDF: the system file picker.
  - Files go through the same intake as shares. What they were chosen for is kept with the intake, natively.
- **Jobs follow the settings:**
  - Photos and documents start in the owner's colours; passport photos always start in colour.
  - Passport photos start with the owner's size and count, never replacing the shopkeeper's own choice.
  - The photo-paper reminder can be turned off.
  - Retention texts say the chosen period.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Automated | vitest: settings, store, messages, merge, job, plan edges, summary prices. JVM: SettingsStoreTest, DiagnosticsTest, ScreenPrivacyTest. e2e: Settings flows, J0 pickers, review cases; matrix + axe for 9 new screens |
| Device (API 35) | Retention choice applied natively; numeric-only diagnostics; report via the share sheet; all three pickers through the real Android pickers; picked purpose stored natively (`docs/evidence/phase-10b/2026-10-17/`) |
| Adversarial | Gate review: 0 Critical, I1–I5, 15 Minor, all fixed or ruled (ledger); MVP audit → Phase 10c plan |
| Final regression | See "Final regression" below |

## Findings and status

| # | Finding | Status |
|---|---|---|
| F8 (Phase 10) | Settings skeleton | **Fixed + verified** |
| New | Choose from phone never built | **Fixed + verified** (e2e red first; device) |
| New | A share opened a question about a job already deleted | **Fixed + verified** (e2e red first) |
| I1–I5 | Passport pick bounce, pick leaking into shares, passport in B&W, fixed "1 day" text, settings saved over an unread file | **Fixed + verified** (I1 test written after the fix) |
| M1–M15 | See ledger | **Fixed** (M1, M2–M10, M12 help, M14, M15) / **Proven intentional** (M11 second half, M12 Back, migrations) |
| Part B (MVP audit) | 11 missing or partial MVP items | **Planned:** Phase 10c (`docs/superpowers/plans/2026-10-17-phase-10c-mvp-completion.md`), next |

## Coverage statement
**Proven (emulators):** everything listed above under "Device (API 35)" and "Automated".

**Not proven:**
- The picker fallback on Android 7–12 (those emulator images show the WebView gate).
- A screenshot window on a real Android ≤ 12 phone.
- The owner setting real prices and the shop name on the shopkeeper's phone.
- The report arriving in WhatsApp.

All are in USER-CHECKLIST §O.

## Final regression (`7edb9c1`, sequential, `docs/evidence/phase-10b/2026-10-17/regression-final/`)
- **Instrumentation:**
  - API 24 / 28 / 30: 58 passed, 0 failed, 4 skipped (by design on those images);
  - API 35 / 36: 62 / 0 / 0.
- **Every level:** share 15/15, render check PASS, privacy hits 0.
- **Crash buffers:**
  - the isolated engine only (Android 7's PDF library on the mutated PDFs of EngineFuzzDeviceTest, contained; the API 36 deliberate crash and HEIC tests);
  - the WebView renderer killed on purpose (API 35/36);
  - one Google system app at boot (API 35).
  - No PrintSaathi app-process crash.
- **PC side:** lint, typecheck, vitest 265, e2e 964, Android lint + JVM.
