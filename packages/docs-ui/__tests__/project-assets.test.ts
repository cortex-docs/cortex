import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GET } from '../app/assets/[...path]/route';

const originalConfigPath = process.env.CORTEX_CONFIG_PATH;
const temporaryDirectories: string[] = [];

function createProject() {
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-assets-test-'));
  temporaryDirectories.push(projectDirectory);
  fs.mkdirSync(path.join(projectDirectory, 'assets'));
  fs.writeFileSync(
    path.join(projectDirectory, 'cortex.config.yml'),
    'project: test\nsources: []\n',
  );
  process.env.CORTEX_CONFIG_PATH = path.join(projectDirectory, 'cortex.config.yml');
  return projectDirectory;
}

function requestAsset(...segments: string[]) {
  return GET(new Request(`http://localhost/assets/${segments.join('/')}`), {
    params: Promise.resolve({ path: segments }),
  });
}

afterEach(() => {
  if (originalConfigPath === undefined) delete process.env.CORTEX_CONFIG_PATH;
  else process.env.CORTEX_CONFIG_PATH = originalConfigPath;

  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('project assets', () => {
  it('serves files from the configured project assets directory', async () => {
    const projectDirectory = createProject();
    fs.writeFileSync(path.join(projectDirectory, 'assets', 'custom.css'), ':root { color: red; }');

    const response = await requestAsset('custom.css');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(await response.text()).toBe(':root { color: red; }');
  });

  it('does not serve files outside the project assets directory', async () => {
    createProject();

    const response = await requestAsset('..', 'cortex.config.yml');

    expect(response.status).toBe(400);
  });

  it('does not follow symlinks outside the project assets directory', async () => {
    const projectDirectory = createProject();
    const privateFile = path.join(projectDirectory, 'private.txt');
    fs.writeFileSync(privateFile, 'private');
    fs.symlinkSync(privateFile, path.join(projectDirectory, 'assets', 'public.txt'));

    const response = await requestAsset('public.txt');

    expect(response.status).toBe(404);
  });
});
