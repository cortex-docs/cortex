import { Command, CommandRunner } from 'nest-commander';
import { DocsServeCommand } from './serve.command';
import { DocsBuildCommand } from './build.command';

@Command({
  name: 'docs',
  description: 'API documentation commands',
  subCommands: [DocsServeCommand, DocsBuildCommand],
})
export class DocsCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
