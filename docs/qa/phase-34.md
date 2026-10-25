# Phase 34: closure report (pages by ‹ › only, zoom only on Adjust's page)

**Spec:** `docs/superpowers/specs/2026-10-25-round-5-copy-paste-cards-drag-zoom-print-back-design.md`, parts 34a–34b.
**Plan:** `docs/superpowers/plans/2026-10-25-phase-33-36-round-5.md`, Tasks 4 and 5.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 38–39.
**Rulings and open findings:** `docs/qa/phase-33-36-rulings.md`.
**Evidence:** `docs/evidence/phase-33-36/2026-10-25/` (SUMMARY.md lists every run).

**Commits:**
- ec2544a: pages move only with ‹ ›, at once.
- 63e57d0: no screen zoom outside Adjust's page.
- 2196fe1: review fix M1 (re-centred when the screen changes size).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AB3–AB4.

## What Phase 34 delivers

**34a: ‹ › only (item 2).** On Adjust, a finger sliding sideways over the page no longer changes the page. ‹ › move it at once, with no slide. The next page's edge still shows at the side. The page stays in the middle when the screen changes size. Zoomed, a finger still moves around the zoomed page (round 4).

**34b: zoom (item 6).** The WebView's own zoom is turned off explicitly (`setSupportZoom(false)`, no zoom controls). Adjust's page keeps its own Zoom in / Zoom out and two-finger zoom (round 4).

**Not reproduced.** On the emulator the screen never zoomed before this change either: Capacitor already turns the WebView's zoom controls off. The change is hardening, and **the owner is asked where they saw zoom on 1.0.252** (AB4).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| A sideways slide over the page never changes the page; ‹ › move it at once (no smooth scrolling) | PASS | adjust.spec "sliding sideways never changes the page", "‹ › at once" (RED first) |
| The page shown stays in the middle when the screen changes size | PASS | adjust.spec review M1 test (RED first) |
| Layout matrix: no page or tool outside the screen, except the strip's off-screen pages by design | PASS | shell.spec layout matrix (exemption: `.adjust-strip` only) |
| A two-finger pinch on the app's screen leaves it at 100 %; the same pinch zooms a page that allows zoom (control) | PASS | ZoomDeviceTest API 35, 3 stable runs; regress.sh |
| Device: a finger slide leaves Page 1; › shows Page 2 | PASS | round5-smoke API 35 `swipeDoesNothingArrowsMove`; round4-smoke `nextPageGoesToPage2` |
| Where the owner saw zoom | PENDING (owner) | USER-CHECKLIST AB4 |

## Coverage statement

**Proven:**
- ‹ › only, by e2e and on an API 35 emulator.
- The screen does not zoom with a two-finger pinch, by an instrumented device test with a working control.

**Not proven:**
- **What the owner saw as zoom.** It was not reproduced. If it was Android's own magnification (Accessibility → Magnification) or the phone's Display size, the app cannot turn it off.
- **A keyboard pan of a zoomed page** (review M8, open for the owner).
