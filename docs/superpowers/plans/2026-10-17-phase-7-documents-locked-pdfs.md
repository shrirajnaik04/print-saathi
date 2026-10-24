# Phase 7 — Documents & locked PDFs (emulator scope) → Milestone C: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:** A customer's PDF (or PDFs and photos together) prints correctly from WhatsApp in 1 tap:
- the right pages, in the right order;
- colour or black & white;
- copies;
- locked e-Aadhaar-style PDFs unlocked with a password that never touches disk.

Hostile or broken PDFs never crash the app or leak files.

**Spec:**
- PLAN §G4: exact path vs processed path, 300 dpi, `RENDER_MODE_FOR_PRINT`, fitted to A4, forms/stamps banner;
- §G5: empty password first; native tiers; NONE-tier option (i) ≤ 20 MB in 256 KB chunks;
- §I-2: Received is skipped for a PDF or a mix;
- §I-7: Pages to print, a tick grid;
- §I-12: Unlock PDF (e-Aadhaar helper, Other password, Show below the field, no autofill or suggestions);
- §J5;
- §J8 rows: damaged / locked / owner-only / forms / mixed / Office;
- §F6: over 300 pages → notice, opens on Pages to print;
- §G2: grey text-like pages as 8-bit DeviceGray Flate;
- §P: 10-page B&W PDF → Ready ≤ 8 s mid / 15 s low; grey text page ≤ 1.5 MB;
- §U "Documents" and "Locked PDFs";
- §V3: documents default to Black & white.
- Accepted ADR-002 (`docs/decisions/ADR-002-pdf-engine.md`, self-check 2026-10-17).

**Exit:**
- **Emulators:** the real-PDF fixture matrix prints correctly (pdf.js read-back); exact path byte-identical; B&W grey-only.
- **Password:** never on disk, in logs or in reports (grep).
- **Hostile set:** contained; regression; independent gate.
- **Real world (owner):** USER-CHECKLIST §D (own e-Aadhaar), §K (real PDFs on the Brother) → **TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION**.

## Global constraints
- **Customer PDFs are parsed only in the isolated engine.** That includes the forms/annotations byte scan. The one exception is the NONE-tier fallback decrypt in the WebView (ADR-002 option i), which is bounded to ≤ 20 MB.
- **Passwords:**
  - held only in a JS in-memory map and in the single binder call that uses them;
  - never in job.json, the nav stack, localStorage, logs, diagnostics or evidence;
  - cleared when the job is printed, left or deleted, and at app start.
- **Decrypted copies** (fallback only) live in `jobs/<id>/work/unlocked-<item>.pdf` (`noBackupFilesDir`). They are deleted with the job's work files, after printing and by retention.
- **Print quality:** the processed path renders each page at ≥ 300 dpi of its box, onto white. Thumbnails are never print sources. The exact path sends the customer's own bytes.
- **Stale work never shows or prints:** `{jobId, rev, planHash}` rules as for photos.
- **No regression of photo and passport flows.** Shared code: plan, renderer, writer, print, Ready.
- Plain words: "PDF", "pages", "locked PDF", "password". Never "decrypt", "encryption", "render".

## Review focus
1. A page selection or reorder must print exactly those pages in that order, with copies collated: the read-back page order must match.
2. The exact path must be used only when it is truly untouched (single unlocked PDF, all pages, original order, no turns, Colour, 1 copy). Its print.pdf must be byte-identical to the received file.
3. A password, wrong or right, must never reach disk or logs. Leaving the app and coming back asks again.
4. A PDF that hangs, bombs or crashes the engine must end as "damaged / too big", never a stuck spinner or an app crash, and must not affect the other files in the job.
5. On NONE-tier phones the fallback copy must be deleted after printing, and must never exceed 20 MB.

---

### Task 1: Engine — PDF facts and page rendering for customer PDFs
- **AIDL `pdfFacts(pdf, password)`:** returns `{pages, flags (1 = forms/annotations found), w1, h1, w2, h2, …}` (pt, after `/Rotate`, the first 500 pages) or `{code}` (password / unsupported / damaged / tooBig). The byte scan for `/AcroForm` and `/Annots` runs in the engine.
- **AIDL `renderCustomerPage(pdf, password, page, dst, maxLongSidePx, quality, grey)`:** opens with the phone's tier and renders the page fitted to `maxLongSidePx` onto white with `RENDER_MODE_FOR_PRINT`. Grey uses Rec.601. Returns `{w, h}`.
- **Fixtures:** `tests/generate/make-doc-pdfs.mjs` (pdf-lib, synthetic only) writes the following to `tests/fixtures/pdf/docs/`:
  - 1-page, 3-page, landscape, mixed sizes, `/Rotate 90`;
  - forms, annotations, blank page, tiny (72 × 72 pt), huge (14400 × 14400 pt), photo page, text/vector page;
  - truncated, garbage, zero-byte, corrupt xref.
  - 120- and 320-page files are made at test time.
- **Device tests:**
  - facts per fixture;
  - page pixel colours at known spots (orientation, `/Rotate`);
  - grey output R = G = B;
  - locked tiers (as in Phase 0);
  - every hostile fixture ends as an error code with the engine still usable.

### Task 2: Job model and plan for documents
- **Job:**
  - `pdf: Record<item, {pages, sizes: [w, h][], forms, locked}>` — facts only, no password;
  - `docPages: {item, page}[]` — the selection, in print order;
  - `docTurns: Record<string, 0..3>`.
- **Actions:** `setDocument` (all pages of all files in received order; photos as one page each; colour set to bw the first time), `setDocPages`, `moveDocPage`, `turnDocPage`.
- **`buildPlan` for documents:**
  - one sheet per selected page, the page fitted in A4 within 6 mm edges;
  - a sideways page goes on a sideways sheet;
  - `pdfPage` on placements;
  - `contentType: 'document'`.
- **Exact path:** `plan.exact = {item}` only when all §G4 conditions hold.
- **Tests:** vitest (selection order, copies, exact-path conditions incl. every disqualifier, mixed photos and PDFs); contract fixture 5 (document) for TS and JVM.

### Task 3: Native render of document plans
- `RenderPlan` accepts `pdfPage` placements and `exact`.
- `PlanRenderer`:
  - asks `renderCustomerPage` at the box's 300 dpi size;
  - grey document pages are written as `GREY8_RAW` (Flate);
  - the exact path copies the received file to `print.pdf.part`, the engine counts its pages, then rename.
- `renderPlan` takes `passwords: {item: string}` (memory only, never logged).
- **Tests:**
  - JVM: plan parse, exact copy and the page-count check;
  - device: a 3-page PDF with selection [3, 1] and 2 copies → pdf.js page order [3, 1, 3, 1]; B&W grey-only; exact path byte-identical; 10-page B&W timing and size per page.

### Task 4: Unlock PDF
- **Native tiers:** the password goes from JS to the engine per call.
- **Unlock screen:**
  - e-Aadhaar helper: 4 letters (made CAPITALS) + year of birth (number pad), building `RAMA1965`;
  - Other password;
  - Show (the text appears below, the field stays a password field);
  - autocomplete, autocorrect and spellcheck off;
  - wrong-password message.
- **Password memory:** a module map in `src/native/passwords.ts`, cleared on print, leave, delete and app start.
- **NONE tier:**
  - `@cantoo/pdf-lib` is lazy-loaded (it moves to `dependencies`, with a dependency note);
  - the WebView fetches the received file through the local server, decrypts it, and sends ≤ 20 MB in 256 KB chunks to `writeUnlocked`;
  - native writes `work/unlocked-<item>.pdf.part`, then renames it;
  - the engine treats it as unlocked.
- **Tests:** vitest (password builder, map clearing); e2e (Unlock flows: right, wrong, Show, helper); device (tiers on 35/36; fallback on 24/28/30 with all three encryptions; 20 MB cap; process death mid-transfer leaves no `.part`; a grep of job files and logcat finds no password).

### Task 5: Screens
- **Received:** a PDF or a mix goes straight to Ready as a document (§I-2). The photo choices explain that they need photos only.
- **Ready for documents:**
  - summary "1 PDF · 4 pages · A4 · Black & white · 1 copy";
  - Unlock first when locked;
  - forms/stamps banner on phones below the native tier;
  - over 300 pages: notice, and Pages to print opens first;
  - damaged PDF message.
- **Change:**
  - Pages to print: a tick grid with small page images made by the engine; select all / none;
  - Page order: Move earlier / later;
  - Turn page; Colour; Copies.
- **Tests:** e2e flows J5 (1 tap for a normal PDF), selection, order, turn, locked, damaged, forms banner, 320-page notice; matrix for new screens.

### Task 6: Hostile, lifecycle, performance, closure
- **Hostile:** bomb-like streams, absurd boxes, huge embedded image. The engine call has a time limit: a hung render is killed and reported as damaged.
- **Lifecycle:** Back, Cancel, rotation, process death mid-render or mid-unlock, a new share during a PDF job, a stale render.
- **Performance:**
  - open latency, page-thumbnail time, 10-page B&W Ready time;
  - engine and app PSS, temporary disk use, print.pdf size;
  - 20 repeated PDF jobs (leak check).
- **Closure:** 5-level regression; independent gate and re-review; `docs/qa/phase-7.md`; traceability §14 and §22; USER-CHECKLIST §D (own e-Aadhaar) and §K (real PDFs on paper).
