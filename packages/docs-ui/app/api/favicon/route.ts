import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';

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
    const content = fs.readFileSync(faviconPath);
    const ext = path.extname(faviconPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'image/x-icon';

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Favicon file not found' }, { status: 404 });
  }
}
