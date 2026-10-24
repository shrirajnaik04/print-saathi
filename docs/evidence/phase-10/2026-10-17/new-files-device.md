# New files arrived — device run (API 35 emulator, Medium_Tablet, emulator-5580), 2026-10-17

Synthetic photos from the test sender only.

1. Share six-photos → Received (job A, 6 files).
2. Share single-photo while A is open → **New files arrived**: "1 new file arrived while this job is open." with
   Start a new job / Add them to this job / Keep working on this job.
3. Add them to this job → Received shows "7 files". On disk: one job folder only (B's folder deleted after A was
   saved); A/src holds 0001–0007.jpg (0007 = B's photo, hard-linked then B deleted); job.json rev 2,
   intakeIds [A, B], order [1..7].
4. All on one page → Keep as they are → Ready: "7 photos · 1 page · A4 · Colour · 1 copy"; out/<hash>/print.pdf and
   the real-file preview were made: the added photo passed the "only this job's own files" check and is the 7th
   placement on the sheet.
