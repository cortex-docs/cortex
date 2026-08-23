import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_REMOTE_BYTES = 20 * 1024 * 1024;

export function isRemoteLocation(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolveLocation(value: string, baseDir: string): string {
  return isRemoteLocation(value) || path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

export function locationExists(value: string): boolean {
  return isRemoteLocation(value) || fs.existsSync(value);
}

export async function readTextLocation(value: string): Promise<string> {
  if (!isRemoteLocation(value)) return fs.readFileSync(value, 'utf-8');

  const response = await fetch(value, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Failed to fetch ${value}: ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_REMOTE_BYTES) {
    throw new Error(`Remote file is larger than ${MAX_REMOTE_BYTES} bytes: ${value}`);
  }
  const content = await response.text();
  if (Buffer.byteLength(content, 'utf-8') > MAX_REMOTE_BYTES) {
    throw new Error(`Remote file is larger than ${MAX_REMOTE_BYTES} bytes: ${value}`);
  }
  return content;
}
