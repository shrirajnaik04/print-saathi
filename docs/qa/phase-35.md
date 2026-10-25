# Phase 35: closure report (ID cards placed by hand, side by side)

**Spec:** `docs/superpowers/specs/2026-10-25-round-5-copy-paste-cards-drag-zoom-print-back-design.md`, parts 35a–35b.
**Plan:** `docs/superpowers/plans/2026-10-25-phase-33-36-round-5.md`, Tasks 6 and 7.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 40–41.
**Rulings and open findings:** `docs/qa/phase-33-36-rulings.md`.
**Evidence:** `docs/evidence/phase-33-36/2026-10-25/` (SUMMARY.md lists every run).

**Commits:**
- 3e98091: ID cards placed by hand, and side by side.
- 9376c0a and 2196fe1: review fixes I4 (the card edge) and M4 (said as a card).

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone: USER-CHECKLIST §AB5–AB6.

## What Phase 35 delivers

**35a: hold and drag a card (item 3).** In Real card size, Big size and Own size:
- Press and hold a card on Adjust cards, drag it and let go. It stays there and prints there, kept inside the printer's edge.
- **Move up / down / left / right** move the chosen card 2 mm a tap.
- **Automatic** puts both back.
- Many copies and Whole page keep their automatic layout.

**35b: side by side (item 4).** **Top and bottom** (the default) or **Side by side**, as two buttons on Adjust cards, the chosen one filled and ticked. Side by side puts front and back in one row, smaller if they do not fit.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| A card held and dragged prints where it was dropped (within the 2 mm snap) | PASS | adjust.spec "press and hold a card" (RED first) |
| Move moves 2 mm; Automatic puts both back; cards stay inside the card page's edge (Big size side by side) | PASS | adjust.spec Move / Automatic; review I4 test (RED first: +19 mm before) |
| Side by side: one row; Top and bottom: one column; the default is Top and bottom | PASS | adjust.spec; idcard.test round 5 (RED first) |
| Many copies: no Move, no Automatic, no arrangement | PASS | adjust.spec; idcard.test guard |
| Device: a card dragged by touch prints elsewhere than before; Side by side prints in one row (pdf.js) | PASS | round5-smoke API 35: `aCardHeldAndDraggedPrintsThere`, `sideBySideInThePrintFile` |
| On the shop's Brother, by the ruler | PENDING (owner) | USER-CHECKLIST AB5–AB6 |

## Coverage statement

**Proven:**
- Card placement and both arrangements by unit and e2e tests and on an API 35 emulator (the print file read back by pdf.js).

**Not proven:**
- **Real-card sizes after a drag, on paper.** The plan keeps the size; a drag only moves the card.
- **Hand-placed positions after Print front only, then Undo** (review M5, open for the owner): they return to automatic.
