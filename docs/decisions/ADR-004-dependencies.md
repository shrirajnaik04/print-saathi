# ADR-004 — Dependencies: few, exact, locked, offline

- **Status:** Accepted (Phase 0, 2026-10-03).
- **Rule source:** PLAN §C, CLAUDE.md §3.
- **Details per package:** `deps-runtime.md` (shipped) and `deps-test-tools.md` (not shipped).

## Decision

1. **Exact versions only.** Exact pins (`.npmrc save-exact=true`, `engine-strict=true`), a committed `package-lock.json`, and `npm ci`. Preflight fails if `node_modules` differs from the lockfile (`npm ls`).
2. **Gradle is STRICT-locked.** `:app`, `:sharesender` and the buildscript classpath (AGP 8.13.0, Kotlin 2.2.20) are locked, and the wrapper checksum is verified. Proof: adding gson fails with "not part of the dependency lock state" (`evidence/phase-0/2026-10-03/mutation-checks.txt`).
3. **Shipped code must earn its place.** No analytics, crash SaaS, Firebase, Google Play services, ML Kit or network SDKs. The release APK holds no INTERNET permission, enforced by the aapt2 manifest check.
4. **Every new dependency or upgrade gets a note** in `docs/decisions/` and a full regression.

## Shipped today

| Layer | Package | Version | Why |
|---|---|---|---|
| Web | `@capacitor/core`, `@capacitor/android` | 8.5.2 | App shell and bridge |
| Web | `preact`, `@preact/signals` | 10.29.8, 2.11.3 | UI (≈ 8 KB gzip) |
| Web | `@fontsource/atkinson-hyperlegible-next` | 5.3.0 | Bundled font (OFL), Latin 400/700 |
| Android | `androidx.exifinterface` | 1.4.2 | EXIF orientation in the engine |
| Android | `androidx.webkit` | 1.14.0 | WebView version gate |
| Android | AndroidX libraries pulled in by Capacitor, and `org.apache.cordova:framework` 14.0.1 | locked | Capacitor's own runtime |

## Build and test only (never in the APK)

| Package | Version | Why |
|---|---|---|
| `@capacitor/cli` | 8.5.2 | `cap sync` |
| `vite`, `@preact/preset-vite`, `@babel/core` | 8.3.2, 2.10.6, 7.29.7 | Build |
| `typescript` | 5.9.3 | Types |
| `vitest`, `fast-check` | 5.0.3, 4.10.2 | Unit and property tests |
| `@biomejs/biome` | 2.5.15 | Lint and format |
| `pdfjs-dist` | 6.3.289 | Independent PDF validation |
| `jpeg-js` | 0.4.4 | Fixture generation |
| `@cantoo/pdf-lib` | 2.11.1 | Locked-PDF fixtures, and the ADR-002 fallback candidate. **If option (i) is built in Phase 7, it moves to `dependencies` as a lazy chunk, with its own note** |
| `androidx.heifwriter` | 1.1.0 | androidTest only: HEIC fixtures |
| `androidx.test` runner/core 1.7.0, `uiautomator` 2.4.0, `junit` | locked | Instrumentation tests |

## Known advisory

`npm audit` reports 3 moderate advisories: uuid < 11.1.1, via `@capacitor/cli` → `xcode`.
- This path is dev-time iOS project tooling only, and the build never calls the affected API.
- `npm audit --omit=dev` = 0.
- Re-check at every Capacitor upgrade.
