# Phase 21 — closure report (Word margins, photos from the top-left)

**Spec:** `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`, Part 2.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-20-24-place-anywhere-scanner-crop.md`, Tasks 3–5.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md` row 7.
**Commits:**
- ca25850 Word margins for photo pages, Narrow by default;
- 164f8ea photos fill pages from the top-left, like Word;
- 82c52bf whole-branch review fixes (Phases 20–24).

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: Narrow margins measured on paper from
the shop's Brother (USER-CHECKLIST §Y2).

## What Phase 21 delivers
- **Settings → Margins**, with Word's names: **Narrow** 1.27 cm (the default), Normal 2.54 cm, Small 0.6 cm (the old
  edge). Settings saved before this version read as Narrow.
- **Which jobs:** photo layouts on A4 only (All on one page, Use more pages, One on each page, photos placed by hand).
  Passport sheets, ID cards, documents and 4×6 photo paper keep their own spacing.
- **Never smaller than the printer can print:** the margin is the larger of the chosen one and the A4 edge the test
  page measured; "Space at paper edges: More" still adds 3 mm on top.
- **Photos start at the top-left, like a Word page:** rows start at the left margin and the first row at the top
  margin; leftover space stays at the right and the bottom. One on each page puts the photo at the top-left of the area
  inside the margins.

## Acceptance (spec Part 2)

| Criterion | Result | Evidence |
|---|---|---|
| Every photo box on A4 inside the chosen margin; first row on the top margin, each row's first photo on the left margin; no overlap; each photo once, shape and order kept | PASS | layouts/flow property tests (10 000 random jobs, top-left rule added), direction.test, sizes.test |
| Narrow is the default; three choices; old settings read as Narrow | PASS | settings.test 6 |
| Ready/Adjust preview: first photo 12.7 mm from the top-left at Narrow | PASS | e2e (Ready and Adjust) |
| Device: the print file's first image at 12.7 mm | PASS | place-smoke API 35: first box in the real print file 12.7 × 12.7 mm (`docs/evidence/phase-24/2026-10-24/place-smoke-api35-final/`); the web app's own plan (`tests/fixtures/plan-v1-free.json`) rendered on API 24/35/36 with its flowed photo at 12.7 mm, boxes read back by pdf.js (`regression/run3/render-check-free-*.json`) |
| Passport and ID card plans unchanged | PASS | their device and render tests pass untouched (`docs/evidence/phase-20-24/2026-10-24/regression/SUMMARY.md`) |
| Narrow margins on paper | PENDING (owner) | USER-CHECKLIST §Y2 |

## Rulings
- The jargon lint allows exactly the Settings label "Margins" (the owner asked for Word's name); "margin" stays banned
  everywhere else.
- Documents keep their own A4 sheet; photo pages carry the margin.
- The centring tests were replaced by top-left rules (the owner overrode PLAN §G0 here); the inside / no-overlap /
  order / aspect invariants were kept.

All rulings for Phases 20–24: `docs/qa/phase-20-24-rulings.md`.

## Coverage statement
**Proven:** the margin and top-left rules over 10 000 random jobs; the settings migration; the preview positions in
the browser; the position in the print file on emulators (API 24, 35, 36), read back by pdf.js.
**Not proven:** the printed distance on the shop's paper (the printer may shift the page); the owner's eye on the
narrower look.
