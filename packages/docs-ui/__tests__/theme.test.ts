import { describe, expect, it } from 'vitest';
import { getAppearanceFromSearch } from '../components/docs/theme-provider';

describe('docs appearance query parameter', () => {
  it('accepts light and dark appearances in any query position', () => {
    expect(getAppearanceFromSearch('?appearance=light')).toBe('light');
    expect(getAppearanceFromSearch('?tab=overview&appearance=dark&source=nav')).toBe('dark');
  });

  it('ignores missing, invalid, and case-mismatched appearances', () => {
    expect(getAppearanceFromSearch('')).toBeUndefined();
    expect(getAppearanceFromSearch('?appearance=system')).toBeUndefined();
    expect(getAppearanceFromSearch('?appearance=Dark')).toBeUndefined();
  });
});
