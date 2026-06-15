// ---------------------------------------------------------------------------
// snippet-generator.ts
// Constants and types for SDK snippet display.
// Snippets are rendered server-side from shared EJS mini-templates
// via the /api/sdk-snippets route using @cortex/codegen's renderSnippet().
// ---------------------------------------------------------------------------

export const SUPPORTED_LANGUAGES = [
  'typescript',
  'python',
  'go',
  'java',
  'kotlin',
  'ruby',
  'php',
  'csharp',
  'rust',
  'cpp',
  'c',
] as const;

export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  kotlin: 'Kotlin',
  ruby: 'Ruby',
  php: 'PHP',
  csharp: 'C#',
  rust: 'Rust',
  cpp: 'C++',
  c: 'C',
};

export const LANGUAGE_SYNTAX: Record<string, string> = {
  typescript: 'typescript',
  python: 'python',
  go: 'go',
  java: 'java',
  kotlin: 'kotlin',
  ruby: 'ruby',
  php: 'php',
  csharp: 'csharp',
  rust: 'rust',
  cpp: 'cpp',
  c: 'c',
};

export function getLanguageDisplayName(lang: string): string {
  return LANGUAGE_DISPLAY_NAMES[lang] ?? lang;
}

export function getLanguageSyntax(lang: string): string {
  return LANGUAGE_SYNTAX[lang] ?? lang;
}
