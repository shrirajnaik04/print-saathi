# Phase 12 — real-world rollout: the automatable part (release hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** a release build that can go on the shopkeeper's phone, plus the install and setup guide. The 2-week field trial itself is the owner's (USER-CHECKLIST §R).

**Spec:** docs/PLAN.md §T1 Phase 12, §Q "Release integrity" and "Logs and diagnostics", Risk 11 (ADB install), §C budgets (APK ≤ 10 MB); traceability row P0-RELEASE-HARDENING.

## Global constraints
- The keystore never enters the repo. No new dependency (keytool comes with the bundled JDK).
- No INTERNET in release; not debuggable; WebView debugging off; backups off (as already checked).
- R8 must not break the isolated engine, the Capacitor bridge or the plugin. A release build is proven on an emulator, not assumed.

## Tasks

### Task 1: Release signing outside the repo
- **Signing details:** `signing.properties` (store file, store password, key alias, key password), read from `PRINTSAATHI_SIGNING` or else `%USERPROFILE%\.printsaathi\signing.properties`.
- **Fail loudly:** a release build without it stops and says how to make one. There is no silent debug-key fallback.
- **`scripts/release-key.mjs`:** makes the key once (keytool from the bundled JBR, RSA 4096, 30 years) with a random password. It never overwrites, and prints the folder to back up.
- **Test:** `scripts/release-key.test.mjs` (never overwrites; properties format).

### Task 2: R8 and log stripping
- `minifyEnabled true`, `shrinkResources true`.
- **Keep rules:**
  - Capacitor plugins (annotations, `@PluginMethod`);
  - the AIDL engine interface and isolated service;
  - Parcelables;
  - JobService.
- **Log stripping:** `-assumenosideeffects` for `Log.v/d/i` (warnings and errors stay; they carry codes only).
- **Device proof (`scripts/device/release-smoke.mjs`, API 35 and API 24):**
  1. install the release APK;
  2. share six photos → Received → All on one page → Ready shows the real page → PRINT opens Android's print screen;
  3. share a PDF → Ready;
  4. check logcat for any app `I`/`D` lines (none expected);
  5. check for crashes (none).

### Task 3: Release checks in one command
- `npm run android:release` builds, signs and verifies:
  - the manifest (existing check);
  - APK size ≤ 10 MB;
  - the APK is signed by the release key, not the debug key (apksigner verify `--print-certs` differs from the debug certificate).
- Output: `release/PrintSaathi-<version>.apk` (git-ignored).

### Task 4: Install and setup guide
`docs/INSTALL.md`, for the owner:
- enable USB debugging;
- `adb install -r`;
- updating keeps the shopkeeper's settings and jobs (same key);
- the Brother Print Service Plugin / Mopria;
- the first-start steps;
- test pages (A4 and 4×6);
- pinning in the share sheet;
- what to back up (the key folder).

USER-CHECKLIST §R: install on the shopkeeper's phone + 2-week trial log.

## Closure
- **Status:** TECHNICALLY CLOSED — PENDING REAL-WORLD VALIDATION (the install on the shopkeeper's phone and the 2-week trial).
- **Regression:** the release smoke on API 24 and API 35 + the PC suites + Android lint/JVM.
- The debug-build device regression is unchanged unless main code changes.
