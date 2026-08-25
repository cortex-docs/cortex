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

const sourceTypes = [
  'openapi-spec',
  'asyncapi-spec',
  'graphql-spec',
  'grpc-spec',
  'openrpc-spec',
] as const;

const environmentVariableSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Must be a valid environment variable name');

const publishGitHubConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    token_env: environmentVariableSchema.optional(),
    username_env: environmentVariableSchema.optional(),
    auth: z.boolean().optional(),
    branch: z
      .string()
      .regex(/^(?!\/|.*(?:\.\.|\/\/|@\{|\\))[A-Za-z0-9._\/-]+(?<![\/.])$/)
      .optional(),
  })
  .strict();

const publishRegistryConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    url: z.string().min(1).optional(),
    name: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    token_env: environmentVariableSchema.optional(),
    username_env: environmentVariableSchema.optional(),
    auth: z.boolean().optional(),
    access: z.enum(['public', 'restricted']).optional(),
    github: z.union([z.boolean(), publishGitHubConfigSchema]).optional(),
  })
  .strict();

const sourceLanguageConfigSchema = z
  .object({
    language: z.enum(supportedLanguages),
    package_name: z.string().min(1),
    template: z.string().min(1).optional(),
    github_repository: z.string().optional(),
    publish: publishRegistryConfigSchema.optional(),
  })
  .strict();

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const heartbeatFlowSchema = z
  .object({
    message: jsonValueSchema,
    response: jsonValueSchema.optional(),
  })
  .strict();

const websocketHeartbeatSchema = z
  .object({
    enabled: z.boolean().default(true),
    format: z.enum(['json', 'text']).default('json'),
    interval_ms: z.number().int().positive().default(30_000),
    timeout_ms: z.number().int().nonnegative().default(10_000),
    client: heartbeatFlowSchema.optional(),
    server: heartbeatFlowSchema.optional(),
  })
  .strict()
  .superRefine((heartbeat, ctx) => {
    if (heartbeat.enabled && !heartbeat.client && !heartbeat.server) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An enabled heartbeat requires a client or server flow',
      });
    }
    if (heartbeat.server && heartbeat.server.response === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['server', 'response'],
        message: 'A server heartbeat requires the client response',
      });
    }
    if (heartbeat.format === 'text') {
      for (const [flowName, flow] of [
        ['client', heartbeat.client],
        ['server', heartbeat.server],
      ] as const) {
        if (flow && (typeof flow.message !== 'string' || flow.message.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [flowName, 'message'],
            message: 'Text heartbeat messages must be non-empty strings',
          });
        }
        if (
          flow?.response !== undefined &&
          (typeof flow.response !== 'string' || flow.response.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [flowName, 'response'],
            message: 'Text heartbeat responses must be non-empty strings',
          });
        }
      }
    }
  });

const websocketSourceConfigSchema = z
  .object({
    heartbeat: websocketHeartbeatSchema.optional(),
  })
  .strict();

const sourceConfigSchema = z
  .object({
    title: z.string().min(1),
    type: z.enum(sourceTypes),
    spec: z.string().min(1),
    endpoint: z.string().url().optional(),
    intro: z.string().min(1).optional(),
    languages: z.array(sourceLanguageConfigSchema).min(1),
    websocket: websocketSourceConfigSchema.optional(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.websocket && source.type !== 'asyncapi-spec') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['websocket'],
        message: 'WebSocket options are only valid for asyncapi-spec sources',
      });
    }
    if (source.endpoint && source.type !== 'graphql-spec') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpoint'],
        message: 'An endpoint is only valid for a graphql-spec source',
      });
    }
  });

const outputConfigSchema = z
  .object({
    base_dir: z.string().min(1).default('./generated'),
  })
  .strict();

const generatorConfigSchema = z
  .object({
    templates: z.string().min(1),
  })
  .strict();

const docsDocumentSchema = z
  .object({
    title: z.string().min(1),
    document: z.string().min(1),
  })
  .strict();

const docsSectionSchema = z
  .object({
    section: z.string().min(1),
    sources: z.array(docsDocumentSchema).min(1),
  })
  .strict();

const homeCallToActionSchema = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
  })
  .strict();

const homeSectionSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    badge: z.string().min(1),
    href: z.string().min(1),
    icon: z.string().min(1).optional(),
    background: z.string().min(1).optional(),
  })
  .strict();

const homeConfigSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    cta: homeCallToActionSchema.optional(),
    sections: z.array(homeSectionSchema).min(1).optional(),
  })
  .strict();

const mcpConfigSchema = z
  .object({
    package_name: z.string().optional(),
    github_repository: z.string().optional(),
  })
  .strict()
  .optional();

const publishConfigSchema = z
  .object({
    registries: z
      .object(
        Object.fromEntries(
          supportedLanguages.map((language) => [language, publishRegistryConfigSchema.optional()]),
        ),
      )
      .strict()
      .optional(),
    mcp: publishRegistryConfigSchema.optional(),
  })
  .strict()
  .optional();

export const cortexConfigSchema = z
  .object({
    project: z.string().min(1),
    title: z.string().optional(),
    logo: z.string().optional(),
    logo_dark: z.string().optional(),
    logo_light: z.string().optional(),
    logoHeight: z.number().positive().optional(),
    showLogoDocsLabel: z.boolean().optional(),
    favicon: z.string().optional(),
    custom_head_html: z.string().optional(),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    home: homeConfigSchema.optional(),
    sources: z.array(sourceConfigSchema).default([]),
    output: outputConfigSchema.default({ base_dir: './generated' }),
    generators: generatorConfigSchema.optional(),
    docs: z.array(docsSectionSchema).optional(),
    mcp: mcpConfigSchema,
    publish: publishConfigSchema,
  })
  .strict();

export type CortexConfigInput = z.input<typeof cortexConfigSchema>;
