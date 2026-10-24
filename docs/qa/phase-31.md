# Phase 31: closure report ("Leave this job?", "Close PrintSaathi?", Home without the WhatsApp card)

**Spec:** `docs/superpowers/specs/2026-10-24-round-4-cards-zoom-pages-leave-design.md`, parts 31a–31c.
**Plan:** `docs/superpowers/plans/2026-10-24-phase-29-32-round-4.md`, Tasks 1 and 2.
**Owner decisions:** `docs/decisions/owner-decisions-2026-10-24.md`, rows 29–31.

**Commits:**
- 5c38d4f: ask before leaving a job or closing the app.
- fff1c50: Home without the WhatsApp card.
- 8608a38: the whole-branch review fixes C2, I1, M1, M3, and the sheet width.
- c9b0774: the round-4 device smoke.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check on the owner's phone (USER-CHECKLIST):
- §AA7: the two questions.
- §AA8: Home.

## What Phase 31 delivers

**31a: "Leave this job?" (item 6).** When Back or Home would leave an unprinted job, a sheet asks:
- **Keep working** stays on the job.
- **Leave** goes back, and the job waits in Recent jobs.
- **Delete this job** removes it, going Home first so a second tap never lands on PRINT.

When it does not ask:
- Back inside the job never asks.
- A printed job never asks.
- Cancel while photos or the print file are being made is already a choice to leave.
- "New files arrived" never asks: its Delete would remove the previous customer's job.

The question is decided at once, even while the phone's engine is making a print file. It never waits on the engine's one queue (review C2). While the question is open, a screen's own next step goes on, for example a print sent becoming its result, and the question gives way (review I1).

**31b: "Close PrintSaathi?" (item 7).** Back on Home asks: **Stay** or **Close the app**.

**31c: Home (item 8).** The "Customer sent files on WhatsApp?" card is gone. Help still explains sharing from WhatsApp.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Which steps leave a job: Back from its first screen, Home from any of its screens; never within the job, after printing, after a Cancel, or from New files arrived | PASS | guard.test 11 (10 RED first; New files arrived RED first) |
| Keep / Leave / Delete; Back while asked = Keep working; a share arriving closes the question (Review Focus 1); Delete removes it from Continue and Recent jobs (Review Focus 2); Home asks Close PrintSaathi? | PASS | leave.spec (8, RED first) |
| With the engine busy: Back asks at once, Cancel leaves at once, Delete goes Home at once | PASS | leave.spec "with the engine busy" 3, with the test engine's one-queue mode (RED first) |
| PRINT, then Back before the print screen closes: the result still comes and the job counts as printed | PASS | leave.spec (RED first) |
| The question fits a 320 px phone at 100 % and 200 % text and a phone on its side; every answer reachable, 56 px or more | PASS | leave.spec 3 (RED first: the sheet was 48 px wider than the phone) |
| Home has no WhatsApp card; Help still explains sharing | PASS | shell-screens.test (RED first) |
| Device: no WhatsApp card; Back on Home asks, Stay stays; Home in a job asks, Keep working stays on Ready; Back inside the job does not ask; Back out of the job asks; Leave → Home with "Continue the last job" | PASS | round4-smoke API 35: `homeHasNoWhatsAppCard`, `backOnHomeAsksAndStayStays`, `leavingAsksKeepWorkingStays` |
| How the questions feel on the owner's phone | PENDING (owner) | USER-CHECKLIST §AA7–AA8 |

## Coverage statement

**Proven:**
- The guard's rules by unit tests.
- The questions by e2e, including the engine being busy (one queue, like the phone) and a print finishing while asked.
- The device flow through Android's own Back key on an API 35 emulator.

**Not proven:**
- The Close the app choice on the owner's phone's launcher, which minimises the app as Back on Home did before.
- A share arriving at the very moment a question is open, on a real phone. This is proven in e2e only.
