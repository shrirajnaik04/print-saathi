# Phase 49: closure report (round 11: Move to page, Passport photos first, the crop corner, the rotation knob, passport photos as they are)

**Spec:** `docs/superpowers/specs/2026-11-08-round-11-move-to-page-design.md`. **Plan:** `docs/superpowers/plans/2026-11-08-round-11-move-to-page.md`.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 66–71.
**Rulings and findings:** `docs/qa/phase-49-rulings.md`. **Evidence:** `docs/evidence/phase-49/2026-11-12/` (SUMMARY.md lists every run).
**Commits:** 1c6722b, ecc7c27 (review fixes), b6c106e (turn handle), 9428cf5 (passport photos), 9e699ac (device evidence). **Release APK:** 1.0.316 (9e699ac), `apk/PrintSaathi-1.0.316-9e699ac.apk`, 1.5 MB, sha256 `2f2fc080fd739b37ffe5838717e7ba33f30c78605c9e44581c28e9126d4014cd`.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the shop printer and the owner's phone: USER-CHECKLIST §AH.

## What Phase 49 delivers
1. **Move to page** (Adjust, photos). Choose a photo → **Move to page** → a list: every other page ("Page 2", "3 photos"), **A new page at the end**, **Cancel**. The photo keeps its size; if its place is free on the new page it stays exactly there, else it takes the first free place (top row first, 2 mm from every other photo, inside the margins); if the page has no room it goes there anyway and the note says so and what to do. One Undo step; Android Back and Escape close the list. The page it left disappears if empty and the others count again (the note names the number *after* that).
2. **Home:** Passport photos first, Photos second.
3. **The resize corner** is an L on the photo's own corner (white with the main colour's ring, like the side handles), not a round dot; same behaviour, touch area still 56 px.
4. **The turn handle** is a white knob with the Turn tool's circular arrow, not a solid blue dot; same behaviour.
5. **Passport photos as they are** (owner: "best quality I meant image as is", and "even with best quality the print must aim for fast printing"): made from the photo's own pixels up to 600 dpi of 35 × 45 mm (1063 px tall; before, 532 px), JPEG quality 98 (was 92), never fewer pixels than the photo has and never enlarged; still **one image stored once** for all copies on the sheet; still sent as a document, the printer's fast mode.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Move to page: any page, a new page, keeps size and place, first free place, covers-note, renumbering, gaps, sideways, turned, huge, flowing layouts fixed first | PASS | movePage.test 26 (RED first; property test: never off the paper, "clear" never claims a clash is clean) |
| The list: 320 px at 200 % text with 12 pages, axe clean, 56 px buttons, Cancel reachable; Back, Escape, focus on the question, Undo/Redo, off while a photo is held | PASS | round11.spec (14, repeated 10 × at 8 workers: 120/120) |
| The corner and the knob are shapes (clipped L; white knob with an arrow), touch areas ≥ 56 px | PASS | round11.spec; screenshots on API 35 debug and release builds |
| Passport photos ask for 600 dpi on A4 and 4×6, with and without a border, colour and B&W, custom size; other jobs 300 | PASS | passportQuality.test 4 (RED first); shared fixture `plan-v1-passport.json` |
| The renderer takes whole numbers 300–600 only, makes such photos with the finer decode once, judges blurry against the photo's own dpi | PASS | RenderPlanTest, PlanRendererTest ×2, RenderPlanContractTest |
| Real engine: 12 and 30 passport photos → one 797 × 1063 image; a 600 × 800 source keeps its own pixels | PASS | PassportQualityDeviceTest ×3 (API 35): `passport-quality/` |
| Real phone screen: Home order, list, move to page 2 and back, the print file has two pages and then one, the moved photo alone on page 2 at its own place | PASS | round11-smoke API 35 8/8 (print file read back by pdf.js) |
| The shrunk, signed release build | PASS | release-round11, release-smoke, release-cards, privacy on 1.0.316 |
| Older features on a device | PASS | API 35 smokes: place, adjust, card, rotate, round3–10 |
| Whole-branch regression | PASS | API 24: 108 passed, 8 skipped (by design); API 35 and 36: 116 passed; share matrix 15/15 each; render checks exit 0; no crash; privacy hits 0 |
| Browser suite, unit tests, size | PASS | 1,952 passed, 24 skipped, 0 failed; unit 649 + 96 script tests; Android JVM 443; startup JS 47,544 of 61,440 B |
| Whole-round review | PASS | 0 Critical, 3 Important, 8 Minor; all fixed test first or proven intentional |
| Print speed and sharpness of passport sheets on the shop printer; the handles on the owner's phone | PENDING (owner) | §AH |

## Coverage statement
**Proven:**
- the move rules by unit and property tests; the screens by browser tests at 320 px with 200 % text and axe;
- the move on a real phone screen and in the printed file (pdf.js reads the file back);
- the passport image sizes, count and render time on the real engine (API 35), the parsing and decoding rules by unit tests;
- the whole branch on Android 7, 15 and 16 emulators; the shrunk, signed build on Android 15.

**Not proven here:**
- **Paper:** how passport sheets look on the shop printer and how long they take to print. The only change is a bigger, finer picture (about 0.33 MB, made in about a second on an emulator, in the same fast printer mode); the printer's own speed was not measured.
- **TalkBack** reading of the page list; the handles under a real thumb on the owner's phone.
- **Not built:** dragging a photo across pages; moving several photos at once; moving a whole page; Move to page for ID cards, passport sheets and documents; the printer's Best photo mode for passport sheets.
- **Old WebViews (Chrome 92):** no image here has one. The API 24–29 images' WebView is below the app's minimum and their screens do not run (a known limit since Phase 10; an attempt to run round11-smoke on API 24 stopped at the "update WebView" gate, as expected). The new CSS was read against the stylesheet's own Chrome 92 rules (a unit test) and by the reviewer (nothing newer than Chrome 79 was found), not seen on a Chrome 92 screen.
- **API 36:** run on a read-only copy of the AVD because the owner's own emulator was using it.
- **The privacy smoke** also ran once against the previous round's release APK before this round's was built; it was repeated on 1.0.316 (PASS).

## Known test-environment weakness (not caused by this round)
Two `shell.spec.ts` browser tests wait 5 s for a lazily loaded PDF page and fail when the whole suite runs at 8 workers on a busy PC; they fail the same way on the previous commit and pass alone. Listed for the owner; see `phase-49-rulings.md`.
