# Phase 11 — closure report (accessibility & UX validation, automatable part)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-11-accessibility-ux.md`.

**Commits:**
- ce98fbc contrast audit;
- 217a6b9 tap counts, screen-reader and keyboard checks, wording, session kit;
- c612681 TalkBack journeys;
- cddd7b9 gate-review fixes;
- 1d89773 journey test waits for the share (API 36 race);
- the closure commit.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** The PLAN exit, "The shopkeeper ≥ 5/6 tasks alone", needs the sessions in USER-CHECKLIST §Q.

## What Phase 11 proves, and how
- **Contrast (PLAN §H1, §U).** Every colour pair in the token table is measured from the stylesheet. Text is at least 7:1 (WCAG AAA), including:
  - labels on the grey desk;
  - the Delete label;
  - a pressed tile.

  axe's AAA rules run on every screen, at every viewport, at 100 % and 200 % text. No raw colours are allowed in styles or screens.
- **Taps (PLAN §A2).** Each journey's sequence reaches the print within the plan's count, counted by the page:
  - J1, J2 and J3: 2 taps;
  - J4: 3;
  - J5: 1;
  - from Home: 4 / 4 / 3.
- **Screen reader and keyboard,** on every screen at 360 px / 100 % and 320 px / 200 % text:
  - one title, and focus starts on it;
  - controls are read top to bottom (the PRINT bar last, in order inside it);
  - from Back to the last control, a focus ring that is drawn, not clipped and not hidden under a pinned bar.
- **TalkBack (PLAN §U "TalkBack completes J1 and J5").** With TalkBack running on Android 15, both journeys reach Android's print screen. Each step:
  1. finds the control by its spoken name;
  2. brings it on screen;
  3. gives it accessibility focus;
  4. clicks it through the accessibility API.

  The test puts the phone's accessibility settings back exactly.
- **Wording (PLAN §H2.12).**
  - No sentence over 20 words and no unusual long words.
  - The jargon lint as before.
  - The 20 longest sentences are kept for a human read.
- **Shopkeeper session kit** (`docs/qa/shopkeeper-session.md`): the six core tasks as a customer says them, tap targets, what to note, and the pass rule.

## Found and fixed

| Where | Problem | Fix |
|---|---|---|
| Fields, tick boxes | Only the browser's thin 1 px focus ring | The same thick ring as buttons |
| Photo buttons | Focus ring clipped away by the photo's box | Ring drawn inside |
| Photo/page tools, frames | Keyboard focus stopped under the pinned PRINT bar (WCAG 2.4.11) | Pinned bars keep their height clear (scroll padding) |
| Pressed tile | Helper text 6.9:1 | Lighter background and a blue outline |
| Wording | "closed unexpectedly"; two sentences of 21 and 23 words | Plain words; split |
| Unlock tests | Timed out once on a busy PC | 20 s limit, assertions unchanged (ruled) |

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Automated | tokens.test, wording.test, e2e matrix with AAA, tap counts, screen reader and keyboard (88 screen checks) |
| Device | AccessibilityJourneyDeviceTest on API 35 (`docs/evidence/phase-11/2026-10-17/`), and in the regression on every level |
| Adversarial | Gate review: 0 Critical, I1–I6 Important (all fixed, focus checks red first), M1–M10 Minor (fixed, ruled or deferred: ledger) |
| Final regression | See below |

## Rulings
- **TalkBack is driven through its accessibility calls, not its gestures.** On the emulator, injected touches (adb input, the emulator console) bypass TalkBack, and raw input events are blocked by SELinux. Cost if wrong: TalkBack's own gesture recognition is unproven. The shopkeeper does not use TalkBack.
- **The WebView ignores accessibility clicks unless a screen reader runs** (Chromium). The test therefore runs with TalkBack on.
- **"Every error panel says what to do" is not a structural check.** Panel titles are built at run time; each message's next step is asserted in the message, print-result and e2e tests.
- **Unlock tests have a 20 s limit** for CPU-heavy decryption. They take 0.24 s alone and 5.1 s beside a Gradle build.

## Deferred minors (none affects what prints)
- **M2:** axe's "incomplete" contrast results (text over photos) are not inspected.
- **M3:** the wording check reads only the string catalogue, and its syllable count is rough.
- **M5:** the title is read after Back.
- **M7:** not yet checked automatically:
  - reduced motion;
  - spoken progress on a device;
  - photo names ("1 of 7" with no "photo");
  - button width;
  - the PRINT bar scrolling at 200 % on 320 px.
- **M10:** alert and status roles are guaranteed only by the Panel component.

## Coverage statement
**Proven (PC and emulators):** everything under "What Phase 11 proves".

**Not proven:**
- The shopkeeper and two seniors doing the six tasks alone (USER-CHECKLIST §Q1–Q2).
- The shopkeeper's language preference (§Q3).
- A real TalkBack user's gestures.
- Text size and contrast on the shopkeeper's actual screen in shop light.

## Final regression (`cddd7b9`, then `1d89773`; `docs/evidence/phase-11/2026-10-17/`)
- **`regression-final/`** (cddd7b9):
  - API 24 / 28 / 30: 59 passed, 0 failed, 6 skipped (the two screen-reader journeys skip there: those images show the WebView gate);
  - API 35: 65 / 0 / 0;
  - API 36: 64 / 1 / 0.
- **The API 36 failure was in the new test, not the app.** J5's share arrived while J1's job was open. The app asked "New files arrived", but the test took the old screen for the new one.
- **Fixed in 1d89773:** the test now waits for the screen to change. Re-tested:
  - the class twice on API 36: 2/2 both (the second run answers "Start a new job");
  - the full levels again: API 36 65 / 0 / 0 (`regression-api36-rerun/`) and API 35 65 / 0 / 0 (`regression-api35-rerun/`).
- **Every level:** share 15/15, render check PASS, privacy hits 0. Accessibility settings are put back after the journeys.
- **Crash buffers:** the isolated engine only (Android 7's PDF library on fuzz PDFs, and API 36's deliberate tests, both contained), the WebView renderer killed on purpose, and one Google Play services crash at boot (API 35). No PrintSaathi app-process crash.
- **PC side:** lint (0 errors), typecheck, vitest 303, e2e 1152, script tests, Android lint + JVM.
- **What a screen reader finds before each step:** `screen-reader-steps-api36.txt`.
