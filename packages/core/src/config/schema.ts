import { z } from 'zod';

const supportedLanguages = [
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

const sourceTypes = ['openapi-spec', 'asyncapi-spec', 'graphql-spec', 'grpc-spec'] as const;

const sourceLanguageConfigSchema = z.object({
  language: z.enum(supportedLanguages),
  package_name: z.string().min(1),
  github_repository: z.string().optional(),
});

const sourceConfigSchema = z.object({
  title: z.string().min(1),
  type: z.enum(sourceTypes),
  spec: z.string().min(1),
  languages: z.array(sourceLanguageConfigSchema).min(1),
});

const outputConfigSchema = z.object({
  base_dir: z.string().min(1).default('./generated'),
});

const docsDocumentSchema = z.object({
  title: z.string().min(1),
  document: z.string().min(1),
});

const docsSectionSchema = z.object({
  section: z.string().min(1),
  sources: z.array(docsDocumentSchema).min(1),
});

const mcpConfigSchema = z
  .object({
    package_name: z.string().optional(),
    github_repository: z.string().optional(),
  })
  .optional();

export const cortexConfigSchema = z.object({
  project: z.string().min(1),
  title: z.string().optional(),
  logo: z.string().optional(),
  favicon: z.string().optional(),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sources: z.array(sourceConfigSchema).min(1),
  output: outputConfigSchema.default({ base_dir: './generated' }),
  docs: z.array(docsSectionSchema).optional(),
  mcp: mcpConfigSchema,
});

export type CortexConfigInput = z.input<typeof cortexConfigSchema>;
