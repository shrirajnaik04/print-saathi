# Phase 10c device spot checks — API 35 emulator (Medium_Tablet, emulator-5580), 2026-10-17

Synthetic files from the test sender only.

1. **First start** (pm clear): Home opens "Welcome to PrintSaathi · Step 1 of 4"; Next ×3 → Done → Home; not shown
   again.
2. **Receiving a slow share** (sender `six-slow`, about 2 s a photo): "Receiving files… 2 of 6" with a bar and
   Cancel (`receiving-api35.png`), then "Files received · 6 files" in its place. A fast 20 × 12 MP share (64 MB,
   copied in under a second) went straight to Files received: the screen never flashed.
3. **Office file** (sender `office`, a .docx): Received "1 file · Nothing here can be printed yet" and under the file
   "Office file: can't be printed yet. Ask for a PDF."
4. **Recent jobs**: each photo job shows its own first photo (`recent-covers-api35.png`).
5. **A share that brought no file** (a wrong local copy step): "Couldn't receive 20 files. Please share them again
   from WhatsApp." — as designed.

Not on a device here: photos on calibrated 4×6 paper (needs a real printer's 4×6 test page; the plan is checked
by the contract fixture and the render path is shared with passport sheets), the print-service warning (API 35 has
Android's own service; Android 7 is checked by PrintServicesDeviceTest in the regression).
