import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { Eta } from 'eta';
import type { GeneratedFile } from './plugin';

export interface TemplateRenderOptions {
  /** Absolute path to the configured custom template root. */
  templateRoot?: string;
  /** Absolute path to a source-language template directory. */
  templateDir?: string;
}

export type TemplateGenerator = 'language' | 'websocket' | 'graphql' | 'grpc' | 'openrpc';

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

export function assertTemplateRoot(templateRoot?: string): void {
  if (!templateRoot) return;
  if (!isDirectory(templateRoot)) {
    throw new Error(`Custom template root not found: ${templateRoot}`);
  }
}

export function findLanguageTemplateDir(language: string): string {
  let installedPackageDir: string | undefined;
  try {
    const runtimeRequire = createRequire(path.join(process.cwd(), 'package.json'));
    installedPackageDir = path.dirname(runtimeRequire.resolve('@cortex/codegen/package.json'));
  } catch {
    // Source checkouts can use the paths below.
  }
  const candidates = [
    path.resolve(__dirname, 'languages', language, 'templates'),
    ...(installedPackageDir
      ? [path.join(installedPackageDir, 'dist', 'languages', language, 'templates')]
      : []),
    path.resolve(
      process.cwd(),
      'node_modules/@cortex/codegen/dist/languages',
      language,
      'templates',
    ),
    path.resolve(process.cwd(), '../codegen/dist/languages', language, 'templates'),
    path.resolve(process.cwd(), '../codegen/src/languages', language, 'templates'),
  ];
  return candidates.find(isDirectory) ?? candidates[0];
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

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export class LayeredTemplateRenderer {
  readonly eta: Eta;
  readonly customDirs: string[];

  constructor(
    readonly builtInDir: string,
    readonly customDir?: string,
    fallbackCustomDir?: string,
  ) {
    this.customDirs = Array.from(
      new Set([customDir, fallbackCustomDir].filter((value): value is string => !!value)),
    );
    this.eta = new Eta({
      autoEscape: false,
      autoTrim: false,
      views: builtInDir,
      defaultExtension: '.ejs',
      cacheFilepaths: false,
    });
    this.eta.resolvePath = (templatePath, renderOptions) => {
      let name = templatePath;
      const sourcePath = renderOptions?.filepath;
      if ((name.startsWith('./') || name.startsWith('../')) && sourcePath) {
        const sourceRoot =
          this.customDirs.find((root) => isWithin(root, sourcePath)) ?? this.builtInDir;
        const sourceDir = path.relative(sourceRoot, path.dirname(sourcePath));
        name = path.join(sourceDir, name);
      }

      const resolved = this.resolve(name);
      if (!resolved) throw new Error(`Template not found: ${templateFilename(name)}`);
      return resolved;
    };
  }

  resolve(name: string): string | null {
    const filename = templateFilename(name);
    for (const customDir of this.customDirs) {
      const customPath = path.join(customDir, filename);
      if (fs.existsSync(customPath)) return customPath;
    }

    const builtInPath = path.join(this.builtInDir, filename);
    return fs.existsSync(builtInPath) ? builtInPath : null;
  }

  load(name: string): string | null {
    const templatePath = this.resolve(name);
    return templatePath ? fs.readFileSync(templatePath, 'utf-8') : null;
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

  list(): string[] {
    const names = new Set<string>();
    for (const root of [this.builtInDir, ...this.customDirs]) {
      if (!root || !isDirectory(root)) continue;
      const visit = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const candidate = path.join(dir, entry.name);
          if (entry.isDirectory()) visit(candidate);
          if (entry.isFile() && entry.name.endsWith('.ejs')) {
            names.add(
              path
                .relative(root, candidate)
                .split(path.sep)
                .join('/')
                .replace(/\.ejs$/, ''),
            );
          }
        }
      };
      visit(root);
    }
    return Array.from(names).sort();
  }
}

export function createLanguageTemplateRenderer(
  language: string,
  options?: TemplateRenderOptions,
): LayeredTemplateRenderer {
  assertTemplateRoot(options?.templateRoot);
  assertTemplateRoot(options?.templateDir);
  const globalCustomDir = options?.templateRoot
    ? path.join(options.templateRoot, 'languages', language)
    : undefined;
  return new LayeredTemplateRenderer(
    findLanguageTemplateDir(language),
    options?.templateDir,
    globalCustomDir,
  );
}

export function applyFileTemplateOverrides<TData extends object>(
  files: GeneratedFile[],
  renderer: LayeredTemplateRenderer,
  data: TData,
  generator: TemplateGenerator,
): GeneratedFile[] {
  return files.map((file) => {
    const outputPath = file.path.split(path.sep).join('/');
    const content = renderer.render(`files/${outputPath}.ejs`, {
      ...data,
      generator,
      file: { ...file },
    });
    return content === null ? file : { ...file, content };
  });
}
