# Phase 1 — closure report (design system and app shell)

**Plan:** `docs/superpowers/plans/2026-10-03-phase-1-design-system-and-shell.md`.
**Commits:** `c0ba4dd`, `898e48f`, `ae554b7`, `67d3434`, `43919b1`.

## Exit criterion: "every screen passes H4 at 200 % text on 320 px"

**Met, after a failed gate.**
- **Automated:** Playwright, 5 screens × 5 viewports × 4 text sizes. Each case checks:
  - no sideways scroll, nothing off-screen;
  - no word split across lines;
  - pinned bars cover ≤ 30 % of the screen;
  - buttons ≥ 56 px;
  - axe WCAG 2.2 AA clean.

  **102/102.**
- **By eye:** every screen at 320 px / 200 % (`docs/evidence/phase-1/*-320-200pct.png`).
- **Device:** API 36 at phone font scale 1.0 and 2.0; system Back walk; Recents blank (`device-checks-api36.md`).

## Gate review: FAIL → findings and status

| # | Finding | Status |
|---|---|---|
| 1 | **Critical:** Settings labels split into 2–3 letter pieces at 200 % on 320 px, yet the matrix passed | **Fixed + verified.** Word-split detector added (it fails on the old CSS); ChangeRow wraps "Change" below; panels and tiles wrap text under the icon |
| 2 | A tile's "not ready yet" message appeared off-screen, so the tap looked dead | **Fixed + verified.** The message shows under the tapped item and is scrolled into view; info panels are `role="status"`; the test asserts `toBeInViewport` at 200 % / 320 px |
| 3 | Changing the phone's font size restarted the app and lost the screen; the live update was missing | **Fixed + verified.** `fontScale` added to `configChanges`, and the `fontScaleChanged` event is applied live. **Device (API 35):** on Help, font scale 1.0 → 1.6; same process (pid 4521, no restart), still on Help, text larger (`api35-live-fontscale-help.png`) |
| 4 | The matrix skipped Problem and Tests | **Fixed + verified.** An e2e-only `?screen=` route (`vite --mode e2e`, compiled out of the app build); 5 screens in the matrix |
| 5 | Layout measured before the font loaded | **Fixed.** Waits for `document.fonts.ready` |
| 6 | Headings smaller than body text on narrow screens | **Fixed.** `max(1.25rem, …)` floor |
| 7 | Strings outside the catalogue; the lint scanned only `en` | **Fixed + verified.** TopBar, ChangeRow and ActionBar use `en`; Stepper button names are passed in; the lint scans all `.tsx` string literals and JSX text (a probe fixture proves it sees them) |
| 8 | Gaps under 0.75 rem; Recent jobs missing; no Panel action; dead Settings rows | **Fixed.** TopBar gap 0.75 rem, rows gap 0.75 rem; Recent jobs on Home (explains "not ready yet"); `Panel.action`; Settings rows explain in place |
| 9 | Tests asserting less than their names | **Partly fixed.** The Back walk was also checked on device with the real Android Back key (API 36). **Open, scheduled:** a Stepper `onChange` clamp test arrives with its first real use (Copies, Phase 3), using Playwright clicks |
| 10 | The 15-minute screenshot switch can't work yet | **Scheduled.** Built with the Settings screen it belongs to (PLAN §I-15, later phase), with an expiry timer and a per-screen count. Today nothing sets it, so screenshots are blocked on Android ≤ 12 customer screens, which is the safe default |

**New defect found by my own visual re-check after the fixes:** the bottom action bar covered 41–49 % of a small screen at 200 % text. **Fixed + verified:** the ActionBar unpins above 25 %, and a new matrix rule caps pinned bars at 30 %.

## Lessons kept
- Passing layout checks are not proof of readability. Look at the extreme case, every screen, every time.
- `overflow-wrap: anywhere` hides layout failures. Use `break-word` plus wrapping layouts.

## Not proven
- Real phones; brand dark modes (darkening off is code only); FLAG_SECURE on API ≤ 32 on a device.
