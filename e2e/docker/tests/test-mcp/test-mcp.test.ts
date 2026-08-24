// Integration test: generates an MCP server from petstore spec, builds it,
// spawns it via stdio transport, and validates the MCP protocol responses.
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// JSON-RPC helpers (newline-delimited JSON over stdio)
// ---------------------------------------------------------------------------

let msgId = 0;

function nextId(): number {
  return ++msgId;
}

/**
 * Send a JSON-RPC request and wait for the matching response by id.
 * Handles both Content-Length framed and newline-delimited JSON.
 */
function sendRequest(
  proc: ChildProcess,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextId();
    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for response to "${method}" (id=${id})`));
    }, timeoutMs);

    let buffer = '';

    function onData(chunk: Buffer) {
      buffer += chunk.toString();

      // Try to extract complete JSON objects from the buffer
      while (true) {
        // Skip any Content-Length headers
        const headerMatch = buffer.match(/^Content-Length:\s*\d+\r?\n\r?\n/);
        if (headerMatch) {
          buffer = buffer.slice(headerMatch[0].length);
        }

        // Try to parse a JSON object from the start of the buffer
        const jsonStart = buffer.indexOf('{');
        if (jsonStart === -1) break;

        // Find the matching closing brace
        let depth = 0;
        let inString = false;
        let escape = false;
        let end = -1;
        for (let i = jsonStart; i < buffer.length; i++) {
          const ch = buffer[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\' && inString) {
            escape = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === '{') depth++;
          if (ch === '}') {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }

        if (end === -1) break; // Incomplete JSON, wait for more data

        const jsonStr = buffer.slice(jsonStart, end + 1);
        buffer = buffer.slice(end + 1);

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.id === id) {
            cleanup();
            resolve(parsed);
            return;
          }
          // Not our message, continue scanning
        } catch {
          // Malformed fragment, skip past the opening brace
          buffer = buffer.slice(1);
        }
      }
    }

    function cleanup() {
      clearTimeout(timer);
      proc.stdout?.removeListener('data', onData);
    }

    proc.stdout?.on('data', onData);
    proc.stdin?.write(message + '\n');
  });
}

/**
 * Send a JSON-RPC notification (no id, no response expected).
 */
function sendNotification(
  proc: ChildProcess,
  method: string,
  params: Record<string, unknown> = {},
) {
  const message = JSON.stringify({ jsonrpc: '2.0', method, params });
  proc.stdin?.write(message + '\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP Server', () => {
  // Resolve paths relative to the monorepo root
  const repoRoot = path.resolve(
    import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
    '../../../..',
  );
  const fixturePath = path.join(repoRoot, 'packages/core/__fixtures__/petstore.yaml');

  let mcpProc: ChildProcess | null = null;
  let toolNames: string[] = [];
  let tmpDir: string;
  let outputDir: string;
  let stderrOutput = '';

  beforeAll(async () => {
    expect(fs.existsSync(fixturePath)).toBe(true);

    // Create a temporary directory for the generated MCP server
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-mcp-e2e-'));
    outputDir = path.join(tmpDir, 'mcp-server');

    // Step 1: Generate the MCP server using the generator directly
    const { OpenAPIParser } = await import(path.join(repoRoot, 'packages/core/dist/index.js'));
    const { McpGenerator } = await import(path.join(repoRoot, 'packages/mcp-gen/dist/index.js'));

    const parser = new OpenAPIParser();
    const spec = await parser.parse(fixturePath);

    const config = {
      organization: 'test',
      package_name: 'petstore-api',
      spec: fixturePath,
      output: { base_dir: './generated' },
      languages: [{ language: 'typescript', package_name: 'test', output_dir: './out' }],
      sources: [
        {
          title: 'Petstore API',
          type: 'openapi-spec',
          spec: fixturePath,
          languages: [{ language: 'typescript', package_name: 'test' }],
        },
      ],
    };

    const generator = new McpGenerator();
    const result = await generator.generate(spec, config, {
      outputDir,
      transport: 'stdio',
      serverName: 'petstore-mcp-test',
    });

    expect(result.files.length).toBeGreaterThan(0);

    // Step 2: Install dependencies
    execSync('npm install --ignore-scripts', {
      cwd: outputDir,
      stdio: 'pipe',
      timeout: 120000,
    });

    // Step 3: Start the MCP server via tsx (avoids CJS/ESM issues)
    mcpProc = spawn('npx', ['tsx', 'src/main.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: outputDir,
    });

    // Collect stderr for debugging
    mcpProc.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    // Give it a moment to start
    await new Promise((r) => setTimeout(r, 1000));

    expect(!mcpProc.killed && mcpProc.exitCode === null).toBe(true);
  }, 180000);

  afterAll(() => {
    if (mcpProc && !mcpProc.killed) {
      mcpProc.kill();
    }

    try {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it('initialize: server responds with capabilities', async () => {
    const response = await sendRequest(mcpProc!, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cortex-e2e-test', version: '1.0' },
    });

    expect(response.result).toBeDefined();
    expect(response.result.serverInfo?.name).toBe('petstore-mcp-test');
    expect(response.result.protocolVersion).toBeDefined();
    expect(response.result.capabilities).toBeDefined();

    // Send initialized notification (required before server accepts tool/resource requests)
    sendNotification(mcpProc!, 'notifications/initialized');

    // Small delay to let server process the notification
    await new Promise((r) => setTimeout(r, 200));
  });

  it('tools/list: returns REST operation tools', async () => {
    const response = await sendRequest(mcpProc!, 'tools/list');

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);
    expect(response.result.tools.length).toBeGreaterThan(0);

    toolNames = response.result.tools.map((t: any) => t.name);
  });

  it('tools/list: includes pets_list tool', () => {
    expect(toolNames).toContain('pets_list');
  });

  it('tools/list: includes pets_create tool', () => {
    expect(toolNames).toContain('pets_create');
  });

  it('tools/list: includes pets_get tool', () => {
    expect(toolNames).toContain('pets_get');
  });

  it('tools/list: includes owners_list tool', () => {
    expect(toolNames).toContain('owners_list');
  });

  it('resources/list: returns spec resources', async () => {
    const response = await sendRequest(mcpProc!, 'resources/list');

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.resources)).toBe(true);
    expect(response.result.resources.length).toBeGreaterThan(0);

    const hasOpenApiSpec = response.result.resources.some(
      (r: any) => r.name === 'openapi-spec' || r.uri === 'api://specs/openapi',
    );
    expect(hasOpenApiSpec).toBe(true);
  });

  it('resources/read: can read openapi-spec resource', async () => {
    const response = await sendRequest(mcpProc!, 'resources/read', {
      uri: 'api://specs/openapi',
    });

    expect(response.result).toBeDefined();
    expect(Array.isArray(response.result.contents)).toBe(true);
    expect(response.result.contents.length).toBeGreaterThan(0);

    const content = response.result.contents[0];
    expect(typeof content.text).toBe('string');
    expect(content.text).toContain('Petstore API');
    expect(content.text).toContain('/pets');
  });
});
