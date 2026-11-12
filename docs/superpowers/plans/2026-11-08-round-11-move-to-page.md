# Round 11 implementation plan (Phase 49)

**Spec:** `docs/superpowers/specs/2026-11-08-round-11-move-to-page-design.md`. Executed inline (as rounds 4–10), test first.

## Tasks
1. **Home order.** `Home.tsx` JOBS: passport, photos, then the rest. Test: `round11.spec.ts` "Home shows Passport photos first".
2. **Resize corner.** `ui.css` `.adjust-handle`: transparent 4 rem touch box, `::before` ring and `::after` white, both clipped to an L; `--arm` set per photo from its short side on screen (`armOf` in `Adjust.tsx`); `.adjust-in` keeps the L inside the page edge. Tests: not round, at least 56 px, on the photo's corner. Looked at in screenshots (8 photos, big photo).
2b. **Turn handle (added 2026-11-12).** `Adjust.tsx` puts the Turn tool's circular-arrow icon in `.adjust-rotate`; `ui.css` draws the white knob and ring (`.adjust-rotate .icon`), the stick stays. Test: `round11.spec.ts` "the turn handle … is a rotation symbol" (RED first: no arrow); rotate.spec and adjust.spec unchanged and green.
2c. **Passport photos as they are (added 2026-11-12).** Web: `PASSPORT_DPI = 600` (`layout/passport.ts`), `Placement.dpi` set on passport photos (`plan.ts`), shared fixture `plan-v1-passport.json` regenerated. Android: `RenderPlan` parses `dpi` (300–600, whole numbers), `RenderPlacement.dpi`, `PlacementDecoder.decodeFine` (default = the usual decode), `EngineRenderer.FINE_JPEG_QUALITY = 98`, `PlanRenderer` keys by dpi and judges low resolution against the photo's own dpi. Tests: `passportQuality.test.ts` (RED first), RenderPlanTest, PlanRendererTest (x2), RenderPlanContractTest, `PassportQualityDeviceTest` (3, real engine).
3. **Pure move.** `core/layout/movePage.ts`: `pageChoices(plan, item)` and `movePhotoToPage(plan, spots, item, to, edgeMm)`. RED first (`movePage.test.ts`, 25 tests incl. a property test: never off the paper, "clear" never claims a clash is clean).
4. **Chooser.** `ConfirmSheet` gets `grid` and per-choice `wide`; `.sheet` scrolls (`vh`, `dvh` in `@supports`); words in `en.adjust`; `Adjust.tsx` button (icon `files`, no new icon) and `moveTo()` saving one `setSpots` action. Tests: `round11.spec.ts` (new page and back, any page by number and renumbering, Undo/Redo, Cancel/Escape/no destination, 320 px at 200 % text with axe).
5. **Verify:** `npm run verify`, `npm run build && npm run size`, full `npm run test:e2e`, device smoke `round11-smoke.mjs` (API 35), older smokes, whole-round review (a fresh reviewer on the most capable model), one fix pass RED first, regression on API 35 / 24 / 36, release APK.
6. **Close:** `docs/qa/phase-49.md`, rulings, traceability P49, USER-CHECKLIST §AH, owner decisions 66–71, evidence summary, public export, memory.

## Review focus (what the tests above do not directly pin)
- A job placed by hand whose photos are on stored pages with gaps, then Move to page, then Remove: page numbers in the note.
- Move to page while a photo is lifted or a side is being dragged (the button must not race the drag).
- Move to page on a job with Copy / Cut in the clipboard (Paste goes to the page shown, unchanged).
- Phones with the smallest WebView (API 24): the L corner and the sheet.
- The "page shown" after the move when the page it left was before it (the note's number).
