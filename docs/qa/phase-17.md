# Phase 17 — closure report (passport: fit the face, border, custom size)

**Spec:** `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`, Part 2.
**Plan:** `docs/superpowers/plans/2026-10-23-phase-16-18-adjust-passport-medium.md`, Tasks 5–7.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-23.md` rows 5 and 6.
**Commits:**
- 8058b8b pan/zoom maths and the gesture tracker;
- ad280f0 face fit and Crop by drag and pinch;
- 1a27553 border and custom size;
- cce8d4d device finding fix.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: pinch on the owner's phone, and the border
and sizes on paper with a ruler (USER-CHECKLIST §W).

## What Phase 17 delivers
- **Fit the face in the frame, the WhatsApp way:** the frame stays still; the shopkeeper drags the photo and pinches to
  zoom it.
  - **Buttons do the same:** Zoom in/out and Move photo up/down/left/right.
  - **Always filled:** the frame always lies inside the photo, and the zoom stops at its limits.
  - **Crop** takes the same drag and pinch.
- **Border (the "picture format" the owner asked for):**
  - black, **1½ pt by default**; choices ½, 1, 1½, 2¼, 3 pt or none;
  - drawn inside each photo, so the photo's size on paper is unchanged;
  - with No border, the cut lines come back.
- **The shop's own passport size:** Settings → Passport photos → Size → **Custom size**, 15–100 mm.
  - **3.5 × 4.5 cm** stays the default.
  - A size too big for 4×6 photo paper goes on A4, and Ready says so.
  - A size too big for A4 is refused, with the reason.

## Acceptance (spec Part 2)

| Criterion | Result | Evidence |
|---|---|---|
| Pan/zoom maths unit-tested: the frame always inside the photo, zoom limits | PASS | panZoom.test 4 (properties), gestures.test 3 (cancel, third finger, capture lost) |
| e2e: drag and pinch (two-finger touch events) and every button | PASS | shell.spec face drag / pinch, crop drag / pinch, buttons |
| The border's width in the print file equals the choice and lies inside the box | PASS | passportBorder.test 10; JVM RenderPlanTest / PlanRendererTest (inset by half the width); device adjust-smoke `passportBorder1_5ptOnEveryPhoto`: 5 of 5 photos have `1.5 w` in the device's print file |
| A custom size prints exactly (± 0.5 mm, from the file) | PASS | Device `passportOneMmBiggerExactly`: a size made 1 mm bigger prints 36.00 × 46.30 mm. Custom-size plan tests. The Settings form is tested in e2e (see ruling) |
| Too big for 4×6 → A4 with a note; too big for A4 refused | PASS | e2e border/custom/too-big/refused; plan tests |

**Ruling (Task 12):** the Settings → Custom size form is proven by e2e and the plan. The device check proves the same
plan → engine → file path through Adjust: a custom size, exact to 0.3 mm. Typing in the Settings form on the device is
not driven.

## Device finding and fix
**A face fitted, then re-fitted to a slightly different shape, could land a hair outside the photo.** Seen on API 35:
Adjust → Bigger on a passport photo led Ready to say "Couldn't prepare the pages".

- **Cause:** floating-point rounding gave a crop top of −2.2 × 10⁻¹⁶. The engine rightly refuses any area outside the
  photo.
- **Fix:** `fitFrame` clamps into the photo (cce8d4d). The plan test was seen failing first.
- **Re-checked:** the device smoke on API 35.

## Whole-branch review (fresh reviewer)
- **I2:** five passport e2e tests had been dropped by mistake in ad280f0, and the ledger wrongly said none had. All
  five are restored and pass unchanged:
  - 8 photos on 4×6, with no price;
  - a photo under 200 dpi says it may print blurry;
  - the 4×6 preview has the 4×6 shape;
  - a tap while the photos are still loading;
  - fitting the face again from Change returns to the same Ready.
- **Minor 6, re-graded Important:** a custom size saved in Settings was not used until it was also chosen. Saving now
  selects it. e2e test seen failing first.
- **Deferred minor:** Size, Border and Fit the face reached from Adjust return to Ready, not to Adjust.

## Final regression
See `docs/qa/phase-16.md` (Phases 16–19 were regressed together) and `docs/evidence/phase-16-19/2026-10-24/regression/SUMMARY.md`.

## Coverage statement
**Proven:**
- the pan/zoom maths (properties);
- gestures, including lost fingers;
- every button and gesture on the face and crop screens (e2e);
- the border width and its inset in the device's print file;
- a changed passport size exact to 0.3 mm in the device's print file;
- custom sizes too big for 4×6 or A4.

**Not proven:**
- pinch on a real phone;
- the border and sizes on paper with a ruler (USER-CHECKLIST §W).
