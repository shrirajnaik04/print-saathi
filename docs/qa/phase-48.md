# Phase 48: closure report (some pages in colour, some in black & white; the pinned page bar)

**Spec:** `docs/superpowers/specs/2026-10-29-round-10-mixed-colour-design.md`.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 62–65.
**Rulings and open findings:** `docs/qa/phase-48-rulings.md`.
**Evidence:** `docs/evidence/phase-48/2026-10-29/` (SUMMARY.md lists every run).
**Commits:** 1ab50d0, 8926e34, d0cf33f (review fixes), 0296cea. Final APK 1.0.310.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the shop printer and the owner's phone: USER-CHECKLIST §AG.

## What Phase 48 delivers
- **Pages in colour and in black & white, one print, in order.**
  - On Ready, under each page's picture: **Colour | Black & white** for that page. Next shows the next page with its own switch.
  - **Choose pages in colour** opens every page's picture with its colour (a tick and the word); tap a page to change it; **All colour** and **All black & white**.
  - **The first guess:** pages that have colour in them (photos, stamps, coloured charts) start as Colour, the plain ones as Black & white. It is made once, from the pages' pictures, on the phone.
  - The summary says "2 colour, 4 black & white"; the Colour | B&W switch at the top shows neither half while the pages are mixed, and a tap on it sets every page again.
- **Printed as one file** (colour mode); the black & white pages are made truly grey, so they print grey whatever the printer does with colour ink.
- **Also:** a page that holds photos of both colours says "1 with both"; a mixed job keeps a colour style and a black & white style apart (Print style ticks both); Adjust, the page tools and Change follow the marks; a pasted photo and a retaken scan page keep their colour. A PDF with a grey page is redrawn (it is no longer the customer's own file); with every page in colour it still is.
- **The pinned page bar:** the Previous / Next bar no longer lets page pictures show through the phone's status-bar strip above it (owner's screenshot); its cover shows only while the bar is stuck at the top.
- **Ready loads on demand** (startup JS 47,241 B of 61,440).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Marks per page keyed "item:page"; the top switch clears them; styles per page; saved and read back | PASS | pagecolour.test 7, pagecolour.review.test 9 (RED first) |
| The plan: grey pages carry a grey style in a colour plan; all grey = plain B&W plan; a grey page is never the customer's file; "N colour, M black & white" | PASS | pagecolour.plan.test 8, pagecolour.review.test (plan) 4 |
| The renderer accepts grey pages in a colour plan; every other mismatch is still refused | PASS | RenderPlanTest +3 (RED first), RenderPlanContractTest |
| The print file: grey pages R = G = B, the colour page keeps its colour, in order | PASS | `PlanRenderDeviceTest` API 24/35/36; round10-smoke API 35 |
| The first guess measures colour in a page picture; never greys a page it could not read | PASS | chroma.test 5; e2e (broken picture stays colour); round10-smoke from the engine's real page pictures |
| Ready: per-page switch, chooser, guess once, All colour, 320 px at 200 % text, axe | PASS | colourpages.spec 14 |
| The pinned bar's band only while stuck | PASS | colourpages.spec (RED first) |
| Real device: share → guess → tap → All black & white → All colour = the customer's own file | PASS | round10-smoke API 35 7/7; release build check |
| Whole-branch review | PASS | 0 Critical, 6 Important fixed test first, 7 Minor (deferred listed) |
| Grey pages on paper from the shop's printer; colour ink on them; the guess on real pages | PENDING (owner) | §AG |

## Coverage statement
**Proven:**
- the marks, plan and summary rules by unit and property-style tests;
- the renderer and the print file's pixels on API 24, 35 and 36 by device tests;
- the whole flow on an API 35 emulator with the real engine, and on the release build;
- the screen at 320 px with 200 % text by browser tests.

**Not proven:**
- paper from the shop's printer, or whether its driver uses colour ink for the grey pages;
- real customer PDFs, and a 300+ page PDF on a slow phone;
- the pinned bar on the owner's own phone.
