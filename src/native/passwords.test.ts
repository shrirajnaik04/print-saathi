import { describe, expect, it } from 'vitest';
import { passwords } from './passwords';

describe('passwords stay in memory, per job (PLAN §G5)', () => {
  it('are given only for their job and forgotten with it', () => {
    passwords.set('a', 1, 'RAMA1965');
    passwords.set('b', 2, 'SITA1970');
    expect(passwords.forJob('a')).toEqual({ 1: 'RAMA1965' });
    passwords.clearJob('a');
    expect(passwords.forJob('a')).toEqual({});
    expect(passwords.forJob('b')).toEqual({ 2: 'SITA1970' });
    passwords.clearAll();
    expect(passwords.forJob('b')).toEqual({});
  });
  it('are forgotten for every job no longer on the screens (review I5)', () => {
    passwords.set('a', 1, 'RAMA1965');
    passwords.set('b', 2, 'SITA1970');
    passwords.keepOnly(['b']);
    expect(passwords.forJob('a')).toEqual({});
    expect(passwords.forJob('b')).toEqual({ 2: 'SITA1970' });
    passwords.clearAll();
  });
  it('a job id that starts like another never gets its passwords', () => {
    passwords.set('ab', 1, 'X');
    expect(passwords.forJob('a')).toEqual({});
    passwords.clearAll();
  });
});
