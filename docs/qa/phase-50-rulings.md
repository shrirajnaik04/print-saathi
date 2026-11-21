# Phase 50 rulings: whole-round review (round 12)

Reviewer: a fresh agent on the most capable model, read-only, on commit 3bb008d. Result: **1 Critical, 9 Important, 10 Minor**; 8 suspicions discarded by the reviewer. The fix pass is commit ad3415e (and 7a7a86b for a fault the device showed). Each fix has a test that failed first or a device check; nothing is deferred without a stated reason.

| # | Finding (shortened) | Result | Evidence |
|---|---|---|---|
| C1 | A real photo with a big rectangle in it (a printed photo, a framed picture, a screen) counted as paper: cut and put in Clean colour | **Fixed + verified.** The engine measures how paper-like the inside of the corners is (a pale sheet with print: `PageDetect.paperShare`, sent with `findPage`); under 55 % is never cut or put in Clean colour | `PaperShareTest` (JVM, 4), `papers.test` (acceptPaper and paperActions) |
| I1 | The ink saving never turned off: Whole photo left Clean colour; photos added later printed Clean colour | **Fixed + verified.** Whole photo and added photos clear it; Undo keeps it with the cuts | `ink.test` (review block) |
| I2 | ID cards printed Clean colour when a job had earlier been looked at as papers | **Fixed + verified.** `styleOf` and `styleOfPage` ignore it for ID cards; `setIdCards` clears it | `ink.test` |
| I3 | A photo the shopkeeper un-cut was cut again on Choose again | **Fixed + verified.** `job.looked`: the look happens once | `ink.test`, `papers.test` |
| I4 | The corners chain saved whatever the finder found on Next, without the paper rule | **Fixed + verified.** The chain no longer looks; it starts on what the photo has | round12.spec, `papers.test` |
| I5 | The corners screen talked about pages on every real photo | **Fixed + verified.** Chain wording: "Photo n of N", "Move the corners to cut this photo, or tap Next to print all of it." | round12.spec, device smoke screenshot |
| I6 | A damaged photo blocked the chain | **Fixed + verified.** Only photos with a picture are asked | `papers.test` (cropChain) |
| I7 | The chain replaced a box crop (Black edges, hand crop) with a finder quad | **Fixed + verified.** It starts on the box crop and only saves a change | code + round12.spec |
| I8 | A standing card got a false "stretched" warning; Card shape made a lying box | **Fixed + verified.** The check accepts both ways up (20 % slack); Card shape keeps the frame's way up | cards.test |
| I9 | Cut photos and cards were drawn from 480 px pictures (soft) | **Fixed + verified.** 1024 px in Adjust, 800 px in the crop screen | browser suite |
| M1 | Black edges? asked about photos cut to paper | **Fixed.** Skipped when the job saves ink | code |
| M2 | Print style showed the wrong mixed-colour choice for an ink job | **Fixed** (`mixedStyles`); no dedicated test | code only |
| M3 | A chosen style does not survive a colour switch for an ink job | **Proven intentional.** A colour switch resets the style to the colour's plain one (as before); an ink job's plain one is Clean colour / Sharp Black | `ink.test` |
| M4 | The chain never ran for jobs that once had passport or card data | **Fixed** (the layout decides) | `papers.test` |
| M5 | The turn knob partly covered by the top bar's touch area on centred photos | **Fixed + verified on a device.** The square starts 14 px above the edge; the stick takes no touches. (A first attempt with `pointer-events: none` made a finger scroll the page on a device: found by the round 3 smoke, reverted, 7a7a86b) | round12.spec, rotate.spec, round3-smoke, `knob/` probe |
| M6 | Resize corner moved at half the finger's speed on centred photos | **Fixed** (factor 2 where the photo grows about its middle; also placed-by-hand photos) | Adjust code, rotate/adjust specs |
| M7 | The 8 s limit was not a hard cap | **Fixed** (each look races the time left) | `papers.test` (fake timers) |
| M8 | 1536 px pictures against PLAN §F3; covers of older jobs; the PDF page cache name | **Covers and cache fixed.** The size is a deliberate owner-requested change (PLAN §F3's 640 px grid was written for "crisp on a phone grid"; the owner's "no blurry images anywhere" overrides it). The Received grid is not lazy-loaded: not measured on a low-memory phone | code |
| M9 | `acceptPaper` and `setQuad` disagreed on edges | **Fixed** (corners clamped to 0..1) | `papers.test` |
| M10 | Test gaps | **Fixed** for paperActions, cropChain, centring (centre.test), ink; **not tested:** the chain after Black edges, and the quarter-turn face check (no real faces) | see closure report |

## Other findings of the work
- **Point 5, "selection area showing the wrong direction":** the owner's photo was not available. What the code shows: the card finder measures a shape along its long sides, so a card-shaped box *inside* a card (the QR block of an Aadhaar back, about 1.5 : 1, standing) can be reported as a card; the screenshot's frame sat on that part of the card. Fixed by keeping only the outer card when one lies inside another (`pickCards`, cards.test). Not reproduced on the owner's photo.
- **Smoke scripts and the host:** round12-smoke tapped "Next point" for "Next" (prefix match); round5's paste mark looked below the photo (now above or below, whichever has room); round3's measure scrolled the page, which hid the title its offsets use. All are script faults, not app faults; each is fixed.
- **Device suite on a busy PC:** on the full run API 35 had two flaky tests (a pinch-zoom check, the dead-renderer check) and API 36 had "System UI isn't responding" plus the pinch checks; all pass when their classes are run alone (evidence in `regression/` and the closure report).

## Follow-up after the owner's photo (2026-11-21): the Aadhaar back that was framed on its QR block
The owner sent the photo and the screen (frame on the QR block and the card's right margin, "Side 1 of 4: top"). **Reproduced** by running the card finder on that photo (a throwaway JVM test; the photo is customer data and is not in the repo or the evidence).
- **Cause (proven on the photo):** all four true outline lines were found, but the true outline was thrown out. The side check subtracts edges that run 4 px inside a side (grain beside a table edge); a real card has a thick dark rim there (the bottom side counted 49 of 60 samples "inside", leaving 0.18 < 0.35), so the whole card failed and the best surviving shape was the standing QR block plus the right margin (aspect 1.54, a card shape by accident). My nesting filter could not help: the outer card was never a candidate.
- **Fix (`CardDetect.measure`):** the penalty is the lesser of the edges counted 4 px and 6 px inside. Grain shows at both distances and still counts; a rim shows at one.
- **Result on the owner's photo:** at the engine's 1024 px the whole card is found, confidence 0.94 (before: the QR block). At 860 px 0.73 (below the 0.75 "sure" line, so the frame shows for checking); the right side's top corner sits about 2 % in from the true corner, so a drag may still be needed.
- **Tests:** `CardRimTest` (3, on edge maps; RED first: the rim case failed with sides [1, 1, 0, 0]; the grain case keeps the old penalty). Corpus unchanged: clear backgrounds 231/240, two cards 38/40, card-free false cards 0/100, `PageDetectTest` green.
- **Not proven:** other photos with a different rim; the corner offset above.
