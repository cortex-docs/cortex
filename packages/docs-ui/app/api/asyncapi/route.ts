import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';

export async function GET() {
  const specPath =
    process.env.CORTEX_ASYNCAPI_PATH ||
    path.join(process.cwd(), '..', 'core', '__fixtures__', 'chat-asyncapi.yaml');

  if (!fs.existsSync(specPath)) {
    return NextResponse.json({ error: 'No AsyncAPI spec configured' }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(specPath, 'utf-8');
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
