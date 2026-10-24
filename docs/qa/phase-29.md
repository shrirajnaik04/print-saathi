# Phase 29: closure report (ID cards: a crop screen for each side, Change photo, Turn left / Turn right)

**Spec:** `docs/superpowers/specs/2026-10-24-round-4-cards-zoom-pages-leave-design.md`, parts 29a–29c.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-29-32-round-4.md`, Tasks 5 and 6.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 25–27.

**Commits:**
- 7614276: ID cards turn a quarter at a time; a turned card prints standing.
- 7b37dcd: crop each ID card side, change a side's photo, turn cards either way.
- 8608a38: the whole-branch review fixes C1 (the back's crop screen) and I2 (the size of standing cards).
- c9b0774: the round-4 device smoke.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone (USER-CHECKLIST):
- §AA2: cropping a real card photographed at the counter.
- §AA3: Change photo.
- §AA4: a standing card printed and measured with a ruler.

## What Phase 29 delivers

**29a: a crop screen for each side (item 2).** Every side that comes from a photo opens its own crop screen first:
- "Front of the card", then "Back of the card", each with a card-shaped frame (85.6 : 54, 80 % of the photo's width or height) when no card is found.
- Done on the front goes to the back. Done on the back goes to the cards, "2 ID cards found".
- A PDF page (e-Aadhaar) is not a photo and has no crop screen.
- Each side is its own screen: it starts from its own frame, and a screen reader is told which side it is on (review C1).

**29b: Change photo (item 3).** Each side has **Change photo**: From the gallery or the file manager. The new photo's crop screen opens, and after Done it replaces that side; the other side is unchanged. Closing the picker without a choice changes nothing. The old photo leaves the job.

**29c: Turn left / Turn right (item 4).** Each side turns a quarter at a time, either way, on the cards screen, on its crop screen and on Adjust.
- A card turned a quarter stands: it prints 54 × 85.6 mm, and the other side keeps its own direction.
- Every size works with standing cards: Real card size, Big size, Many copies (rows as tall as the taller card, so fewer sets fit) and the size chosen on Adjust.
- Adjust and Ready say the size the cards print at (about 160 % for two standing cards on Big size). Bigger stops at the most that fits (review I2).

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Every pair of turns (16) in every size (4): every card inside the page's edges, none overlapping, each its own shape (Review Focus 5) | PASS | idcard.test "every pair of turns in every size" and "Many copies with a standing card" (RED first) |
| The size said for cards is the size printed, standing or lying; a size held down to what fits is said as it prints | PASS | idcard.test `drawnCardScale` 3 (RED first); cards.spec "standing cards on Big size" (RED: "101 %") |
| Each side passes its crop screen; a front fitted by hand never carries over to the back; the back's screen gets the focus | PASS | cards.spec round 4 (6, RED first) and "a front fitted by hand never carries over…" (RED first); 121 earlier card steps pass through the crop screens |
| Change photo: the new photo's crop screen; the other side kept; a closed picker changes nothing (Review Focus 3) | PASS | cards.spec Change photo tests |
| Device: two card photos shared → "Front of the card" → Done → "Back of the card" → Done → "2 ID cards found" | PASS | round4-smoke API 35, `eachSidePassesItsCropScreen` (`docs/evidence/phase-29-32/2026-10-25/round4-smoke-api35/`) |
| Device: Change photo (Front) → gallery → crop screen → the front is the new photo, the old one gone from the job | PASS | round4-smoke API 35, `changePhotoReplacesTheFront` |
| Device: Turn right (Front) → Real card size → the print file draws one card 54.00 × 85.60 mm and one 85.60 × 54.00 mm (pdf.js) | PASS | round4-smoke API 35, `turnedSidePrintsStanding` |
| Device regression: the round-3 card flow (front, then Add the back side from the gallery) through the crop screens | PASS | round3-smoke API 35, `backSideAddedFromTheGallery` |
| How it looks and feels on the owner's phone, with a real card | PENDING (owner) | USER-CHECKLIST §AA2–AA4 |

## Coverage statement

**Proven:**
- The turn geometry: a property test over every pair of turns and every size.
- The flows: e2e in Chromium, plus one run of each on an API 35 emulator through Android's own photo picker. The standing card's size was read back from the device's print file.

**Not proven:**
- A real Aadhaar card photographed at an angle the finder misses (only synthetic cards were used).
- A standing card measured on paper from the shop's printer.
