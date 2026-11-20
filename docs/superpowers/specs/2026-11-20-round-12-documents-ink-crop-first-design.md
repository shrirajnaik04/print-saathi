# Round 12: documents cut to the paper and saving ink, sharper previews, centred pages, crop each photo first, standing ID cards (Phase 50)

**Owner, 2026-11-20** (with eight screenshots: a photographed document printed in B&W Sharp Black, another scanner app's editor, two preview screens, the app's crop screens, another scanner app's page-corner screens, and the ID card edge screen):
1. "Check the document when we select it doesn't consume full image as other doc scanner app."
2. "Hope the prints are ink efficient, for colour as well as black and white, without compromising on print quality."
3. "Make sure no blurry images show anywhere. Must show the image as it is. Even when we crop the images must try to retain quality without blurriness."
4. "One on each page: why not centred? Also when we select one on each page, ask crop mode for each image before sending to the page, so that we don't have to crop afterwards... like the scanner app does, for multiple images or just one."
5. "For ID cards, sometimes for some images they cannot be properly stretched: check what's the issue, check why the selection area shows the wrong direction."
6. (mid-build) "Also hope you handled ID cards that are vertical as well as horizontal; will it auto detect? Aadhaar front and back are horizontal; Voter ID, driving licence are usually vertical."

**Owner answers (AskUserQuestion):** point 1: **auto-crop to the paper** when the app finds a page in the photo; point 2: **automatic for documents**.

## What is built
- **Point 4a, centred.** One on each page (and the pages of "N pages" that hold one photo each) put the photo in the middle of its page. A photo made Smaller keeps its middle. (2026-10-24 had them at the top-left like a Word page; the owner now asks for the middle.) Photos sharing a page start at the margins as before.
- **Point 4b, corners first.** After "One on each page" (and Black edges? if asked), the corners screen of the scanner flow ("Photo 1 of 6", the page's corners with circles and side bars, found paper edges as the start, Turn left / right, Whole photo) opens for each photo in turn: **Next** ... **Done**, then Ready. **Skip the rest** goes straight to Ready; Back returns to the choice. Photos already cut keep their cut.
- **Point 1, auto-crop.** When a layout is chosen, each photo (up to 12, 8 s in all) is looked at by the engine's page finder (the one the Scan pages feature uses); where a paper page covering 30 % to 98.5 % of the photo is found, the photo is cut to its corners (the engine straightens it when printing, so the page fills its sheet). Nothing is cut where no page is found; a photo the shopkeeper already cut is left alone. Crop screens, Adjust and Whole photo can undo it.
- **Point 2, ink.** When **every** photo of a job is a found paper page, the job saves ink: Clean colour in colour, Sharp Black in black and white (the paper's grey or yellow tint stays unprinted, the text stays sharp); the Ready line says "Clean colour" or "Sharp Black". A style the shopkeeper picks always wins. Real photos and mixed jobs are never changed. Passport photos and ID cards are never styled.
- **Point 3, sharp.** The pictures the screens show are made at 1536 px (they were 640) at higher quality; page pictures for choosing pages at 640 px (they were 320). The print itself is unchanged: made from the customer's original at 300 dpi of its box (passport photos 600).
- **Point 5, ID cards that look stretched.** The card always prints as a card (85.6 x 54 mm), so an edge frame of another shape stretches it; the screenshot's frame was a tall piece of a lying card. The edge screen now says "This frame is not card-shaped, so the card will look stretched..." (when the frame's shape is more than 15 % from a card's) and has a **Card shape** button that makes the frame card-shaped about its own middle. *The owner's photo itself was not available, so the cause of that frame was not reproduced.*
- **Point 6, vertical cards.** The finder already sees a card standing (its shape is measured along its long sides). The engine now also looks for the face with the card turned a quarter either way (it looked only at upright and upside down), so a card whose face reads with a quarter turn prints **standing**; the other side (no face) stands with it. *Not proven on real cards here: no real face photos; the engine's face finder cannot be fed synthetic faces.*

## Not built
A separate "ink saver" switch; automatic standing or lying for a card with no face on either side; changing the print resolution; cutting to paper for PDFs.

## Safety and limits
- No new dependency. Startup JS stays under its budget (checked). The 1536 px pictures are drawn scaled by the WebView.
- The finder only reads photos in the isolated engine; nothing about files is logged.
