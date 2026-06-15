import { Command, CommandRunner } from 'nest-commander';
import { McpGenerateCommand } from './mcp-generate.command';

@Command({
  name: 'mcp',
  description: 'MCP server commands',
  subCommands: [McpGenerateCommand],
})
export class McpCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
