# Phase 5 on the API 35 emulator (2026-10-16, build 226d62d)

Driven through the real app (web buttons clicked through the WebView DevTools socket; Android's print screen and
file picker through UiAutomator). Only "Save as PDF" exists on the emulator.

## Test page (Settings → Print a test page → A4 paper)
- Android's print screen opened with **ISO A4** preselected and 1 page.
- Saved file read back with pdf.js (operator list, transforms applied):
  - the square is **50.00 × 50.00 mm**;
  - all 20 passport boxes are **35.00 × 45.00 mm**.
  - The print spooler wrote the page as 595 × 841 pt, rounding A4's 595.28 × 841.89 to whole points. Our content was not scaled.
- PrintSaathi then said: "This was saved as a file, not printed. On the print screen, choose the shop printer at the top." It asked for nothing to be measured (`api35-testpage-a4-result.png`).
- Save as PDF did **not** count as setting up the printer: Home still shows "The shop printer is not set up yet", and no paper file was stored. The test file and print record were gone after Done.

## Big job in parts (6 photos × 8 copies = 48 sheets)
- Ready showed:
  - the summary "6 photos · 6 pages · A4 · Colour · 8 copies";
  - "A big job: it prints in 2 parts of up to 40 pages. This is part 1.";
  - 40 sheets, and the button **PRINT PART 1 OF 2** (`api35-ready-part-1-of-2.png`).
- Android's print screen showed 40 pages (1/40 …).
- The saved file had **40 pages** and was **142 KB** (the six photos are stored once and reused).
- Saved as a file, so Result offered **Print again** (the same part), not the next part.

## Not proven here
- Part 2's file on a device: only a print the printer took moves on to the next part, and the emulator has no printer. Navigation to part 2 and "printed only after the last part" are e2e tests. Part 2's file comes from the same renderer with a different page list.
- Calibration with a real printer: whether the 4×6 size and margins are stored and preselected next time (USER-CHECKLIST §I).
