import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
  info(message: string): void {
    console.log(`  ${message}`);
  }

  success(message: string): void {
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  }

  warn(message: string): void {
    console.log(`  \x1b[33m⚠\x1b[0m ${message}`);
  }

  error(message: string): void {
    console.error(`  \x1b[31m✗\x1b[0m ${message}`);
  }

  header(message: string): void {
    console.log(`\n\x1b[1m${message}\x1b[0m\n`);
  }

  list(items: string[]): void {
    for (const item of items) {
      console.log(`    • ${item}`);
    }
  }
}
