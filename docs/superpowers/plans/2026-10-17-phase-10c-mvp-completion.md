# Phase 10c — MVP completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the R2 MVP items (PLAN §K) that the Phase 10b audit found missing or partial, so V1 matches the approved scope before Phase 11 (UX validation with the shopkeeper).

**Source:** Phase 10b gate review, Part B (ledger, 2026-10-17). Each item was re-checked in the code.

**Spec:** docs/PLAN.md §K1, §K3, §K9, §K12, §D2, §D4, §I-5, §I-6/7, §I-14, §I-16, §I-18, §J8, §H2.4.

## Global Constraints
- As in every phase: plain English, no jargon; one question per screen; ≥ 56 dp targets.
- Customer files are parsed only in the engine. No new dependency.
- Exact print size. Print quality never lowered.

## Tasks (ordered by the owner's priority list: simplicity → reliability → print correctness → senior UX)

### Task 1: Photos on 4×6 photo paper; a Paper choice (§K3, §I-6/7, §I-15)
- **Change → Paper:** A4 or 4×6 photo paper, with pictures. Offered only when the shop printer's 4×6 paper was calibrated (test page); otherwise A4 only, with one line saying why.
- **Photo layouts use the chosen sheet.** The paper is remembered per job type (settings, like colour), and the summary names it.
- **Native:** PrintPlan `paper.id = PHOTO_4x6` for photo layouts (passport already prints on it). The calibrated mils go to the print request, and the content type is photo.
- **Tests:**
  - vitest: layouts on 4×6, both directions; plan contract fixture;
  - e2e: Paper screen, summary, remembered;
  - device: render check on 4×6.

### Task 2: "This photo is small — it may print blurry" for photo layouts (§K3, §F6)
- The renderer's low-resolution list is computed for every photo against the PLAN thresholds: photos < 100 dpi, documents < 120 dpi, passport < 200 dpi (as today).
- **Ready:** one panel naming the photos.
- **Tests:** JVM threshold per type; e2e.

### Task 3: Print service check (§D4, §K12, §I-18, §J8 "No print service")
- **Native `printServices()`:** the installed print services (queryIntentServices for `android.printservice.PrintService`, with a `<queries>` entry), plus whether the phone has Android's built-in one.
- **Home owner section and Help:** "No printing app on this phone. Ask the person who set up this app to install the Brother Print Service Plugin or Mopria" when none can print. Help also covers "only Save as PDF appears".
- **Tests:** JVM classification; e2e Home/Help; device (API 24 has none built in; API 35 has the default service).

### Task 4: Unsupported and unprintable files are named, never dropped (§K1, §J8)
- **Received:** Word, Excel, PowerPoint, video, audio and other files get "This is a Word file. PrintSaathi can't print Word files yet. Ask the customer to send it as a PDF." This replaces the stale "PDFs arrive in a later update".
- **Ready (document and mixed jobs):** "1 file can't be printed (a Word file)" — never a silent drop.
- **Tests:** vitest messages; e2e.

### Task 5: "No" after printing offers Send problem report (§J8 "Print looks wrong")
- **Result:** after "No", the help text, Print again, and **Send problem report**.

### Task 6: Ready: Previous page / Next page buttons (§I-5, §H2.4)
- Big buttons step through the real print pages with "Page 2 of 5". The scrolling list stays.

### Task 7: Recent jobs: a picture of each job and Print again (§I-14, §K9)
- Each row shows the first photo's or page's thumbnail.
- **Print again** opens the job's Ready directly, with the last choices.

### Task 8: First-run help (§I-16, §K12)
- On the first start only: four short steps with pictures:
  - share from WhatsApp;
  - pin PrintSaathi in the share sheet;
  - set up the printer (test page);
  - don't change anything on the print screen.
- Next / Done. Help shows the same steps later.

### Task 9: Locked PDF: Print without this file (§J8 "Locked PDF")
- The Unlock screen and Ready's locked panel offer **Print without this file**, which removes it, with Undo.

### Task 10: The same photo twice in document and mixed jobs (§J8 "Duplicate photos")
- Ready shows the duplicates banner: Keep both (default) / Remove extra copy.

### Task 11: Receiving files: words, a bar and Cancel (§D2, §I-4, §H2.7)
- **Native:** intake progress events (k of n files); `cancelIntake` stops after the current file, keeping the files already received.
- **Web app:** a "Receiving files… 12 of 60" screen with Cancel, shown while a share or pick is copying.

## Rulings (not built, with reasons)
- **Resuming an interrupted copy (§D2):** the share's read permission ends with its task, so a restart can almost never read the URIs again. The plan's fallback ("Couldn't finish receiving N files. Please share them again.") is what runs.
- **150 MB part size:** the Phase 5 ruling m4 (measured) stands.
- **HEIC:** ADR-003 option C (owner decision, 2026-10-17).
- **WebView cache after a background deletion:** cleared by the next in-app sweep (start / resume). Deleted files are never served (the paths are gone).
- **Deletion at expiry with "1 hour":** the daily cleanup runs only while the phone is idle. Every start, resume and print also sweeps, so a job past its hour goes at the next use. To be confirmed on the shopkeeper's phone (USER-CHECKLIST §N6).

## Closure
- **Regression and review:** 5-level device regression, gate review.
- **Documents:** `docs/qa/phase-10c.md`, traceability, USER-CHECKLIST.
