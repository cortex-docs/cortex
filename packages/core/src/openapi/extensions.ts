import type { CortexExtensions, ResourceExtension } from './types';

const CORTEX_PREFIX = 'x-cortex-';

export function extractExtensions(spec: Record<string, unknown>): CortexExtensions {
  const resources = new Map<string, ResourceExtension>();
  const paths = (spec as { paths?: Record<string, Record<string, unknown>> }).paths;

  if (!paths) return { resources };

  for (const [, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [, operation] of Object.entries(pathItem)) {
      if (!operation || typeof operation !== 'object') continue;
      const op = operation as Record<string, unknown>;

      const resourceName = op[`${CORTEX_PREFIX}resource`];
      const methodName = op[`${CORTEX_PREFIX}method-name`];
      const operationId = op['operationId'];

      if (typeof resourceName === 'string') {
        if (!resources.has(resourceName)) {
          resources.set(resourceName, {
            name: resourceName,
            methodNames: new Map(),
          });
        }

        if (typeof operationId === 'string' && typeof methodName === 'string') {
          resources.get(resourceName)!.methodNames.set(operationId, methodName);
        }
      }
    }
  }

  return { resources };
}

export function getOperationExtensions(operation: Record<string, unknown>): Record<string, unknown> {
  const extensions: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(operation)) {
    if (key.startsWith(CORTEX_PREFIX)) {
      const extensionName = key.slice(CORTEX_PREFIX.length);
      extensions[extensionName] = value;
    }
  }

  return extensions;
}
