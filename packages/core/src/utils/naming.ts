const RESERVED_IDENTIFIERS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'def',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'except',
  'export',
  'extends',
  'false',
  'finally',
  'fn',
  'for',
  'from',
  'func',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'interface',
  'let',
  'match',
  'mod',
  'new',
  'nil',
  'none',
  'null',
  'package',
  'pass',
  'private',
  'protected',
  'public',
  'raise',
  'return',
  'self',
  'static',
  'struct',
  'super',
  'switch',
  'this',
  'throw',
  'trait',
  'true',
  'try',
  'type',
  'typeof',
  'use',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function ensureIdentifier(value: string): string {
  const nonEmpty = value || '_';
  const withValidStart = /^\d/.test(nonEmpty) ? `_${nonEmpty}` : nonEmpty;
  return RESERVED_IDENTIFIERS.has(withValidStart) ? `_${withValidStart}` : withValidStart;
}

export function toCamelCase(str: string): string {
  const value = str
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
  return ensureIdentifier(value);
}

export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  const withoutKeywordPrefix =
    camel.startsWith('_') && !/^_\d/.test(camel) ? camel.slice(1) : camel;
  return ensureIdentifier(
    withoutKeywordPrefix.charAt(0).toUpperCase() + withoutKeywordPrefix.slice(1),
  );
}

export function toSnakeCase(str: string): string {
  const value = str
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return ensureIdentifier(value);
}

export function toKebabCase(str: string): string {
  return (
    str
      .trim()
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'generated'
  );
}

export function toUpperSnakeCase(str: string): string {
  return toSnakeCase(str).toUpperCase();
}

export function titleToPascalCase(str: string): string {
  const value = str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  return ensureIdentifier(value);
}

export function singularize(str: string): string {
  if (str.endsWith('ies')) return str.slice(0, -3) + 'y';
  if (str.endsWith('ses') || str.endsWith('xes') || str.endsWith('zes')) return str.slice(0, -2);
  if (str.endsWith('s') && !str.endsWith('ss')) return str.slice(0, -1);
  return str;
}

export function pluralize(str: string): string {
  if (str.endsWith('y') && !/[aeiou]y$/i.test(str)) return str.slice(0, -1) + 'ies';
  if (str.endsWith('s') || str.endsWith('x') || str.endsWith('z')) return str + 'es';
  return str + 's';
}
