# Phase 19 — closure report (print as a document; original photos untouched)

**Spec:** `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`, Part 6.
**Plan:** `docs/superpowers/plans/2026-10-23-phase-16-18-adjust-passport-medium.md`, Task 11b.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-23.md` rows 7 and 8.
**Commits:**
- 50593eb document content type and the as-is copy;
- 5ec8a9f photo notes left out (self-audit).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: print speed and quality on the shop's
Brother (USER-CHECKLIST §X8–X10).

## What Phase 19 delivers
- **Every job goes to the print service as a document** (the printer's normal, faster mode). Photo layouts have
  Change → **Print quality**: "Normal (faster)" (the default) or "Best photo quality (slower)", which sends the photo
  type as before. Nothing about the file changes: same pages, same resolution, same sizes.
- **Original photos untouched:** a JPEG placed whole goes into the print file as **its own picture, byte for byte**
  (no decode-and-save) when all of these hold:
  - placed whole, with no crop;
  - turned only by its own camera note (never a mirrored one);
  - Original style, in colour;
  - no more pixels than its printed size needs at 300 dpi.
- **Who decides:** the isolated engine reads the JPEG's header and says whether it qualifies: baseline or progressive,
  8 bit, YCbCr, no colour profile or an sRGB one. Anything else is drawn as before.
- **The picture only:** its notes are left out (self-audit, 2026-10-24). That means:
  - the EXIF note: where and when the photo was taken, and the phone;
  - XMP, IPTC, comments and the colour profile;
  - anything after the picture: a second picture, a depth map.
- **Bigger photos** are still reduced to 300 dpi at their printed size: the same on paper, less data, faster.

## Acceptance (spec Part 6)

| Criterion | Result | Evidence |
|---|---|---|
| Unit tests for the rule | PASS | quality.test 3, plan contentType tests; JVM JpegAsIsTest 10 |
| JVM: a qualifying JPEG's picture appears unchanged in the print file | PASS | JpegAsIsTest (`pictureOnly` equals the picture byte for byte, baseline and progressive); PlanRendererTest camera turn |
| Device: the print file of a WhatsApp-sized photo contains the original picture | PASS | JpegAsIsDeviceTest 3/3 API 35: every decoded pixel equal, no EXIF and no profile. adjust-smoke `originalPhotoInTheFileByteForByte` (21,077 picture bytes found in the print file), `photoNotesLeftOutOfThePrintFile` |
| Every print request is a document unless Best photo quality is chosen | PASS | quality.test, e2e (the mock records the content type) |
| Speed on the shop's Brother | PENDING (owner) | USER-CHECKLIST §X8–X9 |

## Device findings and fixes
1. **The sRGB profile.** Android's own JPEG encoder embeds an sRGB colour profile. The first rule refused every
   profile, so no phone photo qualified. A profile now qualifies when it describes itself as sRGB; Display P3 and
   others are converted as before.
2. **The as-is answer was refused.** The app side rejected the engine's 7-number answer. It is now accepted only with
   the as-is path and a turn of 0–3.
3. **Self-audit (privacy):** the original's notes went into the print file. Fixed in 5ec8a9f; see
   `docs/evidence/phase-19/2026-10-24/README.md`.

## Whole-branch review (fresh reviewer)
- **I3:** the as-is path was not checked on the real printer, and checklist X10 used a 12 MP photo that never takes
  that path.
  - X10 now uses a WhatsApp-sized photo.
  - X11 prints a progressive JPEG (`tests/fixtures/prog-small.jpg`) on the Brother.
  - **Ruling:** progressive JPEGs keep the as-is path, as the spec says, until X11 is done. The fallback is one line
    in `JpegAsIs.qualifies`.
- **Minor 5, re-graded Important:** "Best photo quality" was offered on 4×6, where it could change nothing. It is no
  longer offered there.
- **Minor 9:** the as-is camera turn is now read with ExifInterface, like every other path; mirrors are refused. A
  device test checks agreement over 9 variants. No input was found where the two readers disagree, so this change
  could not be shown failing first.
- **Minor 10, re-graded Important:** JPEGs stored as RGB (components named R, G, B) would print with wrong colours.
  They are drawn as before. JVM test seen failing first.
- **Minor 12, re-graded Important:** a regression from the notes fix. Print style examples of tiny camera-turned
  photos showed sideways. Previews (JPEG 85) never take the as-is path now. Device test seen failing first.
- **Device suite finding:** PlanRenderDeviceTest still expected the camera-turned photo to be re-saved upright. Under
  owner decision 8 it goes in as stored and the page turns it. The expectation is updated; its colour checks prove
  every photo prints upright (9/9 on API 35).
- **Deferred minor:** the as-is copy holds about 4× the file in memory. It is bounded, and the engine's own
  out-of-memory handling applies.

## Final regression
See `docs/qa/phase-16.md` (Phases 16–19 were regressed together) and `docs/evidence/phase-16-19/2026-10-24/regression/SUMMARY.md`.

## Coverage statement
**Proven:**
- the content-type rule (unit, e2e);
- the JPEG header and picture rules on JVM fixtures, including 300 randomly damaged files;
- on the device:
  - identical decoded pixels and no notes in the print file;
  - camera turns that agree with ExifInterface over 9 variants;
  - previews never as is;
  - every photo upright in the print file (PlanRenderDeviceTest colour checks, pdf.js check on three levels).

**Not proven:**
- print speed and quality on the shop's Brother;
- whether the shop printer's path reads a progressive JPEG correctly (USER-CHECKLIST §X8–X11).
