# Phase 11 evidence — 2026-10-17

## Screen-reader journeys on Android 15 (Medium_Tablet emulator, TalkBack 15 on)
`accessibility-journeys-api35.txt` — `AccessibilityJourneyDeviceTest`, 2 tests, both passed:
- **J1:** six shared photos → "All on one page" → PRINT → Android's print screen.
- **J5:** a shared PDF → PRINT → Android's print screen.

**How each step is done.** The control is found by its spoken name in the accessibility tree. It is brought on screen, given accessibility focus, and clicked through the accessibility API, the calls TalkBack makes for "swipe to it, double tap". TalkBack runs during the test; the test turns it on and off.

**What this does not prove.** TalkBack recognising a real finger's gestures. On this emulator, injected touches (`adb input`, the emulator console) bypass TalkBack, and writing raw touch events is blocked by SELinux. A person using TalkBack on a real phone stays unproven. The shopkeeper does not use TalkBack.

**Found on the way.** Without a screen reader running, the WebView ignores accessibility clicks: the same steps did nothing. This is how Chromium behaves, not an app defect: with TalkBack on, every step works.

## PC checks (in the e2e and vitest suites, every run)
- Text contrast at WCAG AAA (7:1) on every screen at 100 % and 200 % text; colour tokens measured against the PLAN §H1 table.
- Tap counts: each journey's sequence of taps (J1 2, J2 2, J3 2, J4 3, J5 1, J0 4/4/3) reaches the print, counted by the page itself. This proves these sequences are enough. It does not prove a journey never needs more: the black-edges question, the tiny-photo prompt and "New files arrived" add a tap when they appear (review M4).
- On every screen, at 360 px / 100 % and 320 px / 200 % text:
  - one title, which receives focus;
  - controls are read top to bottom (the PRINT bar last, in order inside it);
  - every control from Back to the last one shows a focus ring that is not clipped and is not hidden under a pinned bar.
- Found and fixed:
  - fields and tick boxes had only the browser's 1 px ring;
  - the photo buttons' ring was clipped away (now drawn inside);
  - keyboard focus could stop under the pinned PRINT bar on four screens (the page now keeps the bars' height clear).
- `longest-sentences.md`: the 20 longest sentences, for a human read.
- Wording: no sentence over 20 words, no unusual long words. Fixed: "closed unexpectedly" and two long sentences.
