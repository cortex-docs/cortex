import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsBuildCommand } from '../src/commands/docs/build.command';
import { prepareDocsUiBuildRuntime, resolveDocsUiPath } from '../src/commands/docs/runtime';
import type { LoggerService } from '../src/services/logger.service';
import type { ProjectService } from '../src/services/project.service';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('../src/commands/docs/runtime', () => ({
  prepareDocsUiBuildRuntime: vi.fn(),
  resolveDocsUiPath: vi.fn(),
  resolveNextBin: () => '/next/bin/next',
}));

describe('docs build', () => {
  let workspace: string;
  let outputDir: string;
  let command: DocsBuildCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-docs-build-'));
    outputDir = path.join(workspace, 'site');
    vi.mocked(resolveDocsUiPath).mockReturnValue(workspace);
    command = new DocsBuildCommand(
      { header: vi.fn(), info: vi.fn(), success: vi.fn() } as unknown as LoggerService,
      {
        findConfig: async () => path.join(workspace, 'cortex.config.yml'),
        loadConfig: async () => ({ project: 'test', sources: [] }),
      } as unknown as ProjectService,
    );
    fs.mkdirSync(outputDir);
    fs.writeFileSync(path.join(outputDir, 'old.html'), 'previous build');
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('replaces the previous build with exported pages, data, and browser assets', async () => {
    vi.mocked(execFileSync).mockImplementation((_file, _args, options) => {
      const runtimeDir = String(options!.cwd);
      expect(options!.env).toMatchObject({
        CORTEX_STATIC_EXPORT: '1',
        CORTEX_DIST_DIR: '.next',
        CORTEX_CONFIG_PATH: path.join(workspace, 'cortex.config.yml'),
      });
      for (const [name, content] of [
        ['out/index.html', '<h1>Docs</h1>'],
        ['out/docs/guide.html', '<h1>Guide</h1>'],
        ['out/api/config', '{"project":"test"}'],
        ['out/_next/static/app.js', 'browser code'],
        ['out/logo.svg', '<svg/>'],
        ['.next/server/app.js', 'server code'],
      ]) {
        const file = path.join(runtimeDir, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
      return Buffer.from('');
    });

    await command.run([], { output: outputDir });

    expect(fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8')).toContain('Docs');
    expect(fs.readFileSync(path.join(outputDir, 'docs/guide.html'), 'utf8')).toContain('Guide');
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'api/config'), 'utf8'))).toEqual({
      project: 'test',
    });
    expect(fs.existsSync(path.join(outputDir, '_next/static/app.js'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'logo.svg'))).toBe(true);
    for (const file of ['old.html', '.next', '.cortex-docs-build.json', 'server.js']) {
      expect(fs.existsSync(path.join(outputDir, file))).toBe(false);
    }
    expect(fs.readdirSync(workspace).filter((name) => name.startsWith('.cortex-build-'))).toEqual(
      [],
    );
  });

  it.each(['prepare', 'compile', 'export'])(
    'preserves the previous build after a %s failure',
    async (stage) => {
      if (stage === 'prepare') {
        vi.mocked(prepareDocsUiBuildRuntime).mockImplementationOnce(() => {
          throw new Error('Cannot prepare runtime');
        });
      }
      vi.mocked(execFileSync).mockImplementation(() => {
        if (stage === 'compile') throw new Error('Compilation failed');
        return Buffer.from('');
      });

      await expect(command.run([], { output: outputDir })).rejects.toThrow();

      expect(fs.readFileSync(path.join(outputDir, 'old.html'), 'utf8')).toBe('previous build');
      expect(fs.readdirSync(workspace).filter((name) => name.startsWith('.cortex-build-'))).toEqual(
        [],
      );
    },
  );
});
