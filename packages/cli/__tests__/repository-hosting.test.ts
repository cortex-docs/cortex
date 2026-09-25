import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { readRepositorySnapshot, type RepositorySnapshot } from '@cortex-docs/core/hosting';
import { materializeRepository } from '../src/services/repository-docs';
import { DeployCommand } from '../src/commands/deploy/deploy.command';
import {
  RepositoryDocumentation,
  createRepositoryServer,
} from '../src/commands/mcp/repository-server';
import type { DocsBuildCommand } from '../src/commands/docs/build.command';
import type { LoggerService } from '../src/services/logger.service';

vi.mock('@cortex-docs/core/hosting', async (original) => ({
  ...(await original<object>()),
  readRepositorySnapshot: vi.fn(),
}));
vi.mock('../src/services/repository-docs', async (original) => ({
  ...(await original<object>()),
  materializeRepository: vi.fn(),
}));

let snapshot: RepositorySnapshot;
let markdown: string;
let directory: string;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GITHUB_TOKEN', 'test-maintainer');
  markdown = '# Current documentation';
  snapshot = {
    repository: 'https://github.com/owner/repo',
    repositoryId: 42,
    branch: 'main',
    commit: 'first',
    fingerprint: 'one',
    configText:
      'project: example\ndocs:\n  - section: Guides\n    sources:\n      - title: Guide\n        document: README.md\n',
    config: {
      project: 'example',
      sources: [],
      languages: [],
      output: { base_dir: './generated' },
      docs: [{ section: 'Guides', sources: [{ title: 'Guide', document: 'README.md' }] }],
    },
    files: [
      { path: 'cortex.config.yml', sha: 'config', size: 1 },
      { path: 'README.md', sha: 'doc', size: 1 },
    ],
  };
  vi.mocked(readRepositorySnapshot).mockImplementation(async () => snapshot);
  vi.mocked(materializeRepository).mockImplementation(async (current, target) => {
    directory = target;
    fs.writeFileSync(path.join(target, 'cortex.config.yml'), current.configText);
    fs.writeFileSync(path.join(target, 'README.md'), markdown);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('repository deployments', () => {
  const logger = { header: vi.fn(), info: vi.fn(), success: vi.fn() } as unknown as LoggerService;
  it('skips materializing, building and uploading when inputs are unchanged', async () => {
    const build = { run: vi.fn() };
    const fetcher = vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('/domain')
          ? { status: 'not_configured' }
          : { status: 'unchanged', url: 'https://example.cortexdocs.dev' },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await new DeployCommand(logger, build as unknown as DocsBuildCommand).run(['owner/repo']);
    expect(build.run).not.toHaveBeenCalled();
    expect(materializeRepository).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('cancels the upload lease and removes temporary files after an upload fails', async () => {
    const build = {
      run: vi.fn(async (_args, options) => {
        fs.mkdirSync(options.output);
        fs.writeFileSync(path.join(options.output, 'index.html'), '<h1>Docs</h1>');
      }),
    };
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'DELETE') return Response.json({ status: 'cancelled' });
      if (init.method === 'PUT') return Response.json({ error: 'upload failed' }, { status: 503 });
      const body = JSON.parse(String(init.body));
      return Response.json(
        body.files
          ? { status: 'upload_required', deploymentId: 'test', uploadToken: 'upload-token' }
          : { status: 'build_required' },
      );
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      new DeployCommand(logger, build as unknown as DocsBuildCommand).run(['owner/repo']),
    ).rejects.toThrow('upload failed');
    expect(fetcher.mock.calls.some(([_url, init]) => init.method === 'DELETE')).toBe(true);
    expect(fs.existsSync(directory)).toBe(false);
  });
});

describe('live repository MCP', () => {
  it('refreshes Markdown and tool lists over a real MCP transport, and rejects stale reads', async () => {
    const documentation = new RepositoryDocumentation('owner/repo');
    const server = createRepositoryServer(documentation);
    const client = new Client({ name: 'test', version: '1.0.0' });
    const changed = vi.fn();
    client.setNotificationHandler(ToolListChangedNotificationSchema, changed);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const listed = await client.listTools();
      const guide = listed.tools.find((tool) => tool.name.includes('guide'))!;
      expect(guide).toBeDefined();
      expect(await client.callTool({ name: guide.name })).toMatchObject({
        content: [{ type: 'text', text: markdown }],
      });
      expect(materializeRepository).toHaveBeenCalledTimes(1);
      markdown = '# Changed documentation';
      snapshot = { ...snapshot, commit: 'second', fingerprint: 'two' };
      expect(await client.callTool({ name: guide.name })).toMatchObject({
        content: [{ text: markdown }],
      });
      expect(changed).toHaveBeenCalled();
      const resources = await client.listResources();
      expect(
        await client.readResource({
          uri: resources.resources.find((r) => r.name === 'README.md')!.uri,
        }),
      ).toMatchObject({ contents: [{ text: markdown }] });
      snapshot = {
        ...snapshot,
        commit: 'third',
        fingerprint: 'three',
        config: { ...snapshot.config, docs: [] },
      };
      expect((await client.callTool({ name: guide.name })).isError).toBe(true);
      vi.mocked(readRepositorySnapshot).mockRejectedValueOnce(new Error('GitHub unavailable'));
      const failed = await client.callTool({ name: guide.name });
      expect(failed.isError).toBe(true);
      expect(JSON.stringify(failed)).toContain('GitHub unavailable');
      expect(fs.existsSync(directory)).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('coalesces concurrent checks', async () => {
    const documentation = new RepositoryDocumentation('owner/repo');
    const [first, second] = await Promise.all([documentation.refresh(), documentation.refresh()]);
    expect(first).toBe(second);
    expect(readRepositorySnapshot).toHaveBeenCalledTimes(1);
  });
});
