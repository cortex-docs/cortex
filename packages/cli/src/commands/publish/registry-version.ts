import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import type { PublishRegistryConfig, SupportedLanguage } from '@cortex-docs/core';

export interface RegistryVersionTarget {
  language: SupportedLanguage;
  packageName: string;
  dir: string;
  manifest: string;
  registry: PublishRegistryConfig;
}

export interface RegistryCredentials {
  token?: string;
  username?: string;
}

interface ParsedVersion {
  value: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

const VERSION_PATTERN = '(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)';
const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/;

function parseVersion(value: string): ParsedVersion | undefined {
  const normalized = value.trim().replace(/^v/, '');
  const match = normalized.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return undefined;
  return {
    value: normalized,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length > 0) return 1;
  if (right.length === 0 && left.length > 0) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : undefined;
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    if (leftNumber !== undefined && rightNumber === undefined) return -1;
    if (leftNumber === undefined && rightNumber !== undefined) return 1;
    const comparison = left[index].localeCompare(right[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function latestSemanticVersion(versions: string[]): string | undefined {
  const parsed = versions
    .map(parseVersion)
    .filter((version): version is ParsedVersion => Boolean(version));
  parsed.sort((left, right) => {
    if (left.major !== right.major) return left.major - right.major;
    if (left.minor !== right.minor) return left.minor - right.minor;
    if (left.patch !== right.patch) return left.patch - right.patch;
    return comparePrerelease(left.prerelease, right.prerelease);
  });
  return parsed.at(-1)?.value;
}

function runCaptured(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

function commandError(command: string, result: CommandResult): Error {
  if (result.error) return result.error;
  const detail = result.stderr.trim().split('\n').at(-1);
  return new Error(
    `${command} failed${detail ? `: ${detail}` : ` with status ${result.status ?? 'unknown'}`}`,
  );
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function basicAuthorization(
  credentials: RegistryCredentials,
  defaultUsername = 'token',
): string | undefined {
  if (!credentials.token) return undefined;
  const value = Buffer.from(
    `${credentials.username ?? defaultUsername}:${credentials.token}`,
  ).toString('base64');
  return `Basic ${value}`;
}

async function fetchRegistry(
  url: string,
  headers: Record<string, string> = {},
): Promise<Response | undefined> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'user-agent': 'cortex-publisher', ...headers },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `Registry lookup failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Registry lookup failed for ${url}: HTTP ${response.status}`);
  return response;
}

function metadataChecksum(content: string): string | undefined {
  try {
    const metadata = JSON.parse(content) as { contentChecksum?: unknown };
    return typeof metadata.contentChecksum === 'string' &&
      CHECKSUM_PATTERN.test(metadata.contentChecksum)
      ? metadata.contentChecksum
      : undefined;
  } catch {
    return undefined;
  }
}

function tarEntryText(archive: Buffer, suffix: string): string | undefined {
  const tar = gunzipSync(archive);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const dataStart = offset + 512;
    if (fullName === suffix || fullName.endsWith(`/${suffix}`)) {
      return tar.subarray(dataStart, dataStart + size).toString('utf8');
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return undefined;
}

function findSignature(buffer: Buffer, signature: number): number {
  for (let offset = buffer.length - 4; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

function zipEntryText(archive: Buffer, suffix: string): string | undefined {
  const end = findSignature(archive, 0x06054b50);
  if (end < 0) throw new Error('Published package is not a valid ZIP archive');
  const entryCount = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Published package has an invalid ZIP directory');
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === suffix || name.endsWith(`/${suffix}`)) {
      if (archive.readUInt32LE(localOffset) !== 0x04034b50)
        throw new Error('Published package has an invalid ZIP entry');
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return compressed.toString('utf8');
      if (method === 8) return inflateRawSync(compressed).toString('utf8');
      throw new Error(`Published package uses unsupported ZIP compression method ${method}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return undefined;
}

async function responseBuffer(response: Response | undefined, url: string): Promise<Buffer> {
  if (!response) throw new Error(`Published package artifact not found: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function npmVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): Promise<string[]> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-npm-version-'));
  try {
    const npmrc = path.join(tempDir, '.npmrc');
    const registry = new URL(registryUrl);
    const registryAuthKey = registry.host + registry.pathname.replace(/\/$/, '');
    const tokenLine = credentials.token
      ? `//${registryAuthKey}/:_authToken=\${NODE_AUTH_TOKEN}\n`
      : '';
    fs.writeFileSync(npmrc, `registry=${registryUrl}\n${tokenLine}always-auth=true\n`, {
      mode: 0o600,
    });
    const result = runCaptured(
      'npm',
      ['view', target.packageName, 'versions', '--json', '--registry', registryUrl],
      target.dir,
      { npm_config_userconfig: npmrc, NODE_AUTH_TOKEN: credentials.token },
    );
    if (result.status !== 0) {
      if (
        /\bE404\b|404 Not Found|is not in this registry/i.test(`${result.stdout}\n${result.stderr}`)
      )
        return [];
      throw commandError('npm view', result);
    }
    const value = JSON.parse(result.stdout || '[]') as string | string[];
    return Array.isArray(value) ? value : [value];
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function npmChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): Promise<string | undefined> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-npm-checksum-'));
  try {
    const npmrc = path.join(tempDir, '.npmrc');
    const registry = new URL(registryUrl);
    const registryAuthKey = registry.host + registry.pathname.replace(/\/$/, '');
    const tokenLine = credentials.token
      ? `//${registryAuthKey}/:_authToken=\${NODE_AUTH_TOKEN}\n`
      : '';
    fs.writeFileSync(npmrc, `registry=${registryUrl}\n${tokenLine}always-auth=true\n`, {
      mode: 0o600,
    });
    const result = runCaptured(
      'npm',
      [
        'view',
        `${target.packageName}@${version}`,
        'cortex.contentChecksum',
        '--json',
        '--registry',
        registryUrl,
      ],
      target.dir,
      { npm_config_userconfig: npmrc, NODE_AUTH_TOKEN: credentials.token },
    );
    if (result.status !== 0) throw commandError('npm view', result);
    const output = result.stdout.trim();
    if (!output) return undefined;
    let value: unknown = output;
    try {
      value = JSON.parse(output);
    } catch {
      // npm can return a plain scalar for a single field.
    }
    return typeof value === 'string' && CHECKSUM_PATTERN.test(value) ? value : undefined;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function pypiProjectUrl(registryUrl: string, packageName: string): string {
  const url = new URL(registryUrl);
  if (url.hostname === 'upload.pypi.org') url.hostname = 'pypi.org';
  const simpleIndex = url.pathname.indexOf('/simple');
  if (simpleIndex >= 0) {
    url.pathname = `${url.pathname.slice(0, simpleIndex)}/simple/`;
  } else if (/\/legacy\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/legacy\/?$/, 'simple/');
  } else {
    url.pathname = `${withTrailingSlash(url.pathname)}simple/`;
  }
  const normalizedName = packageName.toLowerCase().replace(/[-_.]+/g, '-');
  return new URL(`${normalizedName}/`, url).toString();
}

function pythonVersionsFromFilenames(packageName: string, filenames: string[]): string[] {
  const normalized = packageName.toLowerCase().replace(/[-_.]+/g, '[-_.]+');
  const pattern = new RegExp(
    `(?:^|/)${normalized}[-_.]+${VERSION_PATTERN}(?=[-_.]|\\.(?:tar\\.gz|zip)$)`,
    'i',
  );
  return filenames.flatMap((filename) => {
    const match = decodeURIComponent(filename).match(pattern);
    return match?.[1] ? [match[1]] : [];
  });
}

interface PythonProjectData {
  versions: string[];
  files: Array<{ filename: string; url: string }>;
}

async function pythonProjectData(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): Promise<PythonProjectData | undefined> {
  const projectUrl = pypiProjectUrl(registryUrl, target.packageName);
  const authorization = basicAuthorization(credentials, '__token__');
  const response = await fetchRegistry(projectUrl, {
    accept:
      'application/vnd.pypi.simple.v1+json, application/vnd.pypi.simple.v1+html;q=0.1, text/html;q=0.01',
    ...(authorization ? { authorization } : {}),
  });
  if (!response) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    const data = (await response.json()) as {
      versions?: string[];
      files?: Array<{ filename?: string; url?: string }>;
    };
    const files = (data.files ?? []).flatMap((file) => {
      if (typeof file.filename !== 'string' || typeof file.url !== 'string') return [];
      return [{ filename: file.filename, url: new URL(file.url, projectUrl).toString() }];
    });
    return {
      versions:
        Array.isArray(data.versions) && data.versions.length > 0
          ? data.versions
          : pythonVersionsFromFilenames(
              target.packageName,
              files.map((file) => file.filename),
            ),
      files,
    };
  }
  const html = await response.text();
  const files = Array.from(html.matchAll(/href=["']([^"']+)["']/gi), (match) => {
    const url = new URL(match[1], projectUrl);
    return {
      filename: decodeURIComponent(url.pathname.split('/').at(-1) ?? ''),
      url: url.toString(),
    };
  });
  return {
    versions: pythonVersionsFromFilenames(
      target.packageName,
      files.map((file) => file.filename),
    ),
    files,
  };
}

async function pythonVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): Promise<string[]> {
  return (await pythonProjectData(target, registryUrl, credentials))?.versions ?? [];
}

async function pythonChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): Promise<string | undefined> {
  const data = await pythonProjectData(target, registryUrl, credentials);
  if (!data) throw new Error(`Published Python package not found: ${target.packageName}`);
  const artifact = data.files.find(
    (file) =>
      file.filename.endsWith('.tar.gz') &&
      pythonVersionsFromFilenames(target.packageName, [file.filename]).includes(version),
  );
  if (!artifact) return undefined;
  const authorization = basicAuthorization(credentials, '__token__');
  const response = await fetchRegistry(artifact.url, authorization ? { authorization } : {});
  const metadata = tarEntryText(
    await responseBuffer(response, artifact.url),
    '.cortex-package.json',
  );
  return metadata ? metadataChecksum(metadata) : undefined;
}

function gitEnvironment(credentials: RegistryCredentials, tempDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0' };
  if (!credentials.token) return env;
  const askPass = path.join(tempDir, 'askpass.sh');
  fs.writeFileSync(
    askPass,
    '#!/bin/sh\ncase "$1" in *Username*) printf "%s" "$CORTEX_GIT_USERNAME" ;; *) printf "%s" "$CORTEX_GIT_TOKEN" ;; esac\n',
    { mode: 0o700 },
  );
  env.GIT_ASKPASS = askPass;
  env.CORTEX_GIT_USERNAME = credentials.username ?? 'token';
  env.CORTEX_GIT_TOKEN = credentials.token;
  return env;
}

function gitVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): string[] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-git-version-'));
  try {
    const result = runCaptured(
      'git',
      ['ls-remote', '--tags', '--refs', registryUrl, 'refs/tags/v*'],
      target.dir,
      gitEnvironment(credentials, tempDir),
    );
    if (result.status !== 0) throw commandError('git ls-remote', result);
    return Array.from(result.stdout.matchAll(/refs\/tags\/v([^\s]+)$/gm), (match) => match[1]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function gitChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): string | undefined {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-git-checksum-'));
  const checkout = path.join(tempDir, 'checkout');
  try {
    const env = gitEnvironment(credentials, tempDir);
    const result = runCaptured(
      'git',
      ['clone', '--depth', '1', '--branch', `v${version}`, registryUrl, checkout],
      tempDir,
      env,
    );
    if (result.status !== 0) throw commandError('git clone', result);
    const metadataPath = path.join(checkout, '.cortex-package.json');
    return fs.existsSync(metadataPath)
      ? metadataChecksum(fs.readFileSync(metadataPath, 'utf8'))
      : undefined;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function getPublishedGitVersion(
  target: RegistryVersionTarget,
  repositoryUrl: string,
  credentials: RegistryCredentials,
): string | undefined {
  return latestSemanticVersion(gitVersions(target, repositoryUrl, credentials));
}

export function getPublishedGitChecksum(
  target: RegistryVersionTarget,
  repositoryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): string | undefined {
  return gitChecksum(target, repositoryUrl, credentials, version);
}

function mavenCoordinates(target: RegistryVersionTarget): { groupId: string; artifactId: string } {
  const content = fs.readFileSync(path.join(target.dir, target.manifest), 'utf8');
  if (target.language === 'java') {
    const groupId = content.match(/<groupId>([^<]+)<\/groupId>/)?.[1];
    const artifactId = content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
    if (groupId && artifactId) return { groupId, artifactId };
  } else {
    const groupId = content.match(/^group\s*=\s*["']([^"']+)["']/m)?.[1];
    const artifactId =
      content.match(/artifactId\s*=\s*["']([^"']+)["']/)?.[1] ?? target.packageName;
    if (groupId) return { groupId, artifactId };
  }
  throw new Error(`Maven coordinates not found: ${path.join(target.dir, target.manifest)}`);
}

async function mavenVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): Promise<string[]> {
  const { groupId, artifactId } = mavenCoordinates(target);
  const metadataUrl = new URL(
    `${groupId.replace(/\./g, '/')}/${artifactId}/maven-metadata.xml`,
    withTrailingSlash(registryUrl),
  ).toString();
  const authorization = basicAuthorization(credentials);
  const response = await fetchRegistry(metadataUrl, authorization ? { authorization } : {});
  if (!response) return [];
  const xml = await response.text();
  return Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g), (match) => match[1]);
}

async function mavenChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): Promise<string | undefined> {
  const { groupId, artifactId } = mavenCoordinates(target);
  const pomUrl = new URL(
    `${groupId.replace(/\./g, '/')}/${artifactId}/${version}/${artifactId}-${version}.pom`,
    withTrailingSlash(registryUrl),
  ).toString();
  const authorization = basicAuthorization(credentials);
  const response = await fetchRegistry(pomUrl, authorization ? { authorization } : {});
  if (!response) throw new Error(`Published Maven POM not found: ${pomUrl}`);
  const checksum = (await response.text()).match(
    /<cortex\.contentChecksum>([^<]+)<\/cortex\.contentChecksum>/,
  )?.[1];
  return checksum && CHECKSUM_PATTERN.test(checksum) ? checksum : undefined;
}

function rubyVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): string[] {
  const result = runCaptured(
    'gem',
    [
      'search',
      target.packageName,
      '--remote',
      '--all',
      '--exact',
      '--clear-sources',
      '--source',
      registryUrl,
    ],
    target.dir,
    { GEM_HOST_API_KEY: credentials.token },
  );
  if (result.status !== 0) throw commandError('gem search', result);
  const line = result.stdout
    .split('\n')
    .find((entry) => entry.startsWith(`${target.packageName} (`));
  const list = line?.match(/\(([^)]+)\)/)?.[1];
  return list ? list.split(',').map((version) => version.trim()) : [];
}

function rubyChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): string | undefined {
  const result = runCaptured(
    'gem',
    [
      'specification',
      target.packageName,
      'metadata',
      '--remote',
      '--version',
      version,
      '--clear-sources',
      '--source',
      registryUrl,
    ],
    target.dir,
    { GEM_HOST_API_KEY: credentials.token },
  );
  if (result.status !== 0) throw commandError('gem specification', result);
  const checksum = result.stdout.match(
    /cortex_content_checksum:\s*["']?(sha256:[a-f0-9]{64})/i,
  )?.[1];
  return checksum && CHECKSUM_PATTERN.test(checksum) ? checksum : undefined;
}

function localNugetVersions(packageName: string, registryUrl: string): string[] {
  const directory = registryUrl.startsWith('file:')
    ? fileURLToPath(registryUrl)
    : path.resolve(registryUrl);
  if (!fs.existsSync(directory)) return [];
  const prefix = `${packageName}.`.toLowerCase();
  return fs.readdirSync(directory).flatMap((file) => {
    const lower = file.toLowerCase();
    if (!lower.startsWith(prefix) || !lower.endsWith('.nupkg')) return [];
    return [file.slice(prefix.length, -'.nupkg'.length)];
  });
}

async function nugetVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): Promise<string[]> {
  if (!/^https?:\/\//i.test(registryUrl))
    return localNugetVersions(target.packageName, registryUrl);
  const { baseAddress, headers } = await nugetBaseAddress(registryUrl, credentials);
  const versionsResponse = await fetchRegistry(
    new URL(
      `${target.packageName.toLowerCase()}/index.json`,
      withTrailingSlash(baseAddress),
    ).toString(),
    headers,
  );
  if (!versionsResponse) return [];
  const data = (await versionsResponse.json()) as { versions?: string[] };
  return data.versions ?? [];
}

async function nugetBaseAddress(
  registryUrl: string,
  credentials: RegistryCredentials,
): Promise<{ baseAddress: string; headers: Record<string, string> }> {
  const authorization = basicAuthorization(credentials);
  const headers: Record<string, string> = authorization ? { authorization } : {};
  const serviceResponse = await fetchRegistry(registryUrl, headers);
  if (!serviceResponse) throw new Error(`NuGet service index not found: ${registryUrl}`);
  const service = (await serviceResponse.json()) as {
    resources?: Array<{ '@id'?: string; '@type'?: string | string[] }>;
  };
  const resource = service.resources?.find((entry) => {
    const types = Array.isArray(entry['@type']) ? entry['@type'] : [entry['@type']];
    return types.some((type) => type?.startsWith('PackageBaseAddress/'));
  });
  if (!resource?.['@id']) throw new Error(`NuGet package index not found in ${registryUrl}`);
  return { baseAddress: resource['@id'], headers };
}

async function nugetChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): Promise<string | undefined> {
  let archive: Buffer;
  if (!/^https?:\/\//i.test(registryUrl)) {
    const directory = registryUrl.startsWith('file:')
      ? fileURLToPath(registryUrl)
      : path.resolve(registryUrl);
    const expected = `${target.packageName}.${version}.nupkg`.toLowerCase();
    const artifact = fs.readdirSync(directory).find((file) => file.toLowerCase() === expected);
    if (!artifact)
      throw new Error(`Published NuGet package not found: ${target.packageName} ${version}`);
    archive = fs.readFileSync(path.join(directory, artifact));
  } else {
    const { baseAddress, headers } = await nugetBaseAddress(registryUrl, credentials);
    const id = target.packageName.toLowerCase();
    const normalizedVersion = version.toLowerCase();
    const artifactUrl = new URL(
      `${id}/${normalizedVersion}/${id}.${normalizedVersion}.nupkg`,
      withTrailingSlash(baseAddress),
    ).toString();
    archive = await responseBuffer(await fetchRegistry(artifactUrl, headers), artifactUrl);
  }
  const metadata = zipEntryText(archive, '.cortex-package.json');
  return metadata ? metadataChecksum(metadata) : undefined;
}

function cargoIndexPath(packageName: string): string {
  const normalized = packageName.toLowerCase();
  if (normalized.length === 1) return `1/${normalized}`;
  if (normalized.length === 2) return `2/${normalized}`;
  if (normalized.length === 3) return `3/${normalized[0]}/${normalized}`;
  return `${normalized.slice(0, 2)}/${normalized.slice(2, 4)}/${normalized}`;
}

async function cargoVersions(
  target: RegistryVersionTarget,
  registryUrl: string | undefined,
  credentials: RegistryCredentials,
): Promise<string[]> {
  return (await cargoIndexData(target, registryUrl, credentials)).entries.map(
    (entry) => entry.vers,
  );
}

interface CargoIndexEntry {
  vers: string;
  cksum?: string;
}

interface CargoIndexData {
  config: { dl?: string };
  entries: CargoIndexEntry[];
}

function parseCargoEntries(body: string): CargoIndexEntry[] {
  return body
    .trim()
    .split('\n')
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line) as { vers?: unknown; cksum?: unknown };
        if (typeof entry.vers !== 'string') return [];
        return [
          { vers: entry.vers, ...(typeof entry.cksum === 'string' ? { cksum: entry.cksum } : {}) },
        ];
      } catch {
        return [];
      }
    });
}

async function cargoIndexData(
  target: RegistryVersionTarget,
  registryUrl: string | undefined,
  credentials: RegistryCredentials,
): Promise<CargoIndexData> {
  const isSparse = !registryUrl || registryUrl.startsWith('sparse+');
  if (isSparse) {
    const baseUrl = withTrailingSlash(
      registryUrl?.replace(/^sparse\+/, '') ?? 'https://index.crates.io/',
    );
    const headers: Record<string, string> = credentials.token
      ? { authorization: credentials.token }
      : {};
    const configUrl = new URL('config.json', baseUrl).toString();
    const configResponse = await fetchRegistry(configUrl, headers);
    if (!configResponse) throw new Error(`Cargo registry configuration not found: ${configUrl}`);
    const config = (await configResponse.json()) as { dl?: string };
    const response = await fetchRegistry(
      new URL(cargoIndexPath(target.packageName), baseUrl).toString(),
      headers,
    );
    return { config, entries: response ? parseCargoEntries(await response.text()) : [] };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-cargo-index-'));
  const checkout = path.join(tempDir, 'index');
  try {
    const result = runCaptured(
      'git',
      ['clone', '--depth', '1', registryUrl, checkout],
      tempDir,
      gitEnvironment(credentials, tempDir),
    );
    if (result.status !== 0) throw commandError('git clone', result);
    const configPath = path.join(checkout, 'config.json');
    if (!fs.existsSync(configPath))
      throw new Error(`Cargo registry configuration not found: ${registryUrl}`);
    const entryPath = path.join(checkout, ...cargoIndexPath(target.packageName).split('/'));
    return {
      config: JSON.parse(fs.readFileSync(configPath, 'utf8')) as { dl?: string },
      entries: fs.existsSync(entryPath)
        ? parseCargoEntries(fs.readFileSync(entryPath, 'utf8'))
        : [],
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function cargoDownloadUrl(
  data: CargoIndexData,
  packageName: string,
  entry: CargoIndexEntry,
): string {
  if (!data.config.dl) throw new Error('Cargo registry download URL is missing');
  const originalPrefix = cargoIndexPath(packageName).split('/').slice(0, -1).join('/');
  const lowerPrefix = cargoIndexPath(packageName.toLowerCase()).split('/').slice(0, -1).join('/');
  if (/\{(?:crate|version|prefix|lowerprefix|sha256-checksum)\}/.test(data.config.dl)) {
    return data.config.dl
      .replaceAll('{crate}', packageName)
      .replaceAll('{version}', entry.vers)
      .replaceAll('{prefix}', originalPrefix)
      .replaceAll('{lowerprefix}', lowerPrefix)
      .replaceAll('{sha256-checksum}', entry.cksum ?? '');
  }
  return new URL(
    `${packageName}/${entry.vers}/download`,
    withTrailingSlash(data.config.dl),
  ).toString();
}

async function cargoChecksum(
  target: RegistryVersionTarget,
  registryUrl: string | undefined,
  credentials: RegistryCredentials,
  version: string,
): Promise<string | undefined> {
  const data = await cargoIndexData(target, registryUrl, credentials);
  const entry = data.entries.find((candidate) => candidate.vers === version);
  if (!entry)
    throw new Error(`Published Cargo package not found: ${target.packageName} ${version}`);
  const artifactUrl = cargoDownloadUrl(data, target.packageName, entry);
  const response = await fetchRegistry(
    artifactUrl,
    credentials.token ? { authorization: credentials.token } : {},
  );
  const metadata = tarEntryText(
    await responseBuffer(response, artifactUrl),
    '.cortex-package.json',
  );
  return metadata ? metadataChecksum(metadata) : undefined;
}

function conanVersions(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
): string[] {
  const registryName = target.registry.name ?? 'cortex';
  const conanHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-conan-version-'));
  const env = { CONAN_HOME: conanHome };
  const packageName = `${target.packageName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}-${target.language}`;
  try {
    const add = runCaptured(
      'conan',
      ['remote', 'add', registryName, registryUrl, '--force'],
      target.dir,
      env,
    );
    if (add.status !== 0) throw commandError('conan remote add', add);
    if (credentials.token) {
      const login = runCaptured(
        'conan',
        [
          'remote',
          'login',
          registryName,
          credentials.username ?? 'token',
          '--password',
          credentials.token,
        ],
        target.dir,
        env,
      );
      if (login.status !== 0) throw commandError('conan remote login', login);
    }
    const result = runCaptured(
      'conan',
      ['list', `${packageName}/*`, '--remote', registryName, '--format=json'],
      target.dir,
      env,
    );
    if (result.status !== 0) {
      if (/not found|no recipes/i.test(`${result.stdout}\n${result.stderr}`)) return [];
      throw commandError('conan list', result);
    }
    const data = JSON.parse(result.stdout || '{}') as Record<string, unknown>;
    const versions: string[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        const match = key.match(new RegExp(`^${escapePattern(packageName)}/([^@#]+)`));
        if (match?.[1]) versions.push(match[1]);
        visit(child);
      }
    };
    visit(data);
    return versions;
  } finally {
    fs.rmSync(conanHome, { recursive: true, force: true });
  }
}

function findMetadataChecksums(directory: string): string[] {
  const checksums: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checksums.push(...findMetadataChecksums(file));
    else if (entry.isFile() && entry.name === '.cortex-package.json') {
      const checksum = metadataChecksum(fs.readFileSync(file, 'utf8'));
      if (checksum) checksums.push(checksum);
    }
  }
  return checksums;
}

function conanChecksum(
  target: RegistryVersionTarget,
  registryUrl: string,
  credentials: RegistryCredentials,
  version: string,
): string | undefined {
  const registryName = target.registry.name ?? 'cortex';
  const conanHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-conan-checksum-'));
  const env = { CONAN_HOME: conanHome };
  const packageName = `${target.packageName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}-${target.language}`;
  try {
    const add = runCaptured(
      'conan',
      ['remote', 'add', registryName, registryUrl, '--force'],
      target.dir,
      env,
    );
    if (add.status !== 0) throw commandError('conan remote add', add);
    if (credentials.token) {
      const login = runCaptured(
        'conan',
        [
          'remote',
          'login',
          registryName,
          credentials.username ?? 'token',
          '--password',
          credentials.token,
        ],
        target.dir,
        env,
      );
      if (login.status !== 0) throw commandError('conan remote login', login);
    }
    const result = runCaptured(
      'conan',
      ['download', `${packageName}/${version}:*`, '--remote', registryName],
      target.dir,
      env,
    );
    if (result.status !== 0) throw commandError('conan download', result);
    const checksums = [...new Set(findMetadataChecksums(conanHome))];
    if (checksums.length > 1)
      throw new Error(
        `Published Conan package contains conflicting Cortex checksums: ${packageName}/${version}`,
      );
    return checksums[0];
  } finally {
    fs.rmSync(conanHome, { recursive: true, force: true });
  }
}

export async function getPublishedVersion(
  target: RegistryVersionTarget,
  registryUrl: string | undefined,
  credentials: RegistryCredentials,
): Promise<string | undefined> {
  let versions: string[];
  switch (target.language) {
    case 'typescript':
      if (!registryUrl) throw new Error('npm registry URL is required');
      versions = await npmVersions(target, registryUrl, credentials);
      break;
    case 'python':
      if (!registryUrl) throw new Error('Python registry URL is required');
      versions = await pythonVersions(target, registryUrl, credentials);
      break;
    case 'go':
    case 'php':
      if (!registryUrl) throw new Error('Git repository URL is required');
      versions = gitVersions(target, registryUrl, credentials);
      break;
    case 'java':
    case 'kotlin':
      if (!registryUrl) throw new Error('Maven repository URL is required');
      versions = await mavenVersions(target, registryUrl, credentials);
      break;
    case 'ruby':
      if (!registryUrl) throw new Error('RubyGems server URL is required');
      versions = rubyVersions(target, registryUrl, credentials);
      break;
    case 'csharp':
      if (!registryUrl) throw new Error('NuGet source URL is required');
      versions = await nugetVersions(target, registryUrl, credentials);
      break;
    case 'rust':
      versions = await cargoVersions(target, registryUrl, credentials);
      break;
    case 'cpp':
    case 'c':
      if (!registryUrl) throw new Error('Conan remote URL is required');
      versions = conanVersions(target, registryUrl, credentials);
      break;
  }

  const latest = latestSemanticVersion(versions);
  if (!latest && versions.length > 0) {
    throw new Error(`No semantic release version found for ${target.packageName}`);
  }
  return latest;
}

export async function getPublishedChecksum(
  target: RegistryVersionTarget,
  registryUrl: string | undefined,
  credentials: RegistryCredentials,
  version: string,
): Promise<string | undefined> {
  switch (target.language) {
    case 'typescript':
      if (!registryUrl) throw new Error('npm registry URL is required');
      return npmChecksum(target, registryUrl, credentials, version);
    case 'python':
      if (!registryUrl) throw new Error('Python registry URL is required');
      return pythonChecksum(target, registryUrl, credentials, version);
    case 'go':
    case 'php':
      if (!registryUrl) throw new Error('Git repository URL is required');
      return gitChecksum(target, registryUrl, credentials, version);
    case 'java':
    case 'kotlin':
      if (!registryUrl) throw new Error('Maven repository URL is required');
      return mavenChecksum(target, registryUrl, credentials, version);
    case 'ruby':
      if (!registryUrl) throw new Error('RubyGems server URL is required');
      return rubyChecksum(target, registryUrl, credentials, version);
    case 'csharp':
      if (!registryUrl) throw new Error('NuGet source URL is required');
      return nugetChecksum(target, registryUrl, credentials, version);
    case 'rust':
      return cargoChecksum(target, registryUrl, credentials, version);
    case 'cpp':
    case 'c':
      if (!registryUrl) throw new Error('Conan remote URL is required');
      return conanChecksum(target, registryUrl, credentials, version);
  }
}
