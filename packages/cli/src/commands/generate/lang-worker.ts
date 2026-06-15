import { parentPort, workerData } from 'node:worker_threads';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface WorkerInput {
  language: string;
  packageName: string;
  outputDir: string;
  githubRepository?: string;
  restResultJson: string;
  asyncSpecJson: string | null;
  gqlSpecJson: string | null;
  grpcSpecJson: string | null;
  version: string;
  asyncapiSourceTitle?: string;
  graphqlSourceTitle?: string;
  grpcSourceTitle?: string;
}

function mapReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).__type === 'Map') {
    return new Map((value as { entries: Array<[string, unknown]> }).entries);
  }
  return value;
}

async function run() {
  const input = workerData as WorkerInput;
  const { FileEmitter, WsTemplateEngine, createWsPluginForLanguage, GqlTemplateEngine, createGqlPluginForLanguage, GrpcTemplateEngine, createGrpcPluginForLanguage } = await import('@cortex/codegen');

  const emitter = new FileEmitter();
  const langDir = input.outputDir;
  const restResult = JSON.parse(input.restResultJson, mapReviver);
  const langResult = restResult.languages.find((l: { language: string }) => l.language === input.language);
  let totalFiles = langResult?.emit?.written?.length ?? 0;
  const protocols = ['REST'];

  if (input.asyncSpecJson) {
    const asyncSpec = JSON.parse(input.asyncSpecJson, mapReviver);
    const wsEngine = new WsTemplateEngine();
    const wsLangConfig = createWsPluginForLanguage(input.language);
    if (wsLangConfig) {
      const wsFiles = (await wsEngine.generate(asyncSpec, input.packageName, input.version, wsLangConfig, input.asyncapiSourceTitle)).filter((f) => f.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(wsFiles, langDir)).written.length;
      protocols.push('WS');
    }
  }

  if (input.gqlSpecJson) {
    const gqlSpec = JSON.parse(input.gqlSpecJson, mapReviver);
    const gqlEngine = new GqlTemplateEngine();
    const gqlLangConfig = createGqlPluginForLanguage(input.language);
    if (gqlLangConfig) {
      const gqlFiles = (await gqlEngine.generate(gqlSpec, input.packageName, input.version, gqlLangConfig, input.graphqlSourceTitle)).filter((f) => f.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(gqlFiles, langDir)).written.length;
      protocols.push('GraphQL');
    }
  }

  if (input.grpcSpecJson) {
    const grpcSpec = JSON.parse(input.grpcSpecJson, mapReviver);
    const grpcEngine = new GrpcTemplateEngine();
    const grpcLangConfig = createGrpcPluginForLanguage(input.language);
    if (grpcLangConfig) {
      const allGrpcFiles = await grpcEngine.generate(grpcSpec, input.packageName, input.version, grpcLangConfig, input.grpcSourceTitle);
      const grpcFiles = allGrpcFiles.filter((f) => f.path.startsWith('src/'));
      totalFiles += (await emitter.writeFiles(grpcFiles, langDir)).written.length;
      protocols.push('gRPC');

      const grpcPkgFile = allGrpcFiles.find((f) => f.path === 'package.json');
      if (grpcPkgFile) {
        const mainPkgPath = path.resolve(langDir, 'package.json');
        if (fs.existsSync(mainPkgPath)) {
          const mainPkg = JSON.parse(fs.readFileSync(mainPkgPath, 'utf-8'));
          const grpcPkg = JSON.parse(grpcPkgFile.content);
          if (grpcPkg.dependencies) {
            mainPkg.dependencies = { ...mainPkg.dependencies, ...grpcPkg.dependencies };
          }
          fs.writeFileSync(mainPkgPath, JSON.stringify(mainPkg, null, 2) + '\n');
        }
      }
    }
  }

  parentPort?.postMessage({ language: input.language, totalFiles, protocols, langDir });
}

run().catch((err) => {
  parentPort?.postMessage({ language: workerData.language, error: err.message });
});
