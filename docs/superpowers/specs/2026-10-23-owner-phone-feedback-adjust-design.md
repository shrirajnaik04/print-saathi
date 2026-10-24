# PrintSaathi V1.2: the owner's phone test — Adjust, passport, medium size (design spec)

**Status:** the four design choices were approved by the owner in conversation (2026-10-23 evening, after testing
`PrintSaathi-1.0.176-8bcaf35.apk` on their phone); this written spec awaits their review.

**Extends:** `docs/PLAN.md` (R2) and `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md`.
The owner overrides three earlier rules:
- PLAN §N "no free-form layout editor": The shopkeeper can now resize every photo, page, passport photo and ID card on the
  preview (a guided **Adjust** screen; still no free positioning or overlapping).
- PLAN §H1 type scale (body 20 px, buttons 22 px, titles 28 px): **medium**, about 15 % smaller.
- Phase 15 auto-rotation: it no longer touches photos chosen from the phone (gallery or file manager).
- PLAN §G0 "each candidate tried upright and sideways": the paper is **upright (portrait) unless the shopkeeper chooses sideways**.

## What the owner asked (their words, in order)
1. "Give option to select on each image to resize, wrap text as square by default."
2. "When images don't fit auto shift on new page. If adjustment requires more space. Then auto adjust on new page."
3. Passport "Fit the face": "We cannot select [the] area and adjust based on our requirement. Cannot zoom in zoom out
   the pic so that we can fit in the selection."
4. Passport photos: a "picture format" option for a picture border, "Black Border weight 1½ pt Default".
5. Aadhaar & ID cards: ask first where to open — gallery (photos) or file manager (documents).
6. Home: card "borders hidden, touching the screen" (their phone has curved sides).
7. "Font and components too big, make it medium size. Buttons, cards, etc."
8. "Photo adjustments must be there for all previews, so that [the shopkeeper] can adjust as [the] customer asks to resize."
9. "Rotation must be allowed in preview so that images can be rotated."
10. "When [an] image is selected from file manager or gallery it shows as is and not rotated or anything."
11. "Portrait or landscape paper, give that option. Default select portrait for all." (their screenshot: one wide photo
    was put on a sideways page by itself)
12. "Continue last job: place it below the Documents & PDF and Aadhaar & ID cards card."
13. "One on each page: allow to crop, rotate, etc. Keep things flexible and extremely user friendly."
14. Brand pack `PrintSaathi-v3/` (PS printer mark): "update the logo everywhere, and add a user friendly animated,
    transitioned splash screen. Make sure nothing consumes more hardware resources and performance isn't affected."
15. "Hope print quality is the same [for] image, document etc. when Original is selected; must be as is for all
    categories." and "Can we print everything as PDF and not as image? … I have faced delayed print when printing
    photos." Their choices after the facts: every job as a document; original photos untouched.

Their answers: Adjust = tap a photo → an Adjust screen (option 1); medium size (~15 % smaller); keep 3.5 × 4.5 cm as
the passport default and add a custom size; border thickness choices with 1½ pt as the default.

## Unchanged rules (they bind every part)
Offline, ₹0, no new dependency; customer files parsed only in the isolated engine; no image bytes over the bridge;
one geometry (the plan) for preview and print; exact physical sizes (± 0.5 mm); never lower print resolution; plain
English (jargon lint); every control the shopkeeper presses ≥ 56 px; text contrast AAA; motion off with "Remove animations";
Back and Home never lose work; every gesture has a button that does the same (PLAN §H2.4).

## Part 1 — Medium size, side space, card source, photos as they are (Phase 16)

**Medium size** (all in `rem`, so the phone's own font size still scales it, capped at 2.0× as now):

| | Now | Medium |
|---|---|---|
| Body text | 20 px | 17 px |
| Button text / height | 22 px / 64 px | 18 px / 56 px |
| PRINT button | 24 px / 72 px | 20 px / 60 px |
| Titles | 28 px | 24 px |
| Home tiles (grid) | 128 px tall | 104 px |
| Tile title / helper | 20–22 / 18 px | 18 / 16 px |
| Icons | 28–32 px | 24–28 px |
| Side space (gutter) | 16 px | **24 px** |

Spacing scale about 15 % tighter. 56 px stays the floor for anything the shopkeeper presses (unchanged rule).

**Side space (item 6):** the owner's phone's curved sides hide what is closer than ~4 mm to the edge; the gutter grows to
24 px, and the layout matrix's floor for "a control keeps clear of the screen's sides" rises from 8 px to 20 px
(a stricter test).

**Aadhaar & ID cards tile (item 5):** opens **"Where is the card?"** with two choices:
- **Photos of the card** — "From the gallery": Android's photo picker, at most 2 photos (front and back); a phone
  without it gets the file picker showing photos.
- **e-Aadhaar PDF or file** — "From the file manager": the document picker (PDFs and photos), as now.
Taps from Home: 5 → 6 (one decision more, asked for by the owner). The share path is unchanged (4).

**Photos as they are (item 10):** a job made from files chosen from the phone (any Home tile) is never turned by the
app; the Phase 15 automatic turn applies only to files shared from WhatsApp or another app. A photo shows the way the
phone's gallery shows it: the camera's own "which way up" mark is applied once (PLAN §F2), nothing else. Turn stays
on every Adjust screen for the shopkeeper to use.

## Part 2 — Passport photos (Phase 17)

**Fit the face (item 3), the WhatsApp way:** the frame stands still in the middle of the screen; the photo moves
under it. One finger drags the photo; two fingers pinch to zoom it in or out. The photo outside the frame is dimmed.
The photo always fills the frame (it can never be moved or zoomed out so far that the frame shows an empty edge).
Buttons do the same: **Zoom in**, **Zoom out**, **Move photo ↑ ↓ ← →**, **Turn**, **Start again**. Saved as the same
frame as now (a part of the photo, kept with its turn and size).

**Crop (Photo tools → Crop)** gets the same gestures as extras: drag inside the frame to move it, pinch to make it
bigger or smaller; the corner handles and buttons stay.

**Picture border (item 4):** Settings → **Passport photo border**: None · ½ pt · 1 pt · **1½ pt (default)** · 2¼ pt
· 3 pt, black. Per job: Change → **Border**, and on the passport Adjust screen. The line is drawn **inside** the photo's
edge, so a photo cut along the outside of the line is still exactly its size (3.5 × 4.5 cm). With a border on, the
grey cut lines between photos are left out (the border is the cutting guide).

**Custom size:** Settings → Passport size gets **Custom size**: width and height in cm (1.5 to 10 cm, to 0.1 mm). Per
job: Change → **Size** (3.5 × 4.5 cm · 2 × 2.5 cm · 2 × 2 inch · the custom size). On Adjust, **Bigger / Smaller** change
the job's size 1 mm at a time, keeping its shape; the sheet re-counts how many fit.

## Part 3 — Adjust on every preview (Phase 18; items 1, 2, 8, 9)

**Entry:** Ready gets an **Adjust** button under Change ("Adjust photos", "Adjust pages", "Adjust passport photo",
"Adjust cards"). Tapping a photo on the preview also opens Adjust with that photo chosen (an extra: small photos are
hard to hit, the button is the main way).

**The Adjust screen:** the page holding the chosen photo, drawn live from the plan (the same thumbnails Ready shows
before the print file is ready). The chosen photo has a thick outline and a round handle at its bottom-right corner
(drag it to resize). Under the page: "Photo 3 of 12 · 8.4 × 6.3 cm". Buttons: **Smaller**, **Bigger**, **Turn**,
**Crop**, **Move earlier**, **Move later**, **Remove** (Undo, as Photo tools), **Previous photo**, **Next photo**,
**Automatic sizes**. Tapping another photo on the page chooses it. **Done** goes back to Ready, which makes the print
file again. Every change is saved at once (Back and Home keep it).

**Photos — "Square" wrap (items 1, 2):** each photo keeps its own size; the photos flow in print order, left to right
in rows, rows top to bottom. A photo that does not fit the rest of a row starts the next row; a row that does not fit
the rest of the page starts the next page — by itself, no question (the summary line says the new page count). Each
row is centred across the page, photos in a row are centred on its middle line, and the rows are centred down the
page. The first size change keeps every photo at the size it had (and the page direction); from then on a photo
changes size only when the shopkeeper changes it. **Automatic sizes**, or choosing another layout, number of pages or paper,
goes back to the automatic layout. A size is kept as the photo's long side in mm, so Turn and Crop keep it.
Bigger/Smaller: × 1.1 per tap; a photo never grows past the space inside the paper's edges (Bigger stops), never
shrinks below 2 cm on its long side (Smaller stops).
**One on each page:** the photo keeps its page; its size changes on that page, centred.

**Documents:** Smaller / Bigger scale the page on its sheet from 100 % (fitted inside the edges, as now) down to 50 %
in 5 % steps, centred; Turn; Crop (photo pages); Move; Remove. A scaled page is no longer the customer's untouched file
(it prints as a prepared page).

**Passport sheet:** all photos on the sheet are the same photo, so Adjust changes them together: Smaller / Bigger
(Part 2), Fit the face, Turn, Border, Size, How many.

**ID cards:** Smaller / Bigger change both cards together, 70 % to 200 % of the real card in 10 % steps ("8.6 × 5.4 cm ·
real size", "10.3 × 6.5 cm · 120 %"), stacked as now with cut lines; Turn (half turn), Fix corners, Swap front and back,
Previous / Next card.

**Turning (item 9):** on every Adjust screen; a photo or page a quarter turn clockwise per tap, an ID card a half turn.

**Plan contract:** placements keep their boxes (the flow decides them); a passport placement may carry `border` (points,
0.25–6). The engine draws it as a black rectangle inside the box, after the photo. Nothing else changes natively.

## Part 4 — Paper direction (item 11; Phase 18)
Every photo, document and passport job prints on **upright paper (portrait)** unless the shopkeeper chooses **sideways (landscape)**
in Change → **Paper direction** ("Portrait — paper standing up" / "Landscape — paper lying sideways", with pictures).
The app never turns the paper by itself any more: layouts, Best, one on each page, documents and passport sheets all
use the chosen direction (a wide photo on upright paper is fitted across it; Turn or Landscape makes it bigger). The
summary line says "Landscape" when chosen. Adjust uses the same direction. ID cards stay on upright A4 (their layouts
are made for it). Acceptance: every layout and plan test runs in both directions; a new job is portrait; Change →
Paper direction → Landscape gives sideways pages in the preview and the print file.

## Part 5 — The PS printer logo and the splash (items 12–14; Phase 16)
- Continue the last job sits under the four job tiles. One on each page gets every Adjust tool (Part 3).
- **Logo everywhere** from the v3 masters (copied to `assets/brand/`, used exactly): Android launcher icon (adaptive:
  white background + the mark as a vector; Android 13 themed icon from the monochrome master; Android 7 square and round
  icons), the browser favicon, and the mark beside "PrintSaathi" on Home (decorative, hidden from screen readers; the
  name stays text). Brand colours (cobalt #304BEE, tangerine #FF854A, ink #111B35) only in the logo; the app's own
  colours stay.
- **Splash:** the phone's own splash (Android 12+: the system splash API; Android 7–11: the window background) shows the
  printer on the app's background. Then the app's first screen paints the same printer at the same place and, in about
  0.8 s, a sheet feeds in from the top, the page comes out below and "PrintSaathi" appears; the splash fades into Home.
  It runs while the app loads (it never waits for anything and adds no work afterwards): CSS transform and opacity
  only, four tiny layers, no script per frame, removed from the page when done. With "Remove animations" on, there is
  no splash animation at all. The brand pack asks for no decorative motion; the owner asked for this one, so it is
  short and tells the story of printing (a ruling).
- Acceptance: launcher, round and themed icons present at every density (script test reads their sizes); the system
  splash attributes set; no Capacitor sample artwork left; e2e: the splash shows and is gone within 1.5 s with Home
  usable, none with reduced motion; device: screenshots of the icon and splash on Android 15 and 7, cold start time
  (`am start -W`) before and after within 10 %.

## Part 6 — Print speed and photos "as is" (item 15; Phase 19)
Facts (code): every job is already sent as a PDF; an untouched customer PDF prints byte for byte; photos print at
300 dots per inch of their printed size from the full photo, re-saved once as JPEG quality 92; changed documents print
as 300 dpi page pictures. Photo layouts were sent with Android's "photo" content type, which lets printers pick their
slower photo mode.
- **Every job is sent as a document** (the printer's normal mode). Photo layouts get Change → **Print quality**:
  "Normal (faster)" (default) or "Best photo quality (slower)", which sends the photo type as before.
- **Original photos untouched:** a JPEG photo placed with no crop, no turn other than its own camera turn (0, ½, ¼ turns
  — never a mirrored one), Original style in colour, and no more pixels than its printed size needs at 300 dpi, goes into
  the PDF as its own file bytes (no decode-and-save). The isolated engine reads only the JPEG's header and says whether
  it qualifies (baseline or progressive, 8 bit, grey or YCbCr, not CMYK); anything else is drawn as now.
- Acceptance: unit tests for the rule; JVM test: a qualifying JPEG's bytes appear unchanged in the print file; device:
  the print file of a WhatsApp-sized photo contains the original bytes; every job's print request is a document unless
  Best photo quality is chosen. Speed on the shop's Brother: owner (PENDING).

## Acceptance
- **Part 1:** the full layout + accessibility matrix (320–480 px, 800×360, text 100–200 %) green with the medium sizes
  and the 20 px side rule; Home at 360 px shows all four job tiles and the Continue card; the card source screen and both
  pickers on the Android 15 emulator; a picked job is never turned (unit + e2e), a shared one still is; JPEGs whose
  camera mark says "turned" (6, 3, 8) show upright exactly once on the device.
- **Part 2:** pan/zoom maths unit-tested (the frame always inside the photo, zoom limits); e2e: drag and pinch (two-finger
  touch events) and every button; the border's width in the print file equals the choice (read back from the device's
  print file) and lies inside the box; a custom size prints exactly (± 0.5 mm, from the file).
- **Part 3:** the flow is property-tested (each photo once, in order, no overlap, inside the edges, its size kept to
  0.1 %, a photo that does not fit moves on, pages added only when needed); e2e: Adjust from every kind of preview,
  resize by button and by dragging the handle, turn, a resize that adds a page; the device's print file has the resized
  photo at the size shown (± 0.5 mm).
- Startup JavaScript stays within its 60 KB budget (new screens load when first opened).
- Not provable here (owner, real phone): pinch on the owner's phone, the border and sizes on paper with a ruler, the shopkeeper using Adjust.

## Out of scope
Free positioning or overlapping photos (Word's "In front of text"), turning by any angle other than quarter turns,
borders for ordinary photos, coloured borders, text on the page.

## Risks
- More buttons for the shopkeeper: one Adjust button, big buttons, everything undoable or saved and reversible.
- Startup JavaScript is at its budget: the new and the Phase 14 card screens are split off and load when opened.
- A photo whose crop or turn changes keeps its long side: its short side changes (stated on screen in cm).
