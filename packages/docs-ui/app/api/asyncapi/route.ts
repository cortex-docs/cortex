import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { getDocsUiRoot, locationExists, readTextLocation } from '@/lib/load-location';

export const dynamic = 'force-static';

export async function GET() {
  const specPath =
    process.env.CORTEX_ASYNCAPI_PATH ||
    path.join(getDocsUiRoot(), '..', 'core', '__fixtures__', 'chat-asyncapi.yaml');

  if (!locationExists(specPath)) {
    return NextResponse.json({ error: 'No AsyncAPI spec configured' }, { status: 404 });
  }

  try {
    const content = await readTextLocation(specPath);
    const isYaml = specPath.endsWith('.yaml') || specPath.endsWith('.yml');

    return new NextResponse(content, {
      headers: {
        'Content-Type': isYaml ? 'text/yaml' : 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json({ error: 'AsyncAPI spec file not found' }, { status: 404 });
  }
}
