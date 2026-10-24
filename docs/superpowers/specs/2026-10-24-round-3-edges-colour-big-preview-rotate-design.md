# Owner round 3 — card edges, back side, side-bar crop, passport count, colour, big preview, rotate handle

**Date:** 2026-10-24 · **Status:** approved by the owner ("Approve, build it all") · **Builds on:** 1.0.224-9c1b253
**Decisions:** `docs/decisions/owner-decisions-2026-10-24.md` rows 16–23.

## What the owner asked (after testing 1.0.224 on their phone)
1. "Remove those corner circles. Don't allow stretch from corners. Must be draggable from the horizontal and vertical
   lines only from middle bar." (screenshot: Fix corners on an ID card)
2. "Add back side functionality not working after we select photo from the gallery."
3. "Add custom number for passport size photos, auto adjust on next page if space isn't enough when the custom number
   entered is big."
4. "Left right borders inside the container … left borders are being hidden … also check all areas. It's spoiling the
   UI/UX, I have told so many times." (screenshot: Home's tiles)
5. "For all print previews the print output must be colour. Let the user change if they want to print in B&W: add a
   toggle in Ready to print, Colour or B&W, for easy switching; must be extremely user friendly."
6. "Allow to rotate images from the image itself, like this" (WPS: a handle above the picture, press and hold, turn to
   any angle, 10° shown).
7. "Increase the size of the preview so that we have enough space to do the changes in the preview for all categories,
   just like this app" (Doc Scanner's Document Editor: the page across the whole width, one row of tools at the bottom).

Answers to the questions asked: side bars only **everywhere** (photos, pages, ID cards); rotate to **any angle,
snapping straight**; **always colour** for new jobs; tools in **one row at the bottom**.

## Unchanged rules
Offline, ₹0, no new dependency; customer files parsed only in the isolated engine; no image bytes over the bridge; one
geometry (the plan) for preview and print; exact sizes; 300 dpi in the box, never lower; plain English; anything
pressed ≥ 56 px; every gesture has a button that does the same; "Remove animations" respected; Back and Home never lose
work.

---

## Phase 25 — fixes

### 25a Card edges are drawn on every side (item 4)
**Cause (found 2026-10-24):** `.screen-host` has `overflow-x: clip` (so a sliding screen never scrolls the page
sideways) with `overflow-clip-margin: 0.5rem` meant to leave room for rings. Chromium applies the clip margin only when
both axes clip, so the host clips at its own edges, which are the edges of the cards in the outer columns: every card,
tile, row or choice touching the screen's side gutter loses the outer side of its 2 px ring (Home's tiles: the left
tile's left edge, the right tile's right edge). The Phase 18 card-edge test checked the CSS, not the painted pixels.
**Design:** the sideways clip moves to the page itself (`html`), where nothing is drawn beyond it; the screen host no
longer clips. A sliding screen still never makes the page scroll sideways; pinned bars keep sticking.
**Accepted when:**
- a browser test walks every screen in the screen map at 360 × 800 and 412 × 915 and, for every element drawn with the
  card ring, reads the **painted pixels** just outside the middle of its left, right and top sides: each must be the
  ring colour (it fails today);
- the existing "no sideways scroll" and pinned-bar tests still pass; a slide-in still never scrolls the page sideways.

### 25b The ID card's back side is added (item 2)
**Cause (found on the device):** after the back photo joins the job, the cards screen clears its "just added" note and
looks for the card in the photo; clearing the note redraws the screen, and the redraw cancels the look that is still
running, so the card is never added. The browser tests passed because their engine answers at once.
**Design:** the look is cancelled only when the screen closes, not when it redraws.
**Accepted when:** an e2e test with a card finder as slow as a phone's (≥ 500 ms) adds the back (fails today); the
device flow Home → Aadhaar & ID cards → gallery photo → Add the back side → gallery photo shows two cards on API 35.

### 25c Crop with the middle bars only (item 1)
**Where:** every crop frame: photos (Crop), photo pages of documents, ID cards (Fix corners).
**Design:**
- No corner circles. The four middle bars are the handles: dragging one moves that side **straight in or out** (top
  and bottom move up and down, left and right move sideways); both of its corners move together, so a straightened
  frame keeps its slant. The magnifier shows while a bar is held.
- One finger elsewhere still moves the whole frame; two fingers make it bigger or smaller.
- Without dragging: "Side 1 of 4: top" with **Next side** and the arrows: Up / Down move the top or bottom side,
  Left / Right the left or right side (the other two arrows are greyed for that side). Start again, Cancel, Whole
  photo, the turns and Done as before.
- Each bar is a button for screen readers ("The top side"), in reading order (top, left, right, bottom).
- The app's automatic straightening (ID cards found, black edges found) is unchanged: its frame may be slanted.
- ID cards: the button and screen "Fix corners" become **"Fix edges"**; the hint says to drag a side bar onto the
  card's edge.
**Accepted when:** e2e: no corner handles on any crop screen; each bar drags its side straight; Next side and the
arrows move the chosen side; a slanted frame keeps its slant when a side moves; screen-reader names and order; 56 px
targets; 320 px at 200 % text.

### 25d Passport: type how many (item 3)
**Design:** on "How many photos?", besides 4 / 5 / 6 / 8 and − / +, a number box ("Or type a number") that opens the
number keypad; 1–100 (was up to 60). Photos that do not fit one sheet go on the next sheets automatically (already so);
Ready says how many sheets.
**Accepted when:** e2e: typing 37 gives 37 photos on as many sheets as needed (A4 and 4×6), every photo inside the
sheet; the box refuses 0 and anything over 100 with a plain message; unit: the count clamps to 1–100.

## Phase 26 — colour by default, one-tap switch (item 5)
**Design:**
- Every new job of every kind (photos, documents and PDFs, passport, ID cards) starts in **colour**. Settings no longer
  sets a default colour per kind (its two colour rows go; saved settings that said B&W are ignored).
- **Ready to print** gets a switch right under the preview: two big halves, **Colour** | **Black & white**, the chosen
  one filled and ticked (✓, never colour alone). One tap changes this job only and redraws the real print preview;
  Change → Colour stays.
**Accepted when:** unit: new jobs of each kind start in colour; e2e: the switch on Ready for photos, a PDF, passport and
ID cards changes the print to grey and back in one tap each; it is a labelled two-option control for screen readers;
56 px; fits 320 px at 200 % text.

## Phase 27 — a big preview with one row of tools (item 7)
**Where:** Adjust for every kind (photos, document pages, passport sheet, ID cards).
**Design:**
- The page is drawn as large as the screen allows: the full width between the side gutters (on a phone in portrait
  the whole width; on a tablet or held sideways, the height decides and the tools sit beside it as now).
- The tools move into **one row** of icon-over-word buttons above Done; the row slides sideways and its last visible
  tool is cut at the edge, so it is clear there are more. Each tool keeps its name, icon and 56 px height.
- The status lines (the size, "Moving photo 3…") stay over or under the page without pushing it around.
**Accepted when:** e2e: on a 360 × 800 phone the page is at least 90 % of the screen width on all four kinds; the tool
row is one row; every tool can be reached by sliding and by keyboard; the layout matrix (320–480 px, 100–200 % text,
800 × 360) and axe pass.

## Phase 28 — turn a photo to any angle from the photo itself (item 6)
**Where:** Adjust, photo jobs (every photo layout, placed by hand or flowing). Document pages, passport sheets and ID
cards keep the 90° Turn.
**Design:**
- The chosen photo shows a **round handle on a short stick above its top edge** (like WPS). Press it and move the finger
  around the photo's centre: the photo turns to follow, showing the angle ("10°"); it clicks into straight (0°, 90°,
  180°, 270°) within 3°. Lifting the finger saves.
- Buttons: **Tilt left** / **Tilt right** turn it 1° a tap; Turn still turns 90°.
- Stored as the quarter turns the job already has plus a **tilt** of −45°…45°; the photo keeps its own size when it
  turns (as in Word); on the page it takes the room its turned outline needs (flowing photos flow around that outline;
  a photo placed by hand turns around its centre and stays inside the margins).
- **Printing:** the engine makes the photo at 300 dpi of its own size; the print file draws it at that angle (no
  second image, no lost resolution); the preview on Adjust and Ready shows the same.
- A tilted photo has no side bars on Adjust (Crop is the way); its round corner still resizes it.
**Accepted when:** unit: angle → turns + tilt round trips; the outline (bounding box) maths; every outline inside the
margins and flowing photos never overlap; plan carries the tilt and the photo's own size. JVM: a plan with a tilt is
accepted, its own size must fit its outline, a bad tilt is refused. Device: a tilted photo prints at its angle and
300 dpi (PlanRenderDeviceTest, colour check at its corners) and pdf.js reads its outline and angle back (render check
extended to angles). e2e: the handle turns the photo with the angle shown and snaps; Tilt buttons; Turn keeps the tilt;
the print plan follows.

---

## Order and closure
Phases 25 → 26 → 27 → 28. Each phase: the closure sequence (CLAUDE.md §2), its report `docs/qa/phase-NN.md`, evidence
in `docs/evidence/phase-NN/2026-10-24/`, traceability rows P25–P28. Then: an independent whole-branch review, the
device regression on API 24, 35 and 36, privacy and release checks, cold start, the APK in `apk/`, a security scan of
the public tree and one new commit on the public repository.

**PENDING REAL-WORLD VALIDATION** (USER-CHECKLIST §Z): the edges on the owner's curved screen; the back side with a
real card; the side bars' feel; colour by default and the switch; the big preview on their phone; the rotate handle's
feel and a tilted photo printed on the Brother.
