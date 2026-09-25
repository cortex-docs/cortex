/** Shared by the CLI and the hosting Worker. Keep this module free of Node APIs. */
import { load } from 'js-yaml';
import { cortexConfigSchema } from './config/schema';
import type { CortexConfig } from './config/types';

export const HOSTING_API = 'https://deploy.cortexdocs.dev';
export const MAX_SITE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SITE_FILES = 2000;
export const IMMUTABLE_TTL = 31_536_000;
export const ROUTING_TTL = 30;
export const RESERVED_PROJECTS = new Set([
  'www',
  'api',
  'deploy',
  'docs',
  'static',
  'demo',
  'app',
  'admin',
  'status',
  'mail',
  'support',
  'assets',
  'cdn',
  'auth',
  'cortex',
  'cortex-docs',
  'origin',
  'customers',
]);

export function assertProjectName(project: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(project) || project.startsWith('xn--')) {
    throw new Error(
      'Change "project" in cortex.config.yml to 1–63 lowercase letters, digits, or hyphens; start and end with a letter or digit.',
    );
  }
  if (RESERVED_PROJECTS.has(project))
    throw new Error(
      `Project name "${project}" is reserved. Change "project" in cortex.config.yml and commit it to the default branch.`,
    );
}

export function parseRepository(input: string): { owner: string; name: string; url: string } {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      input,
    );
  if (!match || match[2] === '.' || match[2] === '..')
    throw new Error('Use a public GitHub repository URL: https://github.com/OWNER/REPO.');
  return { owner: match[1], name: match[2], url: `https://github.com/${match[1]}/${match[2]}` };
}

export function repositoryPath(value: string): string {
  const clean = value.replace(/^(\.\/)+/, '');
  if (
    !clean ||
    clean.startsWith('/') ||
    /[\\?#:]/.test(clean) ||
    [...clean].some((char) => char.charCodeAt(0) < 32) ||
    clean.split('/').some((p) => !p || p === '.' || p === '..')
  ) {
    throw new Error(`Expected a file inside the repository: ${value}`);
  }
  return clean;
}

export async function sha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface RepositoryFile {
  path: string;
  sha: string;
  size: number;
}
export interface RepositorySnapshot {
  repository: string;
  repositoryId: number;
  branch: string;
  commit: string;
  configText: string;
  config: CortexConfig;
  files: RepositoryFile[];
  fingerprint: string;
}
export type Fetcher = typeof globalThis.fetch;

export async function githubJson<T>(
  pathname: string,
  token?: string,
  fetcher: Fetcher = fetch,
): Promise<T> {
  const response = await fetcher(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Cortex-Docs',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    redirect: 'manual',
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429)
      throw new Error(
        'GitHub denied this request or its rate limit was reached. Set GITHUB_TOKEN with repository access and retry.',
      );
    throw new Error(
      `GitHub request failed (${response.status}). Check the public repository URL and GITHUB_TOKEN permissions.`,
    );
  }
  return (await response.json()) as T;
}

export async function readRepositoryFile(
  snapshot: Pick<RepositorySnapshot, 'repository' | 'commit'>,
  file: RepositoryFile,
  fetcher: Fetcher = fetch,
): Promise<Uint8Array> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`Repository file exceeds 5 MiB: ${file.path}`);
  const repo = parseRepository(snapshot.repository);
  const url = `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${snapshot.commit}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'manual',
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(`Cannot read ${file.path} at the default-branch commit (${response.status}).`);
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > file.size || length > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new Error(`Repository file exceeds its expected size: ${file.path}`);
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes.byteLength > MAX_FILE_BYTES || bytes.byteLength !== file.size)
    throw new Error(`Repository file exceeds its expected size: ${file.path}`);
  return bytes;
}

export function specificationReferences(filename: string, text: string): string[] {
  if (/\.proto$/i.test(filename))
    return [...text.matchAll(/\bimport\s+(?:(?:public|weak)\s+)?["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
  if (/\.(?:graphql|gql)$/i.test(filename)) return [];
  const references: string[] = [];
  const visited = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string') references.push(child);
      else visit(child);
    }
  };
  visit(load(text));
  return references;
}

export async function readRepositorySnapshot(
  input: string,
  options: {
    token?: string;
    requirePush?: boolean;
    previous?: RepositorySnapshot;
    fetcher?: Fetcher;
  } = {},
): Promise<RepositorySnapshot> {
  const { token, requirePush, previous, fetcher = fetch } = options;
  const repo = parseRepository(input);
  const base = `/repos/${repo.owner}/${repo.name}`;
  const metadata = await githubJson<{
    id: number;
    private: boolean;
    visibility?: string;
    default_branch: string;
    full_name: string;
    permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
  }>(base, token, fetcher);
  if (metadata.private || (metadata.visibility && metadata.visibility !== 'public'))
    throw new Error('Free Cortex hosting and repository MCP require a public GitHub repository.');
  if (
    requirePush &&
    !metadata.permissions?.push &&
    !metadata.permissions?.admin &&
    !metadata.permissions?.maintain
  )
    throw new Error('Deploy requires a GitHub token with write access to this repository.');
  const head = await githubJson<{ sha: string; commit: { tree: { sha: string } } }>(
    `${base}/commits/${encodeURIComponent(metadata.default_branch)}`,
    token,
    fetcher,
  );
  if (previous?.commit === head.sha && previous.repositoryId === metadata.id)
    return {
      ...previous,
      branch: metadata.default_branch,
      repository: `https://github.com/${metadata.full_name}`,
    };
  const tree = await githubJson<{
    truncated: boolean;
    tree: Array<{ path: string; type: string; mode: string; sha: string; size?: number }>;
  }>(`${base}/git/trees/${head.commit.tree.sha}?recursive=1`, token, fetcher);
  if (tree.truncated) throw new Error('The repository tree is too large to validate safely.');
  const entries = new Map(tree.tree.filter((f) => f.type === 'blob').map((f) => [f.path, f]));
  const configFile = entries.get('cortex.config.yml');
  if (!configFile)
    throw new Error(
      'Commit cortex.config.yml to the root of the public repository’s default branch before deploying.',
    );
  if (configFile.mode !== '100644' && configFile.mode !== '100755')
    throw new Error('cortex.config.yml must be a regular file.');
  if ((configFile.size ?? 0) > 256 * 1024) throw new Error('cortex.config.yml exceeds 256 KiB.');
  const location = { repository: `https://github.com/${metadata.full_name}`, commit: head.sha };
  const configText = new TextDecoder().decode(
    await readRepositoryFile(location, { ...configFile, size: configFile.size ?? 0 }, fetcher),
  );
  const parsed = cortexConfigSchema.safeParse(load(configText));
  if (!parsed.success)
    throw new Error(
      `Invalid cortex.config.yml: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  const config = parsed.data as CortexConfig;
  if (config.generators || config.sources.some((s) => s.languages.some((l) => l.template)))
    throw new Error(
      'Hosted repository builds use Cortex’s built-in templates. Remove custom generator templates from this configuration.',
    );
  const paths = new Set<string>(['cortex.config.yml']);
  const add = (p?: string) => {
    if (p) paths.add(repositoryPath(p));
  };
  for (const section of config.docs ?? []) for (const doc of section.sources) add(doc.document);
  for (const source of config.sources) {
    add(source.spec);
    add(source.intro);
  }
  for (const value of [config.logo, config.logo_dark, config.logo_light, config.favicon])
    add(value);
  for (const section of config.home?.sections ?? []) {
    add(section.icon);
    add(section.background);
  }
  // Include static assets. Unrelated package manifests and source files are not build inputs.
  for (const item of tree.tree) {
    if (item.type === 'blob' && item.path.startsWith('assets/')) add(item.path);
  }
  const dependencies = config.sources.map((source) => repositoryPath(source.spec));
  const visited = new Set<string>();
  for (let index = 0; index < dependencies.length; index++) {
    const filename = dependencies[index];
    if (visited.has(filename)) continue;
    visited.add(filename);
    if (visited.size > 100)
      throw new Error(
        'Hosted builds support at most 100 specification files, including references.',
      );
    const entry = entries.get(filename);
    if (!entry || !['100644', '100755'].includes(entry.mode))
      throw new Error(`Specification is missing or is a symlink: ${filename}`);
    const text = new TextDecoder().decode(
      await readRepositoryFile(location, { ...entry, size: entry.size ?? 0 }, fetcher),
    );
    for (const reference of specificationReferences(filename, text)) {
      const value = decodeURIComponent(reference.split('#')[0]);
      if (!value) continue;
      if (/^[a-z][a-z0-9+.-]*:|^[/\\]/i.test(value))
        throw new Error(
          `Hosted builds require local specification references: ${filename} → ${value}`,
        );
      const components = filename.split('/').slice(0, -1);
      for (const component of value.split('/')) {
        if (component === '..') {
          if (!components.length) throw new Error('Specification reference leaves the repository.');
          components.pop();
        } else if (component !== '.' && component) components.push(component);
      }
      const dependency = repositoryPath(components.join('/'));
      add(dependency);
      dependencies.push(dependency);
    }
  }
  const files = [...paths].sort().map((filePath) => {
    const file = entries.get(filePath);
    if (!file || !['100644', '100755'].includes(file.mode))
      throw new Error(`Configured file is missing or is a symlink: ${filePath}`);
    if ((file.size ?? 0) > MAX_FILE_BYTES)
      throw new Error(`Repository file exceeds 5 MiB: ${filePath}`);
    return { path: filePath, sha: file.sha, size: file.size ?? 0 };
  });
  if (
    files.length > MAX_SITE_FILES ||
    files.reduce((total, file) => total + file.size, 0) > MAX_SITE_BYTES
  )
    throw new Error(
      'Configured documentation exceeds the free hosting limit (2,000 files / 50 MiB).',
    );
  const fingerprint = await sha256(JSON.stringify(files.map((f) => [f.path, f.sha])));
  return {
    ...location,
    repositoryId: metadata.id,
    branch: metadata.default_branch,
    configText,
    config,
    files,
    fingerprint,
  };
}

export interface UploadFile {
  path: string;
  size: number;
  sha256: string;
}

export function validateManifest(input: unknown): UploadFile[] {
  if (!Array.isArray(input) || !input.length || input.length > MAX_SITE_FILES)
    throw new Error('A deployment must contain 1–2,000 files.');
  const paths = new Set<string>();
  let total = 0;
  for (const file of input) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      repositoryPath(file.path) !== file.path ||
      paths.has(file.path) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > MAX_FILE_BYTES ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('Invalid deployment file manifest.');
    if (file.path.startsWith('_cortex/')) throw new Error('The _cortex path is reserved.');
    paths.add(file.path);
    total += file.size;
  }
  if (!paths.has('index.html') || total > MAX_SITE_BYTES)
    throw new Error('A deployment needs index.html and must fit within 50 MiB.');
  return input as UploadFile[];
}
