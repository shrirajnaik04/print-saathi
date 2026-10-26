# Round 8: space between photos, printing a text message, scanning paper pages (Phases 41–43)

**Owner request (2026-10-26, on 1.0.274, with screenshots):**
1. "Some people come like this [a long WhatsApp text message: 'I want this print in night'], but it's a rare case. But the option should be there."
2. "Keep at least this much space between images; don't keep them too close to each other when we import images" (a page they spaced by hand).
3. "What if someone wants to scan documents? They have hard copies and want to scan them" (DocScanner screenshots).

"Keep things extremely user friendly."

**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 52–56. They answered four questions, each with the recommended option, approved the design in chat, then said: "approved, go ahead in autonomous loop mode".

## Phase 41: space between photos (row 52)
- **The gap:** photos are 10 mm apart in every direction, in All on one page, Use more pages and One on each page (the flow layout and the grid/row layouts). Today the gap is 3 mm.
- **How the measure was chosen:** the owner's screenshot has about 9 mm between rows and 21 mm side by side; they chose "about 1 cm all round".
- **Unchanged:** passport sheets (2 mm, for cutting) and ID cards (6 cm stacked, 1 cm side by side). Photos placed by hand keep their places.
- **Side effect:** photos sharing a page are a little smaller to make room. Nothing else changes.

## Phase 42: printing a text message (row 53)

**42a. Getting the text in.**
- **Share:** in WhatsApp, hold the message → Share → PrintSaathi. The share target accepts `text/plain`.
  - A share that carries files keeps only the files (a photo's caption is not printed).
- **Paste:** a new Home tile, **Text message**, opens a screen with:
  - one big text box, labelled "The customer's message";
  - a **Paste** button, which reads Android's clipboard through the app;
  - **Done**.
  - Long-press paste in the box works too.
- **Refused, with a plain message:**
  - empty text: "There is no text to print.";
  - more than 100,000 characters: "This message is too long to print here. Ask the customer to send it as a PDF."

**42b. How it prints.**
- **Into a PDF, inside the engine:** the text becomes a real PDF (vector text) in the isolated engine. Android's `PdfDocument` and `StaticLayout` are used, with the system fonts, so Marathi and Hindi (Devanagari) print correctly.
- **Page:** A4 portrait, margins 12.7 mm (Word's Narrow), black text, line spacing 1.15, left aligned. Long text flows onto more pages; blank lines are kept.
- **WhatsApp marks:**
  - `*bold*` prints bold, `_italic_` italic, `~strike~` struck through, and ` ```mono``` ` in a fixed-width font;
  - the marks themselves are not printed;
  - a mark without its partner prints as it is.
- **Text size:** Small 10 pt, **Normal 12 pt** (the default), Large 14 pt, Extra large 18 pt. It is chosen in **Change → Text size**, a row shown only for text jobs.
- **Afterwards:** the job is an ordinary document job. Ready shows the real pages (Page 1 of N), with Colour (the default) or B&W, copies, Pages to print and PRINT, plus **Edit text** for a text job. Edit text opens the same text box, filled in; Done makes the PDF again.

**42c. Storage and privacy.**
- **Files:** the text is kept in the job's own folder as `src/NNNN.txt`, next to its generated PDF, under `noBackupFilesDir/jobs/`. It is deleted with the job (retention, Delete, Delete all).
- **Never logged, never in a problem report.**
- **Native checks:** every read or write path is inside that job's folder.
- **In the job:** the item is a PDF (`type: 'pdf'`, its path the generated PDF) carrying `text: { size }`. Everything downstream (page facts, preview, untouched-PDF printing, styles) works unchanged.

## Phase 43: scanning paper pages (rows 54–56)

**43a. Taking the photo.**
- **Where to start:** a new Home tile, **Scan pages**, and **Scan with camera** on the add-files screen of a document job.
- **The camera:** these open **the phone's own camera app** (`ACTION_IMAGE_CAPTURE`). The photo is written straight into the app's private job storage (`noBackupFilesDir/jobs/…`) through the app's own non-exported content provider, which gives write access for that one file only.
- **No camera permission** is declared or asked for.
- **No camera app:** "This phone has no camera app."
- **Cancelled:** nothing changes.
- **If Android stops PrintSaathi while the camera is open** (2 GB phones), the waiting photo is imported the next time the app starts.

**43b. Finding the page.**
- **The finder:** the engine looks for the page's four corners. It reuses the ID-card finder (edges → lines → four-sided shapes → true shape recovered from the perspective) with page settings: any proportions between 1:1 and 1:2, either way up, covering 12–98 % of the photo.
- **Found:** its corners are proposed.
- **Not found:** the whole photo is proposed, with "Couldn't find the page's edges. Move the corners onto them."

**43c. "Page n" screen (one photo).**
- **The frame:** the photo with the frame drawn on it, with **corner circles** and the four side bars. Scanned pages only: photos, cards and documents keep side bars only.
- **Without dragging:** the corners and sides move with **Next point** plus Move up / down / left / right.
- **Other buttons:** **Turn left**, **Turn right**, **Whole photo** and **Retake** (a new photo for this page).
- **Done:** the page is straightened (stored as the photo's four corners; the engine straightens it when it prints). Then:
  - **Scan another page** (the camera again), or
  - **Finish (N pages)**.

**43d. "Scanned pages" screen.**
- **What it shows:** the straightened pages one at a time, as on Adjust (Page n of N with ‹ ›).
- **Tools:**
  - **Scan another page**;
  - **Fix edges** (back to Page n);
  - **Turn**;
  - **Move earlier** and **Move later**;
  - **Delete**, with Undo;
  - **Look**, applied to every page: Clean colour (the default), Original, Black & white, Sharp black, OCV black;
  - **Finish** → Ready.
- **A scan job is a document job** of photos, each fitted to A4 and portrait unless it lies sideways. Change, Pages to print and PRINT work as for any document.

**43e. Clean colour.**
- **A new print style** (engine style 6, `clean`), DocScanner's "Vivid Light". It evens out the page's shading and lights the paper to white, keeping the colours of stamps, photos and ink.
- **The method:** each channel is divided by a blurred estimate of the paper's brightness, then given a mild contrast lift.
  - **As built (ruling, 2026-10-27, `docs/qa/phase-41-43-rulings.md`):** the paper estimate uses coarser cells than OCV Black's 1/8-size background: 1/48 of the shorter side, widened by 2 cells, never under half the usual paper. OCV's background would wash stamps and photos white.
  - **The curve:** 255 × (value ÷ paper ÷ 0.9)^1.4.
- **It is a colour style**, so "every print starts in colour" still holds.
- **Where it is offered:** in Print style for every job, and as the default for scan jobs.

## Not changed
- **Photos in Adjust and other crops** keep side bars only, as before.
- **Passport and ID card flows** are unchanged; the camera is offered for documents only in this round.
- **No new dependency, no permission, no network.**
- **Start-up JavaScript stays within 61,440 B:** the new screens load on demand.

## Tests (each written to fail first)
- **Unit:**
  - the 10 mm gap in every photo layout, and passport and cards unchanged;
  - the WhatsApp mark parser (Kotlin JVM);
  - the page finder on synthetic photographed pages (Kotlin JVM): a tilted A4, a page on a patterned table, none on a blank photo;
  - the Clean colour maths, with golden pixels (Kotlin JVM);
  - the text item in the job, its normalisation and the Change row;
  - the scan job's model (pages, order, delete, style default).
- **e2e:**
  - Home's six tiles;
  - the Text message screen: Paste, Done, empty and too long;
  - Ready's Edit text and Text size;
  - Scan: the camera, Page n with corners and their buttons, Scan another page, Scanned pages tools, Finish;
  - photos 10 mm apart.
- **Device:** round8-smoke on API 35:
  - a text share (`text/plain` from the test sender) → its print file has text pages, Devanagari included;
  - a camera capture through the emulator's camera app → the page found, straightened and printed in Clean colour;
  - photos 10 mm apart in the print file.
- **Instrumentation:** the text PDF (pages and size) and the page finder inside the isolated engine.
