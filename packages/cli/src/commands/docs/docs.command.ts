import { Command, CommandRunner } from 'nest-commander';
import { DocsServeCommand } from './serve.command';
import { DocsBuildCommand } from './build.command';
import { DocsStartCommand } from './start.command';

@Command({
  name: 'docs',
  description: 'API documentation commands',
  subCommands: [DocsServeCommand, DocsBuildCommand, DocsStartCommand],
})
export class DocsCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
