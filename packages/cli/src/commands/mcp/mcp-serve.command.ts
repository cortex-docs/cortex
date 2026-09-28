import { Command, CommandRunner } from 'nest-commander';
import { parseRepository } from '@cortex-docs/core/hosting';
import { githubToken } from '../deploy/deploy.command';
import { serveRepository } from './repository-server';

@Command({
  name: 'mcp-serve',
  arguments: '<repository>',
  description:
    'Run a local stdio MCP server with current Markdown documentation from a public GitHub repository',
})
export class McpServeCommand extends CommandRunner {
  async run(params: string[]): Promise<void> {
    await serveRepository(parseRepository(params[0]).url, githubToken());
  }
}
