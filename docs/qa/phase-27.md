# Phase 27: closure report (a big preview with one row of tools on every Adjust screen)

**Spec:** `docs/superpowers/specs/2026-10-24-round-3-edges-colour-big-preview-rotate-design.md`, Phase 27.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-25-28-edges-colour-big-preview-rotate.md`, Task 7.

**Commits:**
- 25c89ba: a big preview with one row of tools on every Adjust screen.
- 9a953c7: review fix M8 (the same big preview on WebView 92–107).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check: how it feels on the owner's phone (USER-CHECKLIST §Z6).

## What Phase 27 delivers

The owner's message, with a Doc Scanner screenshot: "Increase the size of preview so that we have enough space to do the changes in preview for all categories." The change covers photos, document pages, passport sheets and ID cards.

- **On a phone:**
  - The grey stage runs to the screen's edges, and the page fills it, 12 px in from each side.
  - The page is never taller than the screen leaves under the bars.
  - The tools sit in **one row above Done that slides sideways**. The last tool showing is cut at the edge, so it is plain there are more.
  - A tool reached with the keyboard slides fully into view, with its focus ring clear of the row's edges.
- **On a wide screen held sideways** (tablets, or a phone in landscape): the page and the tools sit side by side.
- **Older phones:** the sizes are written so a WebView from Chrome 92 (the app's floor) gets the same layout (review M8).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| The page is at least 90 % of the screen's width on a phone for every kind; the tools are one sliding row; Done always shows | PASS | adjust.spec big-preview 5 + sideways 1 (RED first); Adjust matrix, edges and keyboard 208/208 |
| Nothing outside the screen, no word split, every control ≥ 56 px, at every screen and text size (the row's own tools reached by sliding) | PASS | shell.spec layout matrix (full e2e 1785 passed, 0 failed) |
| The stylesheet works on Chrome 92 (no `dvh` without a `vh` size first, no Media Queries 4 negation) | PASS | tokens.test 2 (RED first) |
| Device: Adjust on API 35 with the big page | PASS (screenshot) | round3-smoke `08-adjust-big-preview.png` (wide tablet layout) |
| How it feels on the owner's phone | PENDING (owner) | USER-CHECKLIST §Z6 |

## Coverage statement

**Proven:** the layout in Chromium at five screen sizes and four text sizes, and the wide layout on the API 35 tablet.

**Not proven:**
- The owner's phone screen.
- A real WebView older than Chrome 108. It is checked from the stylesheet, not on such a phone.

**Known and ruled:** on a phone, a page photo's bottom edge, with its round corner, sits under the tool row until the page is scrolled a little. That is the price of a page over 90 % wide; fitting the whole page above the tools would make it about 75 % wide. See the rulings file.
