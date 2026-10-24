# Android 7 (API 24, emulator ps_api24_2gb, 2 GB) — icon and splash, 2026-10-24

- `launcher-icon-api24.png`: the launcher icon on Android 7.0. It is the pack's app icon, a white square with the PS
  printer. The brand handoff says "white opaque square … no baked-in rounded corners. OS masks the icon", and Android
  7.0's launcher masks nothing, so it shows square. Proven intentional (the pack as delivered).
- `splash-api24-cold-start.png`: a cold start, one frame every 0.3 s. Launcher, then the launch window: the PS printer on
  the app grey, centred. This emulator image's web engine is version 69, older than the app's minimum of 92, so the app
  then shows its "PrintSaathi needs an update on this phone" screen (Phase 1 gate, by design). The web splash therefore
  cannot be shown on this image; the hand-over to it is proven on API 35 (`splash-handover-api35/`).
