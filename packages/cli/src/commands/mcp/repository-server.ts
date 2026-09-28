import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  readRepositorySnapshot,
  repositoryPath,
  type RepositorySnapshot,
} from '@cortex-docs/core/hosting';
import { buildConfigToolDefinitions, type McpStaticTool } from '@cortex-docs/mcp-gen';
import { materializeRepository } from '../../services/repository-docs';

interface RepositoryResource {
  name: string;
  uri: string;
  mimeType: string;
  text: string;
}
export interface DocumentationState {
  snapshot: RepositorySnapshot;
  tools: McpStaticTool[];
  resources: RepositoryResource[];
}

export class RepositoryDocumentation {
  private current?: DocumentationState;
  private pending?: Promise<DocumentationState>;
  constructor(
    private readonly repository: string,
    private readonly token?: string,
  ) {}

  refresh(): Promise<DocumentationState> {
    if (!this.pending)
      this.pending = this.read().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async read(): Promise<DocumentationState> {
    const snapshot = await readRepositorySnapshot(this.repository, {
      token: this.token,
      previous: this.current?.snapshot,
    });
    if (this.current?.snapshot.fingerprint === snapshot.fingerprint) {
      this.current = { ...this.current, snapshot };
      return this.current;
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mcp-'));
    try {
      const paths = new Set([
        'cortex.config.yml',
        ...(snapshot.config.docs?.flatMap((section) =>
          section.sources.map((doc) => repositoryPath(doc.document)),
        ) ?? []),
        ...snapshot.config.sources.flatMap((source) => [
          repositoryPath(source.spec),
          ...(source.intro ? [repositoryPath(source.intro)] : []),
        ]),
      ]);
      await materializeRepository(
        snapshot,
        directory,
        snapshot.files.filter((file) => paths.has(file.path)),
      );
      // Share names, descriptions, and content with the existing generated documentation tools.
      const tools = buildConfigToolDefinitions({ ...snapshot.config, languages: [] }, directory);
      const resources = [...paths].map((filename) => ({
        name: filename,
        uri: `cortex://repository/${filename.split('/').map(encodeURIComponent).join('/')}`,
        mimeType: filename.endsWith('.md')
          ? 'text/markdown'
          : filename.endsWith('.json')
            ? 'application/json'
            : /\.ya?ml$/.test(filename)
              ? 'text/yaml'
              : 'text/plain',
        text: fs.readFileSync(path.join(directory, filename), 'utf8'),
      }));
      this.current = { snapshot, tools, resources };
      return this.current;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
}

export function createRepositoryServer(
  documentation: Pick<RepositoryDocumentation, 'refresh'>,
): Server {
  const server = new Server(
    { name: 'cortex-repository-docs', version: '1.0.0' },
    {
      capabilities: { tools: { listChanged: true }, resources: { listChanged: true } },
      instructions:
        'Read the project documentation before suggesting integration code. Documentation is fetched from the repository’s current default branch before each request. This server exposes read-only documentation; published package MCP servers can also expose API actions.',
    },
  );
  let fingerprint: string | undefined;
  const refresh = async () => {
    const state = await documentation.refresh();
    const changed = fingerprint !== undefined && fingerprint !== state.snapshot.fingerprint;
    fingerprint = state.snapshot.fingerprint;
    if (changed) {
      await server.sendToolListChanged();
      await server.sendResourceListChanged();
    }
    return state;
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await refresh()).tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const state = await refresh();
      const tool = state.tools.find((tool) => tool.name === request.params.name);
      if (!tool)
        throw new Error('This documentation tool no longer exists. Refresh the tools list.');
      if (Object.keys(request.params.arguments ?? {}).length)
        throw new Error('Documentation tools do not take arguments.');
      return {
        content: [{ type: 'text', text: tool.content }],
        _meta: { repository: state.snapshot.repository, commit: state.snapshot.commit },
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Could not read current documentation: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: (await refresh()).resources.map(({ text: _text, ...resource }) => resource),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const state = await refresh();
    const resource = state.resources.find((resource) => resource.uri === request.params.uri);
    if (!resource) throw new Error('Resource no longer exists. Refresh the resources list.');
    return {
      contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }],
      _meta: { repository: state.snapshot.repository, commit: state.snapshot.commit },
    };
  });
  return server;
}

export async function serveRepository(repository: string, token?: string): Promise<void> {
  const documentation = new RepositoryDocumentation(repository, token);
  const initial = await documentation.refresh();
  const server = createRepositoryServer(documentation);
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `Cortex MCP connected to ${initial.snapshot.repository} (${initial.snapshot.branch}). Refreshes from GitHub before each documentation request.\n`,
  );
}
