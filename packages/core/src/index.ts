export { OpenAPIParser } from './openapi/parser';
export { extractExtensions, getOperationExtensions } from './openapi/extensions';
export type {
  CortexExtensions,
  HttpMethod,
  Operation,
  Parameter,
  ParsedSpec,
  RequestBody,
  Resource,
  ResourceExtension,
  ResponseInfo,
  SchemaObject,
  ServerInfo,
  SpecInfo,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from './openapi/types';

export { ConfigLoader } from './config/loader';
export { cortexConfigSchema } from './config/schema';
export {
  getSourcesByType,
  getFirstSourceByType,
  getFirstSpecPath,
  hasSourceType,
  sanitizePackageName,
  computeEffectiveLanguages,
  sourceHasLanguage,
} from './config/utils';
export type {
  CortexConfig,
  DocsSection,
  DocsDocument,
  LanguageConfig,
  McpConfig,
  OutputConfig,
  SourceConfig,
  SourceLanguageConfig,
  SourceType,
  SupportedLanguage,
} from './config/types';

export { GrpcParser } from './grpc/parser';
export type {
  GrpcSpec,
  GrpcService,
  GrpcMethod,
  GrpcMessage,
  GrpcField,
  GrpcEnum,
  GrpcEnumValue,
} from './grpc/types';

export { GraphQLParser } from './graphql/parser';
export type {
  GraphQLSpec,
  GraphQLOperation,
  GraphQLType,
  GraphQLField,
  GraphQLEnum,
  GraphQLInput,
} from './graphql/types';

export { AsyncAPIParser } from './asyncapi/parser';
export type {
  AsyncApiSpec,
  AsyncApiServer,
  AsyncApiChannel,
  AsyncApiOperation,
  AsyncApiMessage,
} from './asyncapi/types';

export {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  titleToPascalCase,
  toSnakeCase,
  toUpperSnakeCase,
  singularize,
  pluralize,
} from './utils/naming';
