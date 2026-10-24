# PrintSaathi V1.3: place anywhere, scanner crop, Word margins, add photos, whole logo (design spec)

**Status:** approved by the owner in conversation on 2026-10-24, after they tested `PrintSaathi-1.0.203-1353ebf.apk` on
their phone. Their choices, in their words and answers, are below. "Approve, build it all": the spec and plan go into
the repository and the work runs to closure without further check-ins.

**Extends:**
- `docs/PLAN.md` (R2);
- `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md`;
- `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`.

**The owner overrides these earlier rules:**
- **PLAN §N, "no free-form layout editor", and the 2026-10-23 spec, "still no free positioning or overlapping".** A photo
  can now be placed anywhere on its page by hand. Photos may overlap; the one moved last prints on top.
- **PLAN §H2.4, "no long-press".** Press and hold lifts a photo to move it. Buttons still do the same (Move ↑ ↓ ← →,
  To previous page, To next page), so it is never the only way.
- **PLAN §G0, "rows centred".** Photo pages fill from the top-left like a Word page.
- **PLAN §G0, "edge space 6 mm A4".** Photo pages on A4 keep Word's **Narrow** margins (1.27 cm) by default.
- **Phase 9 crop.** A crop's frame may now be any four-cornered shape; the photo is straightened when printed.

## What the owner asked (their words, in order)
1. "Add more images option needed."
2. "Press and hold the image to make it movable anywhere and place anywhere in the page, so that [the] user can place
   the image in his desired place in the page."
3. "For all crops give this kind of cropping frame UI; it's from the existing app that we use for our shop, [a] doc
   scanner app from [the] Play Store. Give the same cropping UI." Their screenshot shows:
   - the picture with a blue frame: round handles at the 4 corners and pill handles in the middle of the 4 sides;
   - a round magnifier with a + at the top-left;
   - a bottom bar: ✕, whole picture, turn left, turn right, →.
4. "App logo isn't proper on splash screen, please correct it." Their two screenshots show:
   - Android's own splash: the printer **without** its paper or bottom tray;
   - the app's splash a moment later: paper, but still no tray.
5. "Allow to crop: use [the] same frame to allow cropping of images." (Screenshot: the selected photo's frame on Adjust.)
6. "Default margin layout must be narrow, same as Word." (Screenshot: Word's Margins menu, Narrow = 1.27 cm each side.)

**Their answers:**

| Question | Answer |
|---|---|
| Moving | Free; the others stay where they are; overlap allowed; the moved photo goes on top; **Automatic** re-tidies |
| Crop corners | Free corners that straighten a slanted photo, like the scanner app |
| Passport "Fit the face" | **Unchanged** |
| Same-frame crop | **Side handles** on the Adjust frame crop that side (Word style); the round corner still resizes; the Crop button still opens the full scanner screen |
| Margins | Settings → Margins with Word's names: **Narrow 1.27 cm (default)**, Normal 2.54 cm, Small (today's 6 mm) |
| Where photos start | **Top-left, like Word** |
| Scope of margins | **Photo pages on A4 only.** Passport sheets, ID cards, documents and 4×6 photo paper keep their spacing |
| Publish | When finished, push as **a new commit** to the public repository |

## Unchanged rules (they bind every part)
- **Offline and free:** offline, ₹0, no new dependency.
- **Customer files:** parsed only in the isolated engine; no image bytes over the bridge.
- **Print accuracy:**
  - one geometry, the plan, for preview and print; the Ready preview is the real print file;
  - exact physical sizes (± 0.5 mm);
  - never lower print resolution: 300 dpi in the box;
  - never re-encode a lossy image twice.
- **Wording:** plain English (jargon lint).
- **Accessibility:** anything pressed ≥ 56 px; AAA text contrast; motion off with "Remove animations"; every gesture
  has a button that does the same.
- **Safety:** Back and Home never lose work; no customer file names or paths in logs.

---

## Part 1 — The splash shows the whole logo (Phase 20)

**Cause:**
- Android's splash (`splash_mark.xml`) draws the v3 mark *without* its paper and tray.
- The page's splash then "feeds" the paper in from invisible and "prints" the tray from nothing, but it leaves as soon
  as Home is ready (Phase 16 speed fix).
- On a fast phone, the owner sees only half-built logos.

**Design:**
- **Android's splash** (Android 12+ splash icon; Android 7–11 window picture) draws the **complete** v3 mark:
  - parts: paper (white outline, tangerine sheet, folded corner), the cobalt printer with P and S, and the white
    output tray with its tangerine line;
  - size and centre as now: 0.34 dp per mark unit on the 288 dp canvas;
  - the whole mark lies within the 192 dp circle Android keeps (furthest point ≈ 75 dp from the centre).
- **The page's splash** draws the same complete mark at the same place from its first frame.
  - The only motion is a small "feed" nudge of the sheet: it moves 4 % down and back over 420 ms. The sheet is never
    hidden or faded.
  - The name "PrintSaathi" fades in below.
  - With "Remove animations", nothing moves.
- **Nothing else changes:**
  - the splash still leaves as soon as Home is up;
  - it still runs on the compositor;
  - the screens still preload after it.

**Accepted when:**
- **Brand test:**
  - `splash_mark.xml` contains all four parts of `assets/brand/mark.svg` (the same path data);
  - every point lies inside the 192 dp circle.
- **e2e:** at the splash's first frame, every splash layer is fully opaque, and the sheet is within 5 % of its resting
  place.
- **Device evidence:**
  - API 35: a screen recording frame of Android's splash and one of the page's splash, both showing the whole logo;
  - API 24: the launch window shows the whole logo.
- **Cold start:** first frame (`am start -W`, alternating 20 runs each, no recording) within **10 % of 1.0.176** (the
  Phase 16 limit, unchanged).

## Part 2 — Word margins, photos from the top-left (Phase 21)

**Settings → Margins** (a new row, for the shop owner), with Word's names:

| Choice | Each side | Note |
|---|---|---|
| **Narrow** (default) | 1.27 cm | Word's Narrow |
| Normal | 2.54 cm | Word's Normal |
| Small | 0.6 cm | Today's edge |

**Margin rules:**
- **Which jobs:** photo layouts on A4 only: All on one page, Use more pages, One on each page, and photos moved by hand
  (Part 5).
- **Unchanged spacing:** passport sheets, ID cards, documents/PDFs, and photos on 4×6 photo paper (calibrated edge)
  keep theirs.
- **The printer's own edge:** a margin is never smaller than the edge the printer itself cannot print (the A4 edge
  measured by the test page, when known). "Space at paper edges: More" still adds 3 mm on top.
- **Existing settings:** they read as Narrow. Owner-visible change: photos on A4 get about 6.7 mm narrower overall at
  each edge than in 1.0.203.

**Photos start at the top-left, like a Word page.** On every photo page (A4 and 4×6):
- **Rows:** each row starts at the left margin, and the rows start at the top margin. Leftover space stays at the right
  of a row and at the bottom of the page.
- **Row height:** photos in one row sit on its top line, top-aligned like Word's pictures in a line.
- **Rows-and-grid layouts** (All on one page, Use more pages): the same rows as now, left- and top-aligned instead of
  centred. The last row of a grid starts at the left.
- **One on each page:** the photo at the top-left of the area inside the margins.
- **Sizes chosen on Adjust (flow):** the same Square-wrap flow as now, left- and top-aligned.

**Accepted when:**
- **Unit and property tests:**
  - every photo box on A4 lies inside the chosen margin;
  - the first row touches the top margin, and every row's first photo touches the left margin;
  - no photo overlaps another in an automatic layout;
  - the existing invariants still hold (each photo once, aspect kept, order kept).
- **Settings tests:** Narrow is the default, all three choices are offered, and old settings files read as Narrow.
- **e2e:** the Ready/Adjust preview places the first photo 12.7 mm from the top-left of A4 at Narrow.
- **Device check:**
  - the print file's first image sits at 12.7 mm (pdf.js page check);
  - the passport sheet and ID card plans are unchanged (their existing device and render tests pass untouched).

## Part 3 — Add photos (Phase 22)

**Where:**
- **Add photos:** on the photo list (Change → Photos) and in Adjust's tools, for photo jobs.
- **Add files:** on the page list (Change → Pages) and in Adjust's tools, for document jobs.
- **No Add:** passport jobs (one photo) and ID card jobs (front and back).

**Flow:**
1. Tap → **"Where are the photos?"** (for documents: "Where are the files?") with two big choices, like the
   Aadhaar tile:
   - **From the gallery:** Android's photo picker, many photos (the file picker on phones without it);
   - **From the file manager:** the document picker; for photo jobs photos only, for document jobs PDFs and photos.
2. The files are received like a share: the receiving progress appears after 1 s, and Cancel works.
3. When they arrive, they **join the job at the end**. The "New files arrived" question is not asked, because the
   shopkeeper already said what they want.
4. The shopkeeper is back on the screen they came from:
   - the photo list shows the new photos;
   - Adjust chooses the first new photo.

**Rules:**
- **Order and turning:** the new photos keep their order. They are never turned by the app (chosen from the phone,
  owner 2026-10-23).
- **Too many files:** a job holds at most 100 files (the share rule). If the new files would pass 100, only the first
  ones up to 100 join. A panel says: "Only 7 photos were added: a job holds up to 100 files."
- **Picker closed with nothing chosen:** back where they were, nothing changed.
- **Duplicates:** shown as for any job (the existing banner).
- **App closed while the picker is open:** nothing is lost. The files arrive as their own job and the existing "New
  files arrived" question offers "Add to this job". The intention "add to job X" is kept for 10 minutes (screen
  names and job id only, never file names).
- **Photos placed by hand (Part 5):** new photos go on new pages after the last page.

**Accepted when:**
- **e2e (mock engine):**
  - Add from both sources, from the list and from Adjust;
  - Cancel and close the picker;
  - the 100 cap, with its panel;
  - document jobs take a PDF;
  - no "New files arrived" screen;
  - Back after adding returns to where Add was pressed.
- **Unit:** the reducer adds at the end and the cap holds.
- **Device:** on API 35, Add from the file manager through the real picker (UiAutomator), with the job count unchanged
  and the photos in the job.

## Part 4 — Scanner-style crop with free corners (Phase 23)

**Which crops:**
- photos in photo jobs (Adjust → Crop, Photo tools → Crop);
- photo pages in document jobs;
- ID cards ("Fix corners").

**Passport "Fit the face" is unchanged.** PDF pages still have no crop.

**The screen** (one layout for all three):
- **Top:** the usual top bar (‹ Back · title · Home) and a one-line hint: "Drag a corner or a side. The part inside the
  frame prints."
- **The picture:** as large as fits between the hint and the bottom bar, shown turned as it prints. The part outside
  the frame is dimmed.
- **The frame:** brand-blue lines, with:
  - **4 round corner handles,** each moving its own corner freely;
  - **4 side handles** (pills in the middle of each side), each moving that side, i.e. both its corners together.

  Handles are drawn at 24 px and touched at 48 px. One finger inside the frame moves it; two fingers make it bigger or
  smaller (as now).
- **The magnifier:** while a handle is dragged, a round 112 px magnifier with a + shows the picture under the finger,
  2.5× larger.
  - It sits at the top-left of the picture, and moves to the top-right when the finger is in the top-left third.
  - With "Remove animations" it simply appears, without growing.
- **Without dragging:** under the picture, "Corner 1 of 4: top left" with **Next corner** and **↑ ↓ ← →** (1 % a tap).
- **The bottom bar,** each an icon above its word:
  - **Cancel:** back, nothing saved;
  - **Whole photo:** the frame on the whole picture;
  - **Turn left · Turn right:** turns the photo itself, saved at once like Adjust's Turn; the frame turns with it;
  - **Done:** keeps the frame (primary).

  It is one row when each button is at least 56 px wide, otherwise Done sits on its own row. For ID cards, the two
  turns are one **Upside down** button, because a card always prints lying flat.
- **Where the frame starts:**
  - the photo's straightened frame;
  - else its crop;
  - else the black edges found (unless the shopkeeper chose to keep them);
  - else the whole picture.

  For a card: its corners.
- **What Done keeps:**
  - frame on the whole picture → no crop;
  - frame's corners square with the picture, within 0.5 % → a plain **crop** (as now: the fastest path, no
    straightening);
  - otherwise → a **straightened frame**: the four corners on the upright photo. A frame must not be crossed or folded
    (a move that would do that is not taken) and must be at least 5 % of the picture.
- **Straightened preview:** when the frame is not square, a small "How it will print" picture shows under the buttons,
  made by the engine a moment after the corners stop (as the card screen does now).

**Printing a straightened photo:**
- **Shape:** it is laid out with the shape of the straightened part. Width = the average of its top and bottom sides,
  height = the average of its left and right sides, measured on the photo in pixels.
- **Engine path:** the engine straightens it straight into its box at 300 dpi (the existing card path), from the
  original photo, never from a thumbnail.
- **Print styles:** every style works, including OCV Black (straightened first, then made black and white at 1 bit).
- **Elsewhere:** Adjust and Ready show it straightened (Adjust: engine-made pictures; Ready: the real print file).

**Accepted when:**
- **Unit tests:**
  - quad ↔ crop decisions (square within 0.5 % → crop; whole → none);
  - straightened shape; turning the frame with the photo (both directions, 4 turns = same);
  - side moves;
  - crossed or too-small frames refused;
  - the reducer: a crop and a straightened frame never both kept.
- **e2e:**
  - every handle drags; Next corner and arrows work;
  - the magnifier appears while dragging and goes away after;
  - Whole photo, Turn left and right, Cancel (nothing saved), Done (saved);
  - the card screen keeps its result preview;
  - the screen fits 320 px wide at 200 % text.
- **JVM and device:**
  - the engine refuses a bad quad in a plan;
  - a straightened photo renders at 300 dpi;
  - OCV Black with a quad makes 1-bit output;
  - the pdf.js render check of a plan with a straightened photo matches the box;
  - `PlanRenderDeviceTest` covers a photo quad.

## Part 5 — On the page: press and hold to place, sides to crop (Phase 24)

**Applies to:** photo jobs on Adjust. Document pages, passport sheets and ID cards keep their automatic places.

**Press and hold to move:**
- **Lifting:** a finger held still on a photo for 0.45 s lifts it: shadow, a slightly larger outline, and the status
  line "Moving photo 3. Lift your finger to drop it." If the finger moves more than 8 px first, the page scrolls as
  usual and nothing lifts.
- **Dragging:** the lifted photo follows the finger and stays inside the margins.
- **Snapping:** within 2 mm, it snaps to the page's middle lines, the margins, and other photos' edges and middles. A
  thin guide line shows the snap.
- **Dropping:** lifting the finger drops it there and saves at once.
- **The first drop fixes every photo** on every page where it is now, at its present size. From then on:

  | Action | What happens |
  |---|---|
  | Bigger / Smaller / round corner | Resizes it **around its centre**, inside the margins |
  | Turn | Turns it around its centre |
  | Crop | Keeps the remaining part where it was (Word style) |
  | Remove | Leaves the gap; Undo puts the photo back on its spot |
  | Add photos (Part 3) | New photos flow on new pages after the last page |
  | **To previous page / To next page** (replacing Move earlier / later) | Takes it to the same spot on that page; next from the last page makes a new page |
  | **Move up / down / left / right** | Moves it 2 mm a tap (the button alternative to dragging) |
  | **Automatic** | Puts every photo back in tidy rows at automatic sizes: no spots, no sizes |

- **Overlap:**
  - the photo moved, resized or turned last is drawn and printed on top;
  - a tap picks the top photo;
  - while any photos overlap, Adjust and Ready say "Photo 2 covers part of photo 4." (Ready: "Some photos cover part
    of another. Check the preview.").
- **Starting again from automatic:** changing the paper, the paper direction or the layout removes the hand placings,
  as it removes sizes today.

**Sides to crop (Word style):**
- **The handles:** the selected photo's frame shows a handle in the middle of each side. Dragging a side inward cuts
  that side off; dragging it outward brings it back (up to the photo's own edge).
- **Size:** the part that remains keeps its print size (scale), so the frame shrinks on that side only.
  - In flow, the photo's size becomes the remaining part's, and the others flow on.
  - Placed by hand, the opposite side stays where it was.
- **Straightened photos:** the side cuts follow the straightened shape. The new corners are computed on the
  straightened picture and mapped back exactly.
- **Small photos:** side handles show only when the photo's frame on screen is at least 96 px along that side;
  otherwise Crop (the full screen) is the way. The round corner keeps working.
- **Minimum:** a crop keeps at least 5 % of the photo.

**Accepted when:**
- **Unit tests:**
  - spots ↔ plan: boxes from centre and size, kept inside the margins, z-order;
  - unpinned photos flow after the pinned pages;
  - previous/next page;
  - clearing spots on paper, direction or layout change, and on Automatic;
  - Undo of Remove restores the spot;
  - overlap detection;
  - the side crop keeps the scale and moves the right edges;
  - the straightened side crop maps exactly (the homography round trip).
- **e2e:**
  - press, hold and drag with a mouse pointer and with touch;
  - a quick move scrolls and does not lift;
  - snapping shows a guide;
  - every button alternative;
  - overlap panels;
  - the side handles crop and keep the scale;
  - Automatic clears everything.
- **Device:**
  - a plan with hand-placed, overlapping photos renders to a print file whose images sit exactly at the plan's boxes
    (pdf.js check);
  - the adjust smoke gets press-and-hold and side-crop steps on API 35, with screenshots;
  - nothing customer-related is logged (privacy run).

---

## Order and closure
Phases 20 → 24 in this order:
1. Phase 21 changes where photos sit before Phase 24 fixes them in place.
2. Phase 23 adds straightened frames before Phase 24 crops their sides.

Each phase goes through the full closure sequence (CLAUDE.md §2), with its report in `docs/qa/phase-NN.md` and evidence
in `docs/evidence/phase-NN/2026-10-24/`. The traceability rows are P20–P24.

The final release then needs:
- an independent whole-branch review;
- a full device regression on API 24, 35 and 36;
- privacy and release checks;
- the APK in `apk/`;
- a security scan of the public tree, then one new commit pushed to the public repository.

**PENDING REAL-WORLD VALIDATION** (owner's phone and the shop Brother), added to USER-CHECKLIST §Y:
- how press-and-hold, snapping and the magnifier feel;
- side-crop handle size on their phone;
- a straightened document photo printed flat and sharp;
- Narrow margins measured on paper;
- the splash on their phone.

## Part 6 — Card edges you can see (added 2026-10-24, owner's message during the build)

**The owner's words:** "Also fix invisible border for the cards. Also check other places." Their screenshot of Home has
arrows at the sides of the four job tiles and the "Continue the last job" card.

**Design:**
- Every card or tile on the grey page gets a 2 px edge in the card-edge grey (`--edge`, 3.9:1 on the page). The 1 px
  edge vanished on their phone. This covers:
  - Home's job tiles and the Continue card;
  - the WhatsApp hint card, which had no edge at all;
  - Change and Settings rows, picture choices and the cards found;
  - photo thumbnails.
- One shared token (`--ring`) so no screen drifts.

**Accepted when:** a browser test walks every screen in the screen map. Any white (or stage-grey) card on the grey page
without a border or ring of 2 px or more at 3:1 against the page fails it.

## Part 7 — Four small requests (added 2026-10-24, owner's messages during the build)

1. **"Remove the set up the printer button and its section. It's not needed."** Home no longer shows the panel "The shop
   printer is not set up yet…" with its "Set up the printer" button. The test page stays in Settings → Print a test
   page, and Help keeps its set-up steps.
2. **"Do we need to make the logo and the header static on scroll?"** Their answer to the suggestion: *"keep it static
   on the home page only, as it's shown on home only now."* Home's PrintSaathi logo bar stays at the top while Home
   scrolls. Other screens are unchanged; their top bar scrolls with the page.
3. **Fit the face: "interchange the position of zoom in button and zoom out button, zoom in keep right, zoom out keep
   left."** Zoom out (−) is on the left and zoom in (+) on the right, reading order matching.
4. **ID cards: "Where is the option to print the back side? … We can keep this as optional; the customer might need
   the front only or both sides printed on one page vertically."**
   - With one side, the ID card screen offers **Add the back side**. It asks Gallery or File manager (Part 3's screen),
     the app finds the card in the chosen photo, and it becomes the back.
   - With two sides, the back has **Print front only**, which leaves the back out (Undo brings it back), so the
     customer can have the front alone.
   - Both sides print on one page, front above back (as now).

**Accepted when** e2e tests cover each item:
- Home has no set-up panel, even with no printer set up;
- Home's logo bar keeps its place while the page scrolls, and another screen's top bar still scrolls away;
- Fit the face has − left of +;
- Add the back side gives two cards, front then back, on one page;
- Print front only leaves one card, and Undo restores the back.
