import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import * as yaml from 'js-yaml';
import { normalizeRepositoryUrl } from '@cortex/core';

interface SourceLanguage {
  language: string;
  package_name: string;
  github_repository?: string;
}

interface Source {
  title: string;
  type: string;
  spec: string;
  languages: SourceLanguage[];
}

interface SdkPackage {
  language: string;
  languageDisplayName: string;
  packageName: string;
  githubRepository?: string;
  protocols: string[];
}

const DISPLAY_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  kotlin: 'Kotlin',
  ruby: 'Ruby',
  php: 'PHP',
  csharp: 'C#',
  rust: 'Rust',
  cpp: 'C++',
  c: 'C',
};

const PROTOCOL_LABELS: Record<string, string> = {
  'openapi-spec': 'REST',
  'asyncapi-spec': 'WebSocket',
  'graphql-spec': 'GraphQL',
  'grpc-spec': 'gRPC',
  'openrpc-spec': 'OpenRPC',
};

function findConfigFile(): string | null {
  const configPath = process.env.CORTEX_CONFIG_PATH;
  if (configPath && fs.existsSync(configPath)) return configPath;

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
    return NextResponse.json({ packages: [] });
  }

  try {
    const raw = yaml.load(fs.readFileSync(configFile, 'utf-8')) as Record<string, unknown>;
    const sources = (raw?.sources as Source[]) ?? [];

    const pkgMap = new Map<string, SdkPackage>();

    for (const source of sources) {
      const protocolLabel = PROTOCOL_LABELS[source.type] ?? source.type;
      for (const lang of source.languages) {
        const key = `${lang.language}:${lang.package_name}`;
        const existing = pkgMap.get(key);
        if (existing) {
          if (!existing.protocols.includes(protocolLabel)) {
            existing.protocols.push(protocolLabel);
          }
        } else {
          pkgMap.set(key, {
            language: lang.language,
            languageDisplayName: DISPLAY_NAMES[lang.language] ?? lang.language,
            packageName: lang.package_name,
            githubRepository: lang.github_repository
              ? normalizeRepositoryUrl(lang.github_repository)
              : undefined,
            protocols: [protocolLabel],
          });
        }
      }
    }

    return NextResponse.json(
      { packages: Array.from(pkgMap.values()) },
      { headers: { 'Cache-Control': 'no-cache' } },
    );
  } catch {
    return NextResponse.json({ packages: [] });
  }
}
