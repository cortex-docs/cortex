const LANGUAGES = [
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

export function generateStaticParams(): Array<{ language: string }> {
  return LANGUAGES.map((language) => ({ language }));
}

export default function SdkLanguageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
