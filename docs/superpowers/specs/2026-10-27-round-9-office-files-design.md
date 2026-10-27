# Round 9: Word, PowerPoint and Excel files (Phases 44–47) — design

**Owner's words (2026-10-27, with screenshots of a `.docx` shared from WhatsApp to PrintSaathi):** "When doc file is shared through whats app to the printsaathi app we get this error, also what about .pptx files. Check those too, also check other formats if needed. Priority must be pdf, word, pptx, and low priority: excel files."

**Owner's answers:** both ways, in stages · the shop phone has **WPS Office** · "close is fine, the preview must be honest". **Design approved** ("approved") after worked examples in chat. Rows 57–61 in `docs/decisions/owner-decisions-2026-10-24.md`.

## Why the error happens today
- V1 deliberately refused Office files (PLAN §N, "Office rendering in V1 — not built"). Word, Excel and PowerPoint files are recognised (`SniffedType.OFFICE`) and shown as "Office file: can't be printed yet. Ask for a PDF."
- Android has no built-in Office-to-PDF converter, and the app has no server by design.
- Two more gaps found:
  - a shared `.txt` file is refused, although round 8 can print text;
  - the received screen titles non-photo files "The photos".
- **PDF**, the owner's first priority, already prints fully. It is unchanged.

## What is built: four stages, each closed with its own APK
The next stage starts when the owner says so (or says to continue through all of them).

### Phase 44: no more dead ends
1. **What kind of file.**
   - The engine names each Office file:
     - **Word file**: `.docx`, `.doc`, `.odt`, `.rtf`;
     - **PowerPoint file**: `.pptx`, `.ppt`, `.odp`;
     - **Excel file**: `.xlsx`, `.xls`, `.ods`, `.csv`;
     - **Office file** when it cannot tell.
   - The engine decides by looking inside the file: the zip's entry names, the old binary format's stream names, or the OpenDocument `mimetype`. It never trusts the file's name.
2. **Print with WPS Office.**
   - The file's card (on Received, and on Ready for a job holding one) shows: "This Word file prints from WPS Office." with a big button **Print with WPS Office**.
   - The button opens that one file in WPS Office (package `cn.wps.moffice_eng`, or another WPS edition found on the phone), read-only, through a new non-exported provider that serves only that file to the app it is granted to.
   - Without WPS, Android offers any app that opens the file. With no such app: "Install WPS Office from the Play Store to print this file."
   - WPS prints with Android's print screen, to the same printer.
3. **Privacy trade-off (owner-accepted, row 59):**
   - Through this button the customer's file is handed to WPS, which may list it among its recent files.
   - PrintSaathi still never writes it to shared storage.
   - Pages that PrintSaathi makes itself (Phases 45–47) keep the file private.
4. **Text files.**
   - A shared `.txt` file prints like a WhatsApp text message: Ready "Text message · N pages", Edit text, Text size.
   - Accepted: UTF-8, with or without a BOM, and UTF-16 with a BOM.
   - Anything else: "This text file can't be read. Ask the customer to send it as a PDF."
5. **Wording.**
   - Received's list is titled **"The files"** when it holds anything other than photos.
   - Summaries say "Word file", "PowerPoint file", "Excel file".

### Phase 45: PrintSaathi makes Word pages (`.docx`)
- **What it is.**
  - A converter inside the isolated engine: `int[] officeToPdf(src fd, dst fd, maxPages)` returns the kind code and the page count, or an error code.
  - Built from what Android already has: `java.util.zip`, `XmlPullParser`, `PdfDocument`, `StaticLayout`.
  - No new library and no network.
- **When it runs:** while the file is received. The Receiving screen shows "Getting the Word file ready…".
  - **Success:** the job's item becomes a PDF item `{type:'pdf', office:{kind:'word'}}`. The customer's file is kept beside it as `src/NNNN.office`, and Print with WPS Office uses that original.
  - **Failure** (too complex, damaged, an old `.doc`, a limit reached): the item stays as Phase 44 left it, with the button.
- **Ready:**
  - "Word file · N pages · A4 · Colour · 1 copy";
  - the note "Made from a Word file. Check the preview — it may look a little different from Word.";
  - **Print with WPS Office** beside Change.
  - Everything else works as for any PDF: preview, Colour/B&W, copies, Pages to print, Adjust, Print style.
- **Drawn:**
  - page size, margins, orientation, and sections;
  - paragraphs: alignment, spacing, indents, keep-with-next ignored;
  - runs: bold, italic, underline, strike, size, colour, highlight;
  - fonts mapped to serif, sans-serif or monospace (Devanagari through the phone's fonts);
  - styles (docDefaults, `basedOn` chains, Heading 1–6, Title);
  - bullet and numbered lists (numbering.xml levels: bullet, decimal, letters, roman);
  - tables (grid widths, single borders, cell shading, `gridSpan`, `vMerge`, rows split across pages);
  - inline pictures (PNG and JPEG at their size);
  - floating pictures and text boxes, placed where their paragraph is (approximate);
  - page and section breaks;
  - default header and footer text, with page number fields;
  - the cached text of other fields;
  - tracked changes shown as accepted.
- **Not drawn:**
  - charts, SmartArt and WordArt: a light grey box marked "Chart" or "Diagram";
  - footnotes and endnotes: their text at the end;
  - equations: their plain text;
  - comments.

### Phase 46: PowerPoint (`.pptx`)
- One slide per page, on A4 sideways. The slide is scaled to fit inside 6 mm edges and keeps its shape.
- **Drawn:**
  - text shapes at their `xfrm` place; places not set inherit from the slide layout and master placeholder (`type`, `idx`);
  - text: insets, anchor, autofit font scale, levels with the master's text styles, bullets;
  - pictures;
  - solid fills;
  - backgrounds: slide → layout → master;
  - theme colours (`schemeClr`), straight lines and connectors, group transforms;
  - simple tables (`a:tbl`).
- **Not drawn:**
  - gradients: their first colour;
  - charts and SmartArt: a light grey box;
  - animations and notes.
- Ready's note adds "Some parts (charts, diagrams) print only from WPS Office." when any were met.

### Phase 47 (low priority): Excel (`.xlsx`)
- **Each visible sheet** becomes table pages:
  - shared strings and cached values (no formulas are calculated);
  - number formats: general, fixed decimals, percent, dates;
  - bold, alignment and column widths;
  - merged cells;
  - grid lines;
  - the print area when set.
- **Layout:**
  - empty rows and columns at the end are trimmed;
  - each sheet starts a new page;
  - it is fitted to the page width down to 50 %, then columns continue on following pages;
  - the first row repeats on each page;
  - A4 sideways when the table is wider than tall.
- **Charts:** not drawn.

## Safety (customer files are hostile; parsed only in the isolated engine)
- **Zip:** ≤ 2,000 entries; ≤ 200 MB unpacked in total; any entry over 1 MB packed at more than 100 : 1 is refused; entry names never touch the file system (read from the stream only).
- **XML:**
  - `XmlPullParser` with no DOCTYPE or entity processing, and DOCTYPE refused;
  - ≤ 20 MB per XML part;
  - ≤ 100 levels of nesting.
- **Pictures:** decoded down to their size at 300 dpi, ≤ 24 MP each; ≤ 200 pictures per file.
- **Limits:**
  - ≤ 500 pages;
  - the engine's existing watchdog time for one call;
  - a failure, or the engine dying, marks only that file (the existing damaged-file marks).
- **Logs:** never a file name, path or text.

## Start-up budget (61,162 of 61,440 B)
- The Office card and its words load with their screens:
  - `src/screens/office/*`;
  - `src/i18n/office.ts`, checked by the jargon and wording tests.
- Only the three summary names enter start-up code.
- If the budget is still exceeded, move rarely used parts of Received (the duplicates panel, the auto-turn note) to on-demand loading first.

## Tests (each written to fail first)
- **Unit (TS):**
  - the kind names;
  - the Office card and the button;
  - summaries;
  - the job model for office items;
  - `.txt` routing.
- **JVM:**
  - the kind detector on generated zips, OLE and ODF files;
  - zip and XML limits (zip bomb, DOCTYPE, deep nesting);
  - the DOCX model: styles inheritance, numbering, tables, sections;
  - the PPTX placeholder inheritance and theme colours;
  - the XLSX value formatting and page splitting;
  - text-file decoding.
- **Device (engine):** generated files rendered to a PDF, read back with PdfRenderer:
  - the page count;
  - headings bigger than body text;
  - table borders where the grid puts them;
  - a picture's place;
  - Devanagari ink;
  - a slide's text box and picture at their place;
  - a sheet split across pages with the header repeated.
- **e2e:** Office cards, Print with WPS, Ready's note, the `.txt` flow, 320 px.
- **Device smoke (`round9-smoke.mjs`), with test-sender modes `docx`, `pptx`, `xlsx`, `doc`, `txt`:**
  - a shared `.docx` → Ready "Word file · N pages" → the print file;
  - a `.pptx` → one page per slide;
  - a `.doc` → Print with WPS (handed to the installed viewer, or the "install" message);
  - a `.txt` → Text message.
- **Fidelity:** if the owner sends 10–20 non-customer Word and PowerPoint files, each is printed from PrintSaathi and from WPS and compared page by page. Otherwise synthetic files only.

## Not changed
- PDFs, photos, passport, ID cards, text messages and scanning.
- No server, no new dependency, no INTERNET permission. The only new component is the read-only provider for Print with WPS.
