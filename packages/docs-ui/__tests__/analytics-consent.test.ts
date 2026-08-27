import { describe, expect, it } from 'vitest';
import { analyticsAllowed, isAnalyticsHost } from '../lib/analytics-consent';

describe('analytics consent', () => {
  it('restricts analytics to configured production hosts', () => {
    const hosts = ['docs.cortexdocs.dev', 'demo.cortexdocs.dev'];
    expect(isAnalyticsHost('docs.cortexdocs.dev', hosts)).toBe(true);
    expect(isAnalyticsHost('DOCS.CORTEXDOCS.DEV', hosts)).toBe(true);
    expect(isAnalyticsHost('localhost', hosts)).toBe(false);
    expect(isAnalyticsHost('preview.example.com', [])).toBe(true);
  });

  it('requires an explicit choice in consent regions', () => {
    expect(analyticsAllowed({ choice: null, required: true, enabled: true, ready: true })).toBe(
      false,
    );
    expect(
      analyticsAllowed({ choice: 'granted', required: true, enabled: true, ready: true }),
    ).toBe(true);
    expect(
      analyticsAllowed({ choice: 'denied', required: false, enabled: true, ready: true }),
    ).toBe(false);
  });

  it('starts analytics without a choice outside consent regions', () => {
    expect(analyticsAllowed({ choice: null, required: false, enabled: true, ready: true })).toBe(
      true,
    );
    expect(analyticsAllowed({ choice: null, required: false, enabled: false, ready: true })).toBe(
      false,
    );
  });
});
