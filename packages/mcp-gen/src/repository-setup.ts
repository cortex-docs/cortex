export function generateRepositorySetupSection(options: {
  repository: string;
  serverName: string;
  publishedPackage?: string;
}): string {
  const { repository, serverName, publishedPackage } = options;
  const args = ['-y', '@cortex-docs/cli', 'mcp-serve', repository];
  const command = `npx ${args.join(' ')}`;
  const config = (key: string) =>
    JSON.stringify({ [key]: { [serverName]: { command: 'npx', args } } }, null, 2);
  const lines = [
    '## Client Setup Guide',
    '',
    'Run this project’s documentation MCP server locally for free. Node.js 20+ is required.',
    '',
    '```bash',
    command,
    '```',
    '',
    'The server reads cortex.config.yml and its Markdown documents from the public repository’s default branch. It checks GitHub before every documentation request and downloads changed files automatically. No MCP package publishing or running cloud server is required.',
    '',
    'This connection provides documentation tools and specification resources. It does not execute the project’s API operations.',
    '',
    '### Claude Code',
    '',
    '```bash',
    `claude mcp add ${serverName} -- ${command}`,
    '```',
    '',
    '### Claude Desktop, Cursor, Windsurf, and Cline',
    '',
    'Add this entry to your client’s MCP configuration:',
    '',
    '```json',
    config('mcpServers'),
    '```',
    '',
    '### VS Code',
    '',
    'Add this configuration to .vscode/mcp.json:',
    '',
    '```json',
    config('servers'),
    '```',
    '',
    '### Codex',
    '',
    'Add this configuration to ~/.codex/config.toml:',
    '',
    '```toml',
    `[mcp_servers.${JSON.stringify(serverName)}]`,
    'command = "npx"',
    `args = ${JSON.stringify(args)}`,
    '```',
    '',
    '### Updates and GitHub access',
    '',
    'The server runs while your MCP client is connected. Each request reads the current default branch; failed refreshes return an error instead of silently serving old documentation. New or removed documentation tools trigger a tools-list update.',
    '',
    'Public repositories work without a token within GitHub’s anonymous API limits. For regular use, sign in with gh auth login or provide GITHUB_TOKEN in the MCP process environment. A read-only token is sufficient for mcp-serve.',
    '',
  ];
  if (publishedPackage)
    lines.push(
      '### Published MCP package',
      '',
      'You can also use the existing published package. Its documentation updates when the maintainer publishes a new version, and it may include API action tools.',
      '',
      '```bash',
      `npx ${publishedPackage}`,
      '```',
      '',
    );
  return lines.join('\n');
}
