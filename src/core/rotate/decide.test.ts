import { describe, expect, it } from 'vitest';
import { decideTurns, mayTurn } from './decide';

const sure = (turn: 0 | 1 | 2 | 3) => ({ turn, sure: true });
const unsure = (turn: 0 | 1 | 2 | 3) => ({ turn, sure: false });

describe('which photos are turned upright (Phase 15 spec Part 3)', () => {
  it('faces at exactly one turn decide that turn', () => {
    expect(decideTurns([1], new Map(), new Map([[1, [0, 0, 2, 0]]]))).toEqual({ 1: 2 });
  });
  it('upright faces, or faces at several turns: no turn (the text is not asked)', () => {
    expect(decideTurns([1], new Map([[1, sure(1)]]), new Map([[1, [1, 0, 0, 0]]]))).toEqual({});
    expect(decideTurns([1], new Map([[1, sure(1)]]), new Map([[1, [0, 1, 0, 1]]]))).toEqual({});
  });
  it('no face: the text direction when it is sure, else nothing', () => {
    expect(
      decideTurns(
        [1, 2],
        new Map([
          [1, sure(3)],
          [2, unsure(1)],
        ]),
        new Map([[1, [0, 0, 0, 0]]]),
      ),
    ).toEqual({ 1: 3 });
  });
  it('text alone never turns a photo upside down (right-aligned text and chat screenshots look upside down; review I3)', () => {
    expect(
      decideTurns(
        [1, 2],
        new Map([
          [1, sure(2)],
          [2, sure(1)],
        ]),
        new Map(),
      ),
    ).toEqual({ 2: 1 });
    // Faces may: a face reads only upside down.
    expect(decideTurns([1], new Map(), new Map([[1, [0, 0, 1, 0]]]))).toEqual({ 1: 2 });
  });
  it('a photo already upright by its text is left alone; photos not asked about get nothing', () => {
    expect(decideTurns([1], new Map([[1, sure(0)]]), new Map())).toEqual({});
    expect(decideTurns([], new Map([[1, sure(2)]]), new Map([[1, [0, 1, 0, 0]]]))).toEqual({});
  });
});

describe('photos chosen from the phone show as they are (owner, 2026-10-23)', () => {
  it('a job picked in the gallery or file manager is never turned by the app; a shared one may be', () => {
    expect(mayTurn({ picked: true })).toBe(false);
    expect(mayTurn({})).toBe(true);
  });
});
