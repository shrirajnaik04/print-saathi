# Phase 2 — Intake, job safety, engine thumbnails, walking skeleton (Milestone A0): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:** The shopkeeper can share photos from WhatsApp and print them, one photo per A4 page, through Android's print screen. Underneath:
- a hardened intake (caps, `.part` files, a journal, refusing hostile URIs);
- a revision-checked job store;
- thumbnails made by the isolated engine;
- a result screen.

**Exit (PLAN §T1, Phase 2):** the hostile-provider suite is green; restore after kill is green; zero duplicate imports; the end-to-end path works on the emulators via Save as PDF, with a validated PDF. **Milestone A0 (the shopkeeper prints the first WhatsApp photos) needs the real phone and printer**, so it goes to the user checklist.

**Spec:** PLAN §D2, D2b, D2c, D4, D5, E, F2/F3, G0 (one per page), G1 (PrintPlan), G2, J3, J8.

## Global constraints
- Customer files are parsed only in the isolated engine. Only paths and JSON cross the bridge.
- Hard caps: 200 MB per file, 1 GB per job, ≤ 100 files (refuse more), ≥ 200 MB free space.
- Stall timeout 20 s; overall 3 min per file.
- Every file is written as `.part`, then fsync, then atomic rename.
- Logs carry counts and class names only.
- Print quality: placement images at 300 dpi of their box; JPEG q92 for colour. Never use thumbnails as print sources.
- One active print at a time; copies are built into the PDF.
- Plain-English messages from PLAN §J8.

## Review focus
1. A hostile provider (lying length, stall, endless stream) must never fill the disk or hang the app.
2. A restore or replay must never import twice; a deliberate re-share later must make a new job.
3. A stale async result (old revision) must never overwrite newer choices.
4. The print file's page size and image boxes must match the plan within 0.1 pt (pdf.js check).
5. Process death mid-intake or mid-print must leave no `.part` and must say what happened.

---

### Task 1: Hardened intake + journal
- **`intake/CopyLimits.kt`:** a pure streaming-copy policy. Testable on the JVM with fake streams and a clock: caps, free-space checks every 8 MB, stall and overall timeouts.
- **`Importer` uses it.** It refuses more than 100 files, and writes the per-intake journal `inbox/<intakeId>.json`, replacing the single `pending.json`.
- **Plugin API:**
  - `listIntakes()`: pending, not yet acknowledged;
  - `ackIntake(id)`;
  - one shared executor.
- **On app start:** delete stale `.part` files and resume or report unfinished journals.
- **Test sender modes:** `lying-length`, `unknown-length`, `stall`, `midstream-error`, `zero-bytes`, `over-cap`, `endless`. The device suite expects the message for each.
- **Tests:** `CopyLimitsTest` (each limit RED→GREEN), `IntakeJournalTest`, share matrix + hostile matrix on devices.

### Task 2: Job store (single writer, revision-checked)
- **TS `core/job/`:**
  - `Job` type: id, rev, items (index, path, type, sha256), choice, paper, colour, copies, status, timestamps;
  - a pure reducer;
  - `planHash`.
- **Native `jobs/JobStore.kt`:** `saveJob(json, rev)` writes atomically (temp → fsync → rename) and **refuses a rev that is not newer**. `loadJob(id)`, `listJobs()`.
- **Tests:**
  - JVM: a stale rev is refused and the file is never half-written;
  - TS: reducer properties (rev increases with every change).

### Task 3: Engine thumbnails
- The engine makes `thumbs/<sha>-320.jpg` and `-1280.jpg`, reusing `decodeToJpeg` (q80).
- **Plugin:** `makeThumbnails(jobId)` returns paths, and skips existing files (hash-named).
- **Rules:** never return originals to the WebView for display. A poison-file marker is set before each engine call and cleared after; an item that killed the engine twice is marked damaged.
- **Tests:** instrumentation for thumbnail sizes and the poison marker.

### Task 4: Received screen
- **Content:** count + thumbnails in order + choices.
  - **One on each page** is live.
  - All on one page, Use more pages and Passport say "coming in the next update".
  - Print as document = one per page for photos.
- **Also on this screen:**
  - unsupported-file guidance;
  - the "same photo twice" banner (Keep both is the default);
  - the *New files arrived* choice when a job is open.
- FLAG_SECURE while shown (API ≤ 32).
- **Tests:** render tests, Playwright with mock intake.

### Task 5: Layout "one on each page" + PrintPlan v1
- **TS `core/layout/onePerPage.ts`:** each photo at the largest uncut fit inside the A4 printable area (6 mm edge), page direction per photo (sideways page when the photo is landscape), centred.
- **`core/plan/`:** the PrintPlan v1 type (§G1) and its builder.
- **Tests (fast-check):** each photo exactly once; inside the printable area; aspect error ≤ 0.1 %; deterministic; order kept.

### Task 6: Render plan → print.pdf
- **Native `render/PlanRenderer.kt`:**
  - For each placement, the engine decodes the item at the box size in pixels at 300 dpi (EXIF-correct, transparency onto white) → JPEG q92.
  - The app process `MiniPdfWriter` writes `out/<planHash>/print.pdf.part` → fsync → rename.
  - Copies are collated, with images reused.
  - Re-open check: the page count matches.
  - The PDF page is always portrait; a sideways photo is rotated into the portrait page.
- **Plugin:** `renderPlan(planJson)` returns `{pdfPath, pages}` with progress events. Cancellable, and stale results are discarded via `planHash`.
- **Tests:**
  - JVM: placement maths, points → pixels at 300 dpi;
  - instrumentation: render 3 photos, then validate page sizes and image boxes with pdf.js on the PC (±0.1 pt).

### Task 7: Print + result
- **`print/PdfPrintAdapter.kt`:** the spike adapter generalised. Paper guard: preview → warning page; final → fail with plain words. Content type photo. Colour mode.
- **One print at a time,** with a persisted in-flight record (`state/print.json`).
- **Status:** after the dialog, the job's printer is checked (Save as PDF) and its state polled on resume.
- **Result screen:**
  - Sent ✓ / Still printing / Saved as a file / Nothing printed (cancelled or a `created` job) / Interrupted / Failed;
  - each with its next step;
  - "Did it print correctly?" (Yes / No → help).
- **Ready screen (skeleton):** page thumbnails from the plan + summary line ("3 photos · 3 pages · A4 · Colour · 1 copy") + PRINT.
- **Tests:**
  - JVM: result-state mapping (`created` + finished → nothing printed);
  - device: end to end with Save as PDF on API 35/36, then the saved PDF validated.

### Task 8: Recent / Continue, retention, crash safety
- **Home:** "Continue last job" card; Recent jobs list.
- **Retention:** 1 day by default, running on start, on resume and via a JobScheduler daily job; skips the active job; removes orphan and `work/` files; storage cap 1.5 GB.
- **Crash-loop breaker:** 2 crashes within 60 s → safe start.
- **Tests:** JVM retention policy (time-shifted); instrumentation for the scheduler registration.

### Task 9: Phase 2 closure
- **Device regression** on 5 levels: share + hostile matrix; kill and restore (HOME → `am kill` → Recents on Received/Ready/Result); end-to-end Save as PDF.
- **Gate:** independent review.
- **Docs:** `docs/qa/phase-2.md`; user checklist updated for A0 (the shopkeeper prints WhatsApp photos on the Brother).
