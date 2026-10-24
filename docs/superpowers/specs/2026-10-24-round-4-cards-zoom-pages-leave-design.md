# Owner round 4: ID card crop per side, card turns, change photo, smaller tools and zoom, pages side by side, leave and exit questions, colour toggle at the top, paper type

**Date:** 2026-10-24 · **Status:** approved by the owner ("Approve, build it all") · **Builds on:** 1.0.239-b34bbe7
**Decisions:** `docs/decisions/owner-decisions-2026-10-24.md` rows 24–34.

## What the owner asked (after testing 1.0.239 on their phone)
1. "Put this Colour and Black & white at the top, and it should be a toggle — I had told you. Next to Ready to print maybe?" (screenshot: the switch above PRINT)
2. "When selecting the front and back side of an Aadhaar/ID card, let the user see the crop screen, so that they can crop and then it comes in as the front/back card. The crop frame should default to card size."
3. "How to change a photo? In an Aadhaar card, if the wrong photo is selected by accident for the front or back, we must be able to replace the photo."
4. "Allow rotating images in all directions in the ID card front and back sections, not just turn upside down."
5. "Make the bottom buttons in the edit preview smaller; they are too big and consume a lot of space. Also allow zooming the page in and out, so we can work on smaller images precisely." (screenshot: Adjust's tool row)
6. "When exiting or going back from any ongoing job, ask for confirmation whether they really want to leave the job and discard it, or continue working."
7. "When going back from the home page, ask the user: stay in the app or exit the app."
8. "Remove the section 'Customer sent files on WhatsApp?' from the home page."
9. "Where is the paper type selection? Normal paper, glossy paper, etc.?"
10. "When it is page 2 of 2 (more than one page), allow scrolling through all the pages, so we can see every page's content in the edit preview." (screenshot: Adjust, Page 2 of 2)

**Answers to the questions asked:**
- Toggle: the **two-part toggle** "Colour | B&W".
- Leaving a job: **Keep working / Leave / Delete this job**.
- Paper type: **a reminder only**. Android lets no app set the printer's paper type, so the job is sent the same way.
- Pages: Ready already shows every page (Previous / Next); on Adjust, show **the next and previous page side by side**, "user friendly placement, without disturbing the page".

## Unchanged rules
- Offline, ₹0, no new dependency.
- Customer files are parsed only in the isolated engine, and no image bytes cross the bridge.
- One geometry (the plan) for both preview and print; exact sizes; 300 dpi at the box, never lower.
- Plain English, and anything pressed is at least 56 px.
- Every gesture has a button that does the same.
- "Remove animations" is respected.
- Back and Home never lose work without the shopkeeper saying so.

---

## Phase 29: ID cards (items 2, 3, 4)

### 29a: The crop screen for each photo side (item 2)
**Today:** after the card photos are picked, the cards screen shows what the app found. The crop screen (Fix edges) opens by itself only when nothing was found.

**Design:**
- Every side that comes from a **photo** opens the crop screen in turn, front first:
  - The titles are "Front of the card" and "Back of the card".
  - The hint: "Move the side bars onto the card's edges, then tap Done."
- The frame starts on the card's edges when the app found them. Otherwise it starts as a **card-shaped frame**: 85.6 : 54 on the photo as shown, centred, 80 % of the photo's width, or less if that would not fit its height.
- **Done** keeps the frame and goes to the next side, then back to the cards screen.
  - Back on a crop screen keeps the side as found and returns to the cards screen.
  - Cancel (in the crop bar) does the same.
- The same happens for a back side added later (Add the back side) and for a photo changed with Change photo (29b): its crop screen opens once it is found.
- A **PDF** (e-Aadhaar) keeps its exact panels and is not cropped by hand first (Fix edges is still there). The owner asked about photos; a PDF's panels are exact.

**Accepted when:**
- e2e:
  - two card photos → crop screen "Front of the card" → Done → "Back of the card" → Done → the cards screen with Front and Back;
  - a photo with no card found starts with a card-shaped frame (85.6 : 54 ± 1 % on the photo as shown);
  - Add the back side → its crop screen;
  - a PDF goes straight to the cards screen.
- Device: the round-3 smoke's gallery flow passes through both crop screens.

### 29b: Change photo (item 3)
- Each side on the cards screen gets **Change photo**. It asks "Where is the photo?": From the gallery or From the file manager, as Add photos does.
- The photo picked **replaces that side**:
  - The app looks for the card in it; found or not, its crop screen opens.
  - The old photo leaves the job, unless another side still uses it.
- Leaving the picker without choosing changes nothing.
- The same answer applies while the new photo is looked at as in round 3: the screen says so, and its buttons wait.

**Accepted when:**
- e2e: Change photo on the front → gallery → crop screen → Done → the front is the new photo; the old photo is not in the job.
- A cancelled pick leaves both sides as they were.

### 29c: Turn left / Turn right (item 4)
- "Turn upside down" becomes **Turn left** and **Turn right** (90° a tap, two taps = upside down), on the cards screen (per side) and on the crop screen.
- A card turned a quarter **prints standing**: 54 × 85.6 mm at real size (vertical ID cards). Its box keeps that shape in every size:
  - **Real size:** stacked, centred.
  - **Big:** both enlarged by the same factor to the largest that fits, at most 2×.
  - **Adjust's 70–200 %.**
  - **Many copies:** front and back side by side in rows; a row is as tall as its tallest card; as many sets as fit.
- The cards screen and Adjust show it standing.
- The engine already prints a straightened picture at any quarter turn: this is layout only, plus the plan's existing quarter turns.

**Accepted when:**
- Unit: quarter turns 0–3 in the job; for each size, a turned card's box is 54 × 85.6 mm (scaled), every box is inside the edges, and nothing overlaps.
- e2e: Turn right → the card shows standing and the plan's box is standing; four turns bring it back.
- Device: a card turned once prints standing at 54 × 85.6 mm ± 0.5 mm (release-cards check).

---

## Phase 30: Adjust (items 5, 10)

### 30a: Smaller tools (item 5)
The tool row's buttons become compact: 56 px tall (the floor), a 20 px icon over a 13 px word, about 4.5 rem wide. The row goes from about 100 px to about 72 px tall. The words still never split. The wide layout (tablets, sideways) uses the same compact buttons.

**Accepted when:** e2e: the row's buttons are 56–60 px tall; the row is at most 80 px tall at 100 % text; the layout matrix stays green.

### 30b: Zoom (item 5)
- **Zoom out** and **Zoom in** are the first two tools.
- Steps: 100 % (the page fits), 150 %, 200 %, 300 %, 400 %.
- The zoom shows next to the page number: "Page 1 of 2 · 200 %".
- A **two-finger pinch** on the pages also zooms between 100 % and 400 %, where the phone delivers both fingers to the app. The buttons always work.
- **When zoomed:**
  - The page area keeps its height on the screen and scrolls inside, both ways: one finger pans.
  - Press and hold still moves a photo.
  - The round corner, rotate handle and side bars keep their touch size, and the drags stay exact (they work in page points).
- The zoom is kept while Adjust is open, and starts at 100 % each time Adjust opens.

**Accepted when:**
- e2e:
  - Zoom in twice → the page is twice as wide on screen and the label says 200 %;
  - the page scrolls sideways;
  - the round corner dragged while zoomed resizes by the page-point amount;
  - Zoom out back to 100 %;
  - a two-finger pinch (two touch points) zooms.

### 30c: Pages side by side (item 10)
- On Adjust, all the job's pages sit **in a sideways strip**:
  - The chosen photo's page is in the middle.
  - The previous and next pages show a little at the sides (about 12 px each), so it is plain there are more.
  - A sideways swipe moves one page at a time (it snaps to a page).
- **‹ and ›** (56 px) sit beside "Page 1 of 2" in the line above the page, outside the page, and do the same.
- A photo on any page can be tapped to choose it. Its handles show on its page.
- Press and hold moves a photo within its page; To previous / next page moves it between pages, as today.
- When zoomed, the strip pans like one wide picture and does not snap.
- Ready is unchanged: it keeps Previous / Next; the owner is happy with it.

**Accepted when:**
- e2e:
  - a two-page job on Adjust shows page 2's edge beside page 1;
  - › and a swipe each bring page 2 to the middle, and the label says "Page 2 of 2";
  - tapping a photo on page 2 chooses it;
  - one page: no ‹ ›.
- Device: the place-smoke hold-and-drop still prints the photo where it was dropped.

---

## Phase 31: Leaving (items 6, 7, 8)

### 31a: "Leave this job?" (item 6)
- When a step would leave an **unprinted** job's screens altogether, the app asks first. That means:
  - Android Back or ‹ Back on the job's first screen, the one right above Home;
  - or Home on any of the job's screens.
- The question:
  - Title: **"Leave this job?"**
  - Line: "It stays in Recent jobs, so you can finish it later."
  - **Keep working**: the main button.
  - **Leave**: the job is kept, as today.
  - **Delete this job**: red; its files are removed and it is gone from Recent jobs; then Home.
- Android Back while the question shows means Keep working.
- A printed job (Result reached, or printed before) and moves within a job never ask. Neither do screens with no job: Settings, Help, Recent jobs, Where is the card?.
- The question is a dialog with its own name for screen readers. It holds the keyboard focus until answered and puts it back afterwards. It meets the same 56 px, contrast and plain-word rules.

**Accepted when:**
- e2e:
  - Back from Ready of a new photo job asks; Keep working stays; Leave goes Home and the job is in Recent jobs; Delete removes it;
  - Home from Change asks;
  - Back from Change (within the job) does not ask;
  - after printing, Home does not ask;
  - Android Back closes the question.

### 31b: "Close PrintSaathi?" (item 7)
- Android Back on Home asks **"Close PrintSaathi?"**: **Stay** (main) or **Close the app**.
- Closing moves the app to the background, as Android's own Back does today. Files still being received or a print in progress are never cut off.
- Android Back while the question shows means Stay.

**Accepted when:** e2e: phone Back on Home shows the question; Stay keeps Home; Close the app asks the shell to close it once.

### 31c: Home without the WhatsApp card (item 8)
The "Customer sent files on WhatsApp?" card leaves Home. Help keeps the sharing steps.

**Accepted when:** unit/e2e: Home has no WhatsApp card; Help still has the steps.

---

## Phase 32: Ready (items 1, 9)

### 32a: The Colour | B&W toggle at the top (item 1)
- The round-3 switch moves **into the title line**, right of "Ready to print". It becomes compact:
  - two halves, **Colour** and **B&W**, at least 56 px tall;
  - the chosen half is filled and ticked;
  - screen readers hear "Colour" and "Black & white" in a group named "Print in".
- On a narrow phone or at big text it wraps under the title, never over it.
- It is removed from above PRINT.
- Everything else from round 3 stays: one tap changes the job and redraws the print; a failed save says so.

**Accepted when:**
- e2e: the toggle is in the top bar's title line (its top edge within the title's line box at 360 × 800 and 100 % text), not near PRINT.
- The round-3 switch tests pass against its new place.
- The layout matrix is green at every size and text size.

### 32b: Paper type (item 9)
- Change gets **Paper type**: Plain paper (new jobs) or Glossy photo paper. It is a one-question screen with two big choices and pictures. It covers photos, documents and ID cards; passport photos already ask for photo paper.
- With **Glossy photo paper**:
  - Ready says **"Put glossy photo paper in the printer."**;
  - PRINT reads **PAPER LOADED — PRINT**;
  - the summary line includes "Glossy".
- The print job is sent exactly as for plain paper (the owner's choice: a reminder only).

**Accepted when:**
- unit: the job keeps paper type; old jobs read as plain.
- e2e: Change → Paper type → Glossy → Ready shows the reminder, PAPER LOADED — PRINT, and "Glossy" in the summary; back to Plain removes them; the plan is identical either way.

---

## Owner checks (USER-CHECKLIST §AA, pending real-world validation)
- The colour toggle's place.
- Cropping a real Aadhaar front and back photographed at the counter.
- Change photo.
- A vertical ID card printed standing.
- The smaller tools and zoom on the phone.
- The pages strip.
- The two questions.
- Home without the WhatsApp card.
- Glossy paper with its reminder on the Brother.
