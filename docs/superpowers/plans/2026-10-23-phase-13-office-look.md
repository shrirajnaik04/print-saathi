# Phase 13 — Office (Fluent) look and motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen in the approved Office (Fluent) direction and add the motion system, without losing any accessibility guarantee.

**Architecture:**
- The look is CSS: tokens in `tokens.css`, components in `ui.css`.
- The only component API change is a `tone` on Tile (the coloured icon badge).
- Motion is CSS keyframes/transitions. One wrapper class is set by `app.tsx` from the last navigation action (`forward` / `back` / `fade`).
- No library.

**Tech Stack:** Preact 10, plain CSS, Vitest, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md` (Part 1).

## Global Constraints
- **Text contrast ≥ 7:1** (AAA) for every text pair; non-text (outlines, icon glyphs on badges) ≥ 3:1. `tokens.test.ts` measures each pair.
- **Sizes:**
  - The shopkeeper's controls ≥ 56 px tall, primary ≥ 64 px;
  - layout matrix 320×640 … 800×360 at text 100/130/160/200 %;
  - no horizontal scroll.
- **Motion:**
  - only `transform`/`opacity`;
  - every animation/transition sits under `@media (prefers-reduced-motion: no-preference)`;
  - no animation longer than 400 ms;
  - motion never delays focus moving to the title.
- **CSP:** no inline `style` attributes (classes only), no new dependency.
- **Token values (spec):**

  | Token | Value |
  |---|---|
  | `--bg` | `#F3F4F6` |
  | `--surface` | `#FFFFFF` |
  | `--text` | `#111827` |
  | `--text-muted` | `#3F4B5B` |
  | `--primary` / `--print` | `#3730A3` |
  | `--primary-soft` | `#E0E7FF` |
  | `--stage` (paper preview background) | `#E5E7EB` |

  - Badges (background/glyph): photos `#DBEAFE`/`#1D4ED8`, passport `#EDE9FE`/`#6D28D9`, cards `#FFEDD5`/`#9A3412`, documents `#DCFCE7`/`#166534`.
  - `--elev-1: 0 1px 2px rgb(17 24 39/6%), 0 4px 12px rgb(17 24 39/7%)`.
  - `--elev-2: 0 2px 4px rgb(17 24 39/8%), 0 8px 24px rgb(17 24 39/10%)`.
  - `--radius: 0.75rem`, `--radius-sm: 0.625rem`.
  - Motion: press 120 ms; screen enter 240 ms / exit 160 ms; rise 360 ms with a 50 ms stagger over at most 6 items; `--ease-out: cubic-bezier(.2,.8,.2,1)`.

## Review Focus
- **The lighter stage:** the paper preview on light grey must keep labels readable. White text on the old dark desk becomes `--text`, and tokens.test pairs `--text` on `--stage`.
- **Big text and narrow screens:** at 200 % text on 320 px, a 2-column tile grid would squeeze the tiles. The grid must fall back to one column (layout matrix).
- **Fast taps during a transition:** the old screen's late work is already dropped by `goFrom`. A transition must not leave two screens tappable (only one `<main>` is rendered).
- **Reduced motion:** with `prefers-reduced-motion: reduce`, nothing animates on any screen (e2e: `document.getAnimations()` empty).
- **Pressed state:** shrinking (scale 0.97) must not shift layout; scale is a transform only (the layout matrix still runs).

---

### Task 1: Fluent tokens and their contrast proof

**Files:** Modify `src/styles/tokens.css`, `src/styles/tokens.test.ts`.

- [ ] **Step 1: Failing test.** Update tokens.test pairs to the new table:

  | Pair | Minimum |
  |---|---|
  | text on bg / surface / stage | 7 |
  | muted on bg / surface / primary-soft | 7 |
  | white on primary | 7 |
  | primary on bg / surface / primary-soft | 7 |
  | warn / error / info as today | — |
  | border on surface / bg | 3 |
  | each badge glyph on its badge | 3 |
  | text on a pressed tile | 7 |

  Add `token('stage')`, `token('primary-soft')` and the badge tokens `badge-photos-bg`/`badge-photos-fg` and so on. Remove the desk pair (`--desk` is retired).
- [ ] **Step 2:** `npx vitest run src/styles/tokens.test.ts` → FAIL (missing tokens / old values).
- [ ] **Step 3: Set the values** from Global Constraints in `tokens.css`, adding the elevation, radius and motion tokens. Keep `--warn-*`, `--error-*`, `--info-bg`, `--divider`, `--disabled`. `--border` stays `#64748b` (3:1 non-text).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(phase 13): Fluent colour, depth, radius and motion tokens with measured contrast`.

### Task 2: Components in the Office style

**Files:** Modify `src/ui/Tile.tsx`, `src/ui/primitives.test.tsx`, `src/styles/ui.css`, `src/screens/home/Home.tsx`, `src/screens/recent/Recent.tsx`.

**Interfaces:**
- Produces: `Tile({ icon, title, helper?, onClick, image?, tone? })`, where `tone?: 'photos' | 'passport' | 'cards' | 'documents'`.
- Renders the icon inside `<span class="badge badge-<tone>">`, or `badge badge-neutral` when there is no tone.

- [ ] **Step 1: Failing test** in primitives.test: `render(<Tile icon="photos" tone="photos" title="Photos" onClick={…}/>)` contains `badge badge-photos`; without a tone it contains `badge badge-neutral`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement the tone.** Restyle in `ui.css`:
  - `.tile` and cards: white, `--elev-1`, `--radius`, no 2 px border.
  - Buttons: primary indigo with a white label; secondary white with an indigo outline; `--radius-sm`.
  - `.choice`: white; selected = indigo outline + `--primary-soft` + the existing ✓/"Selected".
  - `.panel`: rounded.
  - `.topbar` buttons: indigo.
  - `.actionbar` pinned: `--elev-2` on `--surface`.
  - Paper preview: `--stage` background, labels in `--text`.
  - Badges: 2.75 rem square, `--radius-sm`, background/glyph from the badge tokens.
  - Home: job tiles in a `.tile-grid` (`grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr))`, gap 0.75 rem); the lead line "What should we print?" under the h1 (`en.home.lead`).
  - Tones on Home: photos, passport, documents. Recent and Continue keep neutral.
- [ ] **Step 4:**
  - `npx vitest run` → PASS.
  - `npm run test:e2e` → PASS (matrix, axe AAA, keyboard, tap counts). Fix any layout problem the matrix finds in CSS, never by excluding a screen.
- [ ] **Step 5: Screenshots** of Home, Received, Ready, Change, Passport, Settings at 412×915 and 320×640/200 % (Playwright, `docs/evidence/phase-13/<date>/look/`). Review them against the approved mockup.
- [ ] **Step 6:** Commit `feat(phase 13): Office (Fluent) components — cards with depth, icon badges, indigo actions, light paper stage`.

### Task 3: Motion system

**Files:** Modify `src/app.tsx`, `src/styles/ui.css`, `src/screens/result/Result.tsx`, `tests/e2e/shell.spec.ts`.

**Interfaces:**
- Produces: `<div class="screen-host enter-<dir>">` wrapping the current screen, where `dir: 'forward' | 'back' | 'fade'` is taken from the last `NavAction` (push → forward; back/backTo → back; home/replace → fade).
- The host is keyed by the entry, so the animation runs once per screen.

- [ ] **Step 1: Failing e2e tests:**
  - `motion: a push enters forward, Back enters back, Home fades`: after tapping a tile, `.screen-host` has class `enter-forward`; after Back, `enter-back`; after Home, `enter-fade`.
  - `motion: nothing lasts longer than 400 ms`: on Home/Received/Ready, every `document.getAnimations()` effect has `getTiming().duration ≤ 400`.
  - `motion: reduced motion means no animation at all`: with `page.emulateMedia({ reducedMotion: 'reduce' })`, on Home/Received/Ready/Result, `document.getAnimations().length === 0`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement:**
  - Keyframes `enter-forward` (translateX(24px) + fade → 0), `enter-back` (−24px), `enter-fade`; all 240 ms `--ease-out`.
  - `.rise > *` children: translateY(10px) scale(.96) + fade, 360 ms, nth-child delays 0/50/…/250 ms (the first 6); applied to `.tile-grid`, `.choices`, the Received thumbnails.
  - Press: `transform: scale(.97)` on `:active` for `.tile`, `.btn`, `.choice`, `.change-row` (120 ms).
  - Result "Sent ✓": the check's stroke draws in once (400 ms).
  - Every rule sits inside `@media (prefers-reduced-motion: no-preference)`.
  - Focus to the title stays in the same effect as today (motion only paints).
- [ ] **Step 4:** Run e2e → PASS. Full `npm run test:e2e` → PASS.
- [ ] **Step 5:** Commit `feat(phase 13): motion — screens slide the way you move, tiles rise, buttons press, the print check draws; off with reduced motion`.

### Task 4: Device proof and performance
- [ ] **Step 1:** `npm run android:sync`. On API 35 and API 36 (2.0× font): screenshots of Home, Received, Ready, Result and Settings via adb (`docs/evidence/phase-13/<date>/device/`).
- [ ] **Step 2:** `node scripts/device/perf.mjs <serial> <big dir> <out.json>` on API 35. Cold start and tap feedback stay within PLAN §P; compare with Phase 10's `perf-api35-final.json`.
- [ ] **Step 3:** Gate review, fixes, 5-level regression, closure report `docs/qa/phase-13.md`, traceability, ledger.
