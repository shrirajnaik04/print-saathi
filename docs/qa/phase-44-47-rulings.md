# Phases 44–47: every ruling made during the build, and the findings left open

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost. Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-27-round-9-office-files-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-27-phase-44-47-round-9-office.md`
- **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 57–61. Three questions were asked; every answer was the recommended option ("Both, in stages", "WPS Office", "Close is fine, preview must be honest"). The owner approved the design and asked for every stage to be built through to closure.

## Rulings

**Phase 44 (names, Print with WPS Office, text files)**
- **A .csv file prints as a text message** (its lines as typed), not as an Excel file with WPS. A CSV cannot be told from plain text without trusting the file's name. Cost: its columns are not lined up.
- **The engine keeps at most 64 MB of a file's parts in memory** (2 GB phones). Cost: a file with more than 64 MB of pictures goes to WPS.
- **XML is read with the platform's SAX parser,** so the same readers run in the PC tests and on the phone. A DOCTYPE anywhere in a part is refused (strengthened after the review, below).
- **What WPS is told.**
  - The file type comes from the engine's kind and format (unknown → application/msword).
  - The file is named "Customer file.docx" (or .xlsx …), never the customer's own name.
  - Cost: an app that trusts the type over the content might refuse an odd file.
- **"Getting the Word file ready…"** takes its kind from the first 4 KB of the file (as the existing sniffer already reads). The engine decides the real kind. Cost: a file that does not say gets "Getting the file ready…".
- **The hand-off guard** reuses the camera's guard. It opens again when PrintSaathi comes back to the front.
- **The Office card is an information panel, not a warning.** A warning panel is announced as an alert and would compete with real errors. Cost: it stands out less.
- **The duplicates panel and the auto-turn note load on demand.** This is the spec's start-up budget fallback, used early (only 18 bytes were spare). Cost: they appear a moment later the first time.
- **Two older checks described the old wording** ("can't be printed yet"). They were changed to the owner's new wording and still check that the file is named, never dropped.
- **The share sheet also offers PrintSaathi for OpenDocument (.odt/.odp/.ods), RTF and CSV files.**
  - The spec names those kinds, but the share list lacked them, so they could never arrive.
  - The release-manifest check now requires every type.
  - Cost: PrintSaathi shows in a few more share lists.
- **"Choose from phone" for documents still offers PDFs and photos only.** The spec is silent, and Office files arrive by WhatsApp. Cost: an Office file already on the phone must be shared, not picked.

**Phase 45 (Word pages)**
- **Unusual namespace names read the same:** elements are matched by their local name. Cost: none known.
- **Small additions to the planned model,** because the drawer needs them:
  - a marked box keeps its size;
  - a paragraph keeps its right indent and the height of an empty line;
  - a section keeps its header and footer distances and whether it is continuous.
- **Small choices:**
  - theme fonts read as sans (Calibri / Aptos);
  - a section with no page size is A4;
  - WordArt prints as its text and sets the note;
  - endnotes are numbered i, ii after the footnotes;
  - paragraphs of one style with "don't add space between" lose that space (lists).

  Cost: small look differences, each covered by the "check the preview" note.
- **A picture the phone cannot draw** (EMF/WMF or linked) becomes a grey "Picture" box and sets the note. More than 200 pictures go to WPS.
- **A file longer than 500 pages is not made into pages.** It stays with Print with WPS Office; it is not cut at 500. Cost: a 600-page file prints only from WPS.
- **Tables:**
  - the left border sits on the left margin (Word 2013 and later);
  - cells have 5.4 pt of space at their sides;
  - borders print 0.75 pt whatever their set thickness. Cost: thick borders print thin.

**Phase 46 (PowerPoint pages)**
- **Slide text uses Word's paragraph layout,** so slides use the same tested code. Cost: none.
- **Logos and bands on the slide master and layout** are drawn behind each slide's own shapes, unless the slide hides them.
- **Default colours:**
  - a shape's style gives its default fill, outline and text colour;
  - text boxes use the presentation's default text (18 pt black when it has none).
- **Arrows, stars and freeform shapes** print their text only, without fill or outline, and set the note. Cost: such a shape's colour is missing.
- **Table styles are not read:** tables print a thin black grid with the cells' own fills. Cost: banded table colours are missing.
- **See-through colours print solid.**
- **The paragraph and table layout and the picture drawing are shared between Word and PowerPoint.** The plan had separate slide text code. The Word tests were unchanged and stayed green.
- **Pictures on a slide are kept at 300 dpi of their printed size,** and cropped pictures stay cropped.
- **Slide text longer than its shape runs past it,** as PowerPoint shows it. Cost: it can overlap other shapes.
- **A deck whose slides are all hidden** stays with WPS rather than printing a blank page.
- **Slides print on upright paper turned a quarter,** with the "Sideways page" badge, as every sideways page already does (owner: portrait for all).

**Phase 47 (Excel pages)**
- **Dates:** format 14 prints dd/mm/yyyy (India), in English month names. 1904-calendar files are read correctly since the review fix.
- **Sizes:** a column is its width in characters × 5.25 pt (48 pt by default); a row is 15 pt by default. Cost: small width differences.
- **Very large sheets go to WPS:** more than 100,000 rows, 1,000 columns or 2,000,000 filled cells.
- **What is and is not printed:**
  - a sheet with a chart or picture, or a chart sheet, sets the note;
  - cell colours, fonts other than bold, and cell borders are not read (light grid lines instead).

  Cost: coloured cells print white.
- **When a table prints sideways.**
  - The spec says sideways "when the table is wider than tall". Read literally, a 3-column fees list printed turned, in a corner.
  - Built: sideways only when the table is wider than tall **and** too wide for an upright page at full size.
  - Cost: a wide but small table prints upright.
- **Cell text is one line, cut at the cell's edge.** Left-aligned text runs on into empty cells beside it, as Excel shows it. Grid lines are light grey; text is 10 pt sans for Excel's Calibri 11. Anything cut sets the note (review fix).

## The whole-round review and its fixes

A fresh reviewer read every change (3 Critical, 3 Important, 6 Minor). The owner's rule is "preview must be honest", so anything that silently printed something different was treated as at least Important. Every fix has a test that failed first (`docs/evidence/phase-44-47/2026-10-27/review-fixes/`).

| Finding | Fix | Test (RED → GREEN) |
|---|---|---|
| **C1** An RTF file printed as a text message full of RTF code | RTF files are Word files (Print with WPS Office) | SnifferTest `rtfIsAWordFileNotText` |
| **C2** Excel number formats with literal text, conditions or leading zeros printed garbage (Indian lakh formats, account numbers, `0007`) | New number formatter: literal text in place, `[>=…]` sections, zero padding | `literalsAndConditionsInsideNumberFormats` |
| **C3** A number wider than its column printed with its first digits cut off (a different number) | General shortens decimals; otherwise `####` and the note | `numbersTooWideForTheirCell`; device `aNumberTooWideForItsCellShowsHashesAndSaysSo` |
| **I1** A DOCTYPE hidden after a comment or a long prolog got past; no limit on expanded text | A DOCTYPE anywhere is refused; text limited to twice the part's size | SafeReadersTest (3) |
| **I2** PowerPoint tables with merged cells were laid out wrongly | Cells covered by a wider or taller cell keep the grid | `mergedTableCellsKeepTheGrid` |
| **I3** Any engine failure lost the file's kind and told WPS ".doc"; broken numbers could crash the drawer | The kind the file's start suggests is kept; any failure keeps the kind; NaN sizes are 0; spans capped | OfficeIntakeTest, `aBrokenNumberIsZeroNotNaN`, `aHugeGridBeforeIsCapped`; device `aSlideWithBrokenNumbersStillPrintsAsPowerPoint` |
| **I3 (measured)** A Word file of 20 phone photos made a 104 MB print file in 15 s | Pictures finish at exactly 300 dpi of their printed size | device `aWordFileWithTwentyPhonePhotosIsMadeInTime`: 46 MB, 7.9 s on API 35 |
| Ruling overturned: 1904-calendar dates 4 years off | Read the workbook's calendar | `dates1904` |
| Minor 2 re-graded: a formula with no saved result printed blank silently | Sets the note | `aFormulaWithNoSavedResultSetsMissed` |
| Minor 4 re-graded: a "different first page" letterhead was not printed on page 1 | First-page headers and footers; symbol-font marks set the note | `aDifferentFirstPageHeaderIsKept`, `symbolFontMarksSetMissed` |
| Minor 5 re-graded: a slide placeholder with no place dropped its text silently | Sets the note | `aPlaceholderWithNoPlaceSetsMissed` |

**Decided by me after the reviewer declined to judge (please confirm):**
- **Old Hindi fonts** (Kruti Dev, DevLys, Chanakya, Shivaji, APS-DV, Shree-Dev, Akruti, Kundli).
  - These type Hindi with Latin letters; without the font, our pages would show gibberish.
  - Such Word and PowerPoint files are therefore not made into pages. They stay with **Print with WPS Office**.
  - Test: `oldHindiFontsAreNotMadeIntoPages` (Word and PowerPoint).
  - Cost: WPS also needs the font installed on the phone.
- **Word's newspaper columns, and pictures or text boxes with text wrapped round them,** print in one column after their paragraph. All the content is there; the "may look a little different" note covers it.
- **Excel repeats only the first row on every page,** as the spec says. The file's own "rows to repeat" setting is not read.
- **A Word header taller than the page** sends the file to WPS (rare).

## Deferred minors (open, with reasons)
- **Large old .doc/.xls files may be named "Office file"** instead of Word/Excel: the engine looks for their parts' names in the first 256 KB only. They still offer Print with WPS Office.
- **Split-screen or floating windows.** If WPS opens there, PrintSaathi never comes back to the front, so **Print with WPS Office** does nothing for up to 10 minutes.
- **Office files are made into pages while the share is still being copied.** In a mixed share, files after an Office file wait (up to 60 s each), and Cancel cannot stop that conversion.
- **Equations print as their plain text,** as the spec says.
