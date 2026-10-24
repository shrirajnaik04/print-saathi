# Phase 12 — closure report (real-world rollout: the automatable part)

**Plan:** `docs/superpowers/plans/2026-10-17-phase-12-release-hardening.md`.

**Decision note:** `docs/decisions/release-signing-2026-10-17.md`.

**Commits:**
- ed201c6 release build;
- the gate-review fix commit;
- the closure commit.

**Status: TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION.** Still to do: the install on the shopkeeper's phone and the two-week trial (USER-CHECKLIST §R).

## What Phase 12 delivers
- **Release signing:**
  - PrintSaathi's own key, made once and kept outside the repo, with its fingerprint pinned in `android/release-cert.sha256`.
  - The build refuses any other key, including one with the same name.
  - On a new PC the backed-up folder is restored, never remade.
  - The folder works on any PC, because the keystore path is relative.
- **The release build:**
  - R8 shrinks it to 1.5 MB (budget 10 MB), keeping the WebView bridge and the isolated engine;
  - verbose, debug and info logs are stripped (proven in the code itself);
  - crash records keep full class names, and each release keeps its mapping file;
  - every build has a rising version code and names its commit.
- **One command, `npm run android:release`:** build, manifest check (no INTERNET, not debuggable, no backup), key, size and stripped logs → `release/PrintSaathi-<version>.apk`.
- **Installing on the shopkeeper's phone:** `node scripts/device/install.mjs --release`.
  - It refuses a test copy on a real phone.
  - It explains, in plain words, a test copy already on the phone, Xiaomi's "Install via USB", an unanswered install prompt, a newer version on the phone, and a full phone.
- **`docs/INSTALL.md`** for the owner: key backup and restore, USB debugging per phone brand, install and update, set-up (printing app, test pages, pin, settings, screen lock).
- **Device-script safety:** scripts that delete the app run only on emulators. Scripts that read the app's private files insist on the debug build, so they never pass without looking.

## Closure sequence (§T0)

| Step | Where |
|---|---|
| Automated | release-key.test (7), check-release.test (6), install.test (12), adb.test (2), DiagnosticsTest (full names); PC suites; Android lint + JVM |
| Device | release-smoke on API 24/28/30/35/36 (`docs/evidence/phase-12/2026-10-17/`) |
| Audit | `audit.txt`: shipped npm 0 vulnerabilities, Android release classpath clean; uuid@7.0.3 is dev-only (Capacitor CLI → xcode) |
| Adversarial | Gate review: C1, I1–I8, M1–M9, all fixed (ledger) |
| Final regression | See below |

## Release smoke (`41c1069`, `docs/evidence/phase-12/2026-10-17/release-smoke-*.json`)
- **API 35 and API 36 (at 2.0× text): PASS.** In the release build:
  1. photos → All on one page → Ready → PRINT → Android's print screen;
  2. a PDF → Ready;
  3. a locked PDF → Unlock (RAMA + 1965) → Ready;
  4. a saved shop name survives `adb install -r`;
  5. the daily cleanup runs in a cold process;
  6. the app's log has lines (241 / 340) and none at verbose, debug or info level from its own tags;
  7. no app crash, and no WebView devtools socket.
- **API 24 / 28 / 30: PASS.** The release build starts on its native "needs an update" screen (those images have WebView 69–83); no crash, no info lines.

## Final regression (debug build at `41c1069`, `regression-final/`)
- **Instrumentation:**
  - API 24 / 28 / 30: 59 passed, 0 failed, 6 skipped (by design on those images);
  - API 35 / 36: 65 / 0 / 0.
- **Every level:** share 15/15, render check PASS, privacy hits 0.
- **Crash buffers:** the isolated engine only (Android 7's PDF library on fuzz PDFs, and API 36's deliberate tests, both contained); WebView renderers killed on purpose; one Google Play services crash (API 35). No PrintSaathi app-process crash.
- **PC side:** lint (0 errors), typecheck, vitest 303, script tests (release-key, check-release, install, adb), Android lint + JVM.

## Coverage statement
**Proven (emulators and PC):** everything above.

**Not proven:**
- The install on the shopkeeper's phone and on its Android version (§R2).
- That phone brand's USB and install prompts (INSTALL.md §2–3).
- The Brother plugin on it (§R3).
- Two weeks of real use (§R4).
- The release build's unlock tier on Android 11–14 with the SDK extension (no such emulator image; the debug build covers it in Phase 7).
