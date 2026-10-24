# Phase 10b device checks — API 35 emulator (Medium_Tablet, emulator-5580), 2026-10-17

Synthetic photos from the test sender only.

1. **Retention follows Settings natively.** A job made 2 hours old (job.json updatedAt + file times):
   - with no settings (default 1 day): kept at the next start;
   - with `state/settings.json` = `{"v":1,"retention":"1h"}`: deleted at the next start ("retention: 1 old jobs deleted").
2. **Diagnostics after a session** (share 6 photos, One on each page, print file made): `no_backup/diag/log.jsonl`
   holds only `start {sdk}`, `intake {files, problems}`, `render {pages, ms, outcome, noSpace}`. A search for
   `no_backup`, `/jobs/`, `.jpg`, `.pdf`, the share's tag and `photo-` found 0 lines.
3. **Send problem report** opens Android's share sheet with the report: versions, phone, RAM, WebView, unlock tier,
   shop, settings, events (`problem-report-share-api35.png`).
4. **Choose from phone** (synthetic photos pushed to /sdcard/Pictures/ps-test, `three.pdf` to Download):
   - Photos → Android's Photo Picker ("This app can only access the photos you select", `choose-photos-picker-api35.png`)
     → 2 selected → Add (2) → Received "2 files"; the job's src holds 0001.jpg and 0002.jpg (copied by the intake).
   - Passport photos → Photo Picker (single) → one tap → "Fit the face in the frame".
   - Documents & PDF → the system file picker → Documents → three.pdf → Ready "1 PDF · 3 pages · A4 · Black & white"
     (`choose-pdf-ready-api35.png`).
   - Not run: Android 7–12 (no Photo Picker → the system file picker; those emulator images show the WebView gate).
