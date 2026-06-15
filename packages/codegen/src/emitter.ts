import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GeneratedFile } from './plugin';

export interface EmitResult {
  written: string[];
  skipped: string[];
}

export class FileEmitter {
  async writeFiles(files: GeneratedFile[], outputDir: string): Promise<EmitResult> {
    const result: EmitResult = { written: [], skipped: [] };
    const resolvedDir = path.resolve(outputDir);

    for (const file of files) {
      const filePath = path.join(resolvedDir, file.path);
      const dir = path.dirname(filePath);

      if (!file.overwrite && fs.existsSync(filePath)) {
        result.skipped.push(file.path);
        continue;
      }

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf-8');
      result.written.push(file.path);
    }

    return result;
  }
}
