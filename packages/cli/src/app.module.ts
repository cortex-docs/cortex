import { Module } from '@nestjs/common';
import { InitCommand } from './commands/init/init.command';
import { GenerateCommand } from './commands/generate/generate.command';
import { ValidateCommand } from './commands/validate/validate.command';
import { DocsCommand } from './commands/docs/docs.command';
import { DocsServeCommand } from './commands/docs/serve.command';
import { DocsBuildCommand } from './commands/docs/build.command';
import { McpCommand } from './commands/mcp/mcp.command';
import { McpGenerateCommand } from './commands/mcp/mcp-generate.command';
import { PublishCommand } from './commands/publish/publish.command';
import { ProjectService } from './services/project.service';
import { LoggerService } from './services/logger.service';

@Module({
  providers: [
    InitCommand,
    GenerateCommand,
    ValidateCommand,
    DocsCommand,
    DocsServeCommand,
    DocsBuildCommand,
    McpCommand,
    McpGenerateCommand,
    PublishCommand,
    ProjectService,
    LoggerService,
  ],
})
export class AppModule {}
