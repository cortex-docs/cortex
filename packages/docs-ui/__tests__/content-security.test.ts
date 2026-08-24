import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../lib/markdown';
import { locationExists, resolveLocation } from '../lib/load-location';
import { sanitizeSvg } from '../lib/sanitize-svg';

describe('user content security', () => {
  it('removes executable content from Markdown HTML', async () => {
    const html = await renderMarkdown(
      '# Guide\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<h1 id="user-content-guide">Guide</h1>');
  });

  it('removes scripts, event handlers, and external references from SVG files', () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a href="https://evil.example"><path d="M0 0"/></a></svg>',
    );

    expect(svg).toBeDefined();
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('https://evil.example');
    expect(svg).toContain('<path');
  });

  it('keeps safe logo text and its typography', () => {
    const svg = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="26" y="15" font-family="sans-serif" font-size="16" font-weight="600">Petstore</text></svg>',
    );

    expect(svg).toContain('<text');
    expect(svg).toContain('font-family="sans-serif"');
    expect(svg).toContain('font-size="16"');
    expect(svg).toContain('font-weight="600"');
    expect(svg).toContain('>Petstore</text>');
  });

  it('keeps remote locations intact and resolves local locations from the project', () => {
    expect(resolveLocation('https://example.com/openapi.yaml', '/workspace/project')).toBe(
      'https://example.com/openapi.yaml',
    );
    expect(resolveLocation('specs/openapi.yaml', '/workspace/project')).toBe(
      '/workspace/project/specs/openapi.yaml',
    );
    expect(locationExists('https://example.com/openapi.yaml')).toBe(true);
  });
});
