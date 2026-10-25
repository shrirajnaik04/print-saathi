# Phases 39–40: every ruling made during the build, and the findings left open

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost.
Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-25-round-7-tools-cursor-bars-card-gap-design.md`
- **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 47–51. Four questions were asked, and every answer was the recommended option.

## Rulings
- **Undo stays next to Redo** (owner's answer). On photos, the row runs Cut, Copy, Crop, Turn, Undo, then Redo, Paste, Zoom out, Zoom in, Smaller, Bigger and the rest. The other kinds keep Zoom, Undo, Redo first: they have no Cut or Copy.
- **Photos, Photo tools and Result load on demand**, fetched in the background about 300 ms after start. Start-up JavaScript had 10 B left; it now uses 59,217 B of 61,440 B. Cost if wrong: the first opening of one of those screens may wait for a small file on the phone.
- **The 60 mm gap applies where the page has room.** For Big and Own size it narrows (to 10 mm at least) instead of shrinking the cards. With 60 mm everywhere, Big-size standing cards printed at 131 % instead of 161 %. Cost if wrong: Big-size pairs sit closer than 6 cm.
- **The shared ID card plan fixture was regenerated:** the back card moved from 84 mm to 134 mm from the top. This is the owner's change; the Android tests read the same file and pass.
- **Older tests now describe the owner's new behaviour.** The round-5 test "Paste goes to the + mark … centred" was replaced by round 7's "top-left at the line". The round-4 and round-6 tests of where Zoom and Undo sit now give their places on photos. No check was weakened.
- **A printed job's second button in Recent jobs is "Choose again"** (review I2). Tapping the job opens its pages with PRINT, so "Print again" would only repeat that. "Choose again" goes back to "What did the customer ask?", for passport photos or an ID card copy from the same file. Cost if wrong: the owner looks for "Print again"; it is PRINT on the job's pages now.
- **"Its pages", not "exactly as printed"** (review M5). Ready draws the pages from today's job and today's app. A job changed after printing shows the change, and an ID card job printed before this update reprints with the 60 mm gap.
- **The line shows only once something is copied or cut** (review M1). It is kept on the page (M3). Its note says "Paste goes to the line." (M2), because it does not blink when the phone asks for less motion.
- **The device smoke presses Smaller and Copy from the page** (not by touch). Neither is what it checks, and a touch fallback had chosen another photo. The line's tap and Paste are real touches.

## Review findings

A whole-branch review (a fresh reviewer) found **0 Critical, 2 Important and 6 Minor** issues.

**Fixed and verified (each with a test that failed first):**
- **I1:** the top side bar lay half under the turn handle, so a crop drag could turn the photo. The bars are now above the turn handle, and their touch areas reach a little past the edge.
- **I2:** a printed job could no longer reach "What did the customer ask?".
- **M1, M2, M3, M4 and M6** (M4: the paste test now finds a spot where the copy fits and checks the corner both ways).

**Accepted, with its reason in the rulings above:** M5.

## Open
- **Battery:** a blinking line costs a little while it shows (only while something is copied, and not under reduced motion). Not measured on a phone.
- **Flaky test:** a test that taps the page on Ready right as the print file arrives failed 1 time in 4. The test now waits and passes 8 out of 8; Ready was not changed this round.
