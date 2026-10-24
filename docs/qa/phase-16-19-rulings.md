# Phases 16–19 — every ruling made during the build, and the deferred minors

Copied from the executor's ledger (a scratch file that is not kept) so no decision taken on the owner's behalf is lost.
Format: when · what was decided · why · what it costs if wrong. Spec: `docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`.

## Rulings

- **Task 1:** Tasks 1 and 2 committed together (30051ae) — they share Passport.tsx/app.tsx and each commit runs the full hook — cost if wrong: one review range covers both.
- **Task 1:** lazy screens preload 0.3 s after start (not on idle) — a full parallel e2e run showed a chunk arriving > 8 s late under load; preloading early makes a blank screen on first open unlikely — cost: ~25 KB of parsing early in the session. **Superseded on 2026-10-24:** they preload 0.3 s after the splash has gone (release cold starts).
- **Task 2:** owner added "Continue the last job below the four tiles" mid-task — done in Task 2 with an e2e test seen failing first.
- **Task 2:** crop/passport stage capped at 42 vh (min 10 rem) — the owner's screenshot showed the buttons under Next; the matrix then flagged target-size on Prices (a button peeking 10 px under the bar) — fixed by grouping "Add a price" (positional coincidence; the matrix keeps guarding it).
- **Task 2:** look screenshots deferred to the device evidence (Task 12) instead of PC screenshots — device screenshots are better evidence — cost: none if Task 12 runs.
- **Task 4:** the e2e for picked photos was written before the code but not run red; proven by a mutation run instead (mayTurn forced true → test fails)
- **Task 4b:** the pack asks for no decorative motion; the owner asked for an animated splash — kept to ~0.75 s, CSS transform/opacity on 4 layers, none with reduced motion — cost: brand-guideline deviation the owner chose.
- **Task 4b:** the system splash shows the printer without paper; the web splash feeds the paper and prints the page (seamless hand-over at the same scale 0.34 dp/unit) — cost if the WebView is not edge-to-edge on an old phone: the printer may shift by half the status bar.
- **Task 4b:** legacy round icon = the square app icon clipped to a circle (the mark stays inside the circle) — cost: none seen.
- **Task 4b:** device check of icons/splash and cold-start timing moved to Task 12 (one device session).
- **Task 6:** passport Bigger/Smaller became Zoom in/Zoom out and Move photo up/down/left/right (the photo moves, not the frame) — the old tests were rewritten for the new behaviour, not loosened — cost: the shopkeeper relearns two button names. **Found wrong by the whole-branch review** (five tests had been dropped; see Final).
- **Task 6:** face stage capped at 40 vh (target-size at 320x640 flagged a button straddling the bar at 46 vh).
- **Task 4c:** family words → 'the shopkeeper' and 'the owner', on screen 'ask the person who set up this app'; gendered pronouns next to them made neutral — cost: some older docs read slightly more formal.
- **Task 4c:** preflight expects the checkout it lives in instead of a fixed D:/ path (same protection on this PC; clones work) — cost: none found.
- **Task 4c:** evidence screenshots (PNG) were not re-shot; any old family wording inside those images stays — cost: a reader of old evidence images may see it.
- **Task 7:** old tests that encoded 'no border / cut lines on every sheet' were updated to the owner's new default (1½ pt border, no cut lines beside it); the cut-line case is tested with No border — cost: none (requirement change).
- **Task 7:** an old job saved before this version prints without a border (its choice had none); new jobs get the default — cost: an in-progress job after the update shows no border until Border is chosen.
- **Task 7:** Settings' size question offers 'Custom size' only once one is set; the job's Size list offers the shop's size and any size made on Adjust.
- **Task 7b:** documents default to each page as in the file (not forced portrait) until a direction is chosen — the owner's 'as is for all categories' vs 'portrait for all'; photos and passport default to portrait — cost: if the owner wants documents forced upright, one line (plan.ts documentPlan) changes.
- **Task 7b:** tests that asserted the old automatic sideways page were updated (choose Landscape where sideways display is the point) — owner's requirement change, not weakening.
- **Task 9:** sizes have no orientation of their own — the job's paper direction (Task 7b) is the page direction, so 'arranged' = job.sizes only — cost: none (simpler than the plan's {orientation, sizes}).
- **Task 9:** the paper direction keeps chosen sizes (they re-flow); layout, pages and paper reset them — cost: a size that fitted one direction may be shrunk in the other.
- **Task 10:** helper module named place.ts (Adjust.tsx and adjust.ts collide on Windows' case-insensitive file system).
- **Task 10:** Ready's tap-to-adjust is an onClick on the sheet (biome-ignore with reason); the Adjust photos button is the keyboard and screen-reader way — cost: none for keyboard users (button exists).
- **Task 11:** ID cards printed as the whole e-Aadhaar page have no Adjust (no cards on the sheet to size) — cost: that one size cannot be adjusted (choose another size).
- **Task 11:** e2e builds skip the background preload of lazy screens — fewer requests under 1,400 parallel pages; the on-demand path (the slower one) is what the tests exercise — cost: the preload itself is covered by lazyScreen unit tests and device runs only.
- **Task 11b:** passthrough only when the source has no more pixels than 300 dpi at its printed size (bigger camera photos are still reduced: same on paper, less data, faster) — cost: a large original is re-saved once at q92.
- **Task 11b:** an ICC profile is accepted only when its description says sRGB (Display P3 etc. are converted as before) — cost: an sRGB profile with an unusual name is decoded as before (one re-save).
- **Task 11b:** the copy uses a plain read/write loop (no sendfile/fsync in the isolated process) — cost: none measurable for photo-size files.
- **Task 12:** splash hold (setKeepOnScreenCondition until onPageCommitVisible) rejected — the callback fires before the page draws and the hold delayed the start (video) — cost: none (rejected).
- **Task 12:** the splash picture is the content view's background, not windowBackground — Capacitor SystemBars repaints the decor with windowBackground read as a colour (a drawable rendered black on device) — cost: none.
- **Task 12:** the ~0.2 s dim of the printer during Android 12+'s own splash exit fade is accepted (same place, same mark; the platform fade) — cost: a brief dim on Android 12+.
- **Task 12:** a qualifying JPEG larger than 3 bytes/pixel + 1 MB is decoded as before rather than held whole in the engine — cost: such an odd file is re-saved once.
- **Task 12:** the brief's "custom size exact" device check is covered by passportOneMmBiggerExactly (same plan → engine → file path, custom size 36×46.3 mm exact ±0.3) plus the custom-size unit tests; Settings → Custom typing is not driven on the device — cost: the Settings form itself is proven in e2e only.
- **Final:** Task 6 ruling ("old tests rewritten, not loosened") was WRONG — 5 passport e2e tests had been dropped in ad280f0; restored verbatim (all 5 pass unchanged).
- **Final:** Task 7b ruling (documents keep each page's own direction) REVERSED — it contradicted spec Part 4 ("every photo, document and passport job prints on upright paper unless … landscape") and misread the owner's "as is" (quality). Documents now default Portrait; an untouched PDF still prints as it came and is shown as in the file; any chosen direction leaves the untouched path — cost if wrong: landscape document pages print smaller until Landscape is chosen.
- **Final:** progressive JPEGs keep the as-is path (spec Part 6 says baseline or progressive) pending X11 on the Brother; the fallback is one line in JpegAsIs.qualifies — cost if wrong: a progressive photo could print wrong on a printer path that cannot read it (Ready's preview, rendered by Android, would look right).
- **Final:** Task 4c evidence images taken before the wording sweep may show old on-screen text naming the owner's family; the public single commit carries only evidence images added from 38da67f on (older ones stay in the private history) — cost: older screenshots are not public.
- **Final:** the animated splash stays (owner asked for it) at a measured ~0.2 s cost to Home on the software-rendered emulator; first frame +9.2 % (20 alternating runs) inside the spec's 10 % — cost if wrong: Home ~0.2–0.3 s later on a slow phone; "Remove animations" or dropping #splash from index.html removes it (USER-CHECKLIST §V2 asks the owner).

## Deferred minors (from the whole-branch review)

- tapping a sheet in part 2 of a big document opens Adjust at the part's own page number, not the job's (Ready.tsx adjustAt).
- Passport Size / Border / Fit the face reached from Adjust return to Ready, not to Adjust (Crop returns to Adjust).
- copyAsIs holds about 4× the file in memory (bounded by 3 bytes/pixel + 1 MB) and has no out-of-memory fallback of its own (the engine's out-of-memory handling applies).
- the splash hand-over is unproven on Android 7–11 (every old emulator image has a web engine below 92 and shows the update screen).

## Open, for the owner

- Upgrade Vite 8.3.2 → 8.3.3 (six development-server advisories; nothing shipped is affected). Needs a dependency note and a full regression (CLAUDE.md §3).
- Choose a licence for the public repository.
