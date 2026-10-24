# PrintSaathi design system — MASTER

**Source:** PLAN §H1–H4. Built with the UI-UX-PRO-MAX rules (style: Minimalism / Swiss; variance 2, motion 2, density 2), then adapted to the shopkeeper: 55–75, knows WhatsApp, low vision.

**When this file and a screen disagree, this file wins,** unless `pages/<screen>.md` overrides it.

## Principles
1. **One obvious next step per screen.** Exactly one primary button. Everything else is visually quieter.
2. **Words first.** Icons are Phosphor *bold* and always sit beside a text label. Colour never carries meaning alone: a selected state shows ✓, a thicker border and the word "Selected".
3. **Paper looks like paper.** Light theme only; previews sit on a dark "desk" (`--desk`).
4. **Big, calm, still.** Large targets, generous spacing, 150–200 ms fades only, and `prefers-reduced-motion` respected.

## Tokens (`src/styles/tokens.css`)

### Colours

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--text` | `#0F172A` | All text | 17.9 : 1 on white |
| `--text-muted` | `#475569` | Helper lines | 7.6 : 1 |
| `--bg` / `--surface` | `#F8FAFC` / `#FFFFFF` | Page / cards | — |
| `--primary` | `#075985` | Main buttons (white label), focus ring, links | 7.6 : 1 |
| `--print` | `#166534` | **PRINT button only** | 7.1 : 1 |
| `--warn-bg` / `--warn-text` | `#FEF3C7` / `#78350F` | Paper reminders, warnings (+ icon) | 8.2 : 1 |
| `--error-bg` / `--error-text` | `#FEF2F2` / `#991B1B` | Problems (+ icon) | 7.6 : 1 |
| `--border` | `#64748B` | Outlines, inputs | 4.8 : 1 (non-text ≥ 3 : 1) |
| `--desk` | `#475569` | Behind paper previews | — |

### Type

| Element | Size and style |
|---|---|
| Font | Atkinson Hyperlegible Next (bundled 400/700), then Noto Sans Devanagari / system |
| Body | 1.25 rem (20 px at 100 %), line height 1.45 |
| Helper | 1.125 rem minimum (18 px); never below 1 rem |
| Buttons | 1.375 rem bold |
| Titles | 1.75 rem bold |

**Root size** = 100 % × the phone's font scale, capped at 200 %. The WebView's own text zoom is fixed at 100 %, so tests see exactly what ships.

### Spacing (8 dp grid)

| Token | Value |
|---|---|
| `--space-1` | 0.5 rem |
| `--space-2` | 0.75 rem |
| `--space-3` | 1 rem |
| `--space-4` | 1.5 rem |
| `--space-5` | 2 rem |
| `--gutter` | 16 px |

### Targets

| Control | Minimum height |
|---|---|
| Anything the shopkeeper presses | 3.5 rem (56 dp) |
| Primary button | 4 rem (64 dp) |
| PRINT | 4.5 rem (72 dp) |
| Tiles | 5.5 rem (88 dp) |

Gaps between targets are ≥ 0.75 rem.

### Icons

| Class | Size |
|---|---|
| `icon-sm` | 1.25 rem |
| `icon-md` | 1.75 rem |
| `icon-lg` | 2 rem |

All icons use `currentColor`.

## Components (`src/ui/`)

| Component | Rules |
|---|---|
| `Button` | `primary` / `print` / `secondary`. Busy: disabled, with a label such as "Preparing…" and `aria-busy`. Press feedback via opacity, no layout shift |
| `Tile` | Big choice with icon + title + optional helper line; whole tile is the button |
| `TopBar` | **‹ Back · title · Home** on every screen except Home (Home has the app name). Back and Home have visible words |
| `ActionBar` | Fixed bottom bar padded by `safe-area-inset-bottom`; page content gets matching bottom padding so nothing hides behind it |
| `Panel` | `info` / `warn` / `error`: icon + what happened + what to do + optional button. `warn`/`error` use `role="alert"` |
| `Stepper` | Big − and + (56 dp) around a large number; disabled at bounds; announces the value |
| `ChangeRow` | "Label — current value" row that opens one decision screen |

## Words

- Reading age 8–9.
- Errors say what happened and what to do.
- The jargon lint (`src/i18n/jargon.test.ts`) fails the build on: DPI, resolution, margin, MIME, format, aspect, render, EXIF, pixel, orientation.

## Anti-patterns

Never use any of these:
- toasts for errors;
- modals for navigation;
- swipe- or long-press-only actions;
- icon-only buttons;
- grey-on-grey text;
- text under 16 px;
- dark mode;
- carousels;
- auto-advance;
- decorative animation.
