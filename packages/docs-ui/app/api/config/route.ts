import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';

export const dynamic = 'force-dynamic';

function findConfigFile(): string | null {
  const specPath = process.env.CORTEX_SPEC_PATH;
  if (specPath) {
    const dir = path.dirname(specPath);
    for (const name of ['cortex.config.yml', 'cortex.config.yaml', 'cortex.yml']) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export async function GET() {
  const configFile = findConfigFile();
  if (!configFile) {
    return NextResponse.json({ title: 'API Docs', project: '' });
  }

  try {
    const raw = yaml.load(fs.readFileSync(configFile, 'utf-8')) as Record<string, unknown>;
    const home = raw?.home as Record<string, unknown> | undefined;
    const configDir = path.dirname(configFile);

    let homeSections = home?.sections as Record<string, unknown>[] | undefined;
    if (homeSections) {
      homeSections = homeSections.map((s: Record<string, unknown>) => {
        if (s.icon && typeof s.icon === 'string' && !(s.icon as string).startsWith('<')) {
          const iconPath = path.resolve(configDir, s.icon as string);
          if (fs.existsSync(iconPath)) {
            return { ...s, iconSvg: fs.readFileSync(iconPath, 'utf-8') };
          }
        }
        return s;
      });
    }

    const readSvg = (p: string): string | undefined => {
      if (p && p.endsWith('.svg') && fs.existsSync(p)) {
        try { return fs.readFileSync(p, 'utf-8'); } catch {}
      }
      return undefined;
    };

    const logoDarkPath = raw?.logo_dark ? path.resolve(configDir, raw.logo_dark as string) : '';
    const logoLightPath = raw?.logo_light ? path.resolve(configDir, raw.logo_light as string) : '';
    const logoPath = raw?.logo ? path.resolve(configDir, raw.logo as string) : '';

    return NextResponse.json({
      project: (raw?.project as string) ?? '',
      title: (raw?.title as string) ?? '',
      primaryColor: (raw?.primaryColor as string) ?? undefined,
      hasLogo: !!(readSvg(logoDarkPath) || readSvg(logoLightPath) || readSvg(logoPath)),
      logoSvg: readSvg(logoPath),
      logoDarkSvg: readSvg(logoDarkPath),
      logoLightSvg: readSvg(logoLightPath),
      logoHeight: (raw?.logoHeight as number) ?? undefined,
      showLogoDocsLabel: (raw?.showLogoDocsLabel as boolean) ?? true,
      theme: (raw?.theme as string) ?? 'system',
      home: home ? {
        title: home.title,
        description: home.description,
        cta: home.cta,
        sections: homeSections,
      } : undefined,
    }, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  } catch {
    return NextResponse.json({ title: 'API Docs', project: '' });
  }
}
