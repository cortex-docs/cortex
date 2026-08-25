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

export type SourceType =
  | 'openapi-spec'
  | 'asyncapi-spec'
  | 'graphql-spec'
  | 'grpc-spec'
  | 'openrpc-spec';

export interface PublishGitHubConfig {
  /** Set to false to disable this GitHub destination. */
  enabled?: boolean;
  /** Environment variable containing a GitHub token. */
  token_env?: string;
  /** Environment variable containing the GitHub username. */
  username_env?: string;
  /** Set to false for a local Git repository used without authentication. */
  auth?: boolean;
  /** Branch that receives the generated package source. */
  branch?: string;
}

export interface PublishRegistryConfig {
  /** Set to false to publish only to the configured GitHub repository. */
  enabled?: boolean;
  /** Registry endpoint, package index, or VCS repository URL. */
  url?: string;
  /** Name used for registries that require a local alias (Cargo and Conan). */
  name?: string;
  /** Environment variable containing the registry token, password, or API key. */
  token_env?: string;
  /** Environment variable containing the registry username. */
  username_env?: string;
  /** Set to false for an anonymous local or internal registry. */
  auth?: boolean;
  /** npm package visibility. */
  access?: 'public' | 'restricted';
  /** Publish the generated package source to github_repository. */
  github?: boolean | PublishGitHubConfig;
}

export interface PublishConfig {
  registries?: Partial<Record<SupportedLanguage, PublishRegistryConfig>>;
  /** npm-compatible registry configuration for the generated MCP server. */
  mcp?: PublishRegistryConfig;
}

export interface SourceLanguageConfig {
  language: SupportedLanguage;
  package_name: string;
  /** Directory with sparse Eta overrides for this source and language. */
  template?: string;
  github_repository?: string;
  publish?: PublishRegistryConfig;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WebSocketHeartbeatFlowConfig {
  /** Message sent by this side of the connection. */
  message: JsonValue;
  /** Response sent by the other side. */
  response?: JsonValue;
}

export interface WebSocketHeartbeatConfig {
  /** Set to false to disable both heartbeat directions. */
  enabled?: boolean;
  /** Encoding used for all configured heartbeat messages. */
  format?: 'json' | 'text';
  /** Interval for client-initiated heartbeat messages. */
  interval_ms?: number;
  /** Maximum wait after a client heartbeat before the connection closes. */
  timeout_ms?: number;
  /** Client-initiated heartbeat and the optional server response. */
  client?: WebSocketHeartbeatFlowConfig;
  /** Server-initiated heartbeat and the required client response. */
  server?: WebSocketHeartbeatFlowConfig;
}

export interface WebSocketSourceConfig {
  heartbeat?: WebSocketHeartbeatConfig;
}

export interface SourceConfig {
  title: string;
  type: SourceType;
  spec: string;
  /** Runtime URL for a GraphQL schema source. */
  endpoint?: string;
  intro?: string;
  languages: SourceLanguageConfig[];
  /** AsyncAPI-specific generated client behavior. */
  websocket?: WebSocketSourceConfig;
}

export interface LanguageConfig {
  language: SupportedLanguage;
  package_name: string;
  output_dir: string;
  template?: string;
  github_repository?: string;
  publish?: PublishRegistryConfig;
  options?: Record<string, unknown>;
}

export interface OutputConfig {
  base_dir: string;
}

export interface GeneratorConfig {
  /** Root directory for sparse Eta template overrides. */
  templates: string;
}

export interface DocsDocument {
  title: string;
  document: string;
}

export interface DocsSection {
  section: string;
  sources: DocsDocument[];
}

export interface HomeCallToAction {
  label: string;
  href: string;
}

export interface HomeSection {
  title: string;
  description: string;
  badge: string;
  href: string;
  /** Path to an SVG or image used by the section card. */
  icon?: string;
  /** Deprecated alias for icon. */
  background?: string;
}

export interface HomeConfig {
  title?: string;
  description?: string;
  cta?: HomeCallToAction;
  sections?: HomeSection[];
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
  custom_head_html?: string;
  theme?: 'light' | 'dark' | 'system';
  primaryColor?: string;
  home?: HomeConfig;
  sources: SourceConfig[];
  output: OutputConfig;
  generators?: GeneratorConfig;
  languages: LanguageConfig[];
  docs?: DocsSection[];
  mcp?: McpConfig;
  publish?: PublishConfig;
}
