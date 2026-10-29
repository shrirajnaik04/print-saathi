# Round 10: some pages in colour, some in black & white (Phase 48), and the pinned page bar fix

**Owner, 2026-10-29:** "What if some pages need to be printed in colour and some pages need to be printed in black and white." Then: "I hope we will be able to change per page as well, navigating through the pages", "do what's best, recommended, extremely user friendly", and a screenshot of Ready where a page picture showed through the status-bar strip above the pinned Previous / Next buttons.

**Owner answers (AskUserQuestion):** the main reason is **pages in order, one print** (not saving colour ink with two prints); the way to choose is **tap pages, with the app's first guess**.

## Part A: the pinned page bar (owner screenshot)
While scrolling Ready, the Previous / Next bar stays pinned at the top, but the sheets scroll under the phone's status-bar strip above it and showed through there. The bar now paints a band of the page colour over that strip, as the brand bar on Home already does.

## Part B: some pages in colour
- **Each page can be Colour or Black & white.** A job still has its one colour (the top switch). Marks per page override it. Tapping the top switch (Colour or B&W) sets every page again and clears the marks.
- **Where the marks live.** Keyed "item:page" (a photo is "item:0"), like page turns and sizes, so they follow their pages through Pages to print and page order.
- **On Ready** (a job of two or more pages, not passport photos or ID cards):
  - Under the page buttons: **This page: Colour | Black & white**. Tap, and that page's picture changes at once; go on to the next page with Next.
  - A button **Choose pages in colour** opens a grid of every page's picture with its mark (a tick and the word, never colour alone). Tap a page to change it. **All colour** and **All black & white** buttons. It lists pages, so a long document is quicker than paging.
  - **The first guess.** The first time the grid opens, pages that have colour in them (photos, stamps, coloured charts or headings) start as Colour and plain pages as Black & white. The guess is made from the colour pictures of the pages, on the phone. Anything the shopkeeper marks stays.
  - The summary line says "6 pages · A4 · 2 colour, 4 black & white · 1 copy". The top switch shows neither half while pages are mixed.
- **Printing.** One print, the pages in order. Black & white pages are made truly grey (R = G = B), exactly as in a black & white job. The print file goes to the printer in colour mode, because Android allows one colour setting per print; whether the printer uses only black ink on grey pages is the printer's choice (the owner checklist says so; it is not promised).
- **Styles.** Colour pages use the job's colour style, black & white pages its black & white style (Black & White, Sharp Black or OCV Black).
- **A PDF with some pages in black & white is not the customer's own file:** it prints by drawing its pages, as black & white PDFs already do.
- **Not built:** two separate prints to save colour ink; colour for part of a page; marks on passport photos and ID cards.

## Safety and limits
- The page images used for the guess are the ones Ready already makes; nothing new crosses the bridge, and nothing is logged.
- Startup JS stays under its budget: the new screens and words load on demand.
