import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { sanitizeSvg } from '@/lib/sanitize-svg';

export const dynamic = 'force-static';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export async function GET() {
  const logoPath = process.env.CORTEX_LOGO_PATH;

  if (!logoPath) {
    return NextResponse.json({ error: 'No logo configured' }, { status: 404 });
  }

  try {
    const ext = path.extname(logoPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const rawContent = fs.readFileSync(logoPath);
    const content = ext === '.svg' ? sanitizeSvg(rawContent.toString('utf-8')) : rawContent;
    if (!content) throw new Error('The SVG logo is not valid.');

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Logo file not found' }, { status: 404 });
  }
}
