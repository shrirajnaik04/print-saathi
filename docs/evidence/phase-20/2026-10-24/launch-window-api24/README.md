# API 24 launch window — release 1.0.224-9c1b253

Emulator `ps_api24_2gb` (Android 7.0, 2 GB), release build installed fresh, two cold starts recorded with
`screenrecord` (10 frames a second; sheets show the first 3.6 s).

- **Launch window (f017–f023 in run 1):** the whole v3 logo — paper with its folded corner, the PS printer and the
  tray — centred, from the first app frame.
- **Then:** "PrintSaathi needs an update on this phone". This image's factory WebView (69) is older than the app
  supports (92), so the native WebView gate shows instead of Home, as documented since Phase 0. A real Android 7 phone
  with an updated WebView goes on to the page's splash and Home.
