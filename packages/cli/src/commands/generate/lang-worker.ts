import { parentPort, workerData } from 'node:worker_threads';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface WorkerInput {
  language: string;
  packageName: string;
  outputDir: string;
  githubRepository?: string;
  hasRest: boolean;
  restResultJson: string;
  asyncSpecJson: string | null;
  gqlSpecJson: string | null;
  grpcSpecJson: string | null;
  openRpcSpecJson: string | null;
  version: string;
  asyncapiSourceTitle?: string;
  asyncapiHeartbeat?: import('@cortex-docs/core').WebSocketHeartbeatConfig;
  graphqlSourceTitle?: string;
  grpcSourceTitle?: string;
  openRpcSourceTitle?: string;
  templateRoot?: string;
  restTemplateDir?: string;
  asyncapiTemplateDir?: string;
  graphqlTemplateDir?: string;
  grpcTemplateDir?: string;
  openRpcTemplateDir?: string;
}

function mapReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).__type === 'Map') {
    return new Map((value as { entries: Array<[string, unknown]> }).entries);
  }
  return value;
}

async function run() {
  const input = workerData as WorkerInput;
  const {
    FileEmitter,
    WsTemplateEngine,
    createWsPluginForLanguage,
    GqlTemplateEngine,
    createGqlPluginForLanguage,
    GrpcTemplateEngine,
    createGrpcPluginForLanguage,
    OpenRpcTemplateEngine,
    createOpenRpcPluginForLanguage,
  } = await import('@cortex-docs/codegen');

  const emitter = new FileEmitter();
  const langDir = input.outputDir;
  const restResult = JSON.parse(input.restResultJson, mapReviver);
  const langResult = restResult.languages.find(
    (l: { language: string }) => l.language === input.language,
  );
  let totalFiles = langResult?.emit?.written?.length ?? 0;
  const protocols = input.hasRest ? ['REST'] : [];

  if (input.asyncSpecJson) {
    const asyncSpec = JSON.parse(input.asyncSpecJson, mapReviver);
    const wsEngine = new WsTemplateEngine();
    const wsLangConfig = createWsPluginForLanguage(input.language);
    if (wsLangConfig) {
      const wsFiles = (
        await wsEngine.generate(
          asyncSpec,
          input.packageName,
          input.version,
          wsLangConfig,
          input.asyncapiSourceTitle,
          input.asyncapiHeartbeat,
          { templateRoot: input.templateRoot, templateDir: input.asyncapiTemplateDir },
        )
      ).filter((f) => f.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(wsFiles, langDir)).written.length;
      protocols.push('WS');
    }
  }

  if (input.gqlSpecJson) {
    const gqlSpec = JSON.parse(input.gqlSpecJson, mapReviver);
    const gqlEngine = new GqlTemplateEngine();
    const gqlLangConfig = createGqlPluginForLanguage(input.language);
    if (gqlLangConfig) {
      const gqlFiles = (
        await gqlEngine.generate(
          gqlSpec,
          input.packageName,
          input.version,
          gqlLangConfig,
          input.graphqlSourceTitle,
          { templateRoot: input.templateRoot, templateDir: input.graphqlTemplateDir },
        )
      ).filter((f) => f.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(gqlFiles, langDir)).written.length;
      protocols.push('GraphQL');
    }
  }

  if (input.grpcSpecJson) {
    const grpcSpec = JSON.parse(input.grpcSpecJson, mapReviver);
    const grpcEngine = new GrpcTemplateEngine();
    const grpcLangConfig = createGrpcPluginForLanguage(input.language);
    if (grpcLangConfig) {
      const grpcFiles = (
        await grpcEngine.generate(
          grpcSpec,
          input.packageName,
          input.version,
          grpcLangConfig,
          input.grpcSourceTitle,
          { templateRoot: input.templateRoot, templateDir: input.grpcTemplateDir },
        )
      ).filter((file) => file.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(grpcFiles, langDir)).written.length;
      protocols.push('gRPC');
    }
  }

  if (input.openRpcSpecJson) {
    const openRpcSpec = JSON.parse(input.openRpcSpecJson, mapReviver);
    const openRpcEngine = new OpenRpcTemplateEngine();
    const openRpcLangConfig = createOpenRpcPluginForLanguage(input.language);
    if (openRpcLangConfig) {
      const allOpenRpcFiles = await openRpcEngine.generate(
        openRpcSpec,
        input.packageName,
        input.version,
        openRpcLangConfig,
        input.openRpcSourceTitle,
        { templateRoot: input.templateRoot, templateDir: input.openRpcTemplateDir },
      );
      const openRpcFiles = allOpenRpcFiles.filter((f) => f.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(openRpcFiles, langDir)).written.length;
      protocols.push('OpenRPC');

      const openRpcPkgFile = allOpenRpcFiles.find((f) => f.path === 'package.json');
      if (openRpcPkgFile) {
        const mainPkgPath = path.resolve(langDir, 'package.json');
        if (fs.existsSync(mainPkgPath)) {
          const mainPkg = JSON.parse(fs.readFileSync(mainPkgPath, 'utf-8'));
          const rpcPkg = JSON.parse(openRpcPkgFile.content);
          if (rpcPkg.dependencies) {
            mainPkg.dependencies = { ...mainPkg.dependencies, ...rpcPkg.dependencies };
          }
          fs.writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + '\n');
        }
      }
    }
  }

  if ((input.restTemplateDir || input.templateRoot) && langResult?.files) {
    const customFilesDirs = [
      input.restTemplateDir ? path.join(input.restTemplateDir, 'files') : undefined,
      input.templateRoot
        ? path.join(input.templateRoot, 'languages', input.language, 'files')
        : undefined,
    ].filter((directory): directory is string => !!directory);
    const finalOverrides = langResult.files.filter((file: { path: string }) =>
      customFilesDirs.some((directory) => fs.existsSync(path.join(directory, `${file.path}.ejs`))),
    );
    if (finalOverrides.length > 0) await emitter.writeFiles(finalOverrides, langDir);
  }

  parentPort?.postMessage({ language: input.language, totalFiles, protocols, langDir });
}

run().catch((err) => {
  parentPort?.postMessage({ language: workerData.language, error: err.message });
});
