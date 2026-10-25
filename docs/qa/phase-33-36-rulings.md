# Phases 33–36: every ruling made during the build, and the findings left open

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost.
Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-25-round-5-copy-paste-cards-drag-zoom-print-back-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-25-phase-33-36-round-5.md`
- **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 35–44.

## Rulings

### Task 1: no hint line on Adjust
- **The ID-card corner-drag test's line that checked the hint is removed.** The owner asked for the hint to go. Cost if wrong: none.

### Tasks 2 and 3: Copy, Cut, Paste and the + mark
- **A copy carries the photo as it was copied** (the file, crop, turn, tilt, corners and size), not the original's number. The plan's "copy from photo n" could not paste after the original was removed. Cost if wrong: none.
- **A copy remembers its original's number even after the original is removed.** A copy is never listed under "These photos are the same". Cost if wrong: none.
- **A copy shows its original's picture until the engine has made its own.** Without that, a pasted copy was left out of the page. Cost if wrong: none.
- **The Copy / Cut / + mark note is a line under the page, not a note over it.** The note over the page covered the top of ‹ ›. Cost if wrong: the note sits one line lower.
- **The copy and paste tests run at a phone's size (412 × 915).**
- **A tap on an empty spot of the page sets the + mark.** Without a mark, Paste puts the photo in the middle of the page shown.

### Task 4: ‹ › only
- **The layout check exempts exactly the page strip from "outside the screen" and "clipped text".** Pages beyond the next one are off screen by design and reached with ‹ ›; every other element is still checked. Cost if wrong: none.
- **The page is no longer a keyboard stop.** Arrow keys cannot slide a strip that does not scroll by hand; ‹ › serve the keyboard.

### Task 5: zoom only on Adjust's page
- **NOT REPRODUCED.** Capacitor already turns the WebView's zoom controls off, and on the emulator the screen never zoomed, so a failing test could not be shown first. `setSupportZoom(false)` is added as hardening, and a device test proves a two-finger pinch leaves the screen at 100 %, with a control proving the same pinch does zoom a page that allows it. **The owner is asked where they saw zoom** (USER-CHECKLIST AB4). Cost if wrong: what they saw is something else.
- **The first two drafts of the device test could not see the page** (UiAutomator found no node for the WebView), and the control first failed. The injected-touch test with a working control is the one kept: a test without a working control proves nothing.

### Tasks 6 and 7: ID cards placed by hand, side by side
- **The arrangement is named "Top and bottom" | "Side by side".** The spec said "One under another", but those three words took three lines in a 72 px tool, and round 4's rule is two lines at most. Cost if wrong: a word.
- **Buttons can show "chosen"** (filled and ticked, `aria-pressed`) for the two arrangement buttons.
- **Swap sides keeps each place by card number.** Not specified. Cost if wrong: a placed pair swaps positions differently.
- **New cards keep the arrangement and drop the places.**

### Task 8: PRINT back at once
- **"Not sent" when Android's print screen closed before it asked for the final file, with the job only created, cancelled or not found.** Android creates the print job when its screen opens. Cost if wrong: a print screen that never marks previews keeps the old 8-second check.
- **The passport test compares PRINT's words before and after**, because A4 passport says PRINT and 4×6 says PAPER LOADED — PRINT.

### Task 9: delete jobs on Recent jobs
- **Each row's Delete is named for screen readers** as "Delete (2 files · Today … · Not printed yet)". Five older selectors were anchored to the row tile with `^`. This is a selector fix, not a weaker check.
- **Recent jobs loads the first time it opens**, and its job text moved to its own module, to stay within the startup budget.

### Device smoke and final review
- **The device smoke's page-change time is named `msWithAdbReads`.** The number includes adb and debug-connection reads (a few hundred ms each); the e2e test times the app itself.
- **Review I4's test was first written with Move left**, which is correctly stopped at the edge for a card already there. It was rewritten as Move right, then Move left, and it failed first (+19 mm instead of +2 mm).
- **Minors fixed now rather than deferred.** CLAUDE.md allows "Deferred" only with the owner's approval, so the minors a shopkeeper meets (M1, M2, M3, M4, M6, M7) are fixed, each with a test that failed first.
- **No WebView cache clear on deleting one job.** The reviewer could not prove the WebView caches these files. Cost if wrong: a deleted job's cover may stay in the WebView's cache until the next Delete all or retention sweep.
- **Print screens from other makers (Samsung, MIUI) are not proven.** "Not sent" relies on the print screen asking for the final file when Print is pressed. Stock Android does, as proven on the emulator. Cost if wrong: on such a phone, PRINT could be offered again while a job is still being created, which could print twice. This is in USER-CHECKLIST AB7.

## Review findings

The whole-branch review found **0 Critical, 4 Important and 9 Minor** issues.

**Fixed and verified (each with a test that failed first):**
- **I1:** a photo pasted after Adjust was opened again was not drawn, and repeated Paste made hidden extra copies.
- **I2:** Paste after a middle page was emptied made a new page.
- **I3:** a cut photo pasted back went under the others.
- **I4:** ID cards were dragged and moved inside the photo margin, so Move left moved right.
- **M1:** the page went off-centre when the screen changed size.
- **M2:** Cut, Undo, Paste did nothing visible and pinned the layout.
- **M3:** pasting a cut photo dropped another photo's Undo.
- **M4:** dragging a card said "photo".
- **M6:** a failed delete on Recent jobs was silent, and a kept printing job was not explained.
- **M7:** Recent jobs counted a copy as a file.

## Open findings: awaiting the owner's decision to defer
- **M5: Print front only, then Undo, loses hand-placed card positions.** The cards go back to their automatic places; Move or a drag puts them back.
- **M8: a zoomed page cannot be panned from a keyboard.** Fingers pan it; a keyboard is not used at the counter.
- **M9: the zoom proof is weaker than the spec asks.** The device test proves the screen does not zoom, but not that Adjust's own page does (that is proven by e2e). The owner's report of zoom on 1.0.252 is unexplained (AB4).
