import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';

describe('icon set (Phosphor bold, PLAN §H1)', () => {
  it('every icon is SVG markup with a viewBox that inherits the text colour', () => {
    for (const [name, svg] of Object.entries(ICONS)) {
      expect(svg, name).toMatch(/^<svg[^>]*viewBox="0 0 256 256"/);
      expect(svg, name).toContain('fill="currentColor"');
    }
  });

  it('has the icons the shell needs', () => {
    for (const n of [
      'photos',
      'passport',
      'document',
      'print',
      'back',
      'home',
      'warning',
      'error',
      'info',
      'settings',
      'help',
      'recent',
      'minus',
      'plus',
      'check',
      'share',
    ])
      expect(ICONS).toHaveProperty(n);
  });
});
