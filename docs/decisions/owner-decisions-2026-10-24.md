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
