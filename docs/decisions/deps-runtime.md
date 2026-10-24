# Dependency notes — runtime (shipped in the APK)

| Package | Why | Licence / cost | Size | Version |
|---|---|---|---|---|
| `@capacitor/core`, `@capacitor/android` | App shell and bridge (PLAN §C) | MIT, free | — | 8.5.2 |
| `preact`, `@preact/signals` | UI and state | MIT, free | ≈ 8 KB gzip | 10.29.8 / 2.11.3 |
| `@fontsource/atkinson-hyperlegible-next` | Bundled low-vision-friendly font (PLAN §H1). Latin 400/700 only, so the app never loads fonts from the network | OFL-1.1, free | woff2 12.1 KB + 12.7 KB (woff fallbacks ≈ 30 KB unused by modern WebViews) | 5.3.0 |
| `androidx.exifinterface` | EXIF orientation in the engine | Apache-2.0 | small | 1.4.2 |
| `androidx.webkit` | WebView version facts and gate | Apache-2.0 | small | 1.14.0 |
| `@cantoo/pdf-lib` | ADR-002 option (i): unlocks a locked PDF in the WebView on phones whose built-in engine can't (PLAN §G5). Moved from dev to runtime in Phase 7 (2026-10-17). Lazy-loaded only on the Unlock screen of such phones; never in the startup bundle. Offline; `npm audit --omit=dev`: 0 vulnerabilities | MIT, free, maintained fork of pdf-lib | ≈ 222 KB gzip (own chunk) | 2.11.1 |

All versions are exact; `package-lock.json` and the Gradle lockfiles pin the full tree.
