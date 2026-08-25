import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { sanitizeSvg } from '@/lib/sanitize-svg';

export const dynamic = 'force-static';

const CONTENT_TYPES: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function GET() {
  const faviconPath = process.env.CORTEX_FAVICON_PATH;

  if (!faviconPath) {
    return NextResponse.json({ error: 'No favicon configured' }, { status: 404 });
  }

  try {
    const ext = path.extname(faviconPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'image/x-icon';
    const rawContent = fs.readFileSync(faviconPath);
    const content = ext === '.svg' ? sanitizeSvg(rawContent.toString('utf-8')) : rawContent;
    if (!content) throw new Error('The SVG favicon is not valid.');

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Favicon file not found' }, { status: 404 });
  }
}
