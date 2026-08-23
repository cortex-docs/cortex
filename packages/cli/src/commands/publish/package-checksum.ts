import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  '.venv',
  '__pycache__',
  'bin',
  'build',
  'dist',
  'node_modules',
  'obj',
  'target',
  'vendor',
]);

const IGNORED_FILES = new Set(['Cargo.lock', 'package-lock.json']);

function collectFiles(root: string, current: string, files: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (IGNORED_DIRECTORIES.has(entry.name) || entry.name.endsWith('.egg-info'))
    )
      continue;
    if (
      entry.isFile() &&
      (IGNORED_FILES.has(entry.name) || entry.name.endsWith('.gem') || entry.name.endsWith('.pyc'))
    )
      continue;

    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, absolute, files);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
}

export function hashPackageDirectory(root: string): string {
  const files: string[] = [];
  collectFiles(root, root, files);
  files.sort();

  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    const absolute = path.join(root, ...relative.split('/'));
    const stat = fs.lstatSync(absolute);
    const content = stat.isSymbolicLink()
      ? Buffer.from(`symlink:${fs.readlinkSync(absolute)}`)
      : fs.readFileSync(absolute);
    hash.update(relative);
    hash.update('\0');
    hash.update(String(content.length));
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}
