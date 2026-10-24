# Phase 10b — Settings and problem report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the shop owner's Settings (PLAN §I-15) and the problem report (§K10, §E diagnostics). Until now every row except Delete all and the test page said "Not ready yet".

**Why now:** Phase 10 finding F8. This is R2 MVP scope (§K3, §K4, §K10, §E, §D6) that no phase after Phase 1's skeleton owned. It must be done before Phase 11 (UX validation with the shopkeeper), because the owner configures these.

**Architecture:**
- **Settings store:** one small versioned JSON at `noBackupFilesDir/state/settings.json`. It is read and written through the existing plugin (`getSettings` / `saveSettings`), atomic, and validated on both sides.
  - Native needs it too: the daily retention job runs without the web app.
  - This means no new dependency: `@capacitor/preferences` is not added (ruling below).
- **Diagnostics:** an app-process ring buffer at `noBackupFilesDir/diag/log.jsonl` (≤ 1 MB, two files rotated).
  - What it holds: events, timings, error codes, crash stacks, versions, RAM.
  - What it never holds: file names, paths, contents or passwords.
  - The report is plain text, sent only when the owner taps **Send problem report**, through Android's share sheet (`shareText`, already built).

**Tech stack:** Preact + TS screens (one decision per screen), Kotlin plugin + JVM tests, Playwright matrix + axe, device check on API 35.

**Spec:** docs/PLAN.md §I-15, §K3, §K4, §K10, §E, §D6, §G0 (remembered choices), §H2.12 (no jargon), §Q (logs and diagnostics).

## Global Constraints
- **Wording:** plain English, no jargon (H2.12; the jargon lint must stay green). Errors say what happened and what to do.
- **Privacy:** settings and diagnostics hold no customer data. The report holds no names, paths, contents or passwords, and that is checked by a test.
- **Defaults** (PLAN §V):
  - retention 1 day;
  - passport 35 × 45 mm, 5 photos, only 5 = ₹50 priced;
  - photos in Colour, documents in Black & white, paper A4 (passport on the calibrated 4×6 photo paper).
- **Robustness:** a missing or broken settings file reads as the defaults; it never breaks a screen.
- **Process:** exact dependency versions. No new dependency without a decisions note.

## Rulings (planned)
- **Native settings file, not `@capacitor/preferences`.** The retention job is native and must read the choice; one store, no new dependency. Cost if wrong: none found (the plugin was "planned" in C but never needed until now).
- **Shop name:** printed in the problem report header and on the test page footer only; nowhere customers' prints would carry it. Cost if wrong: it shows nowhere else.
- **Advanced (§I-15):** only "Space at paper edges: Normal / More (+3 mm)", for printers that cut off the edge despite calibration. Margins stay automatic by default. Cost if wrong: one extra layout input.

## Review Focus
1. A broken, old or hand-edited settings file must read as defaults, field by field; never a blank Settings or Ready.
2. Retention change applies at once: going from 7 days to 1 hour deletes old jobs at the next sweep, never the open job.
3. A price table with gaps or zero or absurd prices: only counts with a price > 0 show "Charge ₹…".
4. Remembered paper and colour per job type must never override a choice the shopkeeper made in the current job, and must always show in the summary.
5. The problem report must contain no file name, path, job id, PDF password or shop customer's text: grep test over a report built after a full session (share, unlock, print).

---

### Task 1: Settings store
- **Files:** `android/.../engine/settings/SettingsStore.kt` (+ JVM test); `src/core/settings/settings.ts` (+ vitest); the plugin methods `getSettings` and `saveSettings`; the mock.
- **Type:**
  `Settings = { v: 1, shopName: string, retention: '1h' | '1d' | '7d', passport: { preset, count, prices: Record<number, number> }, defaults: { photos: { colour }, documents: { colour } }, remembered: { photos?: {paper, colour}, documents?: {colour} }, photoPaperReminder: boolean, edges: 'normal' | 'more', screenshotsUntil: number }`.
- **Tests:**
  - defaults when missing or broken;
  - field-by-field fallback;
  - prices > 0 and ≤ 99 999 only;
  - shop name ≤ 40 characters, trimmed;
  - atomic write;
  - the native `keepMs()` gives 1 h / 24 h / 7 d.

### Task 2: Settings screen with real values + one-decision screens
- **Settings rows show current values:** Shop name · Passport photos and prices · Paper and colour · Delete customer files after · Delete all · Print a test page · Allow screenshots for 15 minutes · Send problem report · Advanced.
- **Each row opens one decision:**
  - **text field:** shop name;
  - **three big choices:** retention, and Space at paper edges;
  - **switch-like choice with a countdown:** screenshots.
- **Tests (e2e):** every row opens; a choice is kept after a reload; matrix + axe for the new screens.

### Task 3: Retention choice is used natively
- `Retention.sweepAsync` reads `SettingsStore.keepMs()`. Changing the choice triggers a sweep (protected jobs kept).
- **Tests:** JVM `JobSweeper` with 1 h; device: 7 d → 1 h with a 2-hour-old job → deleted, the open job kept.

### Task 4: Passport presets, count and price table
- **One screen per decision:** default size (35 × 45 / 20 × 25 / 2 × 2 in), default count (−/+), and prices (a list of counts with a number field each, plus "Add a price").
- `summary.ts` reads prices from settings.
- **Tests:** vitest summary with a custom table; e2e editing a price shows on Ready.

### Task 5: Paper and colour defaults, remembered per job type (§G0)
- New jobs start with the remembered paper and colour of their type (photos / documents), else the defaults. Printing a job remembers its choice for its type.
- The summary always shows them (nothing hidden).
- **Tests:** vitest (`jobFromIntake` with remembered); e2e: print a photo job in B&W, the next photo job starts in B&W and says so.

### Task 6: Allow screenshots for 15 minutes; photo-paper reminder switch; Space at paper edges
- **Screenshots:** sets `screenshotsUntil`. The native `secureFlagNeeded` uses it (already written). The screen shows the minutes left and a "Stop now" choice.
- **Photo-paper reminder:** off means the passport PRINT button is the plain PRINT (no yellow panel). Default on.
- **Space at paper edges:** "More" adds 3 mm to the layout's edge space.
- **Tests:** JVM `secureFlagNeeded` (exists) + plugin wiring; e2e for the reminder; vitest layout with More.

### Task 7: Diagnostics + Send problem report
- **Native `Diagnostics.log(event, fields)`:** fields allow-listed, as numbers / codes / enums only.
- **Events logged:**
  - start, safe start, intake counts and problem codes;
  - engine deaths and OOM, render times and outcome codes;
  - print outcome codes, WebView gone, crashes (stack frames only, messages removed).
- **Report text:**
  - app version, Android version/API, RAM, WebView version, print tier;
  - shop name, settings summary;
  - the last 200 events.
- **Delivery:** shared with `shareText`.
- **Tests:**
  - JVM ring rotation ≤ 1 MB;
  - the allow-list drops strings;
  - the report has no `/`, `.jpg`, `.pdf`, `no_backup`, uuid-shaped ids or the test password;
  - device: report after a session (share, unlock `user-aes256.pdf`, render) grepped the same way.

### Task 8: Closure
- **Regression and review:** 5-level device regression, gate review.
- **Documents:** `docs/qa/phase-10b.md`, traceability rows (§31, K3, K4, K10, E), USER-CHECKLIST (set prices and shop name on the shopkeeper's phone).
