# Phase 1 — Design system and app shell: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. TDD for every behaviour.

**Goal:** A real PrintSaathi shell that the shopkeeper can hold. It includes:
- design tokens and accessible UI primitives;
- a screen stack with a predictable Back;
- an app-controlled text size;
- Home, Settings, Help and Problem skeletons;
- Recents privacy and no surprise dark mode;
- a jargon lint;
- a Playwright viewport × text-size matrix with axe.

**Exit (PLAN §T1, Phase 1):** every screen passes H4 at 200 % text on 320 px.

**Architecture:**
- **Web:** Preact screens on a tiny stack, with tokens in CSS.
- **Native:** MainActivity sets the WebView text zoom to 100 % and reports the phone's font scale. JS applies it to the root `rem`, capped at 2.0×, so tests measure exactly what ships (PLAN §D6). Native also controls the Recents and screenshot policy and disables algorithmic darkening.

**Spec:** `docs/PLAN.md` §D5 (Back), §D6 (system UI), §H (UX), §I (screens 1, 15, 16, 18).

## Global constraints
- Body 20 px (≥ 18, never < 16); buttons 22 px bold; titles 28 px bold; all in `rem`.
- Targets ≥ 56 dp; primary 64–72 dp; tiles ≥ 88 dp; gaps 12–16 dp; 16 dp gutter.
- Icons are Phosphor bold, 28–32 px, **always with a text label**. Colour is never the only signal.
- Light theme only. Errors are in-place panels with `role="alert"`. No toasts or modals for navigation.
- Plain English. Banned words (jargon lint): DPI, resolution, margin, MIME, format, aspect, render, EXIF, pixel, orientation.
- New dependencies, exact pins, all planned in PLAN §C:
  - `@capacitor/app` 8.1.1;
  - `@phosphor-icons/core` 2.1.1;
  - dev: `@playwright/test` 1.63.0, `@axe-core/playwright` 4.13.0.

## Review focus
1. Android Back on every screen (and on Home → minimise) never loses state.
2. Text at 200 % on a 320 px viewport: no clipping, no horizontal scroll, primary button reachable.
3. `FLAG_SECURE` must not stay on after leaving customer content (screenshot support).
4. A phone font scale of 3.0 (some brands allow it) is capped at 2.0, never ignored.
5. Spike/test tools stay reachable only under "For the shop owner".

---

### Task 1: Tokens, design-system MASTER, icons
- **Create:**
  - `design-system/printsaathi/MASTER.md` (PLAN §H1 tokens plus the rules above);
  - `src/ui/icons.ts` (raw SVG imports of the ~12 Phosphor bold icons used);
  - `src/ui/Icon.tsx` (decorative `aria-hidden` when next to a label).
- **Test:** `src/ui/icons.test.ts`. Every exported icon is non-empty SVG markup with a `viewBox`.

### Task 2: UI primitives
- **Create** in `src/ui/`:
  - `Button` (variants primary / print / secondary; ≥ 64 px primary; busy state disables and says so);
  - `Tile`;
  - `TopBar` (‹ Back · title · Home);
  - `ActionBar` (bottom, safe-area padded);
  - `Panel` (warn / error / info, icon + title + body + optional action, `role="alert"` for error/warn);
  - `Stepper` (big − / +, bounds, accessible value);
  - `ChangeRow`.
- **Tests:** `src/ui/*.test.tsx` with `preact-render-to-string`.
  - **Button:** busy is disabled, and the busy label is announced.
  - **Stepper:** clamps at min/max, and disables the end buttons.
  - **Panel:** error/warn render `role="alert"`.
  - **TopBar:** Back and Home have accessible names.
- **Dev dependency** (render tests only, not shipped): `preact-render-to-string`, exact pin.

### Task 3: Screen stack and Back
- **Create:**
  - `src/core/nav/stack.ts`: a pure reducer `{push, back, home}`. Back on Home returns `minimise`.
  - `src/app.tsx` uses it.
  - `@capacitor/app` `backButton` → `back`; `minimise` → `App.minimizeApp()`.
- **Test:** `stack.test.ts`.
  - push → back returns the previous screen with its stored params.
  - home clears to Home.
  - back on Home gives `minimise`.
  - fast-check: any sequence of operations keeps Home at the bottom and never empties the stack.

### Task 4: App-controlled text size, no dark surprise, Recents privacy
- **Native (MainActivity / PrintEnginePlugin):**
  - `webView.settings.textZoom = 100`.
  - `WebSettingsCompat.setAlgorithmicDarkeningAllowed(false)` where supported.
  - `getFontScale()` and a `fontScaleChanged` event (onConfigurationChanged).
  - API 33+: `setRecentsScreenshotEnabled(false)`.
  - `setSecure(on)` for ≤ 32 (FLAG_SECURE), called by screens that show customer content.
- **Web:**
  - `src/core/textScale.ts`: `rootFontPercent(scale) = clamp(scale, 1, 2) × 100`, applied to `<html>`.
- **Tests:**
  - `textScale.test.ts`: 0.85 → 100, 1.3 → 130, 3.0 → 200.
  - JVM test for the secure-flag policy helper.
  - Device check: font scale 2.0 on `ps_api36` and `ps_api24_2gb`, with Home screenshots.

### Task 5: Screens: Home, Settings (skeleton), Help, Problem; string catalogue and jargon lint
- **Create:**
  - `src/i18n/en.ts` (every user-facing string);
  - `src/i18n/jargon.test.ts` (fails on banned words in any string);
  - `src/screens/home/Home.tsx`: 3 tiles, WhatsApp hint card, Recent jobs (disabled with an explanation until Phase 2), "For the shop owner" (Settings, Help, Printer test → the spike screens);
  - `settings/Settings.tsx` (sections listed, values Phase 2+);
  - `help/Help.tsx` (share-from-WhatsApp steps, pin in the share sheet, printer test);
  - `problem/Problem.tsx`.
  - The spike screens move under "For the shop owner → Tests".
- **Tests:** render tests. Home has exactly three tiles with labels, plus the hint card. The catalogue has no banned words.

### Task 6: Playwright matrix and axe
- **Create:**
  - `playwright.config.ts` (vite preview, Chromium only, mock engine);
  - `tests/e2e/shell.spec.ts`.
- **Matrix:** viewports 320×640, 360×800, 412×915, 480×1040, 800×360 × text 100/130/160/200 %, for each screen (Home, Help, Settings, Problem). Assert:
  - `scrollWidth ≤ clientWidth`;
  - no element's text overflows its box;
  - the primary button is visible and ≥ 56 px;
  - axe has no violations (WCAG 2.2 AA tags).
- **Command:** `npm run test:e2e`.

### Task 7: Phase 1 closure
- **Device checks:** Home and Help on API 24 (WebView gate expected unless updated), API 36 and API 35 at font scale 1.0 and 2.0; Android Back walkthrough; the Recents thumbnail on API 36 is blank.
- **Gate:** an independent reviewer.
- **Evidence:** `docs/evidence/phase-1/<date>/`; `docs/qa/phase-1.md`.
