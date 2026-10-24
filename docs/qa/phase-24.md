# Phase 24 — closure report (press and hold to place anywhere; sides to crop) + Parts 6 and 7

**Spec:** `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`, Parts 5, 6 and 7.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-20-24-place-anywhere-scanner-crop.md`, Tasks 13–16, 18–20.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md` rows 2, 6, 8–12.
**Commits:**
- ee4e330 photos placed by hand stay where they are put;
- b406549 press and hold to place a photo anywhere; its sides crop it;
- 4390df9 card edges you can see (2 px), on every screen;
- d28907f, dd85ef9 no printer set-up panel; Home's logo bar stays on top while small; zoom out left of zoom in;
- c378283 the back side of an ID card, optional;
- 82c52bf whole-branch review fixes (Phases 20–24).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do on the owner's phone: how press-and-hold,
snapping and the side pills feel (USER-CHECKLIST §Y5–Y6); card edges and the logo bar on the curved screen (§Y7); the
ID card back side (§Y8); the zoom buttons (§Y9).

## What Phase 24 delivers
- **Press and hold** a photo on Adjust for 0.45 s: it lifts (shadow, "Moving photo 3. Lift your finger to drop it.")
  and follows the finger inside the margins, snapping within 2 mm to the page's middle lines, the margins and other
  photos' edges and middles, with a thin guide line. A finger that moves 8 px first scrolls the page as usual.
- **The first drop fixes every photo where it is.** From then on Bigger / Smaller / the round corner resize around the
  centre; Crop keeps the remaining part where it was; Remove leaves the gap (Undo puts it back); new photos go on new
  pages; **To previous / next page** and **Move ↑ ↓ ← →** (2 mm a tap) are the button alternatives; **Automatic**
  tidies everything back.
- **Overlap is allowed:** the photo changed last is drawn and printed on top; a tap picks the top photo; Adjust says
  "Photo 2 covers part of photo 4." and Ready "Some photos cover part of another. Check the preview."
- **Sides to crop (Word):** a pill in the middle of each side of the chosen photo; dragging it in cuts that side off,
  out brings it back up to the photo's edge. The part left keeps its print size; placed by hand, the opposite side
  stays. Straightened photos are cut on their straightened picture and mapped back exactly. Pills show only where the
  photo is at least 96 px along that side on screen; touched at 56 px.
- **Part 6:** a 2 px edge (`--ring`) on every card, tile, row, choice and thumbnail.
- **Part 7:** Home's set-up panel removed; Home's logo bar stays at the top while it is small; Fit the face has Zoom
  out on the left; ID cards: **Add the back side** (one side) and **Print front only** with Undo (two sides).
- **The round corner on every preview** (owner's message during the closure, 2026-10-24: "Allow to resize. Resizes
  must be allowed for all sections that have photos in the preview"): ID cards, document pages and passport photos
  are resized by dragging the round corner too. The drag makes the change Smaller / Bigger make for that kind (cards
  70–200 % in 10 % steps, pages 50–100 % in 5 % steps, passport photos within the custom-size limits, shape kept),
  shown as it will print while the finger moves. ID cards in "Many copies" and "Fill the page" have no size to change
  (no buttons, no corner).

## Acceptance (spec Parts 5–7)

| Criterion | Result | Evidence |
|---|---|---|
| Unit: spots ↔ plan (centre and size, inside the margins, z-order); unpinned photos flow after; previous/next page; spots cleared on paper, direction, layout, Automatic; Undo of Remove restores the spot; overlaps; side crop keeps the scale; straightened side crop exact (homography round trip) | PASS | free.test 19, job.test, plan.test (incl. the shared plan fixture), undo tests |
| e2e: press, hold and drag with a mouse and with touch; a quick move scrolls; snapping guide; every button alternative; overlap panels; side handles crop and keep the scale; Automatic clears everything | PASS | place.spec 17, adjust.spec |
| Part 6: every screen's cards have a 2 px edge at 3:1 | PASS | "cards show their edges" over every screen (32 failed without `--ring`, 58/58 with) |
| Part 7: no set-up panel; Home's bar stays, others scroll; − left of +; Add the back side gives front then back on one page; Print front only + Undo | PASS | owner-requests.spec 3, cards.spec (back side), shell matrix |
| The round corner resizes ID cards, document pages and passport photos (owner, during the closure) | PASS | adjust.spec 3 (seen failing first: no corner); layout + axe matrix on those screens |
| Device: a plan with hand-placed, overlapping photos renders with every image exactly at the plan's box (pdf.js) | PASS | `tests/fixtures/plan-v1-free.json` (made by buildPlan) rendered by PlanRenderDeviceTest `theWebAppsHandPlacedPlanPrintsEveryPhotoAtItsBox`; colours prove the straightened photo is on top; pdf.js reads every box back within 0.1 pt (`regression/run3/render-check-free-*.json`) |
| Device: press-and-hold and side-crop steps on API 35 with screenshots | PASS | place-smoke 8/8 on the final build (`docs/evidence/phase-24/2026-10-24/place-smoke-api35-final/`): the held photo prints where it was dropped, the others stay, the moved photo on top; a side dragged 20 mm in prints 19.9 mm narrower with its other sides in place; the round corner on a passport sheet prints every photo bigger (35 × 45 → 40 × 51.5 mm, shape kept) |
| Device: nothing customer-related logged | PASS | regress privacy grep (0 hits on API 24/35/36) and privacy.mjs (`regression/SUMMARY.md`) |
| How it feels on the owner's phone | PENDING (owner) | USER-CHECKLIST §Y5–Y9 |

## Whole-branch review
Fixed, each with a test seen failing first:
- **I2:** a tap in an overlap picked the photo underneath (Adjust and Ready); the chosen photo's touch box sat above the
  photo drawn on top.
- **I4:** Crop on a hand-placed photo re-centred and re-enlarged the part left; it now stays where it was, at its scale
  (a straightened frame keeps its centre and its scale by area — ruling).
- **I5:** side pills were missing when Adjust opened from a tap on Ready (the page was measured before it was drawn).
- **I7:** a lift had no end if the app was put away mid-drag, and later presses were ignored.
- **Minors re-graded Important:** side pills touched at 48 px (now 56); a hold without a move saved and made the job
  "placed by hand"; removed photos' places counted as pages; Print front only dropped a custom card size.
- **Device findings:** a long press selected the page label's text; the page moved when a photo lifted (the status
  line now sits over the label; the page's layers stay under the pinned bar).

Deferred minors: the straightened side crop dragged outward stops short of the edge and its 5 % floor is of the
frame; a straightened photo's box is drawn empty while its side is dragged; a drop made while a save is running is
lost; To previous/next page stay disabled for photos added after hand placement until one is moved.

## Coverage statement
**Proven:** the placement model on random plans; mouse and injected touch in the browser; the print file's boxes on
emulators read back by pdf.js; press-hold-drag and side crop through Android's own touch input on API 35.
**Not proven:** the feel of the 0.45 s hold next to Android's long-press timeout or a slower "touch & hold delay"
accessibility setting; a real finger on the owner's curved screen; very many overlapping photos on one page.
