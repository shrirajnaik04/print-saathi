# Round 7: tool order, a blinking cursor, side bars on the edges, ID card gap, printed pages (Phases 39–40)

**Owner request (2026-10-25, on 1.0.271, with screenshots):**
- "Replace undo button with crop button, replace zoom out button with cut, replace zoom in button with copy, replace smaller button with turn."
- "Cursor must be pipe and blinking right?"
- "Why like this? Must be on edges right?" (red arrows at the top and left side bars, drawn inside the photo).
- "How to view printed file/pages?"
- "For ID card keep the distance this much by default for front and back."

**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 47–51 (each question was asked; every answer was the recommended option).

## Phase 39: Adjust

**39a. Tool order for photos (row 47).** The row starts: Cut, Copy, Crop, Turn, Undo, Redo, Paste, Zoom out, Zoom in, Smaller, Bigger. Then the rest follow in today's order: Tilt left, Tilt right, Move earlier / later, Move ×4, Bring to front, Send to back, Previous / Next photo, Remove, Automatic, Add photos. Each tool appears once. Documents, passport sheets and ID cards keep their order, because they have no Cut or Copy.

**39b. The cursor (row 48).**
- The + mark becomes Word's insertion point: a **vertical line** about 1.75 rem tall and 2 px wide, in the primary colour.
- It **blinks** about once a second. It does not blink when the phone asks for reduced motion.
- A tap on an empty spot puts the line there. The note says "Paste goes to the blinking line."
- **Paste puts the photo's top-left corner at the top of the line**, kept inside the margins as before.
- The mark still goes away when the page changes or after Paste.

**39c. Side bars on the edges (row 49).**
- Every side bar of the chosen photo is drawn on that side's edge.
- **Cause of the bug:** near the page's left or top edge, the whole 56 px touch area was moved inside the photo, so its 8 px bar showed 28 px inside.
- **Fix:** the touch area may stay inside, but the bar is drawn on the edge. The round corner handle keeps its place.

## Phase 40: ID cards and printed jobs

**40a. Gap between front and back (row 50).**
- **Top and bottom** (the default arrangement): front at the top as now, the back 60 mm below the front's bottom edge (was 10 mm). This applies to Real card size, Big size and Own size; Big and Own size shrink to fit as before if needed.
- **Unchanged:** Side by side (10 mm between) and Many copies (sets).
- Cards placed by hand are unchanged.

**40b. Printed jobs open on their pages (row 51).**
- In Recent jobs, tapping a **printed** job opens Ready: the pages exactly as printed (Page 1 of N with ‹ ›), with Change, Adjust and PRINT.
- A job not printed yet opens on "What did the customer ask?" as before.
- The Print again button stays (the same place, named for what it does).

## Start-up size
Photos, Photo tools and Result now load on demand, and are fetched in the background after start, like the other screens. This brought start-up JavaScript from 61,430 B to about 59,200 B of the 61,440 B budget.

## Tests (each written to fail first)
- **e2e:**
  - photos tool order;
  - the line, its blink (an animation), no blink under reduced motion, and Paste's top-left at the line;
  - each side bar's middle on its edge for a photo at the page's top-left;
  - a printed job tapped in Recent jobs opens Ready.
- **Unit:** the stacked cards' gap is 60 mm in real, big and own size; side by side stays 10 mm.
- **Device:** round7-smoke on API 35:
  - the card gap read from the print file;
  - Paste's top-left at the line;
  - the bars' places on screen.
