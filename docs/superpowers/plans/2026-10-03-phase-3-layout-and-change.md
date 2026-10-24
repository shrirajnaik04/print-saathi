# Phase 3 — Layout engine + Change screens: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:** The shopkeeper's three photo requests work end to end on A4: "all on one page", "use more pages" (Best, or exactly N) and "one on each page". Everything they may need to adjust sits behind one **Change** button: layout, pages, copies, and the photos themselves (turn, move earlier or later, remove with Undo).

**Spec:** PLAN §G0 (layout engine), §G1 (plan), §H2.0/H2.1 (one decision per screen, values shown behind Change), §I-6/I-7/I-8 (Change hub, one-decision screens, photo tools), §J1/J2/J3, §U "All on one page / More pages / One per page".

**Exit (PLAN §T1, Phase 3):**
- 10 000 property cases green.
- Layout fixtures for 1–30 photos rendered for the owner to review (an evidence page).
- Every new screen passes the 5 viewports × 4 text sizes matrix with axe.

## Global constraints
- **Geometry:** A4 portrait or sideways page; 6 mm edge; 3 mm gap. Units are PDF points, top-left origin, in the page's own direction.
- **Fit:** a photo is never cut (crop is Phase 9). It is scaled to fit its cell, aspect kept (error ≤ 0.1 %), centred.
- **Order:** reading order is kept: rows top to bottom, left to right; pages in order.
- **Determinism:** the same job always gives the same plan (planHash stable).
- **Out of scope:** B&W stays refused natively (Phase 4); 4×6 paper (Phases 5–6); crop (Phase 9). The Change hub shows only rows that work.
- **Turning:** turns are done in the PDF matrix (no re-encoding, no quality loss). The preview turns the thumbnail the same way.

## Review focus
1. Many tiny photos (30 on one page) must still be placed, each at least a few mm, with the < 25 mm warning shown.
2. Extreme shapes (panoramas 10:1, tall screenshots 1:3) must never overflow the printable area or overlap.
3. A turned photo must print turned in the same direction as the preview (pixel test on device).
4. Removing the last photo, or every photo, must never produce an empty plan or a crash. Undo must restore the photo in its old position.
5. Reordering or turning must invalidate the old print file (planHash changes) and never print the stale one.

---

### Task 1: Layout engine (pure TS)
- **`core/layout/arrange.ts`:** `arrangePage(aspects, pageW, pageH, edge, gap)` → the best arrangement on one page. Candidates:
  - uniform grids r×c (last row centred);
  - order-keeping rows (dynamic programming over row breaks, each row scaled to the full width, the stack scaled down to fit the height).
- **Score:** largest smallest-short-side, then paper use. A grid is preferred within 8 % of the best.
- **`core/layout/layouts.ts`:**
  - `allOnOne(items, paper)`: both directions; upright preferred within 3 %.
  - `onPages(items, paper, n)`: balanced in-order groups, one shared direction (and grid shape when a grid wins) for every page.
  - `bestPages(items, paper)`: the fewest pages where every photo's short side is ≥ 40 mm, capped at one per page.
  - `onePerPage` stays.
- **Tests:**
  - fast-check over 10 000 random jobs (1–30 photos, aspects 0.1–10): each photo exactly once, no overlap, inside the printable area, aspect error ≤ 0.1 %, reading order kept, deterministic, page count as asked;
  - examples: 2 portraits on a sideways A4 side by side; 4 equal photos in a 2×2 grid; Best for 6 phone photos = 1 page.

### Task 2: Job choices + plan
- **Job:** `pages: 'best' | number`, `order: number[]` (item indexes in print order), `turns: Record<index, 0..3>`.
- **Actions:** `setPages`, `moveItem` (earlier/later), `turnItem` (+1 quarter turn clockwise), `restoreItem` (Undo after remove, at its old place).
- **`buildPlan`:**
  - uses `job.layout` (onePerPage / allOnOne / morePages + pages);
  - an odd turn swaps the photo's shape;
  - `Placement.turns` carries the turn.
- **Contract fixture:** regenerated; Kotlin parses it.
- **Tests:** reducer properties (rev rises, order is a permutation, Undo restores); plan tests; contract.

### Task 3: Native turns + many photos per page
- **`RenderPlan`:** accepts `turns` 0..3. A placement's total rotation = sideways page (+1 anticlockwise) + photo turns (clockwise). This becomes a quarter-turn count.
- **`MiniPdfWriter`:** `quarterTurnsCcw` 0..3 replaces `turned` (matrix per value).
- **Tests:**
  - JVM matrices for 0/1/2/3;
  - RenderPlan rotation tests;
  - device: a plan with turned photos and a 6-photo page → upright-pixel checks;
  - pdf.js render-check: boxes within 0.1 pt.

### Task 4: Change hub + one-decision screens
- **Ready:** the summary line + a **Change** button → the **Change** screen (rows showing current values):
  - Layout;
  - Pages (more-pages only);
  - Copies;
  - Photos.
- **Layout screen:** 3 choices with mini previews of page 1 drawn from the real plan.
- **Pages screen:** Best · 1 · 2 · 3 · … up to the photo count, with mini previews.
- **Copies screen:** big −/+ (Stepper, 1–99) + Done.
- **Warning:** when all photos are on one page and the smallest is < 25 mm, Ready says "Photos will be very small (about N cm)", with **Use more pages** / **Keep 1 page**.
- **Received:** All on one page and Use more pages become live.
- **Tests:** e2e flows (J1, J2 "exactly 3 pages" in 4 taps), the matrix for every new screen, the Stepper clamp test (carried from Phase 1).

### Task 5: Photo tools
- **Photos screen:** a numbered strip; tap a photo → **Photo tools**:
  - Turn;
  - Move earlier / Move later;
  - Remove → back to Photos with an Undo banner.
- Previews turn the thumbnail like the print.
- **Tests:** e2e (turn changes the preview and the summary stays; move changes the order; remove + Undo); visual check at 320 px / 200 %.

### Task 6: Phase 3 closure
- **Owner review:** layout fixtures for 1–30 photos (portrait, landscape, mixed), shown as an evidence page.
- **Device regression:** 5 levels, plus an end-to-end "all on one page" through Save as PDF on API 35.
- **Gate:** independent review.
- **Docs:** `docs/qa/phase-3.md`; traceability.
