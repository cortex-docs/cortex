import { describe, expect, it } from 'vitest';
import { primaryPalette, primaryThemeCss } from '../lib/primary-theme';

describe('primary button contrast', () => {
  it.each(['#c2410c', '#2563eb', '#7c3aed', '#000000', '#0000ff'])(
    'uses white text on %s',
    (color) => {
      expect(primaryPalette(color).foreground).toBe('#ffffff');
    },
  );

  it.each(['#ffffff', '#ffff00', '#00ff00', '#f97316', '#ff0000'])(
    'uses dark text on a light fill (%s)',
    (color) => {
      expect(primaryPalette(color).foreground).toBe('#0a0a0a');
    },
  );

  it('keeps the chosen button fill instead of brightening it in dark mode', () => {
    expect(primaryPalette('#2563eb').background).toBe('rgb(37,99,235)');
    expect(primaryThemeCss('#2563eb').match(/--color-primary:rgb\(37,99,235\)/g)).toHaveLength(3);
  });

  it('ignores invalid colors before producing CSS', () => {
    expect(primaryThemeCss('red')).toBe('');
    expect(primaryThemeCss('#fff; color:red')).toBe('');
  });
});
