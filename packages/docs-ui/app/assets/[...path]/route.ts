import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { NextResponse } from 'next/server';
import { projectAssetStaticParams } from '@/lib/static-route-params';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams(): Array<{ path: string[] }> {
  return projectAssetStaticParams();
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (!configPath) {
    return NextResponse.json({ error: 'No project configuration was found.' }, { status: 404 });
  }

  const { path: segments } = await params;
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('/') ||
        segment.includes('\\') ||
        segment.includes('\0'),
    )
  ) {
    return NextResponse.json({ error: 'The asset path is not valid.' }, { status: 400 });
  }

  try {
    const assetsRoot = fs.realpathSync(nodePath.join(nodePath.dirname(configPath), 'assets'));
    const assetPath = fs.realpathSync(nodePath.join(assetsRoot, ...segments));
    if (!assetPath.startsWith(`${assetsRoot}${nodePath.sep}`) || !fs.statSync(assetPath).isFile()) {
      throw new Error('The asset path is outside the project asset directory.');
    }

    const extension = nodePath.extname(assetPath).toLowerCase();
    return new NextResponse(fs.readFileSync(assetPath), {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Asset file not found.' }, { status: 404 });
  }
}
