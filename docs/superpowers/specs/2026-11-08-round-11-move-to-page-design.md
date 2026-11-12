# Round 11: Move to page, Passport photos first, the resize corner as a crop corner (Phase 49)

**Owner, 2026-11-08** (with four screenshots: Adjust with "Photo 8 of 8", the Home screen, Adjust with the round resize circle, and another app's crop corners):
1. "What if we want to manually move photos across pages? Eg: Move to page 2, move to page 1, etc. Think of every scenario."
2. "Swap position of photos card with passport photos card."
3. "Can we remove the round circle from the resize image blue circle on bottom right corner? It's consuming unnecessary space I feel, and replace it with how we can see in other image, just like the stretching crop corner. Behaviour will remain the same, only the circle will be replaced by the cropping edges. Must be extremely user friendly."

4. (2026-11-12, a screenshot of the turn handle above a photo, with an arrow on it) "This blue button doesn't look good, make it a rotate symbol for better UI/UX, make it look like the image can be rotated with that button. Just solid blue doesn't look good."

5. (2026-11-12) "Also make sure passport size photos taken as best quality; also even with best quality the print must aim for fast printing." Asked what "best quality" should mean (sharpest picture in the fast printer mode / the printer's Best photo mode / both), the owner answered: **"best quality I meant image as is."**

The owner's standing instruction for rounds: do what is best and recommended, extremely user friendly.

## Part A: Home
Passport photos is the first tile and Photos the second. The other four keep their places.

## Part B: the resize corner
- The round blue dot on the photo's bottom-right corner is gone. In its place is an **L-shaped corner** drawn on the photo's own corner, in the same look as the side handles (a white L with a ring in the brand colour), the way a crop corner looks in other apps.
- **Behaviour is unchanged:** drag it out to grow the photo, in to shrink it; the Bigger / Smaller buttons do the same; the corner is on every preview that had the dot.
- **Easy to hit:** the place to touch stays at least 56 px square (WCAG 2.2 target size). The L itself is 20–36 px, about 40 % of the photo's short side, so a small photo is never covered by its own corner. Where the photo's corner is at the page's edge the L sits just inside it, as the side handles do.
- **The turn handle** (a round dot on a stick above the photo) is the owner's WPS-style turn and does not change.

## Part B2: the turn handle
- The solid blue dot on a stick above the chosen photo is now a **white knob with a circular arrow** (the same arrow as the Turn tool, in the main colour, inside the main colour's ring). It reads as "turn this", and matches the side handles and the crop corner (white face, main colour ring).
- **Behaviour is unchanged:** press it and move the finger around the photo to turn it to any angle, with the degrees shown; the Tilt and Turn tools do the same. The place to touch is still 56 px square above the photo's top edge; the knob is 36 px, the arrow 22 px.
- The arrow is decorative (hidden from screen readers): Tilt left and Tilt right are the named tools.

## Part C: Move to page
A new tool **Move to page** on Adjust for photos (next to To previous page / To next page, which stay).

**The flow.** Choose a photo, tap **Move to page**. A sheet asks "Move photo 3 to which page?" and lists:
- every *other* page, as a big button: "Page 2" and under it "3 photos";
- **A new page at the end**;
- **Cancel** (Escape and Android Back also cancel).

Choosing a page moves the photo and shows that page. A note under the page says where it is: "Photo 3 is now on page 2." One Undo step takes it back, one Redo does it again.

**Where the photo lands (decided, not asked):**
1. It keeps its size.
2. If the place it had on its old page is free on the new page, it goes to **exactly that place**.
3. Otherwise it goes to the **first free place in reading order** (top row first, left to right, 5 mm steps, at least 2 mm from every other photo, inside the margins).
4. If the page has no free place left, it still goes there, at its own place, on top, and the note adds: "There was no free space, so it covers another photo." The existing "Photo a covers part of photo b" bar shows too; the shopkeeper moves or shrinks it.
5. It is drawn on top of the page it joins.

**Every scenario considered (what the tests prove, what is not built):**

| Scenario | Result |
|---|---|
| To any other page by its number, not only the next | Built; a button for each |
| To a new page at the end | Built |
| A photo alone on the last page, "new page" | Not offered (it is already there) |
| A photo alone on an earlier page, "new page" | Offered: it moves to the end, and the page it left is gone |
| It was the only photo on its page | That page is gone; later pages count one less; the note names the page number *after* that |
| The page it goes to is full | Goes there, covers, and says so (see 4) |
| One page only | Only "A new page at the end" (if the photo has company) |
| One photo in the job | The button is off (nothing to move to) |
| Layouts that flow (not yet placed by hand) | The first move fixes every photo where it is, as any hand move does; the others stay |
| Pages numbered with gaps after Cut or Remove | Works by the page *shown*; a removed photo's kept place never becomes a page |
| A turned or tilted photo | Measured by its turned outline |
| A cropped or straightened photo | Measured by the box it is drawn in |
| Sideways pages | Measured sideways |
| A photo bigger than the page | Stays at the margin, still moves |
| Undo / Redo, saved, reopened | One step; the spots are stored with the job |
| Paste after Cut or Copy | Unchanged: it goes to the page shown |
| 320 px wide at 200 % text, 12 pages | The sheet scrolls, every button 56 px or taller, Cancel reachable, axe clean |

**Not built (for the owner to ask for):** dragging a photo across pages by hand; moving several photos at once; moving a whole page (reordering pages); Move to page for ID cards, passport sheets and documents (they have their own page rules).

## Part E: passport photos as they are, and still fast
- **What changes.** A passport photo is now made **from the photo's own pixels, up to 600 dpi of its printed size** (35 × 45 mm: 1063 px tall), instead of being shrunk to 300 dpi (532 px), and its JPEG is kept almost lossless (quality 98, not 92). The photo is never made from fewer pixels than it has and never enlarged past what it has: a WhatsApp-sized face of 600 × 800 px is kept as it is (before, it was shrunk to 399 × 532 and detail was thrown away).
- **Still fast.** The sheet still goes to the printer as a document, the printer's normal-speed mode (the owner's 2026-10-23 ruling: "delayed print when printing photos"), and the photo is still **one image stored once** for all its copies on the sheet. On an API 35 emulator: a sheet of 12 passport photos made in 1.3 s (it was 0.3 s), file 0.33 MB (it was 0.02 MB with a smooth test photo, 0.05 MB for a small one); 30 photos 1.5 s, 0.33 MB.
- **How.** The plan carries `dpi: 600` on every passport photo (`PASSPORT_DPI`); the renderer accepts whole numbers from 300 to 600 only (never coarser than before), makes such a photo with the finer decode, and judges "may print blurry" against what that photo asked for (under 200 dpi of its own).
- **Not changed.** The "Print quality > Best photo quality" choice (the printer's slower photo mode) still does not apply to passport sheets; ID cards, documents and ordinary photos are made at 300 dpi as before.
- **Cannot be promised from here.** The printer's own speed and how the print looks on paper; both are in the owner's checklist §AH.

## Safety and limits
- No new dependency. The page list is the existing modal sheet (`<dialog>`), which holds focus and cancels on Escape and Back.
- Old WebViews: the sheet's height cap uses `vh`, with `dvh` only inside `@supports`, as the stylesheet test requires.
- Startup JS 47.4 of 61.4 KB; the new code is the pure function (about 1 KB gzipped), the sheet use and a few words.
