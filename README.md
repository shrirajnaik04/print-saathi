# PrintSaathi

An Android app for small print shops. A shopkeeper who only knows WhatsApp can turn customers' photos, passport
photos, ID cards and PDFs into correct prints in a few taps, without Word, image editors or printer knowledge. It works
offline, has no accounts and no server, and costs nothing to run.

> **Status:** built and tested on Android emulators (Android 7 to 16), with automated tests at every level.
> **Pending real-world validation** on a shopkeeper's own phone and a shop printer: see
> [docs/spikes/USER-CHECKLIST.md](docs/spikes/USER-CHECKLIST.md). Not on the Play Store; installed over USB
> ([docs/INSTALL.md](docs/INSTALL.md)).

## What it does

- **Share from WhatsApp, or choose from the phone:** photos, PDFs, or a mix.
- **Photos:**
  - layouts: all on one page, several pages, or one on each page;
  - **Adjust on the preview:** make any photo bigger or smaller (also by dragging its corner), turn, crop, move or
    remove it; photos flow onto new pages by themselves;
  - paper: Portrait or Landscape, A4 or 4×6 photo paper.
- **Passport photos:**
  - fit the face by dragging and pinching under a still frame;
  - exact physical size (3.5 × 4.5 cm by default, or the shop's own size) and a thin black border;
  - 4×6 or A4 sheets with the price shown.
- **Documents and PDFs:**
  - choose pages, reorder them, turn them, and size each page;
  - colour or black & white;
  - password-locked PDFs such as e-Aadhaar, with a helper for the password.
- **Aadhaar and ID card copy:** finds the card in a photo or PDF, straightens it, and prints front and back at real
  size, bigger, or many copies.
- **Print styles, black-edge removal, auto-turn of sideways photos (with Undo), real-file preview** before printing.
- **Big, plain screens:**
  - English with no jargon;
  - text up to 200 %;
  - screen reader support;
  - every gesture has a button.

## Privacy and safety

- **Isolated parsing:** customer files are opened only inside an isolated, permission-less engine process. A broken or
  hostile file can crash that process, never the app.
- **Nothing leaves the phone:** release builds have **no INTERNET permission**, no analytics and no backups.
- **Files are deleted:** after 1 day by default.
- **Original photos go into the print file untouched,** without their EXIF notes (place, time, phone).

## Building

Requirements: Node 22.12 or newer, JDK 21, the Android SDK (API 36). Developed and tested on Windows; the device scripts
find the SDK through `ANDROID_HOME`.

```sh
npm ci
npm run verify          # lint, typecheck, unit tests, script tests
npm run test:e2e        # Playwright: every screen at 320–480 px and 100–200 % text, with axe
npm run android:build   # debug APK
npm run android:test    # Android lint + JVM tests
```

[HARNESS.md](HARNESS.md) lists every command, including device tests and the release build. Release signing uses
your own key, made once outside the repository (`node scripts/release-key.mjs`).

## Where things are

- [docs/PLAN.md](docs/PLAN.md): the approved product and architecture plan.
- [docs/decisions/](docs/decisions/): architecture decisions and owner decisions.
- [docs/qa/](docs/qa/): a closure report for every phase, plus the traceability matrix.
- [CLAUDE.md](CLAUDE.md): rules for anyone (human or AI) working here.
- Code:
  - `src/`: the web app (TypeScript, Preact);
  - `android/`: the native engine, intake and printing (Kotlin).

## Licence

No licence has been chosen yet. Until one is added, normal copyright applies. Bundled third-party parts keep their own
licences (for example Atkinson Hyperlegible Next, SIL OFL 1.1).
