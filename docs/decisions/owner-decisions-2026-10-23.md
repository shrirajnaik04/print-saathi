# Owner decisions — 2026-10-23

Recorded from the owner's test of APK 1.0.176 on their own phone (curved screen) on the evening of 2026-10-23, and from
their answers to the questions that followed. Spec:
`docs/superpowers/specs/2026-10-23-owner-phone-feedback-adjust-design.md`. They apply from Phase 16 on.

Several decisions override a rule of the approved plan (`docs/PLAN.md`). Each row names the rule, the new decision, and
what keeps the plan's intent.

| # | Topic | PLAN rule it overrides | Decision | What still holds |
|---|---|---|---|---|
| 1 | Adjust photos on the preview | §N "not yet": *a free-form layout editor* | Every preview (photos, document pages, passport, ID cards) has **Adjust**: per photo Bigger/Smaller (also by dragging a corner), Turn, Crop, Move earlier/later, Remove | Not free-form. Photos keep their order and flow on the page with no overlap, never outside the paper, and move to a new page when they no longer fit. Every drag has a button. The size shown is the size printed (device-checked ±0.5 mm) |
| 2 | Medium size | §H1 type: body 20 px, buttons 22 px, titles 28 px; 16 dp gutter | About **15 % smaller**: body 17 px, titles 24 px, buttons 18 px; **24 px side gutter** (curved screens hid card borders) | Touch targets stay ≥ 56 px (3.5 rem); text still follows the phone's size up to 200 %; AAA contrast unchanged (tokens.test) |
| 3 | Photos picked from the gallery or file manager | Phase 15 automatic turning applied to all photos | Picked photos are shown **as they are**, never turned by the app | The camera's own "which way up" note (EXIF) is still obeyed, as every gallery does. Shared photos still get the Phase 15 suggestion with Undo |
| 4 | Paper direction | §G0 "each tried upright and sideways"; §J3 "on a sideways page if needed" | **Portrait by default for all**, documents included (spec Part 4); Portrait or Landscape is a choice (Change → Paper direction) | A customer's own PDF sent untouched (Colour, all pages, 1 copy, nothing changed) still prints as it came; choosing a direction makes the app lay its pages on that paper. (An earlier executor ruling kept documents' own page directions; the whole-branch review found it contradicted the spec, and it was reverted on 2026-10-24) |
| 5 | Passport border | §G0 passport: cut lines along the gaps | **Black border, 1½ pt by default**; choices ½, 1, 1½, 2¼, 3 pt or none | With "No border" the cut lines come back. The border sits inside the photo; the photo's size on paper is unchanged (device-checked) |
| 6 | Passport size | Presets only | **3.5 × 4.5 cm stays the default**; Settings adds a custom size, 15–100 mm | A size too big for 4×6 photo paper goes on A4 and Ready says so; a size too big for A4 is refused |
| 7 | How jobs are sent to the printer | §D4: photo layouts use `PHOTO` content type | **Every job is sent as a document** (prints faster on the shop printer); an optional "Best photo quality" sends photo layouts as `PHOTO` | Nothing about the file changes: same pages, same resolution, same sizes. Only the hint to the print service changes |
| 8 | Original photos untouched | §G2: every placement decoded and encoded once (JPEG q92) | A plain JPEG that the print does not need smaller goes into the print file **as its own picture, byte for byte** (baseline or progressive, as the spec says) | Only the picture: its notes (EXIF place and time, profile, extras) are left out (self-audit 2026-10-24). Photos bigger than the print needs are still reduced (same on paper, less data). B&W, styles, crops, files stored as RGB and previews are drawn as before. **Risk:** the shop printer's path now reads the customer's own JPEG data (including progressive JPEGs); USER-CHECKLIST §X10–X11 checks it on the Brother. If it fails, the fix is one line in `JpegAsIs.qualifies` (baseline only, or off) |
| 9 | Aadhaar & ID cards tile | Opened the document picker | It asks **"Where is the card?"**: photos of the card (gallery, at most 2) or an e-Aadhaar PDF or file (file manager) | Same intake, same isolated engine |
| 10 | Continue the last job | On top of Home | **Below the four tiles** | — |
| 11 | Logo and splash | — | New logo pack v3 everywhere (launcher, themed icon, splash, Home); a light animated splash | CSS transform/opacity only, ~0.75 s, none with "Remove animations"; no waiting added (splash hand-over, 2026-10-24 evidence) |
| 12 | Open source | — | No mention of the owner's family anywhere in the repository; neutral wording ("the shopkeeper", "the owner"; on screen "ask the person who set up this app") | Guarded by `scripts/quality/open-source.test.mjs` |
| 13 | Publishing | — | Push to `https://github.com/shrirajnaik04/print-saathi.git` as a **fresh history with one commit**, author name and Gmail | The full private history is kept locally. Git-ignored files (the logo pack source, the owner's sample photo) are never published |

## Self-check against the plan's guarantees

| Guarantee | Effect of these decisions |
|---|---|
| Security and privacy | No change to permissions, backups or network. Decision 8 adds a JPEG header reader **inside** the isolated engine (the app process still never parses a customer file); the print service and printer now receive the original photo's picture data instead of the app's re-saved copy, as they already receive a customer's untouched PDF; the photo's notes (EXIF place and time) are dropped |
| Offline, ₹0 | No change |
| Print and image quality | Better or equal: decision 8 removes a re-save; decision 7 changes only the hint; nothing lowers resolution |
| APK and runtime cost | Startup JS stays within the 60 KB budget (lazy screens); the splash uses no script per frame |
| Real-world proof | All PENDING REAL-WORLD VALIDATION on the owner's phone and the shop printer (USER-CHECKLIST §V–§X) |
