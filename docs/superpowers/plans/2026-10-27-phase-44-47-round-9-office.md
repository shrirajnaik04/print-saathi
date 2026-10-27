# Round 9 (Phases 44–47): Word, PowerPoint and Excel files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Office files shared to PrintSaathi never dead-end: Phase 44 adds their kind, Print with WPS Office and `.txt` files; Phases 45–47 add pages made in the isolated engine from `.docx`, `.pptx` and `.xlsx`.

**Architecture:**
- **The engine (isolated process)** gains an `office` package:
  - safe zip and XML readers;
  - a kind detector;
  - per-format models (pure Kotlin, JVM-tested);
  - drawers that write a PDF with `PdfDocument` / `StaticLayout` (device-tested).
- **The importer** converts each Office file at intake; the original is kept as `NNNN.office` beside `NNNN.pdf`.
- **The web app** shows a lazily loaded Office card with **Print with WPS Office**, which opens the original through a read-only provider.

**Tech Stack:**
- Kotlin, using only Android's own APIs: java.util.zip, javax.xml.parsers SAX, PdfDocument, StaticLayout.
- Preact/TypeScript.
- Tests: Vitest, Playwright, JUnit (JVM and device).

**Spec:** `docs/superpowers/specs/2026-10-27-round-9-office-files-design.md`

## Global Constraints
- **Parsing:** customer files are parsed only inside the isolated engine. The app process copies bytes and names nothing from file names or MIME types.
- **No new dependency**, no server, no INTERNET permission.
- **The only new component** is the non-exported, read-only `OfficeShareProvider`.
- **Logs:** never a file name, path or text.
- **Start-up JS:** ≤ 61,440 B gzip (now 61,162).
  - Office screens and words load on demand: `src/screens/office/*`, `src/i18n/office.ts`.
  - If the budget is exceeded, move Received's Duplicates panel and AutoTurnNote to on-demand loading first.
- **Engine limits:**
  - zip: ≤ 2,000 entries; ≤ 200 MB unpacked; an entry over 1 MB packed at more than 100 : 1 is refused;
  - XML: ≤ 20 MB per part, ≤ 100 levels; a DOCTYPE is refused;
  - pictures: ≤ 24 MP each, ≤ 200 per file;
  - ≤ 500 pages;
  - the existing watchdog (`PDF_LIMIT_MS`).
- **Kinds and their file types:**
  - **Word file:** docx, doc, odt, rtf;
  - **PowerPoint file:** pptx, ppt, odp;
  - **Excel file:** xlsx, xls, ods, csv;
  - otherwise **Office file**.
  - Pages are made only from docx, pptx and xlsx.
- **Words, exact:**
  - "This Word file prints from WPS Office." (PowerPoint / Excel / Office likewise);
  - "Print with WPS Office";
  - "Install WPS Office from the Play Store to print this file.";
  - "Made from a Word file. Check the preview — it may look a little different from Word." (PowerPoint / Excel likewise);
  - "Some parts (charts, diagrams) print only from WPS Office.";
  - "This text file can't be read. Ask the customer to send it as a PDF.";
  - "Getting the Word file ready…";
  - summary names "Word file", "PowerPoint file", "Excel file" ("2 Word files" …);
  - the heading "The files".
- **WPS packages, in order:** `cn.wps.moffice_eng`, `cn.wps.moffice_eng.xiaomi.lite`, `com.kingsoft.moffice_pro`.
- **Devices:**
  - test emulators only: 5580, 5560, 5566;
  - never emulator-5554 or any network device;
  - commits authored as the repo's git user, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Per stage:** each stage ends with verify, e2e, JVM, its device smoke part, and a release APK in `apk/`. The whole-round review and the three-level regression come at the end (Task 11).

## Review Focus
1. **Real Word files with features outside the model** (text boxes, columns, huge pictures, odd fonts, empty documents): pages or the WPS fallback, never a crash or an empty page. Task 6: `aDocWithEveryUnsupportedPartStillPrintsItsText`, `anEmptyDocumentGivesOneBlankPageNotAFailure`.
2. **Hostile Office files** (zip bomb, DOCTYPE / entities, 1,000-deep nesting, 10,000 paragraphs, truncated zip): refused within the limits, the item stays an Office file, and the app never crashes. Task 1: SafeZipTest and SafeXmlTest; Task 6: `aHostileDocxIsRefusedNotCrashed` (device).
3. **Old binary, OpenDocument and password-protected files** (an encrypted OOXML is an OLE file holding `EncryptedPackage`): named as well as possible, with Print with WPS offered. Task 1: `anEncryptedDocxIsAnOfficeFileNotWord`.
4. **No WPS and no viewer, or a tap twice on Print with WPS:** a clear message, no stuck button, one hand-off. Task 3: e2e `noOfficeAppSaysInstallWps`, `doubleTapOpensOnce`.
5. **Office items in mixed shares and in Add to this job:** the kinds and originals stay with their items, and Pages to print works. Task 2: `OfficeIntakeTest.anOriginalKeepsItsNumberBesideItsPages`; Task 3: e2e `aMixedShareShowsTheWordCardAndPrintsThePdf`.

---

### Task 1: Engine — safe readers, kind detection, text files (Phase 44)
**Files:**
- Create in `android/app/src/main/java/in/printsaathi/app/engine/office/`:
  - `SafeZip.kt`, `SafeXml.kt`, `OfficeKind.kt`, `TextFile.kt`, `OfficePdf.kt`.
- Modify:
  - `IEngine.aidl`: append `int[] officeToPdf(in ParcelFileDescriptor src, in ParcelFileDescriptor dst, int maxPages); int[] textFileToPdf(in ParcelFileDescriptor src, in ParcelFileDescriptor txt, in ParcelFileDescriptor dst, int sizeTenthsPt);`
  - `EngineService.kt`, `EngineClient.kt`;
  - `android/app/build.gradle`: add `src/sharedTest/java` to the `test` and `androidTest` source sets.
- Test files:
  - in `android/app/src/test/java/in/printsaathi/app/engine/office/`: `SafeZipTest.kt`, `SafeXmlTest.kt`, `OfficeKindTest.kt`, `TextFileTest.kt`;
  - shared: `android/app/src/sharedTest/java/in/printsaathi/app/engine/office/OfficeFixtures.kt` (builds docx, pptx and xlsx zips from given XML strings, OLE heads, ODF zips).

**Interfaces (produced):**
- `class SafeZip.Limits(entries = 2000, totalBytes = 200L shl 20, ratio = 100, ratioAboveBytes = 1L shl 20)`;
- `fun SafeZip.read(input: InputStream, wanted: (String) -> Boolean, limits): Map<String, ByteArray>`. It throws `OfficeRefused(reason)` past a limit.
- `class XNode(name: String /* local name, prefix kept as "w:p" */, attrs: Map<String,String>, children: List<XNode>, text: String)`;
- `fun SafeXml.parse(bytes: ByteArray, maxDepth = 100, maxNodes = 500_000): XNode`. It refuses a DOCTYPE found before the first element, and uses SAX with external entities off.
- `enum class OfficeKind(val code: Int) { OFFICE(0), WORD(1), POWERPOINT(2), EXCEL(3) }` and `enum class OfficeFormat(code) { UNKNOWN(0), OOXML(1), OLE(2), ODF(3), RTF(4), CSV(5) }`;
- `fun OfficeKind.detect(file: java.io.File): Pair<OfficeKind, OfficeFormat>`. OOXML is decided by its zip entry names (`word/`, `ppt/`, `xl/`), OLE by its directory stream names (`WordDocument`, `PowerPoint Document`, `Workbook`/`Book`; `EncryptedPackage` → OFFICE), ODF by its `mimetype` entry, RTF by `{\rtf`.
- `object TextFile { fun decode(bytes: ByteArray): String? }`: UTF-8 with or without a BOM, or UTF-16 LE/BE with a BOM. It returns null for invalid sequences, NUL, or other control characters except `\t\n\r\f`, for more than 100,000 characters, and for blank text.
- `object OfficePdf { fun write(src: PFD, dst: PFD, maxPages: Int): IntArray }` returns `{kind, format, pages, missed}`, or `{kind, format, -code}` with code 7 = not supported, 8 = refused, 9 = too many pages. In Phase 44 every kind returns not supported.
- `EngineClient.officeToPdf(src: File, pdf: File, maxPages = 500): Result<OfficeResult>` with `data class OfficeResult(kind, format, pages, missed: Boolean)` (`pages = 0` when not made); `EngineClient.textFileToPdf(src, txt, pdf, sizeTenthsPt = 120): Result<Int>`.

- [ ] **RED (JVM):**
  - SafeZipTest:
    - `readsOnlyWantedEntries`;
    - `refusesMoreThan2000Entries`;
    - `refusesTotalOver200MB` (use a lowered limit in the test);
    - `refusesAHighlyCompressedBigEntry` (2 MB of zeros);
    - `aTruncatedZipIsRefusedNotThrownRaw`.
  - SafeXmlTest:
    - `parsesNamesAttributesAndText`;
    - `refusesADoctype`;
    - `refusesNestingDeeperThanTheLimit`;
    - `refusesTooManyNodes`.
  - OfficeKindTest, one test per format plus `anEncryptedDocxIsAnOfficeFileNotWord` and `aPlainZipIsNotOffice`.
  - TextFileTest:
    - `utf8WithAndWithoutBom`;
    - `utf16WithBom`;
    - `binaryIsRefused` (a PNG head);
    - `nulOrControlCharsAreRefused`;
    - `blankOrTooLongIsRefused`.
- [ ] **GREEN.** `node scripts/android-env.mjs :app:testDebugUnitTest --tests "in.printsaathi.app.engine.office.*"` → all pass.
- [ ] **Wire it:** the AIDL calls and `OfficePdf.write` (detect, then not supported), and `textFileToPdf` (`TextFile.decode` → write the decoded text as UTF-8 to `txt`, then `TextPdf.render`). Compile, then commit.

### Task 2: App process — intake conversion, text files, Print with WPS (Phase 44)
**Files:**
- Create in `engine/intake/`: `OfficeIntake.kt`, `OfficeShares.kt`, `OfficeShareProvider.kt`.
- Modify:
  - `Importer.kt`: `import(...)` gains `convert: Converters? = null`;
  - `PrintEnginePlugin.kt`: passes the converters; adds `openInOffice({jobId, index})`; `.txt` handling;
  - `AndroidManifest.xml`: the provider, plus `<queries>` for the three WPS packages and `ACTION_VIEW` of the Office MIME types.
- Tests: `OfficeIntakeTest.kt`, `OfficeSharesTest.kt`.

**Interfaces:**
- `class Converters(val office: (src: File, pdf: File) -> Result<OfficeResult>, val text: (src: File, txt: File, pdf: File) -> Result<Int>)`;
- `object OfficeIntake { fun place(src: File /* NNNN.<ext> as copied */, n: Int, sniffed: SniffedType, conv: Converters): Imported? }`. It returns null when the file is not Office or text.
  - **Office:** rename to `NNNN.office` and run the engine.
    - Pages made → `Imported(path NNNN.pdf, PDF, …)` with `office = {kind, missed}`.
    - Otherwise → `Imported(path NNNN.office, OFFICE)` with `office = {kind}`.
    - An engine failure → OFFICE with kind OFFICE.
  - **OTHER:** try text.
    - Made → `NNNN.txt` + `NNNN.pdf`, an entry with `text:{size:12}`, `sniffedType pdf`.
    - Otherwise unchanged.
  - The intake JSON file entry gains `"office": {"kind": "word"|"powerpoint"|"excel"|"office", "missed": bool?}`.
- `class OfficeShares(inbox: File, jobsRoot: File) { fun grant(jobId: String, index: Int): String /* token */; fun fileFor(path: String?, mode: String): File? }`:
  - only `/o/<token>`, only modes without `w`;
  - the file is `jobs/<id>/src/%04d.office`;
  - at most 20 tokens kept; the oldest go first.
- While a file is being made into pages, `Importer.import`'s progress reports it: the plugin's `intakeProgress` event gains `making: "word"|"powerpoint"|"excel"`, and Receiving shows "Getting the Word file ready…" (Task 3 adds the screen side, with the e2e test `receivingSaysGettingTheWordFileReady`).
- Plugin `openInOffice({jobId, index})` resolves to:
  - `{opened: true}`;
  - `{opened: false, noApp: true}`;
  - or `{opened: false, busy: true}` while one is opening (a `CameraGate`-style gate, closed in `handleOnResume`).
  - It uses the first installed WPS package, else a chooser; the MIME type comes from the engine kind and format (docx and the others: the standard OOXML types; OLE: application/msword, vnd.ms-powerpoint, vnd.ms-excel; ODF; rtf; csv).

- [ ] **RED (JVM), OfficeIntakeTest:**
  - `aConvertedWordFileBecomesPagesWithItsOriginalKept`;
  - `aFileThatCannotBeMadeStaysAnOfficeFileNamedByKind`;
  - `anEngineFailureLeavesAnOfficeFileNotAHole`;
  - `aTextFileBecomesATextMessage`;
  - `aBinaryOtherFileStaysOther`;
  - `anOriginalKeepsItsNumberBesideItsPages` (then `JobMerge` keeps them together).
- [ ] **RED (JVM), OfficeSharesTest:**
  - `onlyTheGrantedFileOpensReadOnly`;
  - `writeModesAreRefused`;
  - `unknownOrTraversalTokensAreRefused`;
  - `atMost20Grants`.
- [ ] **GREEN**, wire the plugin and manifest, run `check-manifest` on a debug build (provider not exported), then commit.

### Task 3: Web — Office card, Print with WPS, `.txt`, wording (Phase 44)
**Files:**
- Create:
  - `src/screens/office/OfficeFiles.tsx`: `export function OfficeFiles({ job }: { job: Job })`;
  - `src/i18n/office.ts`: `officeWords`;
  - `src/ui/lazyPart.ts`: `lazyPart<P>(load: () => Promise<(p: P) => JSX.Element>): (p: P) => JSX.Element | null`, which renders nothing until loaded;
  - `src/core/job/office.test.ts`;
  - `tests/e2e/office.spec.ts`.
- Modify:
  - `printEngine.ts`: `IntakeFile.office?`; `openInOffice(o: {jobId: string; index: number}): Promise<{opened: boolean; noApp?: boolean; busy?: boolean}>`;
  - the mock: `?mockOfficeAt=<i>&mockOfficeKind=word|powerpoint|excel|office&mockOfficeMade=1&mockNoOfficeApp=1`, and `__officeOpened` counts;
  - `job.ts`: `JobItem.office?: {kind: OfficeKind; missed?: true}`; normalizeJob keeps only the four kinds; jobFromIntake copies it;
  - `unprintable.ts`: office items are no longer in `unprintableNotes`; `unprintableText('office', kind)` returns the kind name ("Word file");
  - `summary.ts`: `documentLine` counts made Office items by kind before PDFs;
  - `Received.tsx`: `OfficeFiles` (lazyPart) replaces "Nothing here can be printed yet" when every item is an Office file; above the grid otherwise; heading "The files" when any item is not a photo;
  - `Ready.tsx`: `OfficeFiles` under the summary for any Office item;
  - `en.ts`: only the summary names and "The files".
- [ ] **RED (unit), office.test:**
  - `jobFromIntakeKeepsTheOfficeKind`;
  - `aKindNeverOfferedIsDropped`;
  - `unprintableNotesNoLongerNameOfficeFiles`;
  - `documentLineSaysWordFile` ("Word file · 3 pages · A4 · Colour · 1 copy");
  - `aStrayOfficeKindReadsAsOfficeFile`.
- [ ] **RED (e2e), office.spec:**
  - `aSharedWordFileShowsItsCardAndThePrintWithWpsButton`;
  - `printWithWpsHandsTheFileOver` (`__officeOpened` 1);
  - `doubleTapOpensOnce`;
  - `noOfficeAppSaysInstallWps`;
  - `aMadeWordFileOpensOnReadyWithTheHonestNote`;
  - `missedPartsAreSaid`;
  - `aMixedShareShowsTheWordCardAndPrintsThePdf`;
  - `theListIsTitledTheFilesWhenNotAllPhotos`;
  - `aTxtFileIsATextMessage` (mock intake with `text` on a pdf item);
  - `receivingSaysGettingTheWordFileReady` (a mock progress event with `making`);
  - `theCardFits320px`.
- [ ] **GREEN.** Run `npm run verify`, `npm run test:e2e`, `npm run build && npm run size` (≤ 61,440; else apply the Global Constraints fallback). Commit.

### Task 4: Phase 44 device proof and APK
**Files:**
- Create `android/sharesender/src/main/java/in/printsaathi/sharesender/OfficeSamples.kt` (a docx, pptx and xlsx with Devanagari, a table and a picture; a `.doc` OLE head; a `.txt`), and `scripts/device/round9-smoke.mjs`.
- Modify the sender: modes `docx`, `pptx`, `xlsx`, `doc`, `txt`; `sharesender/build.gradle` adds `../app/src/sharedTest/java` to its main source set.
- [ ] **The smoke** (API 35; the emulator has no WPS):
  - a docx share → the Word card;
  - Print with WPS → "Install WPS Office…" or a viewer opens;
  - a txt share → Ready "Text message · 1 page" → its print file;
  - a doc share → the Word card.
  - It writes `round9-smoke.json`.
- [ ] Release `1.0.N` into `apk/`, with its sha256 in the ledger. Commit the evidence under `docs/evidence/phase-44-47/2026-10-27/`.

### Task 5: DOCX model (Phase 45)
**Files:**
- Create in `engine/office/docx/`: `DocxModel.kt` (data) and `DocxReader.kt`.
- Test: `test/.../office/docx/DocxReaderTest.kt`.

**Interfaces:**
- `fun DocxReader.read(parts: Map<String, ByteArray>): DocxDoc`;
- `DocxDoc(sections: List<DSection>, media: Map<String, ByteArray>, missed: Boolean)`;
- `DSection(pageW: Float, pageH: Float, margins: Insets4, header: List<DBlock>, footer: List<DBlock>, blocks: List<DBlock>)`, all in points;
- `sealed DBlock`:
  - `DPara(align: Align, spaceBefore: Float, spaceAfter: Float, lineMul: Float, indentLeft: Float, indentFirst: Float, label: String?, runs: List<DRun>, pageBreakBefore: Boolean)`;
  - `DTable(colWidths: List<Float>, rows: List<DRow>)`, where `DRow(cells)` and `DCell(span: Int, vMerge: Continue|Restart|None, fill: Int?, borders: Borders, blocks: List<DBlock>)`;
  - `DBreak`.
- `sealed DRun`:
  - `DText(text, bold, italic, underline, strike, sizePt, color, highlight, family: Serif|Sans|Mono, superSub)`;
  - `DImage(mediaKey, wPt, hPt)`;
  - `DPlaceholder(label: "Chart"|"Diagram")`;
  - `DField(kind: Page)`.

- [ ] **RED (JVM), with fixtures built from XML strings:**
  - `stylesInheritBasedOnAndDocDefaults` (Heading1 24 pt bold over a 11 pt default);
  - `directRunPropsWinOverStyles`;
  - `numberedAndBulletedLists` ("1.", "2.", "a.", "•", restart per numId);
  - `tableGridSpanAndVMerge`;
  - `sectionsCarryPageSizeMarginsAndOrientation` (twips → pt; landscape swaps w/h);
  - `pageBreakAndPageBreakBefore`;
  - `inlineAndAnchoredPicturesBecomeImages` (EMU → pt);
  - `chartsAndSmartArtBecomePlaceholdersAndSetMissed`;
  - `trackedInsertionsKeptDeletionsDropped`;
  - `fieldsShowTheirCachedTextAndPageFieldsStayLive`;
  - `headersAndFootersDefaultOnly`;
  - `footnotesAreAppendedAtTheEnd`;
  - `textBoxContentFollowsItsParagraph`.
- [ ] **GREEN.** The JVM tests pass. Commit.

### Task 6: DOCX drawing → PDF; Phase 45 proof and APK
**Files:**
- Create `engine/office/docx/DocxPdf.kt`: `fun draw(doc: DocxDoc, out: OutputStream, maxPages: Int): Int` (pages).
  - It uses PdfDocument pages at the section size, StaticLayout for paragraphs (spans for run styles), and a simple table layout (column widths, cell padding 5.4 pt, rows split at a page end).
  - Pictures are decoded with inSampleSize down to their box at 300 dpi.
  - Headers and footers are drawn on every page, with the page field replaced.
- Modify `OfficePdf` (WORD + OOXML → read → draw).
- Test: `androidTest/.../engine/OfficePdfDeviceTest.kt`.
- [ ] **RED (device), on fixture docx files built with the shared OfficeFixtures:**
  - `aOnePageLetterIsOneA4Page`;
  - `aHeadingIsTallerThanBodyText` (ink row height);
  - `tableBordersAreWhereTheGridPutsThem` (±3 px at 2 px/pt);
  - `aPictureLandsAtItsParagraph`;
  - `devanagariHasInk`;
  - `aLongDocumentFlowsOverPagesAndStopsAt500`;
  - `aDocWithEveryUnsupportedPartStillPrintsItsText` (missed = 1);
  - `anEmptyDocumentGivesOneBlankPageNotAFailure`;
  - `aHostileDocxIsRefusedNotCrashed` (a zip bomb and a DOCTYPE give code 8);
  - `aLandscapeSectionGivesALandscapePage`.
- [ ] **GREEN** on API 35. Then: the smoke part `docxBecomesPages` (a share → Ready "Word file · N pages" → the print file holds N pages, A4); verify, e2e, size; release APK. Commit.

### Task 7: PPTX model (Phase 46)
**Files:** `engine/office/pptx/PptxModel.kt`, `PptxReader.kt`; test `PptxReaderTest.kt`.

**Interfaces:**
- `fun PptxReader.read(parts): PptxDeck`;
- `PptxDeck(slideW: Float, slideH: Float, slides: List<PSlide>, media, missed)`;
- `PSlide(bg: Int?, shapes: List<PShape>)`;
- `sealed PShape(x, y, w, h, rot)`:
  - `PText(fill: Int?, line: Int?, insets, anchor: Top|Middle|Bottom, fontScale: Float, paras: List<PPara>)`;
  - `PPicture(mediaKey)`;
  - `PLine(color, widthPt)`;
  - `PTable(colWidths, rows: List<List<PPara-list>>)`;
  - `PPlaceholderBox(label)`.
- [ ] **RED (JVM):**
  - `slideSizeFromPresentation`;
  - `placeholderInheritsPlaceFromLayoutThenMaster` (by type and idx);
  - `textStylesComeFromTheMasterLevels`;
  - `schemeColoursResolveThroughTheTheme`;
  - `backgroundFallsBackSlideLayoutMaster`;
  - `groupTransformsMapChildrenIntoPlace`;
  - `normAutofitScalesFonts`;
  - `gradientsUseTheirFirstStop`;
  - `chartsAndSmartArtArePlaceholdersAndSetMissed`;
  - `slidesInPresentationOrderAndHiddenSlidesSkipped`.
- [ ] **GREEN.** Commit.

### Task 8: PPTX drawing; Phase 46 proof and APK
**Files:** `engine/office/pptx/PptxPdf.kt`: `fun draw(deck, out, maxPages): Int`. Each slide is drawn on an A4 sideways page (842 × 595 pt), scaled to fit inside 6 mm edges and centred. Modify `OfficePdf` (POWERPOINT + OOXML). Device tests are added to `OfficePdfDeviceTest`.
- [ ] **RED (device):**
  - `oneLandscapePagePerSlide`;
  - `aTextBoxIsDrawnAtItsPlace`;
  - `aPictureIsDrawnAtItsPlace`;
  - `theBackgroundColourFillsTheSlide`.
- [ ] **GREEN.** Then: the smoke part `pptxOnePagePerSlide`; verify, e2e, size; APK. Commit.

### Task 9: XLSX model (Phase 47)
**Files:** `engine/office/xlsx/XlsxModel.kt`, `XlsxReader.kt`, `XlsxLayout.kt` (pure page splitting); test `XlsxReaderTest.kt`.

**Interfaces:**
- `XlsxBook(sheets: List<XSheet>)`;
- `XSheet(name, colWidthsPt: List<Float>, rows: List<XRow>, merges: List<Range>, printArea: Range?)`;
- `XCell(text: String, bold, align)`.
- `fun XlsxLayout.pages(sheet, pageW = 595f, pageH = 842f, edge = 17f): List<XPage>`. It trims empty rows and columns at the end, fits to the width down to 50 %, then continues columns on later pages, repeats row 1, and chooses sideways when the table is wider than tall.
- [ ] **RED (JVM):**
  - `sharedStringsAndInlineStrings`;
  - `numbersFormatGeneralFixedPercentDate`;
  - `hiddenSheetsSkipped`;
  - `mergedCellsSpan`;
  - `printAreaLimitsTheCells`;
  - `trailingEmptiesTrimmed`;
  - `fitsWidthDownTo50PercentThenSplitsColumns`;
  - `theFirstRowRepeatsOnEveryPage`;
  - `wideTablesGoSideways`.
- [ ] **GREEN.** Commit.

### Task 10: XLSX drawing; Phase 47 proof and APK
**Files:** `engine/office/xlsx/XlsxPdf.kt`; modify `OfficePdf` (EXCEL + OOXML). Device tests are added to `OfficePdfDeviceTest`.
- [ ] **RED (device):**
  - `aSheetOf200RowsFillsSeveralPagesWithTheHeaderRepeated`;
  - `gridLinesAreDrawn`.
- [ ] **GREEN.** Then: the smoke part `xlsxBecomesTablePages`; verify, e2e, size; APK. Commit.

### Task 11: Closure
- [ ] A whole-branch review by a fresh reviewer (opus), with this Review Focus; one fix pass, each fix RED first.
- [ ] `regress.sh` on API 35, 24 and 36 (one emulator at a time); the older smokes and round8/round9 smokes on API 35; release smoke, release cards, first-frame timing; the final APK in `apk/` with sha256.
- [ ] **Docs:**
  - `docs/qa/phase-44.md` … `phase-47.md`;
  - `phase-44-47-rulings.md`;
  - traceability P44–P47;
  - USER-CHECKLIST §AF;
  - the evidence SUMMARY;
  - PLAN §N updated ("Office files: built in round 9").
- [ ] The public export (scanned with gitleaks and trivy, plus the personal-word grep), committed as the owner and pushed; memory; the report.
