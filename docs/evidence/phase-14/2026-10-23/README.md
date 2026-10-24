# Phase 14 evidence (Aadhaar & ID card copy), 2026-10-23

All test inputs are synthetic (generated cards, a generated e-Aadhaar-like PDF). No real card or real e-Aadhaar was
used or stored; real-photo numbers stay PENDING until the owner provides his own photos (spec Part 2).

## Card detector on the generated corpus (`detector-metrics.txt`, JVM `CardDetectTest`)

Corpus (fixed seeds): 960 × 720 phone-like photos; a random camera (focal length 0.7–1.1 × width, the detector does
not know it), the card tilted up to 35° in any direction, any rotation, shadow across the photo, camera blur, sensor
noise σ 6, JPEG quality 75. "Clear background" = the card's whole outline, its top band included, at least 22 grey
levels from the table.

| Acceptance (spec Part 2) | Result |
|---|---|
| Corner error ≤ 1.5 % of the diagonal in ≥ 95 % of clear-background photos | **231 / 240 = 96.3 %** (paper 60/60, dark 60/60, cloth 60/60, **banded wood 51/60 = 85 %**) |
| Front + back in one photo: both found | 38 / 40 (plan target ≥ 90 %) |
| No false card at the auto-accept level in 100 card-free photos | **0 / 100** (blobs, wood, A4 pages upright and sideways, phone screenshots) |
| A tiny card (4 % of the photo) | never auto-accepted |
| Hostile bytes (200 random / blank / constant images) | no exception |
| Time | 12 ms per photo on the PC (expect roughly 10–20× on a low-end phone) |

Honest reading: the wood generated here has bands of 70 grey levels, stronger than the card's own step against it;
there 15 % of cards are not found and go to Fix corners (one more step, never a wrong print: the cards screen shows
the straightened card before anything prints).

## Engine on Android (`device/`, `CardEngineDeviceTest`)

5 / 5 on **API 24 (2 GB)** and **API 35**: a slanted synthetic card photo found within 1.5 % of the diagonal; a
straightened card exactly 1012 × 638 px keeping its colour (± 4); both panels of the e-Aadhaar-like PDF found and
straightened from the vector page; no face on a blank image; hostile bytes fail contained and the engine keeps working.

## Web app

- `src/core/plan/idcard.test.ts` (9): real size exactly 85.6 × 54 mm, 20 mm from the top, 10 mm apart, cut lines;
  big ≤ 2× and inside the printer's edges; many copies (4 sets on A4 with 6 mm edges); one card; whole page; swap,
  half turn, Fix corners; bad corners refused; Black & white.
- `src/screens/cards/cards.test.ts` (10): which cards print and which is the front, upside-down cards, a photo with
  both sides, a PDF without panels, corners at the photo's edge, corners set by hand on a standing card.
- `tests/e2e/cards.spec.ts` (15; 7 added by the gate review fixes): the flows (two photos, front by face and Swap, Fix corners keeps corners, no card,
  unsure card, shared e-Aadhaar with the whole-page size and the remembered size, locked e-Aadhaar unlocks first,
  many copies). Tap counts in `shell.spec.ts`: share 4, from Home 5.
- Shared plan contract `android/app/src/test/resources/plan-v1-idcard.json`, parsed by the JVM renderer.

## Device smoke (`device-smoke/api35/` first run, `device-smoke/api35-final/` at d42e783 with its checks, `scripts/device/card-smoke.mjs`)

On the Medium_Tablet emulator (API 35), from the synthetic share sender:
- two slanted card photos on a brown table → Received → **ID card copy** → "2 ID cards found" (0 to check) → Card
  copy → Real card size → Ready "ID card · real size · A4 · Colour · 1 copy" → the print file read back: page
  595.28 × 841.89 pt (A4), two images of 1012 × 638 px each placed at **242.65 × 153.07 pt = 85.6 × 54.0 mm** →
  PRINT opened Android's print screen;
- a shared e-Aadhaar-like PDF → Received offers ID card copy and Print the whole document → "2 ID cards found" →
  How big? offers all four sizes (incl. Whole e-Aadhaar page) → the same exact print file.

Screenshots 01–10 and `card-smoke.json` (its `checks`: both found, A4, every card 85.6 × 54.0 mm ± 0.5 mm, four sizes for
the PDF — the script exits 1 if any fails). On paper with a ruler: owner checklist (PENDING).

After the gate review the device test also checks the e-Aadhaar panel's own content (its photo block and paper), on
API 24 (2 GB) and API 35 (`device/CardEngineDeviceTest-api24.xml`, `-api35.xml`).
