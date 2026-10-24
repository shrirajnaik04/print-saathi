# Phases 20–24 — every ruling made during the build, and the deferred minors

Copied from the executor's ledger (a scratch file that is not kept) so no decision taken on the owner's behalf is lost.
Format: when · what was decided · why · what it costs if wrong. Spec: `docs/superpowers/specs/2026-10-24-place-anywhere-scanner-crop-design.md`.

## Rulings

- **Pre-flight (T3→T13/T14):** export photoEdgeMm(job, photoPaper, a4EdgeMm, extraEdgeMm, margins) from plan.ts, used by buildPlan and exposed by usePlanPaper — one source for the margin — cost if wrong: a helper rename.
- **Task 2:** Phase 20's device evidence (Android splash frames API 35/24) and the cold-start measure are taken with the final release APK in Task 17 — the cold start must be measured on that APK anyway and the splash files do not change after ff36788 — cost if wrong: one extra release build later.
- **Task 3:** direction.test "a wide photo alone … fitted across it" now expects 210 − 2×12.7 mm (was 210 − 12) — the owner's Narrow default (spec Part 2), not a weakening — cost if wrong: one number.
- **Task 3:** the jargon lint allows exactly the Settings label "Margins" (OWNER_WORDS) — the owner asked for Word's name; "margin" stays banned everywhere else — cost if wrong: one word in Settings.
- **Task 3:** documents keep their own A4 sheet (EDGE_MM + extra) because buildPlan's photo sheet now carries the margin — spec Part 2 scope — cost if wrong: none (test "the same at every margin" pins it).
- **Task 4:** the centring tests (layouts "fewer photos … centred", sizes.test "one on each page … centred at its size", flow rows grouped by middle line) are replaced by top-left rules — the owner overrode PLAN §G0 (spec Part 2); inside/no-overlap/order/aspect invariants kept and a top-left rule added to the 10 000-job property — cost if wrong: re-centre in 4 functions.
- **Task 5:** Phase 21's device evidence (PlanRenderDeviceTest "Narrow A4 photo plan prints its first photo 12.7 mm from the top-left" + Ready screenshots) runs in the combined device session after Task 16, with Phases 22–24's device items — one emulator boot/install per API level instead of five; each phase still gets its own evidence folder — cost if wrong: a device finding for Phase 21 surfaces later (fix still TDD'd before release).
- **Task 11:** CropFrame is a shared component used by the two existing screens (CropPhoto, FixCorners) instead of one ScannerCrop screen with a mode — the routes stay, less churn — cost if wrong: none.
- **Task 11:** corner handles are touched at 56 px (spec said 48): the project floor for anything pressed (layout matrix "small target") — cost if wrong: none.
- **Task 11:** kept a "Start again" (reset) button beside the arrows (the spec's bar has no Reset; the old screens had one and its e2e test is kept) — cost if wrong: one button.
- **Task 11:** corner buttons are in reading order (TL, TR, BL, BR) for screen readers (the reading-order test) — cost if wrong: none.
- **Task 12:** Phase 23 device closure (adjust-smoke crop steps, render check of a straightened plan) runs in the combined device session (Task 5 ruling).
- **Task 19:** the two Phase 5 e2e tests of Home's set-up panel ("until a test page has printed…", "once the printer is set up…") are removed with the panel — the owner removed the feature (spec Part 7.1); owner-requests.spec checks the panel never shows — cost if wrong: re-add a panel.
- **Task 6/7:** Adjust chooses the first added photo through a one-time session note ('ps.addChoose'), because Adjust is not mounted while "Where are the photos?" is on top (the event alone missed it) — cost if wrong: none.
- **Task 8:** Phase 22 device closure (real DocumentsUI pick on API 35) in the combined device session (Task 5 ruling).
- **Task 14+15:** one commit for both tasks — they change the same Adjust code and place.spec; splitting hunks would leave a commit whose tests fail — cost if wrong: one larger commit to read.
- **Task 16:** Phase 24 device closure (render check of hand-placed overlapping photos, place-smoke hold/drag on API 35, privacy) in the combined device session (Task 5 ruling).
- **Task 10 (device):** the 2 new PlanRenderDeviceTest tests failed on API 35 with RenderOutcome.Failed('no card decoder'): the test built PlanRenderer(steps, steps) without the card decoder the app passes (PrintEnginePlugin.kt:854 cards = engineSteps). Test harness fixed to build it as the app does; product unaffected. Re-run on device after the review fixes.
- **Final:** a straightened frame keeps its centre and its scale by area (it cannot be mapped part by part) — cost if wrong: a straightened re-crop moves its remaining part a little.
- **Final:** the RED needed a realistic 128 MB cap (setprop, not persistent); the image's own 512 MB cap passes the old code too — cost if wrong: none (the fix only frees memory earlier).
- **Final:** the crop frame starts on the black edges found even after "Keep as they are" (a reviewer minor) — the Phase 9 gate M-1 behaviour the owner has used since; the spec line was carried over from the older wording. Pressing Done without changing the frame then crops those edges — cost if wrong: one condition where CropPhoto picks its starting frame.
- **Closure (owner request):** the corner makes the kind's own Smaller/Bigger change through the reducer (same steps and limits as the buttons; ID cards in "Many copies" / "Fill the page" keep no corner, as they have no buttons) — cost if wrong: finer steps for cards would need a reducer change.
- **Closure:** Adjust's hint for documents, passport and cards is "Drag the round corner or use the buttons below." — two longer wordings put a tool button 17–20 px under the Done bar at 480×1040 / 360×800 (axe target-size); this one keeps the matrix green — cost if wrong: a wording change.

## Deferred minors (from the whole-branch review; not fixed in this release)

- sideCropQuad dragged outward halves the distance (stops short of the photo's edge); the 5 % minimum is of the current frame, not of the photo
- while a straightened photo's side is dragged its box is drawn empty until the engine picture is made
- thin straightened strips under 16 px fail the print (engine floor) and the plan does not keep boxes above that
- straightened previews are made at ID-card shape (480×303), so tall pages look soft in Adjust
- the plan's "job is not printed" check before adding into it is missing (harmless: adding clears the printed state)
- a drop made while a save is still running is lost; To previous/next page stay disabled for photos added after hand placement until one is moved

## Open for the owner

- **Vite 8.3.2 → 8.3.3** (6 dev-server advisories; the dev server is not shipped in the app). A dependency upgrade needs the owner's approval (CLAUDE.md §3). Carried over from Phases 16–19.
- **A licence** for the public repository (none chosen yet). Carried over from Phases 16–19.
