# PrintSaathi — checks only you can do (Phases 0–6)

Everything here needs a real phone, the shop printer, the shopkeeper, or your own documents. Emulators cannot prove these.
Allow about 60–90 minutes in total. Tick each box and write what you saw.

**Where results go:** put photos and screenshots in `docs/evidence/phase-0/<date>/user/`, or send them to me in chat.

**What not to keep:** never keep a customer's real file, and never put your e-Aadhaar in the folder. For §D only the result is recorded.

## Before you start (5 min)

1. Turn on USB debugging on the phone and allow this PC: `docs/INSTALL.md` §2 (with notes for Samsung, Xiaomi/Redmi/POCO, Oppo/Vivo/Realme and Android 7).
2. **The shopkeeper's phone gets only the real app:** `npm run android:release`, then `node scripts/device/install.mjs --release`. Never a test copy: the install script refuses one on a real phone.
3. **Your own phone** may get a test copy for the earlier sections: `npm run android:build`, then `node scripts/device/install.mjs --test-copy`. A test copy and the real app cannot replace each other, so to switch, uninstall first (only on your phone).
4. The script prints the phone's model and Android version. **Write them down:** __________

## §A WhatsApp shares (your phone first, then the shopkeeper's) — 15 min

Use photos and PDFs you made yourself, never customer files.

| # | What to do | What to check | Result |
|---|---|---|---|
| A1 | In WhatsApp, open a chat with 1 photo → tap it → **Share** → **PrintSaathi** | The app opens and says "1 file received: 1 photo", with the picture shown | ☐ PASS ☐ FAIL |
| A2 | Select 6 photos in a chat (long-press, tap more) → **Share** → **PrintSaathi** | "6 files received: 6 photos", in the same order as WhatsApp | ☐ ☐ |
| A3 | Share 1 PDF (sent "as document") | "1 file received: 1 PDF" | ☐ ☐ |
| A4 | Share 2 photos + 1 PDF together | "3 files received: 2 photos and 1 PDF" | ☐ ☐ |
| A5 | Share a Word file (.docx) | Says it can't be printed yet and asks for a PDF or photo | ☐ ☐ |
| A6 | After A2, press **Home**, open WhatsApp, then come back to PrintSaathi through **Recents** | Still shows the same 6 photos, with no duplicate job | ☐ ☐ |
| A7 | Is **PrintSaathi** in the share list without scrolling? If not, long-press it and **Pin** it | Write: pinned? ☐ yes ☐ not possible on this phone | |
| A8 | **Dual WhatsApp phones only:** share from the second WhatsApp | Works like A1 | ☐ ☐ ☐ n/a |
| A9 | If you have an iPhone photo sent **as document** (`.heic`) | Write what the app says (decision ADR-003) | |

## §B Shop printer — print path and ruler tests — 25 min

You need: the shop printer on Wi-Fi, A4 paper, 4×6 photo paper, and a **steel ruler** (mm). Use the shopkeeper's phone if it is ready; otherwise yours.

| # | What to do | What to record | Result |
|---|---|---|---|
| B1 | In PrintSaathi, scroll to **Printer test (for the shop owner)** → **Test page A4** | Android's print screen opens. Photograph it, especially the printer name and **Paper size** at the top | photo ☐ |
| B2 | If it shows **Save as PDF** or **Select a printer**, tap it and choose the shop printer (Brother). If the Brother is missing, see §F | Which printer service names appear: __________ | |
| B3 | Do not change anything else; tap the print button | Did a page come out? ☐ yes ☐ no | |
| B4 | **Ruler on the A4 page:** measure the black square, in mm, left to right and top to bottom | Square: ____ × ____ mm (should be 50 × 50). One box: ____ × ____ mm (should be 35 × 45) | ☐ within ±0.5 mm |
| B5 | Load **4×6 photo paper**. Tap **Passport 4×6 — 1 sheet (document)** | Did the print screen preselect a 4×6 size? Write its exact name: __________ | |
| B6 | Print it. **Ruler:** one passport box | ____ × ____ mm (35 × 45) | ☐ within ±0.5 mm |
| B7 | **Passport 4×6 — 1 sheet (photo)**: print, then measure one box | ____ × ____ mm (does PHOTO mode enlarge?) | |
| B8 | **Passport 4×6 — 2 sheets (document)**: print both, then measure | sheet 1 ____ × ____ / sheet 2 ____ × ____ | |
| B9 | **Wrong paper:** start **Passport 4×6 — 1 sheet (document)** again, change **Paper size** to **A4** | The preview shows "Wrong paper. Nothing will print…" (photograph it) | ☐ |
| B10 | Tap print anyway | Nothing prints, and the screen says "Nothing was printed – the paper was not 4x6…". Tap **Retry**, choose 4×6 again: the real page is back | ☐ ☐ |
| B11 | **Test page A4 black & white**: print it | Did the printer print it in black only? Did the printer's own screen say anything? | |
| B12 | After each print, tap **Show last print report** → **Send report** to yourself on WhatsApp | It holds no customer data, only paper sizes and printer IDs. Send me the text | ☐ |
| B13 | With 4×6 paper loaded, print **Test page A4** (paper mismatch on purpose) | What does the Brother's own screen or light show? | |

**Photograph every printed page with the ruler lying on it,** so the mm marks are readable.

## §C the shopkeeper's phone facts — 5 min

1. Open PrintSaathi on **The shopkeeper's phone** and scroll to **This phone**.
2. Take a screenshot of the whole section (scroll if needed).

Record:
- **Android version:** _____ (level __)
- **System update level:** _____
- **Memory:** _____
- **Web engine version:** _____
- **"Can open locked PDFs by itself":** ☐ Yes ☐ No

**If the app shows "Please update Android System WebView" instead:**
1. Tap the button and update from the Play Store.
2. Reopen the app.
3. Write down that this happened: ☐

## §D Locked PDF: your own e-Aadhaar — 5 min

Use **your own** e-Aadhaar. Nothing is kept: the app deletes the job afterwards. Don't send me the file.

| # | What to do | What to check | Result |
|---|---|---|---|
| D1 | Send your e-Aadhaar PDF to yourself on WhatsApp, then share it to PrintSaathi | Ready says "This PDF is locked. Type its password to open it." with **Unlock** | ☐ |
| D2 | **Unlock** → type the first 4 letters of your name (small letters are fine) and a **wrong** year → **Unlock** | The letters turn into CAPITALS; "That password didn't work…" | ☐ ☐ |
| D3 | Correct the year → **Unlock** | Ready: "1 PDF · 1 page (or 2) · A4 · Black & white · 1 copy"; the preview shows your card | ☐ |
| D4 | Print it in **Black & white** and in **Colour** (Change → Colour) on the shop printer | Both print fully: photo, QR code, text; nothing missing compared with the PDF on your phone | ☐ ☐ |
| D5 | Press Home, open the job again from "Continue the last job" | It asks for the password again (it is never kept) | ☐ |
| D6 | Do D1–D3 on **The shopkeeper's phone** | Note whether it unlocks there too (old phones use the app's own unlock) | ☐ yes ☐ no: ____ |
| D7 | Delete the WhatsApp message to yourself afterwards | — | ☐ |

## §E the shopkeeper's language check — 10 min

1. Print `docs/spikes/language-mockups.html`: open it in Chrome, **Ctrl+P → A4 landscape**. You get 3 pages (English, Marathi, Hindi).
2. Show the shopkeeper the English page first. Ask: *"A customer sent 7 photos and wants them on one page. What would you tap?"* Then: *"Where would you tap to print?"*
3. Repeat with the Marathi and Hindi pages.
4. Tick the boxes at the bottom of each page.
5. **Correct the Marathi and Hindi words in pen**; they are drafts.
6. Record: which language should the app use? ☐ English ☐ मराठी ☐ हिन्दी
7. Record: digits like **7** or **७**? ☐ 7 ☐ ७

## §F Print services — 3 min

On the phone that will print, open **Settings → Connected devices → Connection preferences → Printing**. The name can differ: search Settings for "Printing".

Record which services are listed and ON:
- ☐ Brother Print Service Plugin
- ☐ Mopria
- ☐ Default Print Service
- ☐ other: ______

If none is ON, the app will only offer "Save as PDF". Install and turn on the **Brother Print Service Plugin** from the Play Store, then repeat §B1.

## §G Milestone A0: The shopkeeper prints the first WhatsApp photos (Phase 2) — 20 min

You need: the shop printer on Wi-Fi with A4 paper, and 3 photos you took yourself (at least one taken sideways).
First do it once yourself, then let the shopkeeper do G1–G4 alone while you only watch.

| # | What to do | What to check | Result |
|---|---|---|---|
| G1 | In WhatsApp, select the 3 photos → **Share** → **PrintSaathi** → **One on each page** | "Ready to print" shows "3 photos · 3 pages · A4 · Colour · 1 copy"; the sideways photo's page says "Sideways page" | ☐ PASS ☐ FAIL |
| G2 | Tap **PRINT**. First time only: at the top of the print screen choose the **shop printer** (not "Save as PDF"). Then tap the round print button | Android's screen shows A4 and 3 pages | ☐ ☐ |
| G3 | Look at the paper | 3 sheets; each photo whole (nothing cut), upright, centred, with a small white edge (about 6 mm); colours look right | ☐ ☐ |
| G4 | Back in PrintSaathi | "Sent to the printer ✓", then "Did it print correctly?" → **Yes, done** returns to Home | ☐ ☐ |
| G5 | Print again; in Android's screen change **Paper size** to anything other than A4 | The preview turns into a yellow "Wrong paper" page; tapping print prints **nothing**; PrintSaathi says the paper size was wrong. Change it back to A4 and print again | ☐ ☐ |
| G6 | Print again and choose **Save as PDF** at the top instead of the printer | PrintSaathi says "This was saved as a file, not printed" | ☐ ☐ |
| G7 | Did the shopkeeper manage G1–G4 alone? Write where they hesitated | ________ | ☐ alone ☐ needed help |
| G8 | Write the printer's name as it appears in the print screen, and the time from PRINT to paper | ________ | |

If anything fails, take a photo of the paper and a screenshot, and send them to me. Never send a customer's file.

## §H Layouts, Black & white and file size (Phases 3–4) — 20 min

You need: the shop printer with A4 paper, and 6 photos **you** took with your phone's camera (full size, not
WhatsApp copies; at least one of trees, grass or a busy market, the hardest kind for file size).

| # | What to do | What to check | Result |
|---|---|---|---|
| H1 | Open `docs/evidence/phase-3/2026-10-03/layout-gallery.html` on the PC | 1–30 photos look sensible on the page: nothing tiny next to something huge, the order kept | ☐ looks right ☐ note: ____ |
| H2 | Share the 6 camera photos from your **Files/Gallery** app (as files, not through WhatsApp) → **One on each page** | "Ready to print" shows each page as it will print (it changes from a drawing to the real page within a few seconds) | ☐ ☐ |
| H3 | **Change → Colour → Black & white** → **PRINT** | Android's screen shows **Black & White** already chosen; the paper comes out grey only | ☐ ☐ |
| H4 | Before printing H3, choose **Save as PDF**, save it to Downloads and send me the size of that PDF (in MB) | I divide by 6: each page should be at most 3 MB. A synthetic, very busy test page came to 3.25 MB | ____ MB |

## §I Printer setup, test page and big jobs (Phase 5, Milestone A) — 20 min

You need: the shop printer with A4 paper, a ruler, and (for I3) 4×6 photo paper.

| # | What to do | What to check | Result |
|---|---|---|---|
| I1 | PrintSaathi → **Help** → **Print a test page** → **A4 paper** → choose the **shop printer** at the top → print | The black square measures **5.0 cm** each side (±0.5 mm); a grey box **3.5 × 4.5 cm**. Back in PrintSaathi: "Sent to the printer ✓" and what to measure | ☐ ☐ ____ cm |
| I2 | Go to Home | "The shop printer is not set up yet" is **gone** | ☐ ☐ |
| I3 | Put 4×6 photo paper in → **Print a test page** → **4×6 photo paper** → print | PrintSaathi says "4×6 photo paper is saved for passport photos" (or that the printer offers none). Each grey box 3.5 × 4.5 cm | ☐ ☐ |
| I4 | Print the 4×6 test page again | Android's print screen now has the 4×6 paper **already chosen** | ☐ ☐ |
| I5 | Share 6 photos → **One on each page** → **Change → Copies → 8** → back to Ready | "A big job: it prints in 2 parts…"; the button says **PRINT PART 1 OF 2**. Print it: 40 sheets. Then "Yes, print part 2 of 2": 8 sheets | ☐ ☐ |
| I6 | Settings → **Delete all customer files now** → **Delete all** | It asks first; afterwards Home has no "Continue the last job" | ☐ ☐ |

## §J Passport photos (Phase 6, Milestone B) — 15 min

You need: the shop printer with 4×6 photo paper (do §I3 first so PrintSaathi knows the paper), a ruler, and a
portrait photo of yourself on your phone (not a customer's).

| # | What to do | What to check | Result |
|---|---|---|---|
| J1 | Share the photo to PrintSaathi → **Passport photos** | "Fit the face in the frame": the frame and oval sit on the face; Move / Bigger / Smaller / Reset work | ☐ ☐ |
| J2 | **Next** | "5 passport photos · 4×6 photo paper · Colour · 1 sheet · Charge ₹50" and "Put 4×6 photo paper in the printer" | ☐ ☐ |
| J3 | **PAPER LOADED — PRINT** → print (change nothing) | Android's screen already has the 4×6 paper chosen | ☐ ☐ |
| J4 | Measure a printed photo with the ruler | **35 mm wide, 45 mm tall (±0.5 mm)**; thin grey cut lines between the photos; the face where the frame was | ☐ ☐ ____ × ____ mm |
| J5 | **Change → How many photos? → 8** → print on 4×6 (2 sheets) | Measure a photo on **each** sheet: still 35 × 45 mm (some print services shrink jobs of more than one page) | ☐ ☐ ____ / ____ mm |
| J6 | On a phone or printer with no 4×6 photo paper saved (Ready says "Printing on A4 paper"): share a photo → Passport photos → print on A4 | Measure: 35 × 45 mm on A4 too | ☐ ☐ ____ mm |
| J7 | Let the shopkeeper do J1–J3 alone with another photo | Did they manage alone? Where did they hesitate? | ☐ alone ☐ help: ____ |

## §K Documents and PDFs on paper (Phase 7, Milestone C) — 20 min

You need: the shop printer with A4 paper and a few **non-customer** PDFs: a bank statement or bill of your own, a
form you filled in, a scanned page, a PDF with a sideways (landscape) page.

| # | What to do | What to check | Result |
|---|---|---|---|
| K1 | Share a normal PDF → **PRINT** (1 tap) | Prints in black & white, all pages, in order, right way up | ☐ ☐ |
| K2 | Change → **Colour** → print the same PDF | Prints exactly like the PDF on your phone (the customer's own file goes out untouched) | ☐ |
| K3 | Change → **Pages to print** → untick a page → Done → print | That page is missing, the others print in order | ☐ |
| K4 | Change → **Page order** → tap a page → **Move later** / **Turn** → Done → print | The new order and the turned page as shown on Ready | ☐ ☐ |
| K5 | The PDF with a sideways page | It prints on a sideways sheet, not shrunk on an upright one | ☐ |
| K6 | The filled-in form (on **The shopkeeper's phone**) | If Ready warns "filled-in boxes or stamps…", compare the paper with the PDF: what is missing? | ☐ no warning ☐ warning: ____ |
| K7 | Copies: set **2** on a 3-page PDF | Prints 1, 2, 3, 1, 2, 3 (sets in order) | ☐ |
| K8 | Share 2 photos and a PDF together | All become pages in the order you shared them | ☐ |
| K9 | Let the shopkeeper print a PDF alone (K1) | Did they manage alone? | ☐ alone ☐ help: ____ |

## §L Print styles on paper (Phase 8) — 15 min

You need: the shop printer with A4 paper, one of your own colour photos and a photo of a printed page you took with
your phone (not a customer's).

| # | What to do | What to check | Result |
|---|---|---|---|
| L1 | Share your photo → One on each page → Change → **Print style** | Six examples of your photo: Original, Vibrant, Soft Tone, Black & White, Sharp Black, OCV Black | ☐ |
| L2 | Print the photo in **Original**, **Vibrant** and **Soft Tone** | Vibrant: stronger colours, skin still natural? Soft Tone: gentler, a little lighter? | ☐ ☐ ☐ |
| L3 | Share the photo of the printed page → **Print as document** → print in **Black & White**, **Sharp Black**, **OCV Black** | Sharp Black: darker text, whiter paper. OCV Black: only black and white, the shadow of your phone gone, every letter readable | ☐ ☐ ☐ |
| L4 | Look at the six sheets side by side | Which style would you use for which customer job? Anything that looks wrong? | ____ |

## §M Black edges and crop (Phase 9, Milestone D) — 15 min

You need: a few of **your own** pictures: a phone screenshot, a WhatsApp video still or film photo with black bars,
a scanned page with a dark edge, a dark night photo, a photo of something on a black background.

| # | What to do | What to check | Result |
|---|---|---|---|
| M1 | Share the screenshot / bars picture → One on each page | "Black edges?" appears once, the example "Without the edges" is right; Remove → printed without them | ☐ ☐ |
| M2 | Share the night photo and the black-background photo | **No** "Black edges?" question (nothing should be cut) | ☐ ☐ |
| M3 | The scanned page → Print as document | Black edges removed if found; prints black & white | ☐ |
| M4 | Any photo → Change → Photos → photo → **Crop** → Smaller, Move, drag a corner → Use this part → print | The paper shows exactly the part in the frame | ☐ |
| M5 | Let the shopkeeper do M1 and M4 alone | Did they manage? Where did they hesitate? | ☐ alone ☐ help: ____ |
| M6 | If you can, collect 20–30 of your own pictures with and without black edges and tell me which were wrong | (helps tune the detector on real pictures) | ____ |

## §N Speed, big shares, two shares, full phone and privacy (Phase 10) — 25 min

On the shopkeeper's phone, with your own photos only.

| # | Do this | Expect | Result |
|---|---|---|---|
| N1 | Close PrintSaathi completely, then open it; time until Home shows | About 1.5 s on a newer phone, 2.5 s at most on an old one | ____ s |
| N2 | Share 6 WhatsApp photos → All on one page; time until the real page shows on Ready | 4 s or less (8 s on an old phone) | ____ s |
| N3 | Share 20 big camera photos → Use more pages; while "Getting the photos ready… 12 of 20" shows, tap Cancel once, then share them again and let it finish | Words, a bar and Cancel; Cancel goes Home and the job is in Recent jobs; the second time Ready shows the pages | ☐ |
| N4 | With a job open on Ready, share 1 more photo from WhatsApp | "New files arrived": try **Add them to this job** (the photo joins, choose the layout again) and, another time, **Start a new job** | ☐ ☐ |
| N5 | Print a job, then while the result screen shows, share 1 more photo | "New files arrived" without "Add" (the printed job would print again); Start a new job prints only the new photo | ☐ |
| N6 | Leave a job on Ready, wait overnight with the phone locked; next morning open Recent jobs | Jobs older than 1 day are gone (the cleanup runs while the phone rests); the open job is kept if you return within 30 minutes | ☐ |
| N7 | Recents (the square button) after leaving PrintSaathi with customer photos open | Android 13 or newer: the PrintSaathi card is blank. Android 12 or older: blank too (screen protected) | ☐ Android ___ |
| N8 | Only if the phone is nearly full: share photos | "Phone storage is full…" with **Delete old PrintSaathi jobs**; nothing half-received is left | ☐ / not tried |

## §O Settings, problem report and Choose from phone (Phase 10b) — 15 min

| # | Do this | Expect | Result |
|---|---|---|---|
| O1 | Settings → Shop name → your shop's name → Save | The Settings row shows it | ☐ |
| O2 | Settings → Passport photos and prices → Prices: set the prices you charge (e.g. 4, 6, 8 photos) → Save; then make a passport job of that count | Ready says "Charge ₹…" with your price | ☐ |
| O3 | Settings → Delete customer files after: choose what you want (1 hour / 1 day / 7 days) | The row shows it; old jobs go after that time | ☐ ____ |
| O4 | Settings → Send problem report → send it to yourself on WhatsApp | A short text with the phone and app versions and numbers only — no customer names or files | ☐ |
| O5 | Home → Photos (Choose from phone) → pick 3 photos from the gallery | Received shows the 3 photos | ☐ |
| O6 | Home → Passport photos → pick 1 photo | Straight to "Fit the face in the frame" | ☐ |
| O7 | Home → Documents & PDF → pick a PDF from Downloads | Ready shows its pages | ☐ |
| O8 | On Android 12 or older only: Settings → Allow screenshots for 15 minutes, then take a screenshot of a job | The screenshot works for 15 minutes, then is blocked again on customer screens | ☐ / not this phone |

## §P 4×6 photos, first start, receiving, page buttons (Phase 10c) — 20 min

On the shopkeeper's phone and the shop Brother, with your own photos only. P1 needs the 4×6 test page printed once (Settings → Print a test page → 4×6).

| # | Do this | Expect | Result |
|---|---|---|---|
| P1 | Share 2 photos → One on each page → Change → Paper → **4×6 photo paper** → PRINT on 4×6 glossy | Two 4×6 prints, the photos inside the white edges, the same as Ready; measure: not enlarged past the edges | ☐ |
| P2 | Compare P1's print quality with an A4 photo print of the same photo | 4×6 looks as good (it is sent as a document, for exact size; tell me if the Brother printed it as plain paper) | ☐ |
| P3 | Update the app on the shopkeeper's phone, open it | "Welcome to PrintSaathi · Step 1 of 4"; Next ×3 → Done; it never comes back, even after the phone's Back | ☐ |
| P4 | Share 30+ big photos from WhatsApp | "Receiving files… 12 of 30" with a bar and Cancel, then Files received by itself; Back only leaves the screen (the photos still arrive) | ☐ |
| P5 | On the shopkeeper's phone: Home | No "No printing app on this phone" warning (the Brother plugin or Mopria is installed) | ☐ |
| P6 | A job with 5 pages on Ready: tap Next a few times, then scroll by hand | The buttons stay at the top on a normal text size; "Page k of 5" follows the scrolling | ☐ |
| P7 | Recent jobs | Each job shows its first photo; a printed job has Print again | ☐ |
| P8 | Send a Word file from WhatsApp | "Office file: can't be printed yet. Ask for a PDF." | ☐ |

## §Q Can the shopkeeper do it alone? (Phase 11) — 45 min per person

Use the printable kit `docs/qa/shopkeeper-session.md`: the six customer requests, what to note, and the pass rule (5 of 6 alone, tap targets met). Do it with the shopkeeper, then with 1–2 other seniors if you can. Send me the filled sheet; every confusing step becomes a fix.

| # | Do this | Expect | Result |
|---|---|---|---|
| Q1 | The shopkeeper's session (kit) | ≥ 5 of 6 alone; taps 2 · 2 · 2 · 3 · 1 | ___ / 6 |
| Q2 | Senior 2 (kit) | as Q1 | ___ / 6 |
| Q3 | Ask the shopkeeper: English or Marathi/Hindi? | Decides PLAN §H5 | ______ |

## §R Install on the shopkeeper's phone and the two-week trial (Phase 12)

Follow `docs/INSTALL.md` first: key backup, build, install, set-up. Then use the shop normally for two weeks and keep a short log.

| # | Do this | Expect | Result |
|---|---|---|---|
| R1 | Back up `C:\Users\<you>\.printsaathi\` (USB stick + private cloud) | Two copies of the key folder | ☐ |
| R2 | `npm run android:release`, then `node scripts/device/install.mjs --release` with the shopkeeper's phone connected | "Release APK OK…", then "Success"; PrintSaathi opens with the first-start steps | ☐ |
| R3 | INSTALL.md §4 set-up (printing app, test pages A4 + 4×6, pin, settings, screen lock) | Home shows no printer or printing-app warning | ☐ |
| R4 | Two weeks of real use: each day note anything that went wrong (what the shopkeeper was doing, what the screen said) and send a problem report for it | A log with dates; ideally "nothing blocking" | ☐ |
| R5 | At the end: send me the log and the reports | Fixes planned from them | ☐ |

## §S Aadhaar & ID card copy on paper (Phase 14) — 20 min

You need: the shop printer with A4, a ruler, **your own** Aadhaar card (or PAN / voter ID) and **your own** e-Aadhaar
PDF (never a customer's). Photograph the card's front and back on the shop counter, at a slight angle, as a customer
would; send both photos to yourself on WhatsApp.

| # | What to do | What to check | Result |
|---|---|---|---|
| S1 | Share both photos to PrintSaathi → **ID card copy** | "2 ID cards found"; each card straight (no table showing), Front = the side with your photo | ☐ ☐ |
| S2 | If a card looks wrong: **Fix corners** → drag the dots (or Next dot + arrows) → Done | The straightened card under "How it will print" follows the dots | ☐ ☐ |
| S3 | **Card copy → Real card size → PRINT** (change nothing on Android's screen) | Ready says "ID card · real size · A4 · Colour · 1 copy" | ☐ ☐ |
| S4 | Measure each printed card with the ruler | **85.6 mm wide, 54.0 mm tall (±0.5 mm)**; thin cut lines around each | ☐ ☐ ____ × ____ mm |
| S5 | Share your e-Aadhaar PDF → **ID card copy** → type the password (first 4 letters in CAPITALS + year of birth) | "2 ID cards found" from the PDF's two panels; front = the panel with your photo | ☐ ☐ |
| S6 | Try **Big size** and **Many copies** once each | Big: both sides twice as big; Many copies: sets in rows with cut lines | ☐ ☐ |
| S7 | Photograph one card on a busy cloth or wood table | Found, or "Check the corners" / Fix corners opens — never a wrong card printed without you seeing it | ☐ ☐ |
| S8 | Let the shopkeeper do S1 + S3 alone with your card | Did they manage alone? Where did they hesitate? | ☐ alone ☐ help: ____ |

Please also note: how many of your real card photos were found without Fix corners (the generated test set says
96 % on clear tables; real photos are the real test).

## §T Photos sent sideways (Phase 15) — 10 min

| # | What to do | What to check | Result |
|---|---|---|---|
| T1 | Photograph a typed letter lying flat on the table (the phone often gets the way up wrong); share it | Received says "Turned 1 photo upright." and the photo shows upright | ☐ ☐ |
| T2 | Tap **Undo** | The photo goes back as it came | ☐ ☐ |
| T3 | Share a photo of a person taken sideways | Turned upright (by the face) — or left alone; never turned the wrong way | ☐ ☐ |
| T4 | Share 3 ordinary photos (already upright) | No note; nothing turned | ☐ ☐ |

## §U The new look on the shopkeeper's phone (Phase 13) — 5 min

| # | What to do | What to check | Result |
|---|---|---|---|
| U1 | Open PrintSaathi, go through a photo job | Screens slide in quickly; nothing feels slow or jumpy; buttons react at once when pressed | ☐ ☐ |
| U2 | Phone Settings → Accessibility → "Remove animations" on, then open PrintSaathi | No sliding at all; everything still works | ☐ ☐ |
| U3 | Print 6 photos on one page (as in §H) | It feels as quick as before the new look (the emulator measured ≈ 0.25 s more to make the file while the spinner turns) | ☐ ☐ |

## §V Medium size, new logo, splash, card source, picked photos (Phase 16) — 10 min

| # | What to do | What to check | Result |
|---|---|---|---|
| V1 | Look at the phone's home screen and app list | The new PS printer icon (blue printer, orange paper); with themed icons on, a one-colour PS printer | ☐ ☐ |
| V2 | Close PrintSaathi fully, then open it from the icon | The printer appears, a sheet feeds in, a page comes out, the name appears, then Home. No white or empty screen in between; it does not feel slower than before | ☐ ☐ |
| V3 | On the curved screen, scroll Home and a few screens | Card borders and buttons are fully visible on both sides; text and buttons feel medium (not too big) | ☐ ☐ |
| V4 | Look at Home | Four tiles, then "Continue the last job" below them | ☐ ☐ |
| V5 | Tap **Aadhaar & ID cards** | It asks "Where is the card?"; **Photos of the card** opens the gallery (pick up to 2); **e-Aadhaar PDF or file** opens the file manager | ☐ ☐ |
| V6 | **Photos** → pick a photo that is sideways in the gallery | It shows exactly as in the gallery; no "Turned" note | ☐ ☐ |
| V7 | Phone Settings → Accessibility → "Remove animations" on, then open PrintSaathi | No splash animation; the app opens straight | ☐ ☐ |

## §W Passport photos: fit the face, border, custom size (Phase 17) — 15 min

| # | What to do | What to check | Result |
|---|---|---|---|
| W1 | Passport photos → pick a photo → "Fit the face in the frame" | Pinch to zoom and drag to move the photo under the still frame; the Zoom and Move buttons do the same | ☐ ☐ |
| W2 | Next → Ready → print on 4×6 photo paper | 5 photos, each with a thin black border (1½ pt). Ruler: **35 × 45 mm ± 0.5 mm**, border included | ☐ ☐ |
| W3 | Change → Border → 3 pt, then No border | A thicker border; with No border, thin cut lines between the photos instead | ☐ ☐ |
| W4 | Settings → Passport photos → Size → Custom size 34 × 42 mm; make a passport job and print | Ruler: 34 × 42 mm ± 0.5 mm | ☐ ☐ |
| W5 | Custom size 70 × 90 mm | Ready says the photos go on A4 paper (too big for 4×6) | ☐ ☐ |

## §X Adjust on every preview, paper direction, print speed and quality (Phases 18–19) — 25 min

| # | What to do | What to check | Result |
|---|---|---|---|
| X1 | Share 6 photos → All on one page → **Adjust photos** → photo 1 → **Bigger** 3 times (or drag its round corner) | The screen shows its size in cm; the others move to page 2 when it no longer fits. Print: ruler on photo 1 = the size shown ± 1 mm | ☐ ☐ |
| X2 | On Adjust: Turn, Crop, Move earlier, Move later, Remove then Undo | Each does what it says on the preview, and the print matches | ☐ ☐ |
| X3 | On Ready, tap a photo on the page | Adjust opens with that photo chosen | ☐ ☐ |
| X4 | One on each page → Adjust → crop and turn one photo | Only that photo changes | ☐ ☐ |
| X5 | A PDF → Adjust pages → page 2 Smaller twice (90 %) | Page 2 prints smaller, centred; page 1 unchanged | ☐ ☐ |
| X6 | Aadhaar & ID cards → photos of a card → Adjust → Bigger | The card prints at the size shown | ☐ ☐ |
| X7 | Change → Paper direction → Landscape | Preview and print are sideways; a new photo job starts Portrait again | ☐ ☐ |
| X8 | Print 6 photos on A4 in colour; time from the print button to paper out. If the old version is still at hand, compare | As fast or faster than before (jobs are now sent as documents) | ☐ ☐ |
| X9 | Change → Print quality → Best photo quality; print the same page | Note whether it looks better and how much slower it is | ☐ ☐ |
| X10 | A photo received on WhatsApp (sent as a photo, so about 1600 px) → One on each page → print; compare with the photo on the phone | Same sharpness and colours as the original: no visible loss. This photo goes into the print as it is (a 12 MP camera photo is first reduced to what A4 needs, so it would not test this) | ☐ ☐ |
| X11 | Copy `tests/fixtures/prog-small.jpg` from this repository to the phone (WhatsApp it to yourself as a document) → One on each page → print | It prints whole, with the right colours. It is a "progressive" JPEG, also put in as it is: this proves the shop printer's path reads such photos. If it prints wrong or blank, tell the person who set up the app (the fix is one line) | ☐ ☐ |

## §Y Place anywhere, scanner crop, Word margins, Add photos, whole logo (Phases 20–24) — 30 min

| # | What to do | What to check | Result |
|---|---|---|---|
| Y1 | Open the app from the launcher a few times | Android's splash and the app's splash both show the **whole** logo (paper, PS printer, tray) from the first moment; nothing feeds in from nothing; the logo never blinks or fades between them; it does not feel slower than 1.0.203 | ☐ ☐ |
| Y2 | Share 4 photos → All on one page → print on A4. Ruler from the paper's top-left corner to the first photo | 12.7 mm (Word's Narrow) ± 1 mm; the photos start top-left. Settings → Margins → Normal: 25.4 mm | ☐ ☐ |
| Y3 | Photo list → **Add photos** → From the gallery → 2 photos; then Adjust → Add photos → From the file manager | The photos join the job at the end, no "New files arrived" question; back where you pressed Add | ☐ ☐ |
| Y4 | Photograph a page lying on a table at an angle → share it → Print as document → Crop → drag the four corners onto the page's corners (use the magnifier) → Done → print | The page prints flat and straight, sharp; Cancel, Whole photo, Turn left and Turn right do what they say | ☐ ☐ |
| Y5 | Adjust: press and hold a photo, drag it anywhere, let go; try near the page's middle and another photo's edge | It lifts after about half a second, follows the finger, snaps to the guide lines, stays inside the margins; the page does not scroll while it is held; a quick swipe still scrolls | ☐ ☐ |
| Y6 | Adjust: drag a photo's side pill in, then print | That side is cut off, the rest prints the same size; the round corner still resizes. The pills are easy to grab on your phone | ☐ ☐ |
| Y7 | Home on your phone: look at the tiles' edges at the curved sides; scroll Home | Every card's edge is clearly visible; the PrintSaathi bar stays at the top while Home scrolls | ☐ ☐ |
| Y8 | Aadhaar photo (front only) → ID card copy → **Add the back side** → gallery → the back photo → Card copy → Real card size → print | Front above back on one page; with two sides, **Print front only** prints the front alone (Undo brings the back) | ☐ ☐ |
| Y9 | Passport photos → Fit the face | Zoom out is on the left, Zoom in on the right | ☐ ☐ |
| Y10 | Adjust on an ID card copy, a passport sheet and a PDF page: drag the round corner out and in, then print | Each one grows and shrinks as you drag, in the same steps as Smaller / Bigger, and prints at the size shown | ☐ ☐ |

## §Z Card edges, the back side, side bars, passport count, colour, big preview, turn to any angle (Phases 25–28) — 25 min

| # | What to do | What to check | Result |
|---|---|---|---|
| Z1 | Home, Settings and Recent jobs on your phone: look at the left and right edges of the tiles and cards | Every card's edge shows on the left, the right and the top, also at the curved sides; nothing is cut off | ☐ ☐ |
| Z2 | Home → Aadhaar & ID cards → Photos of the card → pick the front photo from the gallery → **Add the back side** → Photos of the card → pick the back photo | "2 ID cards found": front and back (the back is no longer lost); Card copy → Real card size prints both | ☐ ☐ |
| Z3 | Any crop: a photo's Crop, a page's Crop, an ID card's **Fix edges** | No corner circles; only the bars in the middle of each side. Dragging a bar moves that side straight in or out; the arrows move the chosen side; Start again puts the frame back | ☐ ☐ |
| Z4 | Passport photos → Change → How many photos? → type **40** → Done | Ready says 2 sheets; the print has 30 on the first A4 sheet and 10 on the second (on 4×6 paper: as many sheets as needed). Typing 0, 101 or letters says "Type a number from 1 to 100." | ☐ ☐ |
| Z5 | Start any new job (photos, a PDF, passport, ID card) | Ready shows **Colour** chosen. Tap **Black & white**: the preview turns grey and it prints grey; tap **Colour**: back to colour. One tap each | ☐ ☐ |
| Z6 | Adjust on photos, a PDF page, a passport sheet and an ID card copy, on your phone | The page is big (edge to edge); the tools are one row at the bottom that slides sideways; Done is always there | ☐ ☐ |
| Z7 | Adjust a photo: press the round handle above it and move your finger around the photo; let go. Then Tilt left / Tilt right; print | The photo turns with your finger and shows the angle (e.g. "10°"); near straight it clicks straight; Tilt left / right turn it 1° a tap; it prints at that angle, as sharp as before, inside the margins | ☐ ☐ |

## §AA ID card crop and turns, Change photo, smaller tools and zoom, pages side by side, the two questions, colour at the top, paper type (Phases 29–32) — 25 min

| # | What to do | What to check | Result |
|---|---|---|---|
| AA1 | Any job → Ready to print | **Colour \| B&W** sits next to the title "Ready to print". One tap on B&W turns the preview grey; one tap on Colour turns it back | ☐ ☐ |
| AA2 | Home → Aadhaar & ID cards → Photos of the card → pick the front photo, then add the back photo (a real card photographed at the counter) | Each side opens its own crop screen first ("Front of the card", then "Back of the card"), with a card-shaped frame. Move the side bars onto the card's edges, tap Done: "2 ID cards found" | ☐ ☐ |
| AA3 | On the cards screen: **Change photo (Front)** → From the gallery → another photo | Its crop screen opens; after Done, the new photo is the front and the back is unchanged. Closing the gallery without choosing changes nothing | ☐ ☐ |
| AA4 | A card that stands up (a vertical ID): **Turn right** or **Turn left** on it → Card copy → Real card size → print | It turns a quarter each tap, both ways; it prints standing, 5.4 × 8.56 cm by the ruler, the other side lying as before | ☐ ☐ |
| AA5 | Adjust on photos, a PDF page, a passport sheet and an ID card | The tools at the bottom are smaller (about the size of a fingertip) and still easy to tap. **Zoom in** / **Zoom out** make the page bigger and smaller (100 % to 400 %, shown as "Page 1 of 2 · 200 %"); two fingers on the page zoom too; while zoomed a finger moves the page; dragging a corner while zoomed is finer | ☐ ☐ |
| AA6 | Adjust on a job with 2 or more pages | The edge of the next page shows at the side. A sideways swipe, or **‹ ›** beside "Page 1 of 2", brings the next page to the middle and chooses its first photo; the tools then change what you see | ☐ ☐ |
| AA7 | In any job, tap **Home** or the phone's Back where it would leave the job; then on Home press the phone's Back | "Leave this job?": Keep working stays, Leave goes to Home (the job is in Recent jobs), Delete this job removes it. On Home: "Close PrintSaathi?": Stay keeps the app, Close the app closes it | ☐ ☐ |
| AA8 | Home | No "Customer sent files on WhatsApp?" card; Help still explains sharing from WhatsApp | ☐ ☐ |
| AA9 | Change → **Paper type** → Glossy photo paper → print on glossy paper on the Brother | A yellow line says "Put glossy photo paper in the printer."; the button says PAPER LOADED — PRINT. On Android's print screen, choose the glossy paper setting yourself (Android cannot set it) | ☐ ☐ |

## §AB Copy / Cut / Paste and the + mark, pages by ‹ › only, zoom, ID cards placed by hand and side by side, PRINT after Back, deleting jobs (Phases 33–36) — 25 min

AB3 replaces AA6's "a sideways swipe": pages now move with ‹ › only (owner, round 5).

| # | What to do | What to check | Result |
|---|---|---|---|
| AB1 | 4 photos → All on one page → Adjust photos | No grey hint line under "Photo 1 of 4" | ☐ ☐ |
| AB2 | On Adjust: choose a photo → **Copy**; tap an empty spot on the page (a **+** mark appears, "Paste goes to the + mark."); **Paste**. Then **Cut** another photo, go to another page with **›**, **Paste** | The copy appears centred on the + mark, the same picture, size and turn; the cut photo appears on the page you went to. Paste twice makes two copies. Recent jobs still says the number of files the customer sent | ☐ ☐ |
| AB3 | Adjust on a job with 3 or more pages: slide a finger sideways over the page, then tap **›** and **‹** | Sliding does nothing; ‹ › change the page at once, with no slide | ☐ ☐ |
| AB4 | Anywhere in the app outside Adjust (Home, Ready, Settings): put two fingers on the screen and spread them | Nothing zooms. **Please tell me where you saw zoom on 1.0.252** (which screen, and how); I could not make it happen | ☐ ☐ |
| AB5 | ID card copy → Real card size → **Adjust cards**: press and hold the back card, drag it, let go; then **Move left / right / up / down**, then **Automatic** | The card follows your finger and stays where you let go, and prints there; Move moves 2 mm a tap; Automatic puts both cards back | ☐ ☐ |
| AB6 | On Adjust cards: **Side by side**, print; then **Top and bottom** | Side by side prints front and back next to each other in one row (Big size too); Top and bottom (the default) prints them one under the other | ☐ ☐ |
| AB7 | Ready → **PRINT** → on Android's print screen press the phone's Back (or the X) without printing | Ready shows **PRINT** again at once (no "Opening the print screen…"), and PRINT works the first time you tap it. **On your Brother's print screen and your phone**, check this too: a print that really went must not be offered as "not sent" | ☐ ☐ |
| AB8 | Home → Recent jobs → **Delete** on one job → Delete; then **Delete all jobs** → Delete all | Each asks once; the job (or every job) disappears from the list and from Home. Old jobs are also deleted by themselves 1 day after they were last used (Settings → Delete customer files after) | ☐ ☐ |

## §AC Undo / Redo, Bring to front / Send to back on Adjust (Phases 37–38) — 10 min

| # | What to do | What to check | Result |
|---|---|---|---|
| AC1 | Photos → All on one page → Adjust photos: press and hold a photo, drag it over another; then tap **Undo**, then **Redo** | **Undo** and **Redo** are the 3rd and 4th tools (after Zoom). Undo puts the photo back where it was; Redo puts it where you dropped it. Both are greyed out when there is nothing to undo or redo | ☐ ☐ |
| AC2 | Do several things (Bigger, Turn, Remove, Copy then Paste, a crop), then tap **Undo** again and again | Each tap takes back one change, newest first, up to 50. After an Undo, any new change clears Redo (as in Word) | ☐ ☐ |
| AC3 | Make a change on Adjust, tap Done, then on Ready tap **Black & white** (or Change something), then Adjust again | Undo is greyed out: a change made outside Adjust is never taken back | ☐ ☐ |
| AC4 | Make a change, tap Done, open Adjust again | Undo still works for what you did before (until you change something elsewhere) | ☐ ☐ |
| AC5 | On a computer keyboard (a tablet with one): Ctrl+Z, Ctrl+Y | Undo and Redo | ☐ ☐ |
| AC6 | Drag one photo over another. With the top one chosen tap **Send to back**; then with the other tap **Bring to front** | The photo goes under (or over) the one it covers, on screen and in the print. The buttons are greyed out when the chosen photo covers nothing, or is already where the button would put it | ☐ ☐ |
| AC7 | ID card copy → Real card size → Adjust cards: drag the cards over each other, then **Send to back** / **Bring to front** | The same for the two cards | ☐ ☐ |

## Decisions only you can make

| Topic | Choice | My recommendation |
|---|---|---|
| **ADR-001** PDF writer | **Decided 2026-10-17:** accepted | — |
| **ADR-002** locked PDFs on old phones | **Decided 2026-10-17:** accepted, option (i) built in Phase 7 | §D6 shows whether the shopkeeper's phone uses it |
| **ADR-003** iPhone (HEIC) files sent as documents | **Decided 2026-10-17:** option C kept (A and B were hard stops) | — |
| Language | from §E (English is the V1 source until then) | — |
| Photo pages over 3 MB (§H4) | **Decided 2026-10-17:** A, keep full quality | — |
| Retention | **Decided 2026-10-17:** 1 day by default, changeable | — |

(All of these are in `docs/decisions/owner-decisions-2026-10-17.md`.)

Files:
- `docs/decisions/ADR-001-pdf-writer.md`
- `docs/decisions/ADR-002-pdf-engine.md`
- `docs/decisions/ADR-003-engine-process.md`
