# Splash hand-over without a white or empty screen — evidence (2026-10-24)

## The finding

Device check of 2026-10-23 (`../../2026-10-23/brand/device-api35/splash-cold-3.png`): on a cold start, between
Android's splash (the PS printer on the app grey) and the web splash (the same printer, animated), the screen went
**white**. The app window and the WebView were white until the page drew, about 1–1.3 s on this emulator.

## What was tried

The emulator is Medium_Tablet, API 35. Each attempt was checked on screenrecord video, 10 frames per second, sorted into
states. `handover-sequences.txt` has all runs.

1. **Grey window and grey WebView.** No white any more, but still about 1.3 s of empty grey between the two printers.
2. **Keep Android's splash until the page is visible** (`setKeepOnScreenCondition` until `onPageCommitVisible`).
   **Rejected:**
   - The callback fires before the page has drawn, so about 1.3 s of empty grey still followed.
   - Holding the first frame made the start later.
3. **The splash picture as the window background.** **Rejected:** Capacitor's SystemBars plugin repaints the window
   with that attribute read as a colour, and a picture there came out black (`rejected-window-picture-black.png`).

## What shipped

- **Before the page draws:** the page is see-through (`capacitor.config.ts` `backgroundColor: '#f3f4f600'`) over the
  splash picture, which is set as the content view's background in `MainActivity`. The printer stays where Android's
  splash drew it.
- **When the web splash is gone:** the page has drawn by then, so `PrintEngine.splashGone()` makes the WebView solid
  grey again and takes the picture away. Nothing stays drawn under the page.
- **No waiting is added.**

Results:

- `final-run3-every-0.4s.png` shows the sequence: launcher, then the printer the whole time, then the web splash, then
  the app.
- The only dip left is Android 12+'s own splash exit fade. The printer dims for about 0.2 s at the same place
  (`final-exit-fade-dip.png`).

## Tests

- `scripts/brand/brand.test.mjs` "from the splash to Home the printer stays in place": the wiring, and no splash hold.
- `tests/e2e/shell.spec.ts`: the phone is told once the splash is gone, both with and without animations.

## Not verified

- Android 7–11, where the launch window is drawn by the compat library: to be seen during the API 24 regression.
- A real phone.
