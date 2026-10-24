# Phases 29–32: every ruling made during the build, and the deferred minors

This is copied from the executor's ledger, a scratch file that is not kept, so no decision taken on the owner's behalf is lost.
Each line gives what was decided, why, and what it costs if it is wrong.
- **Spec:** `docs/superpowers/specs/2026-10-24-round-4-cards-zoom-pages-leave-design.md`
- **Plan:** `docs/superpowers/plans/2026-10-24-phase-29-32-round-4.md`
- **Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 24–34.

## Rulings

### Task 1: "Leave this job?" and "Close PrintSaathi?"
- **The app's own moves never ask.** Intake routing, safe start and Receiving giving way use an unguarded move. Only the shopkeeper's Back and Home ask. Cost if wrong: none, because those moves were never a choice to leave.
- **Received's Cancel while photos get ready is an explicit leave.** Asking after it would strand a cancelled screen. Cost if wrong: one fewer question after a Cancel.
- **Back from a job opened by Start a new job asks too.** It leaves the new job's screens, which is consistent with the spec. Cost if wrong: one extra answer.
- **Test changes follow the owner's new behaviour; no check was weakened:**
  - 20 existing shell.spec steps and 2 screen-map routes now answer Leave.
  - "Ten quick taps on Back" now stops at the question.

### Task 2: Home without the WhatsApp card
- **The `.hint-card` style is kept.** Settings' price section uses it. Cost if wrong: none.

### Task 3: Colour | B&W next to "Ready to print"
- **The title is 20 px instead of 24 px when it has a control beside it.** That way the title and the toggle fit on one line on a 360 px phone. Cost if wrong: a slightly smaller title on Ready.

### Task 4: Paper type
- **The glossy reminder is not shown on top of the 4×6 photo-paper reminder.** The 4×6 reminder already says to load photo paper. Cost if wrong: one fewer line on 4×6.
- **Change, its choice screens and Paper type now load the first time they open.** Round 4's shell work pushed the startup JavaScript to 62,091 B, over its 61,440 B budget. Cost if wrong: a short load the first time Change opens.
- **The e2e selectors for "Paper" now skip "Paper type" too.** This is a selector change, not a weakened check.

### Task 5: ID cards turn a quarter at a time
- **Turning a card keeps an optional step, which defaults to a half turn.** The existing Turn upside down button worked until Task 6 replaced it. Cost if wrong: none.

### Task 6: Crop each side, Change photo, Turn left and Turn right
- **The crop screen is titled by side ("Front of the card", "Back of the card"), also when opened from Fix edges.** This is clearer than "Fix the edges". Cost if wrong: a title.
- **A changed photo opens only its own side's crop screen**, with no chain to the other side. Cost if wrong: none.
- **121 existing card-flow e2e steps now pass through the crop screens**, through a helper. This is the owner's new behaviour, not a weakened check:
  - The tap counts became 4 → 6 (ID card copy) and 6 → 8 (from Home).
  - Adjust's card Turn is now a quarter turn.
- **A false positive in the jargon check was avoided by renaming a variable.** It read `=> … <` as screen text. The check itself is unchanged.

### Task 7: Smaller tools on Adjust
- **The tools are 56–64 px tall, not 56–60.** Every row has a two-word label that takes two lines at 72 px, plus a 2 px border, so 64 is the floor for two lines. Cost if wrong: 4 px.
- **Adjust's card tool says "Swap sides"; the cards screen keeps "Swap front and back".** No tool then needs three lines. Cost if wrong: a shorter word.

### Task 8: Pages side by side on Adjust
- **The next and previous pages show about 10 px at the sides.** The page is then at least 90 % of a phone's width, the round-3 rule. The plan's spacing would have made it 86 %. Cost if wrong: a slimmer peek.
- **The strip leaves room above and below the pages that lets taps through to the line above.** The round-3 turn handle above a photo at a page's top is then never cut off by the sliding strip, and taps still reach ‹ ›. Cost if wrong: none seen; 5 rotate tests failed without it.
- **At rest on a page without the chosen photo, the first photo on that page is chosen.** This applies after a swipe or after ‹ ›, so the tools never change a photo the shopkeeper cannot see. Copies (passport photos, card sets) keep their choice. Cost if wrong: one tap to choose another photo.
- **A slide the app starts never chooses a photo.** Under load a smooth slide paused for more than 150 ms and the rest timer chose another photo. The full suite found this and it was root-caused. A touch, the mouse wheel or a key on the strip hands control back.
- **‹ › are a fixed 56 px**, so "Page n of N" keeps room between them at 200 % text on a 320 px phone. They are still 56 px or more to touch.
- **A document's pages now show their pictures on Adjust.** They were grey boxes before round 4, because Adjust never asked the engine for them. The owner asked to "see all pages content". Only the page in the middle, its neighbours and the chosen page are drawn (PLAN §P). Cost if wrong: none.
- **The page in the middle is the keyboard's stop.** The accessibility checker requires a sliding area to be reachable by keyboard, and making the strip itself the stop would break the reading order. Cost if wrong: one more Tab stop on jobs with several pages.
- **A finger swipe is proven on the device, not in e2e.** Headless Chromium does not scroll for a synthesized touch, not even the tool row. The e2e tests slide sideways over the photo with the wheel instead; the finger swipe is in the round-4 device smoke.
- **Two placement tests now wait for Ready's page before measuring it.** Under load the heading shows first. This is a precondition; no assertion was weakened.

### Task 9: Zoom on Adjust
- **The % shows in the label only when zoomed.** At 100 % it says "Page n of N", as before, which is calmer. Cost if wrong: one string.
- **While zoomed, only the page in the middle shows, and the strip neither snaps nor slides to other pages.** ‹ › still move pages and choose their photo, but panning a zoomed page must not jump pages. Cost if wrong: two taps to change page while zoomed.
- **While zoomed, the strip is cut to the pages' own area.** The room above for handles would otherwise show the page over the page bar. A turn handle above a photo at a page's very top is hidden while zoomed; the Tilt buttons and zooming out remain. Cost if wrong: zoom out to use that handle.
- **Zoom goes back to 100 % when the screen changes size**, for example on rotation. The 100 % sizes it is measured from no longer hold. Cost if wrong: zoom again.
- **A two-finger pinch is proven by e2e only.** The test drives the touch handler with two points; adb input has one finger. This is listed as not proven on the device.
- **The page label is said aloud on one-page jobs too**, because zoom changes it.

### Final review and the device run
- **M1 was re-graded from Minor to Important by its effect.** A double tap on "Delete this job" landed on PRINT for the job being deleted. Now Home comes first, then the delete. Cost if wrong: none.
- **M3 was re-graded from Minor to Important by its effect.** Home, then Delete, on "New files arrived" deleted the previous customer's job. New files arrived no longer asks. Cost if wrong: leaving New files arrived has no question, as in 1.0.239.
- **Declined item 1, the pinch on a real phone:** a pan already started by the first finger may stop the app from taking over the move. adb input has one finger, so this is e2e only, with owner check AA5. Cost if wrong: the page scrolls a little while zooming.
- **Declined items 2, 3, 4 and 6 are harmless or intended:**
  - Setting the scroll position during a slide when zooming is harmless, because zoomed shows only that page.
  - On a phone with a fractional screen density, the app's own slide may never be marked finished. The only effect is that it doesn't choose a photo, which is by design.
  - The engine makes pictures and finds cards in its one queue, so a changed photo's shape is known.
  - Scrolling past the end of a zoomed page carries on into the screen, which is intended because it reaches the tools.
  - Cost if wrong: none seen.
- **On cards, Bigger's last step up to the most that fits can be less than 10 points**, because the plan holds the size down. Cost if wrong: one more tap.
- **The device shows the compact switch's B&W half as "B&W"**, its on-screen text, as Android's own label. The round-3 smoke now taps it by that name.

## Deferred minors (not fixed in this round)
- **M2, the guard looks only at the top screen.** Home from Problem, Receiving or Make room pushed over a job leaves the job without asking. Nothing is lost.
- **M5, the compact "B&W" half's spoken name in a browser is "Black & white".** Voice control saying "B&W" does not match it. Android shows "B&W" itself, as noted above.
- **A failed "Delete this job" is silent.** The job stays in Recent jobs.
- **Declined item 7, FixCorners' live preview.** It squashes a standing card while it is fitted, before Done reorders the corners. This predates round 4.

## For the owner to confirm
- **The question sheet's place.** "Leave this job?" rises from the bottom of the screen, with Keep working on top, then Leave, then Delete this job in red.
- **Zoomed pages.** While zoomed, the turn handle above a photo at the very top of a page is hidden. Use Tilt left or Tilt right, or zoom out.
- **Pages at rest choose their first photo.** After a swipe to another page, the tools change that page's first photo, not the one chosen before.
