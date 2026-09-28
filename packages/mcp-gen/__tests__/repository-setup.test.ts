import { expect, it } from 'vitest';
import { generateRepositorySetupSection } from '../src/repository-setup';

it('uses repository MCP in client configurations and retains the optional npm package', () => {
  const setup = generateRepositorySetupSection({
    repository: 'https://github.com/owner/repo',
    serverName: 'example',
    publishedPackage: '@example/mcp',
  });
  expect(setup).toContain('npx -y @cortex-docs/cli mcp-serve https://github.com/owner/repo');
  const json = [...setup.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1]),
  );
  expect(json[0].mcpServers.example.args).toEqual([
    '-y',
    '@cortex-docs/cli',
    'mcp-serve',
    'https://github.com/owner/repo',
  ]);
  expect(json[1].servers.example.command).toBe('npx');
  expect(setup).toContain('npx @example/mcp');
  expect(
    generateRepositorySetupSection({
      repository: 'https://github.com/owner/repo',
      serverName: 'example',
    }),
  ).not.toContain('### Published MCP package');
});
