# Phase 30: closure report (Adjust: smaller tools, zoom, pages side by side)

**Spec:** `docs/superpowers/specs/2026-10-24-round-4-cards-zoom-pages-leave-design.md`, parts 30a–30c.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-29-32-round-4.md`, Tasks 7, 8 and 9.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 28 and 33.

**Commits:**
- f9a566c: smaller tools on Adjust.
- 3f63831: Adjust shows the pages side by side.
- 86cc60a: zoom the page on Adjust.
- 8608a38: one flick slides one page (device finding), and the review fixes.
- c9b0774: the round-4 device smoke.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone (USER-CHECKLIST):
- §AA5: the tools and zoom, two fingers included.
- §AA6: the pages strip.

## What Phase 30 delivers

**30a: smaller tools (item 5).** The tools in the bottom row, and in the grid beside the page on a wide screen, are 56–64 px tall instead of 68–80 px. They still keep a 56 px touch area and say what they do. "Swap sides" replaces "Swap front and back" on Adjust, so no tool needs three lines.

**30b: zoom (item 5).** **Zoom out** and **Zoom in** are the first two tools on every Adjust screen: photos, document pages, passport sheets and ID cards.
- The steps are 100, 150, 200, 300 and 400 %. Two fingers on the page zoom anywhere between, about the point between them.
- The label says "Page 2 of 6 · 200 %", aloud too.
- While zoomed, only the page in the middle shows, bigger. It slides both ways inside the same space, and a finger pans it. ‹ › still change pages.
- Every drag keeps working in page points: a 40 px corner drag at 200 % changes the photo half as much as at 100 % (Review Focus 4).
- Zoom is back to 100 % whenever Adjust opens and when the screen turns.

**30c: pages side by side (item 10).** Adjust shows every page in a strip that slides sideways, one page at a time:
- The next and previous pages show about 10 px at the sides.
- "Page n of N" has **‹ ›** beside it (56 px).
- When the strip stops on a page, its first photo is chosen, so the tools change what is on screen.
- A document's pages show their pictures, which were grey boxes before round 4. Only the page in the middle, its neighbours and the chosen page are drawn, so a long job never holds every picture at once.
- Two device findings were fixed: one quick flick slid three pages, and now slides one; the turn handle of a photo at a page's top was cut off by the strip.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Tools 56–64 px, the row at most 80 px tall, on every kind | PASS | adjust.spec "tools are compact" ×4 kinds (RED first: 68–80 px) |
| Zoom out / Zoom in first on every kind; 150 / 200 / 400 %; the page twice as wide at 200 %; slides both ways; keeps its shape standing or sideways; 100 % on a fresh Adjust; a pinch zooms without lifting a photo | PASS | adjust.spec zoom (10; 7 RED first; "keeps its shape" RED without the fix: 0.35 squashed); zoom.test 4 |
| Drags at 200 % in page points: the corner, press and hold (Review Focus 4) | PASS | adjust.spec "at 200 % a corner drag…" and "at 200 % press and hold…" |
| The pages strip: 10 px peek; ‹ › and sideways sliding move one page and choose its photo; a tap on page 2 chooses; the turn handle whole; one page at a time; pictures for document pages; only nearby pages drawn | PASS | adjust.spec pages side by side (8, RED first; "a big fling" RED: page 5) |
| Device: tools compact and Zoom first; the next page's edge 10 px; a real finger swipe → "Page 2 of 6", "Photo 2 of 6"; Zoom in twice → "Page 2 of 6 · 200 %", exactly 2× as wide; a finger pans the zoomed page both ways | PASS | round4-smoke API 35, upright: `toolsAreCompact`, `theNextPageShowsAtTheSide`, `aFingerSlidesToTheNextPage`, `zoomInTwiceIs200`, `zoomedAFingerPansThePage` |
| Device regression: hold and drag, side crop, the round corner, the turn handle printed at its angle | PASS | place-smoke, adjust-smoke, rotate-smoke, round3-smoke API 35 |
| How it feels on the owner's phone | PENDING (owner) | USER-CHECKLIST §AA5–AA6 |

## Coverage statement

**Proven:**
- Every Adjust screen at 5 widths and 4 text sizes (layout, accessibility checks, keyboard).
- Zoom and the strip by e2e, and on an API 35 emulator with a real finger (adb) for the swipe and the pan.

**Not proven:**
- **A two-finger pinch on a real phone.** adb input has one finger. The e2e test drives the handler with two touch points.
- **How fast zooming feels on a low-end phone.** It was measured only on the emulator.
