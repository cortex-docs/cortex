import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';

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
    const content = fs.readFileSync(logoPath);
    const ext = path.extname(logoPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Logo file not found' }, { status: 404 });
  }
}
