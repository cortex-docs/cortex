#!/usr/bin/env node
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-V')) {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'),
    ) as { version: string };
    process.stdout.write(`${manifest.version}\n`);
    return;
  }

  await CommandFactory.run(AppModule, {
    logger: ['warn', 'error'],
    serviceErrorHandler: (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  });
}

bootstrap().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
