# Owner decisions — 2026-10-24 (after testing 1.0.203 on their phone)

The owner's requests and their answers to the questions asked, in order. The spec built from them:
`docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md` (Parts 1–7).

| # | Topic | The owner's words or choice | Built as |
|---|---|---|---|
| 1 | Add photos | "Add more images option needed." | Add photos / Add files: Gallery or File manager; the files join the job (spec Part 3) |
| 2 | Moving a photo | "Press and hold the image to make it movable anywhere … place the image in his desired place in the page." Question: what happens to the others? Answer: **free, others stay** (Word's "In front of text") | Press and hold, then drag; snapping guides; overlap allowed, the moved one on top; Move ↑ ↓ ← → and To previous / next page; Automatic re-tidies (Part 5) |
| 3 | Crop | "For all crops give this kind of cropping frame UI … doc scanner app … the same cropping UI." Question: corners free or a rectangle? Answer: **free corners that straighten** | Scanner-style frame for photos, photo pages and ID cards: corner and side handles, magnifier, Cancel · Whole photo · Turn left · Turn right · Done (Part 4) |
| 4 | Passport "Fit the face" | Question: the scanner frame too? Answer: **keep it as it is** | Unchanged |
| 5 | Splash | "App logo isn't proper on splash screen, please correct it." | The whole v3 logo from the first frame, on Android's splash and the app's (Part 1) |
| 6 | Same-frame crop | "Allow to crop: use same frame to allow cropping of images." Question: side handles or a crop mode? Answer: **side handles crop** (Word style) | A pill on each side of the chosen photo on Adjust (Part 5) |
| 7 | Margins | "Default margin layout must be narrow, same as Word." Questions: size, start, scope. Answers: **Word's names, Narrow default**; **top-left like Word**; **photo pages on A4 only** | Settings → Margins (Narrow 1.27 cm / Normal 2.54 cm / Small 0.6 cm); photos fill pages from the top-left (Part 2) |
| 8 | Card edges | "Also fix invisible border for the cards. Also check other places." | A 2 px edge on every card, tile, row, choice, thumbnail and preview area; a test over every screen (Part 6) |
| 9 | Printer set-up | "Remove the set up the printer button and its section. It's not needed." | Home's set-up panel removed; the test page stays in Settings (Part 7) |
| 10 | Fixed header | "Do we need to make the logo and the header static on scroll? Please suggest." After the suggestion: **"keep it static on home page only"** | Home's logo bar stays at the top while it is small; other screens unchanged (Part 7) |
| 11 | Zoom buttons | "Interchange … zoom in keep right, zoom out keep left." | Fit the face: Zoom out left, Zoom in right (Part 7) |
| 12 | ID card back side | "Where is the option to print the back side? … optional … front only or both sides on one page vertically." | Add the back side (one side found); Print front only with Undo (two sides) (Part 7) |
| 13 | Building | "Approve, build it all." | Spec and plan in the repository, built to closure without further check-ins |
| 14 | Publishing | Push the result to the public repository? **Yes, as a new commit** | After the security scan, one new commit on the public repository |
| 15 | Resize everywhere | During the closure, with a screenshot of Adjust on an ID card: "Allow to resize. Told u resizes must be allowed for all sections that have photos in the preview." | The round corner resizes ID cards, document pages and passport photos too, as Smaller / Bigger do (Phase 24 report) |

## Round 3 (after testing 1.0.224, same day)

| # | Topic | The owner's words or choice | Built as |
|---|---|---|---|
| 16 | Crop frame | "Remove those corner circles. Don't allow stretch from corners. Must be draggable from the horizontal and vertical lines only from middle bar." Question: where? Answer: **everywhere** | Photos, document pages and ID cards: the four middle bars only; automatic straightening kept (spec 2026-10-24 round 3, 25c) |
| 17 | ID card back side | "Add back side functionality not working after we select photo from the gallery." | Bug fixed (25b) |
| 18 | Passport count | "Add custom number for passport size photos, auto adjust on next page if space isn't enough." | Type any number 1–100; extra sheets as needed (25d) |
| 19 | Card edges | "Left right borders inside the container … being hidden … check all areas … I have told so many times." | Root cause fixed for every screen, with a test of the painted pixels (25a) |
| 20 | Colour | "All print output must be colour; a Colour / B&W toggle on Ready to print, extremely user friendly." Question: remember a B&W choice? Answer: **always colour** for new jobs | Colour by default for every kind; Colour \| Black & white switch on Ready (26) |
| 21 | Bigger preview | "Increase the size of preview … for all categories, just like this app" (Doc Scanner). Question: where do the tools go? Answer: **one row at the bottom** | The page across the screen on every Adjust screen; one sliding row of tools (27) |
| 22 | Rotate handle | "Allow to rotate images from the image itself, like this" (WPS). Question: how? Answer: **any angle, snaps straight** | A handle above the chosen photo; any angle, snapping within 3°; Tilt buttons (28) |
| 23 | Building | "Approve, build it all." | Spec and plan in the repository, built to closure; APK, report and a public-repo commit |

## Round 4 (after testing 1.0.239, same day)

| # | Topic | The owner's words or choice | Built as |
|---|---|---|---|
| 24 | Colour toggle | "Put this Colour and Black & white at the top, and it should be a toggle, next to Ready to print." Question: which control? Answer: **two-part toggle** | Colour \| B&W in Ready's title line (spec 2026-10-24 round 4, 32a) |
| 25 | ID card crop | "Let the user see the crop screen for front and back … crop frame default to card size." | The crop screen for every photo side in turn; card-shaped frame when nothing is found (29a) |
| 26 | Change photo | "If the wrong photo is selected for front or back, we must be able to replace it." | Change photo per side (29b) |
| 27 | Card turns | "Allow rotating images in all directions in the ID card front and back sections." | Turn left / Turn right; a quarter-turned card prints standing (29c) |
| 28 | Adjust tools and zoom | "Make the bottom buttons smaller … allow zooming the page in and out." | Compact 56 px tools; Zoom out / Zoom in and pinch, 100–400 % (30a, 30b) |
| 29 | Leaving a job | "Ask whether they really want to leave the job and discard, or continue working." Question: which choices? Answer: **Keep working / Leave / Delete** | "Leave this job?" (31a) |
| 30 | Exit from Home | "When going back from the home page, ask: stay in the app or exit." | "Close PrintSaathi?" Stay / Close the app (31b) |
| 31 | Home | "Remove 'Customer sent files on WhatsApp?' from Home." | Removed (Help keeps the steps) (31c) |
| 32 | Paper type | "Where is the paper type selection? Normal, glossy …" Question: Android cannot set it — what should it do? Answer: **reminder only** | Paper type Plain / Glossy on Change; glossy reminder on Ready (32b) |
| 33 | Pages | "Allow scrolling through all the pages in the edit preview." Answer: Ready already does; on Adjust **show next and previous page sideways**, without disturbing the page | Pages side by side on Adjust, ‹ › beside the page number (30c) |
| 34 | Building | "Approve, build it all." | Spec and plan in the repository, built to closure; APK, report and a public-repo commit |
