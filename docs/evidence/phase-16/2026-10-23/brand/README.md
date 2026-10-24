# Brand v3 and splash — evidence

## In the browser (Playwright, 360 px)

- `splash-0ms.png` … `splash-750ms.png`: the web splash at 0, 200, 450 and 750 ms. The sheet feeds in, the page comes
  out, then the name appears.
- `home-360.png`: Home with the PS printer beside the name.

## On a device (`device-api35/`, emulator Medium_Tablet, Android 15, debug build of 2026-10-23)

- `splash-cold-1.png` … `splash-cold-4.png`: cold start, captured with screencap in a loop:
  1. The launcher, with the new icon in the dock.
  2. Android's own splash: the printer, without paper, on the app grey.
  3. and 4. **White** (one frame, captured twice). This is the finding fixed on 2026-10-24: see
     `../../2026-10-24/splash-handover-api35/`.
- `home-after-splash.png`: the web splash (printer, paper and name) on the app grey.
- `launcher-apps.png`: the app list, cropped to the row with PrintSaathi. The rest of the emulator's app list is left
  out on purpose.

**Not verified:** the themed (monochrome) icon was not checked on a device with themed icons switched on.
