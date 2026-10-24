# Phases 25–28: every ruling made during the build, and the deferred minors

Copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost.
Each line gives what was decided, why, and what it costs if wrong. Spec: `docs/superpowers/specs/2026-10-24-round-3-edges-colour-big-preview-rotate-design.md`.

## Rulings

- **Task 3:** with the corners gone, a frame can no longer be slanted by hand: photos and pages are straightened only when a frame comes from detection (ID cards) or from a job saved by 1.0.224; tests that proved the straightened print path start from such a frame (mock `mockQuad=1`) — the owner's choice ("everywhere") — cost if wrong: hand straightening of photographed pages would need a corner mode back.
- **Task 3:** crop bars' touch boxes are 56 px fixed, not 3.5 rem — at 200 % text the rem boxes made neighbouring bars cover each other (a11y check) — cost if wrong: none (56 px is the floor).
- **Task 3:** two test-timing fixes (the 200 % crop check now waits two frames like the matrix; the Adjust straightened test waits for Ready) and the card preview test moves the left side (the test engine names its picture after the top-left x) — not weakenings.
- **Task 4:** one MAX_PASSPORT_COUNT (settings.ts) for the job and the shop's usual count, 100; settings.test's stored 900 now reads 100 (requirement change) — cost if wrong: one number.
- **Task 5:** Settings' colour rows and the Paper and colour screen are removed (one row left: Paper for photos, opened directly); tests that pinned 'documents start B&W' / 'colour printed last is remembered' updated to the owner's new rule; tests of the processed B&W path set B&W explicitly (fixtures unchanged) — cost if wrong: a Settings colour default would need adding back.
- **Task 7:** the layout matrix's 'outside screen' and 'touches the screen side' rules skip controls inside a row that slides sideways (reachable by sliding); the row itself, page sideways scroll and 56 px still checked — cost if wrong: a tool could sit under a curved edge until slid.
- **Task 7:** the page is capped at (screen height − 12 rem) × its shape, so on a phone a tall page's bottom sits under the tool bar until scrolled a little — bigger page over a page that always fits — cost if wrong: one CSS number.
- **Task 8:** sizes stay the photo's own long side when tilted (Word keeps a picture's size when it turns); the layout uses the outline's long side — cost if wrong: one conversion.
- **Task 9:** a tilted photo with a quad (an old straightened photo) is allowed and made at its own size — the web app can produce it; cost if wrong: a straightened photo could not be tilted.
- **Task 10:** the turn drag is followed by window listeners, not pointer capture — the handle moves onto the turned frame when the photo first tilts (a new element) and lost the drag; cost if wrong: none seen.
- **Task 10:** Ready shows the real print file, so its tilt is proven by the device/pdf.js checks, not the e2e.
- **Task 10:** the handle always sits above the photo (WPS); at 200 % text with the photo at the top margin it may overlap the page label above — cost: a visual overlap, the handle still works.
- **Final:** review disagreement on Task 3 (a card the finder misses, photographed at an angle, cannot be straightened by hand any more) — the owner's explicit words ("middle bar only", "Everywhere"); put to the owner in the report as a consequence to confirm — cost if wrong: such a card prints slanted until corners come back in Fix edges.
- **Final:** review disagreement on Task 7 (a full page's bottom, with its round corner, sits under the tool row until scrolled on a phone) — the owner asked for a bigger preview; fitting the whole page above the tools would make it about 75 % of the width instead of over 90 % — cost if wrong: one scroll; owner checks Z6.
- **Final:** declined-to-judge items (snap angles/1° steps, one tool row, page-filling photo shrinking when turned, B&W resetting a colour style, outline taps, device-only questions, closure docs, fixtures) stand as spec, owner choice or closure work — cost if wrong: none found.
- **Final:** lazy-load these two (Help made startup bigger: it shares code with Welcome) rather than raise the budget — cost if wrong: a short load before those two screens.

## Deferred minors (from the whole-branch review; not fixed in this round)

- M3 the first "Print as document" sets Colour even after Black & white was chosen on Ready (the switch shows it).
- M5 Crop on a turned photo placed by hand moves the kept part along the page's axes (about 5 mm at 20°).
- M6 a side bar dragged past the opposite side returns to where the drag began instead of its last good place.
- M7 the rotate handle's touch square covers the bottom middle of the photo above it in a grid.
- M9 Tilt right shows the same icon as Turn.
- M10 rotateItem saves a new revision even when nothing changed.
- M11 the engine ignores a "tilt" that is not an object instead of refusing the plan (the web app never sends one).
- M12 the layout matrix exempts any sideways-scrolling element, not just .tool-row.
- M13 a screen restored within 30 min that was one of the removed colour settings shows a blank screen.

## For the owner to confirm

- **No hand straightening.** With the corner circles gone, as asked, a frame can no longer be slanted by hand. If the app does not find a card or page that was photographed at an angle, it now prints slanted. If that matters at the counter, corners can come back in Fix edges only.
- **The page bottom on Adjust.** On a phone, a whole-page photo's bottom edge, with its round corner, sits under the tool row until the page is scrolled a little. The alternative is a page about 75 % of the screen's width instead of over 90 %.
