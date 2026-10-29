# Phase 48 (round 10): every ruling made during the build, and the findings left open

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost. Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-29-round-10-mixed-colour-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-29-phase-48-round-10-mixed-colour.md`
- **Owner:** asked "What if some pages need to be printed in colour and some in black and white", then "change per page while navigating through the pages", then "do what's best, recommended, extremely user friendly. Also fix this issue" (a screenshot of a page picture showing through the status-bar strip above the pinned page bar). Two questions were answered with the recommended option: pages in order in one print (not two prints to save colour ink), and tap pages with a first guess.

## Rulings

**The design**
- **A job still has one colour; marks per page override it.** The top Colour | B&W switch sets every page again and clears the marks. Cost: one tap wipes the marks of a long document (no Undo for it).
- **Marks are kept per "item:page"** (a photo is "item:0"), like page turns and sizes, so they follow their pages through Pages to print and page order. They are not in Adjust's Undo list, like Colour (a Colour choice belongs to Change and Ready).
- **One print, colour mode.** A mix is one print file sent to the printer in colour mode (Android allows one colour setting per print); the grey pages are made truly grey in the file (every pixel R = G = B; proved on a device). Whether the printer then uses only black ink for them is the printer's choice and is not promised (owner checklist AG6).
- **A job's top switch shows neither half while pages are mixed;** the summary says "2 colour, 4 black & white".
- **Per-page switch under each page's picture,** not in the pinned page bar: two rows of 56 px buttons would be taller than the bar's 15 % pin limit and it would stop staying at the top.
- **"Choose pages in colour" is a panel on Ready, not a new screen,** so the pages' pictures and the print preview are already there and the choice shows at once.
- **The first guess** reads each page's colour picture in the web view (a small canvas copy; no new native call and no bytes over the bridge). A page is colour when 0.4 % of its pixels have a 40-step spread between red, green and blue. A picture that cannot be read keeps its page in colour (nothing is greyed without evidence). It is made once per job, only for a job in colour, and a black & white job is never guessed (the shopkeeper chose it). Cost: pale shading is guessed black & white and a warm-light scan of a plain page can be guessed colour; one tap fixes either.
- **A PDF with a grey page is not the customer's own file:** it prints by drawing its pages (every page in colour with the plain style is still the customer's file, checked page by page).
- **Styles:** a mixed job keeps a colour style and a black & white style apart (`bwStyle`); Print style ticks both. Before this was fixed, choosing Sharp Black quietly dropped Vibrant (review I5).
- **The Colour screen's and Change's wording:** Change says "Some in colour"; the Colour screen ticks neither card while pages differ; choosing one sets every page.

**The renderer**
- **A colour plan may hold grey pages.** The old rule ("a colour plan refuses Sharp Black, OCV Black and Black & White") is the very thing this round changes. `RenderPlanContractTest` was updated to the new rule; every other mismatch (a colour style on a black & white plan, an unknown style) is still refused, and the untouched path still requires every page original.

**Ready loads on demand**
- Startup JS had 133 bytes spare; the new code needed about 1 KB. Ready is the biggest screen after a share, so it now loads when first opened (preloaded when the app is idle). Startup JS is 47,241 B of 61,440. Cost: Ready's first appearance after a cold start of the app can show the brief blank "busy" screen the other on-demand screens show. One older test (forms and stamps) got a 15 s wait for that reason; its assertions are unchanged.
- **Four older tests looked for the buttons "Colour" and "Black & white" by name across the whole page;** the per-page switches add more. They were scoped to the top switch with the same assertions (and the per-page group is named "Colour of page N" so the old lookups for "Print in" stay unique).

**The status-bar fix**
- The page bar's cover (a band of the page colour over the status-bar strip) shows only while the bar is stuck at the top. As first built it was always on and painted over the button above the bar at the top of the page; the review found that and a test now pins both states.

## The whole-round review and its fixes
A fresh reviewer read every change: 0 Critical, 6 Important, 7 Minor. All Important were fixed test first, in one pass.

| Finding | Fix | Test |
|---|---|---|
| **I1** the status-bar band covered the button above the bar at the top of the page | band only while stuck (`useStuck`, `.pager-stuck`) | e2e: stuck → band, top → none |
| **I2** the first guess could overwrite taps made while it ran | the job ignores a guess after any mark or colour change; a late answer after leaving Ready is dropped | `never overwrites what the shopkeeper chose meanwhile` |
| **I3** the guess came back on every visit and undid All colour | made once per job (`pagesMarked`, kept through saving) | `is made once per job…`; e2e `…does not undo All colour when Ready is opened again` |
| **I4** a page with photos of both colours showed as plain Colour | "1 with both" in the summary, neither half of its switch chosen, the card says "Some in colour", each photo drawn grey by its own style | plan + e2e tests |
| **I5** one style slot for a mixed job; Print style showed the wrong one | `bwStyle`; Print style ticks both | job + e2e tests |
| **I6** a pasted copy of a photo and a retaken scan page lost their colour | the mark follows | two job tests |
| **M1** text made again kept stale marks | cleared | job test |
| **M2** marks on a passport or ID job said "Some in colour" | `hasPageColours` ignores them there | job test |
| **M3** every page set to colour on a black & white job was redrawn instead of being the customer's file | untouched is decided by each printed page's style | plan test |
| **M4** the Colour screen's black & white card showed marked pages in colour | drawn without marks | (screen; typecheck + e2e) |
| **M5** a scan page set to colour got Original, not Clean colour | Clean colour | job test |
| **M6 (part)** the page chooser's pictures load lazily | `loading="lazy"` | — |

## Deferred minors (open, with reasons)
- **The "Choose pages in colour" button has no `aria-expanded`** (the shared Button has no such property); its label changes to "Done" while open.
- **A PDF of 300+ pages:** the guess runs after 8 s on the pictures that arrived and later pages stay in colour; this needs a device check with a 300-page PDF on API 24.
- **No web-made mixed-colour plan file is parsed by the Kotlin contract tests;** the mixed plans there are hand-written. The device test and the smoke prove the real path.
- **A guess that finds nothing grey still saves a new revision** (harmless: the print file's name ignores the revision).

## Decisions for the owner
- **Should the first guess be shyer** (only pages with a lot of colour), or bolder? Today a coloured line of text is enough for Colour.
- **Should the top switch and All colour / All black & white keep the marks** (so one tap could be undone)? Today they set every page again.
- **Does the printer use colour ink on the black & white pages?** Only the shop's printer can say (checklist AG6).
