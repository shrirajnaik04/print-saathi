# Phase 28: closure report (turn a photo to any angle from the photo itself)

**Spec:** `docs/superpowers/specs/2026-10-24-round-3-edges-colour-big-preview-rotate-design.md`, Phase 28.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-25-28-edges-colour-big-preview-rotate.md`, Tasks 8–10.

**Commits:**
- c0fd321: photos turned to any angle in the job, the layout and the plan.
- 20634ed: the engine prints a photo at any angle.
- 16d7c90: turn a photo to any angle from the photo itself.
- 9a953c7: review fixes I2 and M4 (turning keeps the photo's size and place under the finger; no snap back).

**Release:** 1.0.239-b34bbe7 in `apk/` (sha256 `93ee3db5…f80e`). The device and release evidence is in `docs/evidence/phase-25-28/2026-10-24/regression/SUMMARY.md`.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check: how the handle feels on the owner's phone, and a turned photo printed on the Brother (USER-CHECKLIST §Z7).

## What Phase 28 delivers

The owner's message, with a WPS screenshot: "Allow to rotate images from the image itself… press and hold on that icon and rotate however we want."

- **The round handle:** on Adjust (photo jobs), the chosen photo has a round handle on a short stick above its top edge.
  - Press it and move the finger around the photo: the photo turns to follow, about its own centre, keeping its size.
  - The angle shows on the photo ("20°").
  - Within 3° of straight (0°, 90°, 180° or 270°) it clicks straight.
  - Lifting the finger saves the angle. A photo placed by hand is put on top, as with other changes.
  - The photo stays drawn at its new angle while it saves; it never jumps back first.
- **Buttons:** **Tilt left** and **Tilt right** turn it 1° a tap, for keyboards, screen readers and fine steps. Turn still turns 90° and keeps the tilt.
- **A turned photo keeps its own size** (as in Word).
  - On the page it takes the room of its turned outline, and the other photos flow around it.
  - Automatic sizes are kept as they are when it first turns (review I2).
  - A photo placed by hand turns about its centre and stays inside the margins.
  - A photo that fills the page is made smaller so its turned outline still fits (spec).
- **Its frame turns with it:** the outline, the round corner (which still resizes it, along its turned sides) and the handle all turn. Side bars are hidden while it is turned (Crop is the way). The size line gives its own size and the angle.
- **Stored** as the quarter turns the job already had plus a tilt of −45°…45° (0.1° steps).
- **Printing:**
  - The engine makes the photo at 300 dpi of its own size, never of its bigger outline.
  - The print file draws it with one matrix turned about the outline's centre, with no second image and no lost sharpness.
  - Adjust, Ready and the small previews draw it the same way.
- **Other kinds keep Turn:** document pages, passport photos and ID cards. The engine refuses a turned PDF page or passport photo.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Unit: angle ↔ quarter turns + tilt round trip; outline and own-size maths; snap; shown degrees | PASS | tilt.test 5 (RED first: no module; −0 caught) |
| Unit: outlines stay inside the margins, flowing photos never overlap, the plan carries the tilt and the photo's own size | PASS | plan.test tilt 4, incl. a 300-run property; job.test rotate 3; the review's own 2,000-plan check found every outline within the engine's 0.5 pt |
| JVM: a tilted plan is accepted and made at 300 dpi of its own size; a sideways page keeps the tilt; bad tilts, a tilt on a PDF page or a passport photo are refused; one matrix turns the photo about its centre; a camera-turned photo is turned, then tilted | PASS | RenderPlanContractTest 3, MiniPdfWriterTest 1, PlanRendererTest 2 (RED first: compile / stashed renderer) |
| pdf.js reads each image's angle back; angles are compared within 0.1° | PASS | render-check.test 2 (RED first) |
| e2e: the handle turns the photo, shows the degrees and saves on release; clicks straight; Tilt buttons; Turn keeps the tilt; no side bars, the corner resizes; the size line; placed by hand turns about its centre; turning past the half turn; on a phone; the photo keeps its size and centre while turning and never snaps back; other kinds have no handle | PASS | rotate.spec 11 (RED first; review I2 and M4 RED first) |
| Device: the web app's hand-placed plan with photo 1 at 10° prints red where photo 1 is and white in its outline's corner; pdf.js reads every box and angle back | PASS | PlanRenderDeviceTest `theWebAppsHandPlacedPlanPrintsEveryPhotoAtItsBox`; `regression/run2/render-check-free-*.json` (API 24, 35 and 36) |
| Device: a photo turned 20° (upright page) and −15° (sideways page) prints its top red and bottom blue along its own axis, outline corners white, at 300 dpi of its own size; pdf.js reads 340° and 105° | PASS | PlanRenderDeviceTest `aTiltedPhotoPrintsAtItsAngleAt300DpiOfItsOwnSize`; `regression/run2/render-check-tilt-*.json` (API 24, 35 and 36) |
| Device: the round handle turned by Android's own touch input (15°) plus Tilt right (1°): the print file draws the photo at 344° | PASS | round3-smoke API 35, `roundHandleTurnsThePhotoInThePrintFile` |
| On the owner's phone and on the Brother | PENDING (owner) | USER-CHECKLIST §Z7 |

## Whole-branch review (Phases 25–28)

The reviewer (a fresh reader) found 0 Critical, 2 Important and 13 Minor. All of the following were fixed, each with a test seen failing first:
- **I1:** the card back side could still be lost on a slow phone.
- **I2:** turning shrank and moved the photo.
- **M4:** the photo snapped back to its old angle before the save landed.
- **M2:** the passport box could re-save an old number.
- **M1:** the colour switch failed silently.
- **M8:** the big preview did not apply on older WebViews.

Nine minors are deferred, and every one is listed in `phase-25-28-rulings.md`.

## Coverage statement

**Proven:**
- The maths on random plans.
- The PDF matrices against pdf.js, read independently of our writer.
- Printing at an angle on API 24, 35 and 36.
- The handle with a mouse in Chromium and with Android's touch input on API 35.

**Not proven:**
- The handle's feel under a real finger on the owner's phone.
- A turned photo printed on the Brother.
- A handle near the page's side at 45°, which may reach past the screen's edge on a narrow phone.
