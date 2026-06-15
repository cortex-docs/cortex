export type SupportedLanguage =
  | 'typescript'
  | 'python'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'ruby'
  | 'php'
  | 'csharp'
  | 'rust'
  | 'cpp'
  | 'c';

export type SourceType = 'openapi-spec' | 'asyncapi-spec' | 'graphql-spec' | 'grpc-spec';

export interface SourceLanguageConfig {
  language: SupportedLanguage;
  package_name: string;
  github_repository?: string;
}

export interface SourceConfig {
  title: string;
  type: SourceType;
  spec: string;
  intro?: string;
  languages: SourceLanguageConfig[];
}

export interface LanguageConfig {
  language: SupportedLanguage;
  package_name: string;
  output_dir: string;
  github_repository?: string;
  options?: Record<string, unknown>;
}

export interface OutputConfig {
  base_dir: string;
}

export interface DocsDocument {
  title: string;
  document: string;
}

export interface DocsSection {
  section: string;
  sources: DocsDocument[];
}

export interface McpConfig {
  package_name?: string;
  github_repository?: string;
}

export interface CortexConfig {
  project: string;
  title?: string;
  logo?: string;
  logo_dark?: string;
  logo_light?: string;
  logoHeight?: number;
  showLogoDocsLabel?: boolean;
  favicon?: string;
  theme?: 'light' | 'dark' | 'system';
  primaryColor?: string;
  sources: SourceConfig[];
  output: OutputConfig;
  languages: LanguageConfig[];
  docs?: DocsSection[];
  mcp?: McpConfig;
}
