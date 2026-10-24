# Phase 10 — Robustness, performance & security: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** prove PLAN §P, §Q and the §R level-12 adversarial checklist on the emulators. Measure every budget, fix what misses, and record the rest as PENDING REAL-WORLD VALIDATION (real low-end phone, the shopkeeper's phone).

**Architecture:** no new architecture. Device scripts measure and attack the existing app. Findings are fixed in place. Big-job mode is the only new behaviour (PLAN §F6).

**Spec:**
- PLAN §P (budget table);
- §Q (threat model);
- §R levels 8–12 (races, performance, security/privacy, adversarial);
- §F6 (big jobs);
- §D2/§D2c (hostile intake, races);
- §T Phase 10 exit: "Section P met; adversarial suite: 0 crashes, 0 silent losses, 0 mismatches".

## Global constraints
- **Destructive tests only on my own emulators and temp data.** Never on emulator-5554 (the owner's).
- **Customer-like data only synthetic.** Logcat and evidence are privacy-checked before saving (HARNESS.md).
- **Optimise only without loss of print quality** (owner decision 2026-10-17). A budget missed only by a synthetic extreme is recorded as an evidenced exception, never forced.

## Review focus
1. Memory after 20 jobs of 6–20 photos stays within idle + 10 %, and the engine always lets go.
2. Big jobs (30–100 photos, > 150 MP): progress with words, Cancel that really stops, no out-of-memory, and the order kept.
3. Kill on every screen (HOME → `am kill` → reopen): same job and step, or the Continue card; no file lost; no duplicate.
4. Release build: no INTERNET, no backup or transfer, no debug logs with names or paths. A network monitor shows 0 bytes.
5. Fuzzed print plans and hostile files never crash the app process.

---

### Task 1: Performance budgets (PLAN §P)
Script `scripts/device/perf.mjs`, on API 24 / 2 GB, API 28 / 2 GB and API 35. Every row of §P is measured or marked N/A with a reason:
- cold start (`am start -W` + JS mark);
- share 6 → Received;
- choice → Ready (6 photos A4, with the file preview);
- mini previews;
- 10-page B&W PDF;
- 108 MP one per page;
- 20 × 12 MP on 2 pages;
- first engine bind;
- peak PSS during the 20 × 12 MP job;
- idle PSS on Home;
- 20 jobs leak check;
- print-file sizes;
- startup JS / CSS (`npm run size`);
- APK (`apkanalyzer`);
- long tasks (PerformanceObserver in e2e).

Results go to `docs/evidence/phase-10/<date>/perf.md`. Misses are fixed or recorded with a reason.

### Task 2: Big-job mode (PLAN §F6)
For more than 30 images or more than 150 MP:
- thumbnails and analysis in groups of 10, with "Preparing 12 of 60 photos…" and a Cancel that stops between groups;
- refuse more than 100 files, as the intake already does: verify.

**Tests:** e2e with mocks; device test with 60 synthetic photos on API 24 / 2 GB (time, PSS, Cancel).

### Task 3: Adversarial and race suite (PLAN §R levels 8 and 12)
Script `scripts/device/adversarial.sh` plus UiAutomator where needed. Each check gets PASS / FAIL with evidence:
- 30–100 photos;
- the same photo × 10;
- rotate and send to the background during processing;
- Cancel at every stage;
- low disk during a write (fill with a temp file);
- a giant panorama;
- 100 MP;
- transparent PNG;
- CMYK JPEG and odd PDFs;
- mutated and corrupt PDFs and images;
- truncated streams;
- deceptive extensions;
- decompression bombs;
- absurd page boxes;
- zero-page and empty files;
- rapid PRINT taps;
- Back mid-processing;
- a new share during intake, render and the print screen;
- kill on every screen (HOME → `am kill` → Recents) and with "Don't keep activities";
- 20+ repeated jobs.

### Task 4: Fuzz
- **Plan fuzz:** random valid and invalid PrintPlans into `RenderPlan.parse` + `MiniPdfWriter` (JVM, fast-check-like seeded generator). Valid ones become PDFs readable by pdf.js; invalid ones are refused, never crash.
- **Sniffer fuzz:** mutated headers.
- **Detector fuzz:** random grey images never throw and never suggest outside the limits.

### Task 5: Security and privacy review (PLAN §Q, §R level 10)
- The `security-audit` skill, or an equivalent fresh reviewer, over the whole app.
- Merged-manifest test for the release build: no INTERNET; `allowBackup=false`; data-extraction rules; only MainActivity exported; the engine isolated.
- Backup dry-run (`bmgr`).
- Network check (no sockets).
- Logcat grep for names, paths and passwords across a full session.
- Time-shifted retention: 1 hour / 1 day / 7 days.
- Recents thumbnail: API 33+ hidden; ≤ 12 secure flag.
- `npm audit` / osv-scanner.

### Task 6: Closure
- 5-level regression.
- Gate review and re-reviews.
- `docs/qa/phase-10.md`.
- Traceability §26–27, §38, §40–44.
- USER-CHECKLIST: performance on the shopkeeper's phone.
- Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION (real low-end phone).
