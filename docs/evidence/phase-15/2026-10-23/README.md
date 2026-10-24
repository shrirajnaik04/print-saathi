# Phase 15 evidence (auto-rotation), 2026-10-23

Synthetic inputs only. Faces on real photos can't be generated, so the face signal on real photos stays PENDING the
owner's own photos (spec Part 3 "On real photos: owner checklist").

## Text direction on a labelled generated set (`text-direction-metrics.txt`, `src/core/rotate/textTurn.test.ts`)

Documents photographed on a table (the table shows around the page), with a centred heading, a right-aligned date,
left-aligned paragraphs (indented first lines, short last lines), shadow, blur and noise; each in all 4 turns.

| Spec Part 3 acceptance | Result |
|---|---|
| Precision of the turns it applies ≥ 98 % (≥ 400 images) | **396 applied of 400, all right (1.000)**; 4 abstained |
| Abstains rather than guessing; abstain rate reported | 4 / 400 = 1 % |
| No turn for images without enough signal (blank, blobs, smooth scenes) | 0 turned of 240 (60 × 4 turns) |
| An upright page stays as it is | 30 / 30 |
| Centred and justified pages | never a wrong turn (centred abstains) |

**After the Phase 15 gate review** (the rule the app applies): text alone only ever turns a photo a quarter turn, never
upside down; screenshots (PNG) never use text; a line must have several words (blinds and fences are not text). End to
end on the set: **left-aligned pages 198 / 400 turned, 0 wrong** (the upside-down ones are left for faces or the shopkeeper);
blinds and fences 0 of 320 turned.

**Known limitation (measured, ledgered):** a page set entirely right-aligned has the same margins as a left-aligned
page upside down. Upright right-aligned pages are no longer turned, but a right-aligned page photographed sideways is
turned the wrong quarter (60 of 60 such test images end upside down). Such pages are rare in this shop's documents; the
note "Turned … upright" with **Undo** is always on screen.

## Faces (engine, Android's built-in FaceDetector at the four turns)

`CardEngineDeviceTest.aBlankPhotoHasNoFaceAtAnyTurnAndJunkFailsContained` on API 35: a blank photo has no face at any
turn ([0, 0, 0, 0]: nothing is turned); junk bytes fail contained. The rule (`decide.test.ts`): faces at exactly one
turn decide it; upright or unclear faces mean no turn and the text is not asked.

## App behaviour

- Job rules (`idcard.test.ts`, "auto-rotation in the job"): only photos nobody turned by hand; once per job; Undo takes
  back only the app's own turns; a later hand turn wins; never an ID card job or an already-framed passport photo.
- e2e (`tests/e2e/cards.spec.ts`, Phase 15 block): the note on Received and Ready, the turn reaching the print plan,
  Undo restoring the photos and the plan, no note without a signal.
- Real Android (`device-smoke/`, `scripts/device/rotate-smoke.mjs`, API 35): a photo of a typed page taken sideways
  (shared by the synthetic sender) arrives turned upright with "Turned 1 photo upright." and Undo
  (`01-received-turned.png`, `02-received-photo-upright.png`).
