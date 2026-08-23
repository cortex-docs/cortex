import { Command, CommandRunner } from 'nest-commander';
import { GeneratorsExportCommand } from './export.command';

@Command({
  name: 'generators',
  description: 'Custom generator template commands',
  subCommands: [GeneratorsExportCommand],
})
export class GeneratorsCommand extends CommandRunner {
  async run(): Promise<void> {
    this.command.help();
  }
}
