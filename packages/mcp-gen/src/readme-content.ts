import type { McpToolInfo } from './tool-info';

export interface ReadmeData {
  serverName: string;
  packageName: string;
  specTitle: string;
  transport: 'stdio' | 'sse';
  toolInfos: McpToolInfo[];
  instructions?: string;
}

function esc(s?: string): string {
  return (s ?? '').replace(/\n/g, ' ');
}

function jsonConfig(key: string, name: string, pkg: string, extra?: string): string {
  const lines = [
    '{',
    `  "${key}": {`,
    `    "${name}": {`,
    `      "command": "npx",`,
    `      "args": ["${pkg}"]${extra ? ',' : ''}`,
  ];
  if (extra) lines.push(`      ${extra}`);
  lines.push('    }', '  }', '}');
  return lines.join('\n');
}

function generateToolSnippet(tool: McpToolInfo): string {
  if (tool.source === 'docs') {
    return [
      '// Call this tool to get full content',
      '// The agent receives the complete markdown',
      '// document to use as context.',
      '',
      '{',
      `  "name": "${tool.name}",`,
      '  "arguments": {}',
      '}',
      '',
      '// Returns: full document content (markdown)',
    ].join('\n');
  }
  const args: Record<string, string> = {};
  for (const p of tool.parameters) args[p.name] = `<${p.type}>`;
  const argsJson = JSON.stringify(args, null, 4)
    .split('\n')
    .map((l, i) => (i === 0 ? l : '  ' + l))
    .join('\n');
  return `// MCP tool call\n{\n  "name": "${tool.name}",\n  "arguments": ${argsJson}\n}`;
}

export function generateSetupSection(data: ReadmeData): string {
  const { serverName: name, packageName: pkg, transport } = data;
  const npxCmd = `npx ${pkg}`;

  const lines: string[] = [
    `## Client Setup Guide`,
    '',
    'Connect your MCP server to an MCP-compatible AI client.',
    '',

    "### 1. What you're connecting",
    '',
    '| | |',
    '|---|---|',
    `| **Transport** | \`${transport}\` |`,
    `| **Package** | \`${pkg}\` |`,
    `| **Command** | \`${npxCmd}\` |`,
    '| **Runtime** | `Node.js 20+` |',
    '| **Auth** | `none` |',
    '',

    '### 2. Prerequisites',
    '',
    '- Node.js 20+ and npm on PATH',
    '- No build step needed — `npx` downloads and runs the package automatically',
    '',

    '### 3. Universal config shape',
    '',
    'Most clients use this JSON block. Learn it once:',
    '',
    '```json',
    jsonConfig('mcpServers', name, pkg),
    '```',
    '',

    '### 4. Per-client setup',
    '',

    '#### 4.1 Claude Code (CLI)',
    '',
    '```bash',
    `claude mcp add ${name} -- ${npxCmd}`,
    '```',
    '',
    'Scope with `--scope`: `local` (default), `project` (committed .mcp.json), or `user` (all projects).',
    '',
    '```bash',
    `claude mcp list          # see configured servers`,
    `claude mcp get ${name}   # inspect one`,
    `claude mcp remove ${name}`,
    '```',
    '',

    '#### 4.2 Claude Desktop',
    '',
    'Edit the config, then fully restart the app:',
    '',
    '- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`',
    '- Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`',
    '- Linux: `~/.config/Claude/claude_desktop_config.json`',
    '',
    '```json',
    jsonConfig('mcpServers', name, pkg),
    '```',
    '',

    '#### 4.3 Cursor',
    '',
    'Project: `.cursor/mcp.json` — Global: `~/.cursor/mcp.json`',
    '',
    '```json',
    jsonConfig('mcpServers', name, pkg),
    '```',
    '',

    '#### 4.4 VS Code (GitHub Copilot)',
    '',
    'Create `.vscode/mcp.json`. Note: VS Code uses `"servers"`, not `"mcpServers"`.',
    '',
    '```json',
    jsonConfig('servers', name, pkg),
    '```',
    '',

    '#### 4.5 OpenAI Codex CLI',
    '',
    'Config in `~/.codex/config.toml` (TOML format):',
    '',
    '```toml',
    `[mcp_servers.${name}]`,
    `command = "npx"`,
    `args = ["${pkg}"]`,
    '```',
    '',

    '#### 4.6 Windsurf',
    '',
    'Config: `~/.codeium/windsurf/mcp_config.json`',
    '',
    '```json',
    jsonConfig('mcpServers', name, pkg),
    '```',
    '',

    '#### 4.7 Cline (VS Code extension)',
    '',
    '```json',
    jsonConfig('mcpServers', name, pkg, '"disabled": false,\n      "autoApprove": []'),
    '```',
    '',

    '#### 4.8 Continue',
    '',
    `Create \`.continue/mcpServers/${name}.yaml\`:`,
    '',
    '```yaml',
    `name: ${name}`,
    'version: 0.0.1',
    'schema: v1',
    'mcpServers:',
    `  - name: ${name}`,
    '    command: npx',
    '    args:',
    `      - "${pkg}"`,
    '```',
    '',

    '#### 4.9 Zed',
    '',
    'In `settings.json`. Note: Zed uses `"context_servers"`.',
    '',
    '```json',
    '{',
    '  "context_servers": {',
    `    "${name}": {`,
    '      "source": "custom",',
    '      "command": "npx",',
    `      "args": ["${pkg}"]`,
    '    }',
    '  }',
    '}',
    '```',
    '',

    '#### 4.10 JetBrains IDEs',
    '',
    'Settings → Tools → AI Assistant → Model Context Protocol (MCP) → Add Server:',
    '',
    '```json',
    jsonConfig('mcpServers', name, pkg),
    '```',
    '',

    '### 5. Quick reference',
    '',
    '| Client | Config location | Key | Format |',
    '|--------|----------------|-----|--------|',
    '| Claude Code | `claude mcp add` | — | CLI |',
    '| Claude Desktop | `~/Library/.../claude_desktop_config.json` | `mcpServers` | JSON |',
    '| Cursor | `.cursor/mcp.json` | `mcpServers` | JSON |',
    '| VS Code | `.vscode/mcp.json` | `servers` | JSON |',
    '| Codex CLI | `~/.codex/config.toml` | `mcp_servers` | TOML |',
    '| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | JSON |',
    '| Cline | VS Code settings | `mcpServers` | JSON |',
    `| Continue | \`.continue/mcpServers/${name}.yaml\` | \`mcpServers\` | YAML |`,
    '| Zed | `settings.json` | `context_servers` | JSON |',
    '| JetBrains | AI Assistant settings | `mcpServers` | JSON |',
    '',

    '### 6. Troubleshooting',
    '',
    `- **npx not found** — Ensure Node.js 18+ is installed and npm is on your PATH`,
    `- **Command not found in GUI apps** — GUI apps may not inherit shell PATH. Use the full path: /usr/local/bin/npx`,
    `- **Server not responding** — Test manually: \`${npxCmd}\``,
    `- **Permission denied** — Try: \`npx --yes ${pkg}\``,
  ];

  return lines.join('\n');
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'rest':
      return 'REST';
    case 'websocket':
      return 'WS';
    case 'graphql':
      return 'GQL';
    case 'openrpc':
      return 'OpenRPC';
    case 'docs':
      return 'DOCS';
    default:
      return source;
  }
}

export function generateToolsSection(data: ReadmeData): string {
  const { toolInfos, serverName } = data;
  const lines: string[] = [
    '## Tools',
    '',
    `${toolInfos.length} tools available for AI agents via \`${serverName}\``,
    '',
  ];

  for (const tool of toolInfos) {
    const badge = sourceLabel(tool.source);
    const meta: string[] = [`\`${badge}\``];
    if (tool.method) meta.push(`**${tool.method}**`);
    if (tool.path) meta.push(`\`${tool.path}\``);
    if (tool.channel) meta.push(`\`${tool.channel}\``);
    if (tool.operationType) meta.push(tool.operationType);
    if (tool.serviceName) meta.push(`\`${tool.serviceName}\``);

    lines.push(`### \`${tool.name}\``);
    lines.push('');
    lines.push(meta.join(' · '));
    lines.push('');
    lines.push(esc(tool.description));
    lines.push('');

    if (tool.parameters.length > 0) {
      lines.push('| Name | Type | Required |');
      lines.push('|------|------|----------|');
      for (const p of tool.parameters) {
        lines.push(
          `| \`${p.name}\` | \`${p.type}\` | ${p.required ? '**required**' : 'optional'} |`,
        );
      }
      lines.push('');
    }

    lines.push('<details>');
    lines.push('<summary>MCP call snippet</summary>');
    lines.push('');
    lines.push('```json');
    lines.push(generateToolSnippet(tool));
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

export function generateReadme(data: ReadmeData): string {
  const sections: string[] = [
    `# ${data.serverName}`,
    '',
    `MCP server generated from **${data.specTitle}** by [Cortex Docs](https://github.com/cortex-docs/cortex).`,
    '',
    generateSetupSection(data),
    '',
  ];

  if (data.instructions) {
    sections.push('## Agent Instructions');
    sections.push('');
    sections.push(data.instructions);
    sections.push('');
  }

  sections.push(generateToolsSection(data));

  sections.push('## Verify');
  sections.push('');
  sections.push('```bash');
  sections.push(`npx @modelcontextprotocol/inspector npx ${data.packageName}`);
  sections.push('```');

  return sections.join('\n') + '\n';
}
