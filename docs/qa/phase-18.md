# Phase 18 — closure report (Adjust on every preview, paper direction)

**Spec:** `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`, Parts 3 and 4.
**Plan:** `docs/superpowers/plans/2026-10-23-phase-16-18-adjust-passport-medium.md`, Tasks 7b–11.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-23.md` rows 1 and 4.
**Commits:**
- 00eb85e paper direction;
- 118db9e flow layout;
- 92b8a54 sizes kept in the job;
- 3086b15 Adjust photos;
- f89036e Adjust pages, passport and ID cards;
- abdd0a8 device smoke.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: sizes on paper with a ruler, and the
shopkeeper using Adjust (USER-CHECKLIST §X).

## What Phase 18 delivers
- **Paper direction:** Portrait unless the shopkeeper chooses Landscape (Change → Paper direction). The app never turns
  the paper by itself any more.
  - A document keeps each page's own direction until a direction is chosen (ruling: the owner's "as is").
  - The summary says "Landscape" when it is chosen.
- **Photos flow like Word's "Square" wrap:**
  - in rows, in order, at the sizes chosen, never overlapping, always inside the paper's edges;
  - a photo that no longer fits moves on, and a page is added only when needed.
- **Adjust on every preview:**
  - **Photos:** Bigger/Smaller (or drag the round corner), Turn, Crop, Move earlier/later, Remove with Undo. Each photo
    shows its size in cm.
  - **Document pages:** each page's size, 50–100 %.
  - **Passport photos:** the photo size.
  - **ID cards:** the card size, 70–200 %.
  - **On Ready:** an Adjust button, and tapping a sheet opens Adjust at that photo.
  - **Wide screens:** in landscape the tools sit beside the page.
  - **Every drag has a button,** and every change is saved in the job.

## Acceptance (spec Parts 3 and 4)

| Criterion | Result | Evidence |
|---|---|---|
| The flow is property-tested (each photo once, in order, no overlap, inside the edges, its size kept to 0.1 %, a photo that does not fit moves on, pages only when needed) | PASS | flow.test 5 (300 + 200 property runs), sizes.test 11 |
| e2e: Adjust from every kind of preview; resize by button and by the handle; turn; a resize that adds a page | PASS | adjust.spec 12 (photos, pages, passport, cards), Adjust matrix |
| The device's print file has the resized photo at the size shown (± 0.5 mm) | PASS | Device adjust-smoke `adjustPrintsTheSizeShown`: the screen showed 13 × 9.7 cm; the file has 129.77 × 97.33 mm (0.23 / 0.33 mm off) |
| A resize that needs room adds a page on the device | PASS | `biggerPhotoFlowsOnToANewPage`: 1 → 2 pages |
| Every layout and plan test in both directions; a new job is portrait; Landscape gives sideways pages | PASS | direction.test 7, plan tests, e2e direction; device `uprightPaperByDefault` |

## Review Focus (plan) — how each is pinned

| # | Input class | Test |
|---|---|---|
| 1 | A frozen photo that no longer fits after Turn or Crop | sizes.test "turned photo that no longer fits" |
| 2 | Photos added to an arranged job have no size yet | sizes.test "a photo without a size gets the median size" |
| 3 | 100 photos at the smallest size: fast, never more pages than photos | flow.test |
| 4 | A pinch that loses a finger | gestures.test |
| 5 | A custom passport size too big for 4×6 or A4 | Phase 17 tests |

## Whole-branch review (fresh reviewer)
Each fix below had a test seen failing first:
- **I1:** dragging a photo's corner until it flowed to the next page left the drag stuck and its size unsaved.
  - The overlays are now keyed per photo.
  - A finger lifted anywhere ends the drag.
  - A lost handle never blocks the next drag.
  - Test: e2e "dragging a corner until the photo moves to the next page".
- **Documents upright, per spec Part 4.** The executor's Task 7b ruling had kept each document page's own direction;
  it is reversed.
  - Documents start Portrait.
  - The customer's own PDF sent untouched still prints as it came, and is shown as in the file.
  - Any chosen direction makes the app lay the pages on that paper.
  - The direction screen shows the PDF's page.
- **Minor 1, re-graded Important:** Ready's "very small" panel could throw away sizes chosen on Adjust. It is no longer
  shown once sizes are chosen.
- **Minor 3, re-graded Important:** Undo of Remove brought a photo back at an average size. It keeps its size now.
- **Minor 4, re-graded Important:** on ID cards, "Many copies" + Bigger silently made one set, so fewer copies printed.
  Many copies have no Adjust now, as for the whole page.
- **Deferred minor:** tapping a sheet in part 2 of a big document opens Adjust at the part's own page number.

## Final regression
See `docs/qa/phase-16.md` (Phases 16–19 were regressed together) and `docs/evidence/phase-16-19/2026-10-24/regression/SUMMARY.md`.

## Coverage statement
**Proven:**
- the flow layout (properties: order, no overlap, inside the edges, sizes kept, pages only when needed);
- Adjust from every kind of preview (e2e), including a drag across a page break, Undo and the small-photo panel;
- the size shown is the size in the device's print file (0.23 / 0.33 mm off);
- a bigger photo moves others to a new page on the device;
- Portrait by default for every job (unit, e2e, device).

**Not proven:**
- sizes on paper with a ruler;
- the shopkeeper using Adjust with a customer waiting (USER-CHECKLIST §X).
