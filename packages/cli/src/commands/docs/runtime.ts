import * as path from 'node:path';

export function resolveDocsUiPath(): string {
  try {
    return path.dirname(require.resolve('@cortex/docs-ui/package.json'));
  } catch (error) {
    throw new Error(
      `Cannot find the Cortex Docs UI runtime. Reinstall @cortex/cli. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function resolveNextBin(docsUiPath: string): string {
  try {
    return require.resolve('next/dist/bin/next', { paths: [docsUiPath] });
  } catch (error) {
    throw new Error(
      `Cannot find the Next.js runtime for Cortex Docs. Reinstall @cortex/cli. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
