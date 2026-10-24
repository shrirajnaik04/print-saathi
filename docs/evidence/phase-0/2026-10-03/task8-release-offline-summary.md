# Task 8 — spike (c): a release build works without the INTERNET permission

**Setup:**
- Device: `ps_api36` (Android 16 emulator).
- APK: `npm run android:release`, debug-signed for the spike; the manifest check passed in the same command.
- Installed fresh after uninstalling. A photo share was sent in with the test sender (6 photos).

| Check | Result | Evidence |
|---|---|---|
| Release APK requests no INTERNET | `dumpsys package` lists no INTERNET; flags `[HAS_CODE ALLOW_CLEAR_USER_DATA]`, not debuggable | `check-manifest` (aapt2) ok |
| The app process cannot open network sockets | Process groups `9997 20219 50219`, **no 3003 (AID_INET)**, so the kernel denies sockets regardless of the web layer | `ps` / `/proc/<pid>/status` |
| Bundled font loads | "Atkinson font active" (`document.fonts.check` after `fonts.ready`). Latin 400/700 woff2 are 12.1 KB and 12.7 KB | screenshot |
| Web Worker fetches a local file | "worker read 20442 bytes": a module worker fetched a `convertFileSrc` URL from the app's own origin | screenshot |
| Local image shown by path | First received photo rendered from `convertFileSrc` (no base64) | screenshot |
| CSP placement | CSP `<meta>` is our first `<head>` element, after Capacitor's injected bridge. The app, worker, fonts and images all work under `default-src 'self'` | `index.html` |
| Network unreachable | "Try the internet" → `blocked: TypeError: Failed to fetch` | screenshot |
| Logcat privacy | 0 hits for `no_backup` or `/jobs/` | logcat scan |

**What blocked the network fetch:** the CSP `connect-src 'self'` (the first layer) and the missing INTERNET permission (the kernel layer) each block it independently. WebView console logging is off (`loggingBehavior: 'none'`), so which layer fired first is not logged. Both layers are proven present.

**Production dependencies:**
- `@fontsource/atkinson-hyperlegible-next` 5.3.0: OFL-1.1, font files only, no code at runtime. Decision note in `docs/decisions/deps-runtime.md`.
- `npm audit --omit=dev` reports 0 vulnerabilities. The 3 moderate advisories (uuid < 11.1.1 via `@capacitor/cli` → `xcode`) are dev-time, iOS project tooling only, in uuid v3/v5/v6 with a caller-supplied buffer that our build never calls. Recorded as not applicable; re-check at each upgrade.

**Not proven here:** the same run on a real phone (user checklist).
