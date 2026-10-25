# Round 6: Undo / Redo and Bring to front / Send to back on Adjust (Phases 37–38)

**Owner request (2026-10-25):**
- The owner asked: "Do we require any lightweight doc library for the Adjust view, so that we are flexible to do anything we want just like Word? What do you recommend? Keep things extremely user friendly."
- I recommended:
  - no document library;
  - the Word-like gaps added to the existing Adjust;
  - Undo / Redo and Bring to front first.
- The owner answered: "Do whatever is best and recommended."

**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 45–46.

## Why no document library (row 45)

Adjust does not draw a picture of the page. It edits the job's own choices (spots, sizes, turns, crops), and one plan draws both the preview and the print file. That is why the preview and the print never differ.

A canvas editor (Fabric.js, Konva) would cost more than it gives:
- **A second copy of the page.** It keeps its own positions, which would have to be translated back into the plan after every move.
- **Photos hidden from TalkBack.** It draws on a canvas, so screen readers cannot see the photos, and they would lose the button for every gesture.
- **Weight on 2 GB phones.** It is heavy there, for features we would mostly hide.

**Later options, not built in this round:**
- Align and Distribute.
- Select several photos.
- A text box. The print engine would have to draw text, which needs its own spec.

## Phase 37: Undo / Redo for every change on Adjust

**37a. What it does.**
- Adjust's tools get **Undo** and **Redo**, right after Zoom out / Zoom in, on every kind: photos, document pages, passport sheets and ID cards.
- **Undo** takes back the last change made on Adjust:
  - a move, a drag or a drop;
  - Bigger or Smaller, a corner drag;
  - Turn, Tilt, a turn with the handle;
  - Crop, a side crop;
  - Move earlier or later;
  - Remove, Cut, Paste, Add photos;
  - Automatic;
  - a card's place, Side by side;
  - Swap sides, Fix edges;
  - a page's size or turn, Remove page;
  - passport size or framing;
  - Bring to front or Send to back.
- **Redo** puts back what Undo took back. A new change after an Undo clears Redo, as in Word.
- Each tap or drop is one step, as in Word. Up to **50 steps** are kept.
- Zoom, ‹ ›, choosing a photo and Copy are not changes, so they are not undone.
- **Keyboard:** Ctrl+Z is Undo; Ctrl+Y or Ctrl+Shift+Z is Redo.

**37b. How long it lasts.**
- The steps belong to the job, as the clipboard does (round 5). Leaving Adjust and coming back keeps them.
- They are forgotten:
  - when the job is left (Home, another job);
  - when the app closes;
  - **when the job was changed anywhere else since the last step**, for example Change → Layout, or a print. An Undo then never takes back a choice made outside Adjust.
- This last rule is checked by the job's revision: the steps are kept only while the job's revision is the one the last step left.

**37c. What a step holds.** A step holds the job's adjustable choices before the change:
- the photos and their order;
- turns, tilts, crops and frames;
- sizes and places;
- pages and documents' pages, turns and sizes;
- ID cards;
- passport framing;
- the same-photo groups.

It never holds:
- whether the job was printed, or its parts;
- colour, paper, paper type, layout, copies or style (Change's choices);
- the received notes.

Undo saves these choices back as one change through the single writer (PLAN §D2c), so a stale revision is still refused.

**37d. With round 5's own Undo buttons.** The "Photo removed — Undo" and "Page removed — Undo" panels stay; they are the quick way back. An Undo or Redo from the tools closes them, so one removal is never undone twice. If what was cut is back in the job after an Undo, Paste has nothing to put back (as review M2).

**37e. Disabled when there is nothing to undo or redo.** The button says so to screen readers (disabled), and is 56 px or more like every tool.

## Phase 38: Bring to front / Send to back

**38a. What it does.** For photos, and for ID cards placed by hand (Real card size, Big size, Own size), Adjust's tools get **Bring to front** and **Send to back**, after the Move buttons.
- **Bring to front** draws the chosen one above every photo or card it overlaps on its page.
- **Send to back** draws it below them.
- The print follows, because the plan draws placements in layer order.

**38b. When they can be tapped.**
- Only when the chosen one overlaps another on its page, because otherwise nothing would change.
- Bring to front is disabled when it is already above all it overlaps; Send to back when it is already below them.

**38c. How.**
- **Photos:** the first use fixes every photo where it is, as a drag does (spots from the plan). The chosen photo's layer then becomes one above (or below) every layer on its page.
- **ID cards:** a card not yet placed by hand is placed where it is drawn. The chosen card's layer then becomes one above (or below) the other card's.
- Either is one change, so one Undo takes it back.

**38d. Words.** "Bring to front" and "Send to back", Word's own names. Each has its icon (Phosphor `selection-foreground` / `selection-background`). Redo uses `arrow-clockwise`'s mirror, Phosphor `arrow-u-up-right`. Undo keeps `arrow-counter-clockwise`.

## Not changed
- The print engine, the PrintPlan contract and Android code: these are web-app changes only.
- Startup JavaScript: Adjust loads when first opened. The job's new actions are small; the startup budget is 61,440 B.

## Tests (each written to fail first)
- **Unit:**
  - the step store (push, undo, redo, a 50-step limit, redo cleared by a new change, forgotten on another revision);
  - the restore action (restores exactly the adjustable choices, keeps printed / colour / layout);
  - the photo and card layer actions (front, back, unchanged without places).
- **e2e at 412 × 915:**
  - Undo and Redo of a move, a Remove, a Paste, a card drag and a page turn;
  - Redo cleared by a new change;
  - the steps kept after leaving Adjust for Ready, and forgotten after Change → Layout;
  - Ctrl+Z / Ctrl+Y;
  - the Remove panel closes on Undo;
  - Bring to front / Send to back reorder overlapping photos and cards in the plan, and are disabled when nothing overlaps;
  - 56 px and accessible names.
- **Device:** a round6-smoke on API 35. A drag is undone and redone, and a photo is brought to front, both read back from the print file by pdf.js.
