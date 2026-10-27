# Phase 46: closure report (PowerPoint files made into pages)

**Spec:** `docs/superpowers/specs/2026-10-27-round-9-office-files-design.md`, Phase 46.
**Rulings and open findings:** `docs/qa/phase-44-47-rulings.md`.
**Evidence:** `docs/evidence/phase-44-47/2026-10-27/`.
**Commits:** 3538848, 2581f28; review fixes 8e2ec55. Stage APK 1.0.299.

**Status: TECHNICALLY CLOSED, PENDING REAL-WORLD VALIDATION.** Still to check with real slides: USER-CHECKLIST §AF4.

## What Phase 46 delivers
- **A .pptx file becomes one page per slide.** Each slide is on A4 sideways, scaled to fit inside 6 mm edges and kept in shape. Ready shows "PowerPoint file · N pages" and the "check the preview" note. Slides print turned on upright paper, as every sideways page does.
- **Drawn:**
  - text placed where the slide, its layout or its master puts it, in the master's text styles (sizes, bullets, levels), with autofit's shrink;
  - theme colours, solid fills, gradients as their first colour, backgrounds (slide → layout → master);
  - pictures (cropped as on the slide), lines, groups, simple tables (merged cells kept);
  - the master's logos and bands.
- **Not drawn, and said so:** charts, SmartArt, arrows, stars and freeform shapes (text only), and placeholders with no place. Hidden slides are left out.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| Slide size, placeholder places and text styles from layout then master, theme colours, backgrounds, groups, autofit, gradients, charts as boxes, order and hidden slides, tables and merged cells | PASS | PptxReaderTest 15 (RED first) |
| One sideways page per slide; a text box and a picture where the slide puts them (±4 px); the background fills only the slide | PASS | OfficePdfDeviceTest (PowerPoint part) on API 24, 35, 36 |
| Broken numbers in a slide still print, as PowerPoint | PASS | `aSlideWithBrokenNumbersStillPrintsAsPowerPoint` |
| A real device: a shared two-slide .pptx → "PowerPoint file · 2 pages", two A4 sideways pages | PASS | round9-smoke `pptxBecomesPages`, `pptxOnePagePerSlide` |
| Real customer slides look like PowerPoint | PENDING (owner) | §AF4 |

## Coverage statement
**Proven:**
- the reading rules on synthetic decks by JVM tests;
- placement by device tests reading pixels back;
- the share → pages path on an API 35 emulator.

**Not proven:**
- real decks with rich templates (table styles, effects and shapes beyond rectangles and ellipses are approximated or noted).
