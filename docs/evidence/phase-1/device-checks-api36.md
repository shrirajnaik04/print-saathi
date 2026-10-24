# Phase 1 device checks: API 36 (Android 16 emulator, `ps_api36`), 2026-10-03

Debug build of HEAD `ae554b7`.

| Check | Result | Evidence |
|---|---|---|
| Home at phone font scale 1.0 | 3 tiles, WhatsApp hint, owner tools; nothing clipped | `api36-home-font100.png` |
| Home at phone font scale 2.0 (`settings put system font_scale 2.0`) | The app reads 2.0, so the root size is 200 % (WebView `textZoom` pinned at 100). Icons sit above labels; whole words only | `api36-home-font200.png` |
| Help at 2.0 | Opens scrolled to the top; Back and Home shown as words; title on its own line | `api36-help-font200.png` |
| System Back on Help | Returns to Home (MainActivity stays resumed) | `dumpsys activity` |
| System Back on Home | App minimised (launcher on top), process still alive | `dumpsys` + `ps` |
| Recents thumbnail (API 33+) | Blank card, icon only: customer photos not shown | `api36-recents-blank.png` |
| Reopen from Recents | Home, intact | screenshot |

**Not checked here:**
- **FLAG_SECURE on API ≤ 32:** needs a customer-content screen on API 24/28/30. Covered by the JVM rule test; device check at the Phase 2 Received screen.
- **Algorithmic darkening off:** needs a phone with brand dark mode for apps. Code path only.
- **API 24 and 28:** they show the native WebView gate (factory WebView 69 < 92), as designed.
