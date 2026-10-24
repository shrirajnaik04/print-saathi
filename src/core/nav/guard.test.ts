import { describe, expect, it } from 'vitest';
import { exitsApp, leftJob } from './guard';
import type { Screen } from './stack';

// Owner, round 4: ask before a step leaves an unprinted job's screens, and before Back on Home closes the app.
const home: Screen = { name: 'home', params: {} };
const at = (name: string, jobId?: string): Screen => ({ name, params: jobId ? { jobId } : {} });

describe('which steps leave a job', () => {
  it('Back from the job’s first screen leaves it', () => {
    expect(leftJob([home, at('ready', 'a')], { type: 'back' })).toBe('a');
  });
  it('Back within the job does not', () => {
    expect(leftJob([home, at('ready', 'a'), at('change', 'a')], { type: 'back' })).toBeNull();
  });
  it('Home from any of its screens does', () => {
    expect(leftJob([home, at('ready', 'a'), at('change', 'a')], { type: 'home' })).toBe('a');
  });
  it('a printed job (its Result) never asks', () => {
    expect(leftJob([home, at('ready', 'a'), at('result', 'a')], { type: 'home' })).toBeNull();
    expect(leftJob([home, at('result', 'a')], { type: 'back' })).toBeNull();
  });
  it('screens without a job never ask', () => {
    expect(leftJob([home, at('settings')], { type: 'home' })).toBeNull();
    expect(leftJob([home, at('recent')], { type: 'back' })).toBeNull();
  });
  it('Home opening another screen (Start a new job) is the shopkeeper’s own choice: no question', () => {
    expect(
      leftJob([home, at('ready', 'a'), at('newfiles', 'a')], { type: 'home', andOpen: at('received', 'b') }),
    ).toBeNull();
  });
  it('a step the shopkeeper already chose to leave by (Cancel while photos get ready) never asks', () => {
    expect(leftJob([home, at('received', 'a')], { type: 'home', sure: true })).toBeNull();
    expect(leftJob([home, at('received', 'a')], { type: 'back', sure: true })).toBeNull();
  });
  // Review M3: "New files arrived" carries the open job's id, but it is about the new files: Home or Back from it never
  // asks (its Delete this job would delete the previous customer's job).
  it('New files arrived never asks', () => {
    expect(leftJob([home, at('ready', 'a'), at('newfiles', 'a')], { type: 'home' })).toBeNull();
    expect(leftJob([home, at('newfiles', 'a')], { type: 'back' })).toBeNull();
  });
  it('pushing or replacing never leaves a job', () => {
    expect(leftJob([home, at('ready', 'a')], { type: 'push', screen: at('change', 'a') })).toBeNull();
    expect(leftJob([home, at('ready', 'a')], { type: 'replace', screen: at('result', 'a') })).toBeNull();
  });
});

describe('which step closes the app', () => {
  it('Back on Home', () => {
    expect(exitsApp([home], { type: 'back' })).toBe(true);
  });
  it('not Back anywhere else, nor Home', () => {
    expect(exitsApp([home, at('settings')], { type: 'back' })).toBe(false);
    expect(exitsApp([home], { type: 'home' })).toBe(false);
  });
});
