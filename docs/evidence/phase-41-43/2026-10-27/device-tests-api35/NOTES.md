# Round 8 device proof (Task 8), API 35 emulator (Medium_Tablet, emulator-5580)

- `round8-device-tests-api35.xml`: PageDetectDeviceTest 2, ScanRenderDeviceTest 2, TextPdfDeviceTest 6 — 10/10 pass.
  - PageDetect: a synthetic page photographed at a slant on a brown table, found by the isolated engine within 3 % of
    its corners; a photo with no page finds none.
  - ScanRender: through the real print path (PlanRenderer + engine), the page prints straightened by its corners
    (page-white near all four box corners, the red stamp where it sits on the page), and in Clean colour the paper
    prints ≥ 245 and the stamp stays red.
  - Mutation check (run once, then restored): with the corners left out of the plan and Original instead of Clean,
    both ScanRender tests FAIL (2/2 failures) — the test tells a straightened page and Clean colour apart.
- `../round8-smoke-api35/`: `scripts/device/round8-smoke.mjs` with the emulator's own camera app (system mode).
  9/9 checks: no camera permission; a WhatsApp text message (80 lines, English + Devanagari, marks) prints as 2 A4
  pages; Scan pages → the real camera app (shutter, Done) writes into the app's private storage through its provider →
  Page 1 with 4 corner circles and 4 side bars → "Couldn't find the page's edges" (the emulator's camera sees no paper)
  → Done → Scanned pages → Finish → 1 page printed, "Scanned pages · 1 page · … · Clean colour"; Back in the camera
  changes nothing; the app killed (am kill) while the camera was open → the photo is kept and opens at the next start;
  six photos on one page are ≥ 10 mm apart (smallest gap 10.00 mm).

## What could not be run, and why
- **The fake camera in the app's screens.** Since Android 11 only a pre-installed camera app answers an implicit
  IMAGE_CAPTURE request, so the test sender's fake camera cannot answer on API 30+; on API 24–29 images the app's
  screens cannot run at all (their WebView is below the app's minimum, the known Phase 10 limit). An API 24 run was
  tried and stopped at the app's own "needs an update" screen. The fake camera's known page is therefore checked by the
  device tests above (finder and print path) instead of through the screens. The smoke keeps the fake mode for an
  emulator image that has both a new WebView and API < 30, should one be available.
- **A real paper page through a real phone camera:** PENDING REAL-WORLD VALIDATION (owner's phone).
