# Phase 48 evidence (owner round 10: some pages in colour, some in black & white), 2026-10-29/30

Every PDF, photo and page here is synthetic: built in code by the test sender. No customer's file was used. The owner's screenshot (a Ready screen with a page picture showing through the status-bar strip) was used only to understand the fault and was not copied anywhere.

## Device regression on the final build (`regression/`, after the review fixes)

| Level | Instrumentation | Share matrix | Print-file render checks (pdf.js) | App log privacy hits |
|---|---|---|---|---|
| API 35 (Medium_Tablet) | 113 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |
| API 24 (ps_api24_2gb) | 105 passed, 0 failed, 8 skipped (by design, as in earlier rounds) | 15/15 PASS | 3/3 exit 0 | 0 |
| API 36 (ps_api36) | 113 passed, 0 failed | 15/15 PASS | 3/3 exit 0 | 0 |

The earlier regression on the build before the review fixes is kept in `regression-before-review-fixes/` (API 35 113/113, API 24 105 + 8 skipped, API 36 113/113). The instrumentation includes the round's device test `aColourPageBesideBlackAndWhitePagesKeepsItsColourAndTheOthersAreGrey` on every level.

## Round 10 on a device (API 35, final build: `smokes-api35/round10/`)

A four-page PDF: black lines on every page, a red and a blue block on pages 2 and 4. 7/7 PASS.

| Check | Result |
|---|---|
| Shared from another app, it starts in Colour: "1 PDF · 4 pages · A4 · Colour · 1 copy" | PASS |
| Choose pages in colour: the first guess, read from the engine's own page pictures, keeps pages 2 and 4 in Colour and makes 1 and 3 Black & white ("2 colour, 2 black & white") | PASS |
| The print file holds 2 pages drawn from grey data and 2 colour pictures with real colour in them (15.5 % of their pixels), four pages in order, A4 | PASS |
| Tapping Page 1 makes it colour: "3 colour, 1 black & white"; the file now has 3 colour pictures | PASS |
| All black & white: a plain black & white print (4 pages from grey data, no colour picture) | PASS |
| All colour: the customer's own file again (13,719 bytes, the same as before any marks) | PASS |

The device test proves the same on the renderer: a colour page next to grey pages keeps its colour; the grey pages hold zero non-grey pixels, in page order.

## Older smokes on API 35 (final build: `smokes-api35/`)
- **round9, round8, round7, round6, round5, round4, round3, place, adjust, card, rotate:** all PASS on the first run.
- **privacy:** PASS (no customer data in the app's log; Recents shows a blank card).

## The review and its fixes
- The first regression ran before the review; `review` found 0 Critical, 6 Important, 7 Minor. All Important were fixed test first; see `docs/qa/phase-48-rulings.md`.
- One finding was visible in a screenshot of the first device run: the status-bar band covered the Adjust button above the page bar at the top of the page. The band now shows only while the bar is stuck, with a test for both states.

## Release (`release/`)
- **The APK:** `apk/PrintSaathi-1.0.310-0296cea.apk`, 1,556,920 bytes, versionCode 310.
  - sha256 `d3fc4534f2d2e1f1519191d8c4f2fda01b8e974fb9632c9e105081aadab222e0`.
  - Signed with the pinned PrintSaathi key. The release checks pass (no INTERNET permission, private providers not exported, every share type).
- **release-smoke and release-cards (API 35):** PASS.
- **The release build with the colour PDF:** the guess ("2 colour, 2 black & white"), a tap on a page ("3 colour, 1 black & white"), All black & white and All colour all work; 0 PrintSaathi crashes (`final-release-colour.json`, `.png`).
- **Cold start, first frame:** 1.0.305 against 1.0.310, 20 runs each, alternated. Medians 904 ms and 928 ms (+2.7 %, within run-to-run noise); means 947 ms and 950 ms (`first-frame-vs-1.0.305-alternating-20-each.json`). Ready now loads on first open, and the idle preload keeps it ready.

## Browser suite and unit tests (`web/`)
- **Browser suite (e2e):** 1,940 passed, 24 skipped (as before), including colourpages.spec 14 (axe at 320 px with 200 % text).
- **Unit tests:** 619 passed, plus 96 script tests. Android JVM tests 440/440.
- **Start-up size:** JS 47,241 B of 61,440 B (it was 61,307 B before Ready loaded on demand); CSS 7,425 B of 15,360 B.

## Not proven here
- Paper from the shop's printer: that grey pages are grey on paper, and whether the printer uses colour ink for them.
- Real customer PDFs with colour in them; the first guess on real pages (pale shading, warm scans).
- A 300+ page PDF on a slow phone (the guess waits at most 8 s for page pictures).
- The pinned page bar on the owner's phone (the cover over the status-bar strip is proven in a browser test, not on that phone).

These are in USER-CHECKLIST §AG.
