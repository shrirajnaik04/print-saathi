# Phases 41–43: every ruling made during the build, and the findings left open

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost. Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-26-round-8-photo-gap-text-scan-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-26-phase-41-43-round-8.md`
- **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 52–56. Four questions were asked; every answer was the recommended option. The owner approved the design and asked for the round to be built to closure while away.

## Rulings

**Phase 41 (photos 1 cm apart)**
- **Older tests now describe the owner's 10 mm gap.**
  - The test that put three 6 cm photos in one row now uses 5.5 cm photos: three 6 cm photos no longer fit across A4 with 1 cm gaps.
  - Two shared plan fixtures were regenerated. A third regenerated only its formatting, so it was restored.
  - No check was weakened.
- **The device smoke for placing by hand looked for photo 3 at 104.2 mm** (where it was with 3 mm gaps). It now finds photo 3 by its row.

**Phase 42 (text messages)**
- **Page size:** Android's PDF maker takes whole points, so A4 is 595 × 842 pt (0.3 pt off). Fine for text.
- **Old PDFs are kept after Edit text or Text size,** until the job is deleted. A failed save may still point at the old file. Cost: a few small PDFs per job until retention.
- **A share that carries files ignores its text** (a photo's caption is not printed).
- **A text item records only its size, not the text file's path.** The engine finds `NNNN.txt` from the job folder and the item's number. The review showed this had a cost: Add to this job renumbered the files apart. That was fixed (I1, below), and a number now always stays with its item.
- **A text message from Home is a new job of its own:** it never joins a job through "Add photos". The same applies to scanned pages.

**Phase 43 (scanning)**
- **Clean colour's paper estimate differs from the spec's wording.**
  - What was built: cells 1/48 of the page's shorter side (at least 8 px), widened by 2 cells, never under half the page's usual paper.
  - Why not the spec's "1/8-size background as OCV Black": that one treats anything wider than a few millimetres at print size as paper. It would wash stamps and photos white, against the spec's own "keeping the colours of stamps, photos and ink".
  - Cost if wrong: a very large dark photo on a page prints lighter (never white).
  - The reviewer agreed with the reasoning and asked that the owner be told, which the round's report does.
- **The page finder reuses the ID card finder with a page's limits,** and it can measure a slanted near-square page either way up. Card results are unchanged (same tests).
- **The camera's answer decides.**
  - OK keeps the photo; anything else drops it ("Cancelled: nothing changes").
  - After Android stopped the app there is no answer, so a photo that was written is kept at the next start. Cost: a photo cancelled after the camera already wrote it, with the app stopped meanwhile, arrives as a page. It can be deleted.
- **Known limit:** if the app restarts for another reason while the camera is still open, that photo cannot be saved, and the shopkeeper takes it again.
- **The scanning screens' words load with those screens,** to stay within the start-up budget. The jargon and plain-wording checks read them too.
- **Look sets colour and style together:**
  - Clean colour and Original are colour looks;
  - Black & White, Sharp Black and OCV Black are black and white looks;
  - this is what Print style does.
- **After Retake or Scan another page, Done waits** ("Getting the photo…") until the new page opens.
- **A page's number comes from its file's name,** which is always above any number the job used. Tests check the order of pages, not "2".
- **Device proof was split in two.**
  - Android 11+ lets only a pre-installed camera app answer the app's camera request. So the test sender's fake camera cannot reach the app's screens on API 30+.
  - On API 24–29 images the app's screens do not run at all: their WebView is too old, a known limit since Phase 10.
  - The screens were therefore proven with the emulator's real camera app, and the known synthetic page through the engine's finder and the real print path.
  - No debug-only camera override was put into the app.

## Review findings

A whole-branch review (a fresh reviewer) found **0 Critical, 6 Important and 14 Minor** issues.

**Fixed and verified (each with a test that failed first):**
- **I1:** a text message added to another job (New files arrived → Add to this job) lost Edit text and Text size, because its files were numbered apart. They now keep one number together.
- **I2:** a scan job opened again from Continue or Recent jobs landed on the photo questions. It now opens Scanned pages.
- **I3:** tapping B&W and then Colour on a scan job dropped Clean colour. It now comes back to Clean colour.
- **I4:** a double tap on Scan another page or Retake opened the camera twice. The screens and the app now allow one camera at a time.
- **I5:** a text share that could not print could not be shared again for a minute. The RED run on the device is kept in `review-fixes/`.
- **I6:** Retake dropped Pages to print. Its test now follows the app's real order.
- **M5 (raised to a fix):** a camera that says it took a photo but gives none now says so: "The camera didn't give the photo. Please try again."
- **M3 (raised to a fix):** Done waits while the page is still being looked for.
- **M12:** two stale comments.
- **The reviewer's test-strength point:** the WhatsApp marks tests were also checked by a mutation (a word-edge rule removed: 1 of 8 tests fails).

**Deferred minors (left as they are, with what each costs):**
- **M1:** a typed message is lost if the engine fails after Done.
- **M2:** if making the PDF fails, Edit text keeps the new words, which do not print.
- **M4:** a page whose photo cannot be shown says "move the corners" with no frame. Retake and Back still work. "Getting the photo…" stays if an import fails.
- **M6:** a photo can be lost if the app dies in a tiny window between taking it up and recording it.
- **M7:** the marks parser:
  - a 100,000-character line of unclosed marks is slow; it stops cleanly at the 60 s guard;
  - a mark right after a Devanagari vowel sign can open mid-word.
- **M8:** Paste reads the clipboard on the screen's thread. A clip holding a file reference would paste that file read as text.
- **M9:** a retake that fails to join its job opens as a job of its own.
- **M10:** Finish on Scanned pages, opened from Ready, opens a second Ready (Back goes through both).
- **M11:** a repeated share while on Text size opens Received again.
- **M13:** emoji in a text PDF are not tested on a device. Devanagari is proven by ink only, not by eye.
- **M14:** a shared `.txt` file is refused ("ask for a PDF") now that PrintSaathi appears in the text share list.

## Open
- **Flaky unit test:** the text-direction test (round 4) timed out once at 24.7 s against its 20 s limit, while 67 test workers and an emulator ran. Its result was right (precision 1.000). It passed alone and in every later run. Recorded as a known flaky test under load.
- **Real-world checks** (USER-CHECKLIST §AE):
  - real paper photographed with the owner's phone;
  - WhatsApp's own Share of a text message;
  - the 1 cm gap measured on paper.
