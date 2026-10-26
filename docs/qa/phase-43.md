# Phase 43: closure report (scanning paper pages with the phone's camera)

**Spec:** `docs/superpowers/specs/2026-10-26-round-8-photo-gap-text-scan-design.md`, parts 43a–43e.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 55–56 ("The phone's own camera", "Corners for scanned pages only").
**Rulings and open findings:** `docs/qa/phase-41-43-rulings.md`.
**Evidence:** `docs/evidence/phase-41-43/2026-10-27/` (SUMMARY.md lists every run).
**Commits:** 3b2ae32 (page finder, Clean colour), a86e709 (camera capture), d3f543a (screens), a6a42dd (device proof), 6c02541 (review fixes I2, I3, I4, I6, M3, M5).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check with real paper and the owner's phone and printer: USER-CHECKLIST §AE5–AE10.

## What Phase 43 delivers
- **Taking the photo (43a):** Home's **Scan pages** tile, and **Scan with camera** on a document's Add files. The phone's **own camera app** takes the photo; it is written straight into the job's private storage through the app's own non-exported provider, which opens only that one waiting photo, only for writing. No camera permission is declared or asked for. No camera app: "This phone has no camera app." Cancelled: nothing changes. If Android stops PrintSaathi while the camera is open, the photo is kept at the next start.
- **Finding the page (43b):** the engine looks for the page's four corners with the ID card finder's steps and a page's limits (any sheet from square to twice as long, either way up, 12–98 % of the photo). Found: its corners are proposed. Not found: the whole photo, with "Couldn't find the page's edges. Move the corners onto them."
- **Page n (43c):** the photo with **corner circles and side bars** (scanned pages only; photos, cards and documents keep side bars only). Without dragging: **Next point** (8 points: 4 corners, 4 sides) and the arrows. **Turn left / right, Whole photo, Retake** (a new photo in this page's place), **Done** (the corners are kept; the engine straightens the page when it prints).
- **Scanned pages (43d):** the straightened pages one at a time (Page n of N, Previous / Next), **Scan another page, Fix edges, Turn, Move earlier / later, Delete** with Undo, **the look of every page** (Clean colour, Original, Black & White, Sharp Black, OCV Black), **Finish (N pages)** → Ready. A scan job is a document of photos: Change, Pages to print and PRINT work as for any document; Ready says **Scanned pages · N pages** and has a **Scanned pages** button to come back.
- **Clean colour (43e):** a new colour print style (engine style 6), the default for scan jobs and offered in Print style for every job: the paper's shading divided out (white, even paper), writing darker, colours of stamps and ink kept.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Page finder on synthetic photographed pages: 40 slanted pages on wood / cloth / dark within 2 %, a 95 % page, none on 20 page-free photos; ID card results unchanged | PASS | PageDetectTest 5 (RED first); CardDetectTest 6, PanelsTest 5 unchanged |
| Clean colour: grey paper → ≥ 245, text ≤ 90, red stamp stays red; a shadow evened out (paper spread ≤ 10); golden pixels worked by hand | PASS | CleanColourTest 6 (RED first); RenderPlanContractTest (clean in colour only) |
| Capture store: only the waiting photo opens, only for writing; claimed once; nothing taken leaves nothing; a non-photo refused | PASS | CaptureStoreTest 7 (RED first) |
| Job model: scan jobs a document in Clean colour; retakeItem keeps the page's place; "Scanned pages" summary | PASS | scan.test 5 (RED first) |
| Screens: corners found, 4 circles + 4 bars at 56 px, Next point and arrows, not found, Done → Scanned pages → Finish, Move / Delete / Undo / Look, Retake, no camera, cancelled, Print style offers Clean colour, Add files → Scan with camera, 320 px | PASS | scan.spec 11 |
| Device (engine): the synthetic page found within 3 %; none on a bare table | PASS | PageDetectDeviceTest 2, API 35 |
| Device (print path): straightened by its corners (page-white where the table was, the stamp where it is on the page); Clean colour paper ≥ 245 and the stamp red; mutation-checked | PASS | ScanRenderDeviceTest 2, API 35 |
| Device (screens, real camera app): Scan pages → the emulator's own camera (shutter, Done) → Page 1 with circles and bars → Done → Scanned pages → Finish → 1 page in Clean colour; Back in the camera changes nothing; the app killed while the camera is open → the photo kept at the next start; no camera permission | PASS | round8-smoke API 35 (system camera) 9/9 |
| Review: a scan job opened again opens Scanned pages (I2); Colour brings back Clean colour (I3); a double tap opens one camera (I4); Retake keeps Pages to print (I6); Done waits for the finder (M3); a camera that gives no photo says so (M5) | PASS | scan.spec, scan.test, CameraGateTest (each RED first) |
| A real paper page with the owner's phone and printer | PENDING (owner) | USER-CHECKLIST §AE5–AE10 |

## Coverage statement
**Proven:** the finder, Clean colour, the capture store and the job model by tests written first; the screens in the browser; on an API 35 emulator the finder and the print path with a known synthetic page, and the whole flow through a real camera app (including cancel and the app being stopped).

**Not proven:**
- **A found page through the screens on a device.** Android 11+ lets only a pre-installed camera app answer the app's camera request, and the emulator's camera sees a room, not paper; the known page is proven through the engine and the print path instead (see the device notes).
- **Real paper and real phone cameras** (lighting, shadows, a page on a white table — where no page is found and the corners are moved by hand).
- **Phones whose camera app ignores the request's output place** (a few cheap phones save to the gallery instead): the app then says "The camera didn't give the photo. Please try again." — such a phone cannot scan; files from its gallery still print as photos or documents.
