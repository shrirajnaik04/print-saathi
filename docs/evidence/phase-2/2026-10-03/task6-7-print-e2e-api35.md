# Phase 2 Tasks 6–7: share → print file → Android print → result (API 35 emulator, 2026-10-03)

Device: `Medium_Tablet` AVD, Android 15 (API 35), debug build of `e6a4e4b`. Real app, real isolated engine, real
Android print system. "Save as PDF" stands in for the shop printer (the real Brother is a user check, A0).

| Step | What happened | Evidence |
|---|---|---|
| Share 6 photos (test sender, `six-photos`) | Received: "6 files" | screenshot in session |
| One on each page | Ready: "6 photos · 6 pages · A4 · Colour · 1 copy"; each wide photo shown on a sideways page | — |
| Print file | `out/<planHash>/print.pdf` (181 KB) + `print.json`; `work/` cleared; engine process ended after ("isolated not needed") | adb ls, logcat |
| PRINT | Android print screen: A4 preselected, 1 copy, 6 pages | `api35-print-dialog-6-pages.png` |
| Save to PDF | File name offered: `PrintSaathi.pdf` (never the customer's) | — |
| Result | "This was saved as a file, not printed. On the print screen, choose the shop printer at the top." | `api35-result-saved-as-file.png` |
| Saved file (pdf.js) | 6 pages, 1 photo each, all drawn turned; photo boxes identical to ours | see note |
| After Result | print record and print file deleted; job not marked printed (saved ≠ printed) | adb ls |
| Print again → PRINT → kill the app (`kill -9`) while the print screen is open | record had ids only (`jobId`, `planHash`, label `PrintSaathi 38502`, flags); Android closed its print screen | adb |
| Reopen the app | Result: "Printing was interrupted. Tap Print again." | `api35-result-interrupted-after-kill.png` |
| Logs | 0 PrintSaathi log lines with `no_backup`, `/jobs/` or photo names | logcat grep |

**Note (proven intentional, Android behaviour):** Android's *Save as PDF* rewrote the page box to whole points
(595 × 841 pt = 209.9 × 296.69 mm). The photo boxes are unchanged (x 17.0079, w 561.2598, h 748.3465; y shifts
by exactly the 0.89 pt trimmed from the top), so only blank edge is lost. Our own file is exact A4 (render-check:
595.2756 × 841.8898, every box within 0.1 pt). What a real print service does to scale is the Phase 5 ruler test.

**Not proven here:** a real printer (sent / printing / blocked / failed states), the wrong-paper guard in a real
dialog on this build (proven in Phase 0 spike b with the same rules; unit tests cover the classification), API
24/28/30/36 (next device regression), a WhatsApp share (user checklist).
