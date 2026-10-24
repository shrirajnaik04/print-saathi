# Phase 15 — Auto-rotation Implementation Plan

> **For agentic workers:** executed inline (superpowers:executing-plans), owner asleep (autonomous run).

**Goal:** photos that arrive sideways or upside down are turned upright by themselves, with a note and Undo.

**Architecture:** two signals, each abstaining when unsure. Text direction runs in the web app on the existing
≤ 512 px raw-grey analysis bytes (the same bytes the black-edge check uses; pure TS, vitest-tested on a generated
set). Faces run in the isolated engine (Android's built-in `FaceDetector` on the four turns). The result goes into
the job's existing `turns`, so preview, print and Undo already work.

**Spec:** docs/superpowers/specs/2026-10-23-fluent-look-id-cards-auto-rotation-design.md, Part 3.

## Global Constraints
- No library, no network, no Play services; customer images parsed only in the engine (the analysis bytes are the
  engine's own output, as for black edges).
- Plain English: "Turned 2 photos upright · Undo".
- Never for a photo the shopkeeper already turned by hand, nor a passport photo after framing, nor an ID card job (its cards
  have their own orientation).
- Precision ≥ 98 % on the applied turns of a labelled generated set (≥ 400 images); abstain rate reported.

## Review Focus
1. A photo with no text and no face (blank, abstract, a landscape) is never turned.
2. Right-aligned, centred or justified text abstains instead of guessing 180°.
3. A job reopened later (Continue) does not turn again, and Undo is not undone by a later look.
4. Turns from Photo tools always win over auto-turns.
5. The engine call failing or timing out changes nothing.

### Task 1: Text direction (TS, pure)
**Files:** Create `src/core/rotate/textTurn.ts`, test `src/core/rotate/textTurn.test.ts` (generator in
`src/core/rotate/pages.testkit.ts`).
**Produces:** `textTurn(grey: Uint8Array, w: number, h: number): { turn: 0 | 1 | 2 | 3; sure: boolean }` — the
clockwise quarter turns that make the image upright.
- Bradley binarisation (window ≈ min(w, h) / 8, ink below 0.85 × the local mean).
- Projection-profile energy across rows vs columns: lines run along the axis whose profile alternates; ≥ 1.8× or abstain.
- Line starts vs ends (aligned margin = start): their spread ratio ≥ 2 or abstain; at least 4 text lines.
**Tests:** generated pages (left-aligned paragraphs, indents, short last lines) in 4 turns, ≥ 400: precision ≥ 98 %
of applied turns, abstain rate printed; blank, noise, photo-like blobs, centred and justified text: never applied.

### Task 2: Faces (engine)
**Files:** `isolated/Cards.kt` (`faceTurns`), `IEngine.aidl` `int[] faceTurns(in PFD src, int maxLongSidePx)` →
`{faces at turn 0, 1, 2, 3}`; `EngineClient.faceTurns`; plugin `faceTurns({ jobId })` → `{ items: [{ index, faces: [4] }] }`.
**Rule (TS):** turn t only when faces appear at exactly one turn t ≠ 0 and none at the others.
**Tests:** device: a blank image → [0, 0, 0, 0]; hostile bytes contained. (Real faces can't be generated: the face
signal on real photos is PENDING the owner's photos.)

### Task 3: Apply with Undo
**Files:** `job.ts` (`autoTurned?: Record<number, 1 | 2 | 3>`, actions `autoTurn`, `undoAutoTurn`; `turnItem` clears
the item's auto mark), `src/screens/rotate.ts` (`suggestTurns(job)`: analysis bytes + faceTurns → turns), Received
(runs it while the shopkeeper reads the choices; note "Turned N photos upright · Undo").
**Tests:** reducer (only untouched photos; Undo restores; a hand turn wins), e2e (`?mockTurn=…`): the note, Undo, the
turn reaches the plan.

Commit per task; gate review; regression; closure `docs/qa/phase-15.md`.
