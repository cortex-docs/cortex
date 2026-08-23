import * as fs from 'node:fs';
import * as path from 'node:path';
import { Eta } from 'eta';

export interface McpTemplateOptions {
  /** Absolute path to the configured custom template root. */
  templateRoot?: string;
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

export function findMcpTemplateDir(): string {
  const candidates = [
    path.resolve(__dirname, 'templates'),
    path.resolve(__dirname, '../templates'),
    path.resolve(__dirname, '../../templates'),
    path.resolve(process.cwd(), 'templates'),
    path.resolve(process.cwd(), 'packages/mcp-gen/templates'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package-json.ejs'))) return candidate;
  }
  return candidates[0];
}

function templateFilename(name: string): string {
  const filename = name.endsWith('.ejs') ? name : `${name}.ejs`;
  const normalized = path.normalize(filename);
  if (
    path.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`Template path must stay inside its template directory: ${name}`);
  }
  return normalized;
}

export class McpTemplateRenderer {
  private readonly builtInDir = findMcpTemplateDir();
  private readonly customDir?: string;
  private readonly eta: Eta;

  constructor(options?: McpTemplateOptions) {
    if (options?.templateRoot && !isDirectory(options.templateRoot)) {
      throw new Error(`Custom template root not found: ${options.templateRoot}`);
    }
    this.customDir = options?.templateRoot ? path.join(options.templateRoot, 'mcp') : undefined;
    this.eta = new Eta({
      autoEscape: false,
      autoTrim: false,
      views: this.builtInDir,
      defaultExtension: '.ejs',
      cacheFilepaths: false,
    });
    this.eta.resolvePath = (templatePath) => {
      const resolved = this.resolve(templatePath);
      if (!resolved) throw new Error(`MCP template not found: ${templateFilename(templatePath)}`);
      return resolved;
    };
  }

  resolve(name: string): string | null {
    const filename = templateFilename(name);
    if (this.customDir) {
      const customPath = path.join(this.customDir, filename);
      if (fs.existsSync(customPath)) return customPath;
    }
    const builtInPath = path.join(this.builtInDir, filename);
    return fs.existsSync(builtInPath) ? builtInPath : null;
  }

  render<TData extends object>(name: string, data: TData): string | null {
    const templatePath = this.resolve(name);
    if (!templatePath) return null;
    const template = fs.readFileSync(templatePath, 'utf-8');
    try {
      return this.eta.renderString(template, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to render template ${templatePath}: ${message}`, { cause: error });
    }
  }
}

export function renderMcpTemplate(
  name: string,
  data: object,
  options?: McpTemplateOptions,
): string | null {
  return new McpTemplateRenderer(options).render(name, data);
}
