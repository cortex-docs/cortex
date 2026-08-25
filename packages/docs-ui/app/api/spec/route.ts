import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import {
  getDocsUiRoot,
  locationExists,
  readTextLocation,
  resolveLocation,
} from '@/lib/load-location';

export const dynamic = 'force-static';

function resolveSpecPath(): string | null {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (configPath && fs.existsSync(configPath)) {
    try {
      const yaml = require('js-yaml');
      const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
      const firstRest = ((raw?.sources ?? []) as any[]).find((s: any) => s.type === 'openapi-spec');
      if (firstRest?.spec) {
        const resolved = resolveLocation(firstRest.spec, path.dirname(configPath));
        if (locationExists(resolved)) return resolved;
      }
    } catch {}
  }

  if (process.env.CORTEX_SPEC_PATH && locationExists(process.env.CORTEX_SPEC_PATH)) {
    return process.env.CORTEX_SPEC_PATH;
  }

  const fallback = path.join(getDocsUiRoot(), '..', 'core', '__fixtures__', 'petstore.yaml');
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

export async function GET() {
  const specPath = resolveSpecPath();
  if (!specPath) {
    return NextResponse.json({ error: 'Spec file not found' }, { status: 404 });
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
    return NextResponse.json({ error: 'Spec file not found' }, { status: 404 });
  }
}
