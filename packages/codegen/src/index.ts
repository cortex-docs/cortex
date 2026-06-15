export { CodegenEngine, type GenerationResult, type LanguageResult } from './engine';
export { renderSnippet, renderRestSnippet, getAvailableSnippetTemplates } from './snippet-renderer';
export { FileEmitter, type EmitResult } from './emitter';
export {
  PluginRegistry,
  type LanguagePlugin,
  type CodegenContext,
  type GeneratedFile,
  type NamingConventions,
} from './plugin';
export { getLanguageNaming } from './naming';
export { TypeScriptPlugin } from './languages/typescript/index';
export { PythonPlugin } from './languages/python/index';
export { GoPlugin } from './languages/go/index';
export { JavaPlugin } from './languages/java/index';
export { KotlinPlugin } from './languages/kotlin/index';
export { RubyPlugin } from './languages/ruby/index';
export { PhpPlugin } from './languages/php/index';
export { CSharpPlugin } from './languages/csharp/index';
export { RustPlugin } from './languages/rust/index';
export { CppPlugin } from './languages/cpp/index';
export { CPlugin } from './languages/c/index';
export { createWsPluginForLanguage, type WsCodegenContext } from './languages/ws-template-plugin';
export { WsTemplateEngine, type WsLanguageConfig } from './languages/ws-template-plugin';
export { GqlTemplateEngine, createGqlPluginForLanguage, type GqlLanguageConfig } from './languages/gql-template-plugin';
export { GrpcTemplateEngine, createGrpcPluginForLanguage, type GrpcLanguageConfig } from './languages/grpc-template-plugin';

import { PluginRegistry } from './plugin';
import { TypeScriptPlugin } from './languages/typescript/index';
import { PythonPlugin } from './languages/python/index';
import { GoPlugin } from './languages/go/index';
import { JavaPlugin } from './languages/java/index';
import { KotlinPlugin } from './languages/kotlin/index';
import { RubyPlugin } from './languages/ruby/index';
import { PhpPlugin } from './languages/php/index';
import { CSharpPlugin } from './languages/csharp/index';
import { RustPlugin } from './languages/rust/index';
import { CppPlugin } from './languages/cpp/index';
import { CPlugin } from './languages/c/index';

export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();
  registry.register(new TypeScriptPlugin());
  registry.register(new PythonPlugin());
  registry.register(new GoPlugin());
  registry.register(new JavaPlugin());
  registry.register(new KotlinPlugin());
  registry.register(new RubyPlugin());
  registry.register(new PhpPlugin());
  registry.register(new CSharpPlugin());
  registry.register(new RustPlugin());
  registry.register(new CppPlugin());
  registry.register(new CPlugin());
  return registry;
}
