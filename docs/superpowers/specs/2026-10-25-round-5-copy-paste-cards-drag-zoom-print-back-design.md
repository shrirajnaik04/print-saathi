# Owner round 5: copy, cut and paste on Adjust; ‹ › only; ID cards placed by hand and side by side; zoom on Adjust only; PRINT back at once; delete jobs

**Date:** 2026-10-25 · **Status:** approved by the owner ("go ahead") · **Builds on:** 1.0.252-c9b0774
**Decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 35–44.

## What the owner asked (after testing 1.0.252 on their phone)
1. "Copy paste, cut paste, options needed."
2. "Disable finger swipe between pages; keep only navigation through previous and next buttons. Next and previous must be as fast as possible, to move through the pages instantly."
3. "For ID cards, allow drag so that we can place the image anywhere we want."
4. "Also, what if the user wants the front and back horizontal on the page? But the default must be vertical."
5. "Remove the highlighted section under Photo 4 of 5" (the hint line "Tap a photo to choose it…" on Adjust).
6. "Zoom is now allowed in the full app, on all the pages. Zoom must be allowed only in preview edit (Adjust) mode, just to zoom the printable page, so that small images can be adjusted precisely."
7. "When we press Back on the print screen, it still shows 'Opening the print screen…' with a disabled button. The button must show PRINT as soon as we press Back on the print screen, without any delay, so that we can press PRINT again."
8. "Add a feature in Recent jobs: clear or delete all recent jobs, so that the app is not loaded with unnecessary storage and storage isn't filled (please check this, I may be wrong). The app must always be lightweight."
9. (Mid-design) "Check if a cursor is needed on pages, just like Word, so that it's helpful for pasting wherever we need."

**Answers to the questions asked:**
- Copy and paste: **Word-like tools**, Copy, Cut and Paste, within one job.
- ID card drag: **hold and drag each card**, like photos.
- Side by side: **a toggle on Adjust**, "One under another" (default) | "Side by side".
- Back from the print screen: **back on Ready with PRINT ready**, with no "cancelled" screen.
- Recent jobs: **Delete all + delete one**.
- The 1-day automatic delete stays.
- The cursor: a **"+" mark** where an empty spot on the page is tapped; Paste goes there (approved with the design).

**What was found when checking (item 7):**
- Android's print screen closed without a print, so no print job existed.
- The app then kept "checking" for up to 8 seconds before it gave up and showed "Printing was cancelled".

**What was found when checking (item 8):**
- Customer files already delete themselves 1 day after the job was last used (Settings → "Delete customer files after"), and Settings has "Delete all".
- Neither is on Recent jobs, where the shopkeeper looks.

**What was found when checking (item 6):**
- Nothing turned off the phone's own pinch zoom of the whole screen.

## Unchanged rules
Offline, ₹0, no new dependency. Customer files are parsed only in the isolated engine, and no image bytes cross the bridge. One geometry (the plan) for both preview and print; exact sizes; 300 dpi at the box. Plain English; anything pressed is at least 56 px; every gesture has a button that does the same. "Remove animations" is respected. Back and Home never lose work without the shopkeeper saying so.

---

## Phase 33: editing on Adjust (items 1, 5, 9)

### 33a: Copy, Cut, Paste (photos)
Three tools follow Remove in the tool row: **Copy**, **Cut**, **Paste**.

**Copy** remembers the chosen photo, along with its crop, turn, angle and size. A short line says "Photo 3 copied."

**Cut** remembers the chosen photo and takes it off the page. This works like Remove: its Undo panel shows and brings it back.

**Paste** is greyed out until something is copied or cut. It puts the photo on the page shown in the middle:
- At the "+" mark (33b), or else in the middle of that page.
- Kept inside the page's margins, at the photo's own size.
- It becomes the chosen photo, placed by hand, so it can be dragged at once.
- Pasting what was copied adds a new copy each time: the same photo file printed again. No file is copied, so storage does not grow.
- Pasting what was cut puts that photo back, once; Paste is then greyed out again.

The remembered photo belongs to this job. It is kept while the job's screens are open and forgotten when the job is left. A copy never shows the "These photos are the same" note.

The screens that work with photos (Photos, Ready's count, Pages) count a pasted copy as a photo of its own.

Only the photos kind has these tools. Document pages, passport sheets and ID cards don't (their pieces are not free photos).

### 33b: The "+" mark (Word's cursor)
A tap on an empty spot of the page shown, on the photos kind, sets a small "+" mark there:
- 24 px drawn, with nothing to touch on the mark itself.
- A tap on a photo still chooses the photo.
- The mark is where Paste goes. A paste uses it up.
- Turning to another page clears the mark.
- The page-number line then says "Paste goes to the + mark", out loud as well.

### 33c: No hint line
The line under the title ("Tap a photo to choose it. Hold it to move it. …" and the cards and passport versions) is removed from every Adjust screen. Help keeps explaining the gestures.

## Phase 34: pages and zoom (items 2, 6)

### 34a: ‹ › only
- A finger no longer slides the pages. Only ‹ › move them, at once, with no slide animation.
- The next and previous page's edges still show at the sides.
- Moving to a page chooses its first photo, as now.
- While zoomed, a finger still pans the page (that is the zoom's purpose).

### 34b: Zoom only on Adjust's page
- The phone's own pinch zoom of the screen is switched off in the app (the WebView's zoom).
- No screen zooms by pinching, Adjust's frame included. Only Adjust's page zooms, by its own two-finger zoom and Zoom in / Zoom out.
- Text size still follows the phone's font setting, as before.
- Proof is a device test: a two-finger pinch made through Android's own testing tools on Home leaves the screen at scale 1; on Adjust's page it zooms the page.

## Phase 35: ID cards (items 3, 4)

### 35a: Placed by hand
On Adjust for ID cards, in sizes Real card size, Big size and the size chosen on Adjust (not Many copies, not Whole e-Aadhaar page):
- **Press and hold** a card, then drag it anywhere on the page. It snaps to the page's middle lines, its margins and the other card's edges, as photos do.
- Move up, Move down, Move left and Move right move the chosen card 2 mm a tap (as photos).
- **Automatic** puts both cards back in their places.

Rules for a card placed by hand:
- It keeps its place when its size changes, kept inside the page.
- Its place is measured from the card's middle, so a turn keeps it where it was.
- It prints exactly where it is shown.
- The cards may overlap: the one moved last is on top, as with photos.

### 35b: Side by side
On Adjust for ID cards (the same sizes), a toggle: **One under another** (default) | **Side by side**:
- **Side by side:** the cards are in one row, centred on the page, a 10 mm gap between them.
- **Big size:** as big as fits in that row.
- **Size chosen on Adjust:** held down to what fits, as now.
- Choosing an arrangement clears places set by hand (it is the "automatic" arrangement).

## Phase 36: printing and storage (items 7, 8)

### 36a: PRINT back at once
- **Backed out:** if Android's print screen closes before Android asks for the final file (the shopkeeper pressed Back or closed it), nothing was sent. The app knows this at once: Ready shows PRINT again, enabled, with nothing else on screen.
- **Printed:** if the final file was asked for, the job is checked as now and the result screen shows what happened.
- **A print screen that never marks its previews** asks for "the final file" on every layout. Then the current checking stays (at most 8 seconds), and the result screen says what happened.

### 36b: Delete jobs on Recent jobs
**Delete each job:** every row on Recent jobs has **Delete** (56 px), asked once: "Delete this job? Its files are removed from the phone." with **Delete** / **Keep**.

**Delete all jobs:** a button at the end of the list, asked once: "Delete all jobs? All customer files are removed from the phone." with **Delete all** / **Keep**.
- It reuses Settings' Delete all, which keeps a job that is open on another screen.
- Afterwards the list says "No jobs yet." and Home has no Continue card.

**Unchanged:** the 1-day automatic delete.

## Owner checks (USER-CHECKLIST §AB, pending real-world validation)
- Copy, Cut and Paste with the "+" mark.
- ‹ › only, instant.
- A two-finger pinch on Home and on Ready does nothing; on Adjust it zooms the page.
- ID cards held and dragged, and side by side.
- No hint line.
- Back from Android's print screen, then PRINT straight away.
- Delete one and Delete all on Recent jobs.
