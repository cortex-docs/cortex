const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const yaml = require('js-yaml');

const ROOT = '/cortex';
const WORK = '/tmp/cortex-publish-e2e';
const FIRST_VERSION = '0.0.1';
const VERSION = process.env.PUBLISH_E2E_PUBLISH_TARGET ? FIRST_VERSION : '0.0.2';
const API_URL = 'http://localhost:4010';
const CLI = path.join(ROOT, 'packages/cli/dist/main.js');
const SDK_LANGUAGES = ['typescript', 'python', 'go', 'java', 'kotlin', 'ruby', 'php', 'csharp', 'rust', 'cpp', 'c'];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || WORK,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: options.timeout || 600000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
  return result.stdout;
}

async function waitForPort(host, port, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(500);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Registry did not start: ${host}:${port}`);
}

function githubRepository(language) {
  return `https://github.com/cortex-e2e/${language}-sdk`;
}

function githubCloneRepository(language) {
  return `${githubRepository(language)}.git`;
}

function assertGitHubVersion(language, version) {
  const repository = `/shared/github-${language}.git`;
  run('git', ['--git-dir', repository, 'rev-parse', `refs/tags/v${version}`]);
  const metadata = JSON.parse(run('git', [
    '--git-dir', repository,
    'show',
    `refs/tags/v${version}:.cortex-package.json`,
  ]));
  if (!/^sha256:[a-f0-9]{64}$/.test(metadata.contentChecksum ?? '')) {
    throw new Error(`GitHub ${language} v${version} does not contain a Cortex checksum`);
  }
}

function createProject() {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  for (const entry of fs.readdirSync('/shared')) {
    fs.rmSync(path.join('/shared', entry), { recursive: true, force: true });
  }
  fs.mkdirSync('/shared/nuget', { recursive: true });

  const spec = yaml.load(fs.readFileSync(path.join(ROOT, 'packages/core/__fixtures__/petstore.yaml'), 'utf8'));
  spec.servers = [{ url: API_URL }];
  write(path.join(WORK, 'petstore.yaml'), yaml.dump(spec));

  const languages = [
    ['typescript', '@cortex-e2e/sdk'],
    ['python', 'cortex-e2e-sdk'],
    ['go', 'git.local/cortex/e2e-sdk'],
    ['java', 'dev.cortex.e2e.java'],
    ['kotlin', 'dev.cortex.e2e.kotlin'],
    ['ruby', 'cortex-e2e-sdk'],
    ['php', 'cortex/e2e-sdk'],
    ['csharp', 'Cortex.E2E.Sdk'],
    ['rust', 'cortex-e2e-sdk'],
    ['cpp', 'cortex-e2e-sdk'],
    ['c', 'cortex-e2e-sdk'],
  ].map(([language, package_name]) => ({
    language,
    package_name,
    github_repository: githubRepository(language),
    publish: { github: { auth: false } },
  }));

  const config = {
    project: 'cortex-publish-e2e',
    mcp: { package_name: '@cortex-e2e/mcp', github_repository: githubRepository('mcp') },
    sources: [{
      title: 'Petstore API',
      type: 'openapi-spec',
      spec: './petstore.yaml',
      languages,
    }],
    output: { base_dir: './generated' },
    publish: {
      mcp: {
        url: 'http://npm-registry:4873',
        auth: false,
        access: 'public',
        github: { auth: false },
      },
      registries: {
        typescript: { url: 'http://npm-registry:4873', auth: false, access: 'public' },
        python: { url: 'http://pypi-registry:8080', auth: false },
        go: { url: 'file:///shared/go-sdk.git', auth: false },
        java: { url: 'http://maven-registry:8080/releases', username_env: 'MAVEN_USERNAME', token_env: 'MAVEN_TOKEN' },
        kotlin: { url: 'http://maven-registry:8080/releases', username_env: 'MAVEN_USERNAME', token_env: 'MAVEN_TOKEN' },
        ruby: { url: 'http://gem-registry:9292/private', token_env: 'GEM_HOST_API_KEY' },
        php: { url: 'file:///shared/php-sdk.git', auth: false },
        csharp: { url: '/shared/nuget', auth: false },
        rust: { url: 'sparse+http://cargo-registry:8000/index/', token_env: 'CARGO_REGISTRY_TOKEN' },
        cpp: { name: 'cortex-local', url: 'http://conan-registry:9300', username_env: 'CONAN_LOGIN_USERNAME', token_env: 'CONAN_PASSWORD' },
        c: { name: 'cortex-local', url: 'http://conan-registry:9300', username_env: 'CONAN_LOGIN_USERNAME', token_env: 'CONAN_PASSWORD' },
      },
    },
  };
  write(path.join(WORK, 'cortex.config.yml'), yaml.dump(config, { lineWidth: 120 }));

  run('git', ['init', '--bare', '/shared/go-sdk.git']);
  run('git', ['init', '--bare', '/shared/php-sdk.git']);
  for (const language of [...languages.map((entry) => entry.language), 'mcp', 'typescript-only']) {
    const mockRepository = `/shared/github-${language}.git`;
    run('git', ['init', '--bare', mockRepository]);
    run('git', [
      'config',
      '--global',
      `url.file://${mockRepository}.insteadOf`,
      githubCloneRepository(language),
    ]);
  }
}

function testGithubOnlyPublishing() {
  const root = path.join(WORK, 'github-only');
  const configPath = path.join(root, 'cortex.config.yml');
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(path.join(WORK, 'petstore.yaml'), path.join(root, 'petstore.yaml'));
  write(configPath, yaml.dump({
    project: 'cortex-github-only-e2e',
    sources: [{
      title: 'Petstore API',
      type: 'openapi-spec',
      spec: './petstore.yaml',
      languages: [{
        language: 'typescript',
        package_name: '@cortex-e2e/github-only',
        github_repository: githubRepository('typescript-only'),
        publish: { enabled: false, github: { auth: false } },
      }],
    }],
    output: { base_dir: './generated' },
  }));

  run('node', [CLI, 'generate', '--config', configPath, '--no-mcp'], { cwd: root });
  const publishArgs = [CLI, 'publish', '--config', configPath, '--sdk', 'typescript'];
  run('node', publishArgs, { cwd: root });
  assertGitHubVersion('typescript-only', FIRST_VERSION);

  fs.rmSync(path.join(root, 'generated'), { recursive: true, force: true });
  run('node', [CLI, 'generate', '--config', configPath, '--no-mcp'], { cwd: root });
  const unchangedOutput = run('node', publishArgs, { cwd: root });
  if (!unchangedOutput.includes('All selected packages are unchanged')) {
    throw new Error('An unchanged GitHub-only package was not skipped');
  }

  const packageRoot = path.join(root, 'generated', 'typescript', 'cortex-e2e-github-only');
  fs.appendFileSync(path.join(packageRoot, 'src/index.ts'), '\nexport const githubOnlyMarker = "published";\n');
  run('node', publishArgs, { cwd: root });
  assertGitHubVersion('typescript-only', '0.0.2');

  const consumer = path.join(root, 'consumer');
  run('git', ['clone', '--branch', 'v0.0.2', githubCloneRepository('typescript-only'), consumer], { cwd: root });
  run('npm', ['install'], { cwd: consumer });
  run('npm', ['run', 'build'], { cwd: consumer });
  run('node', ['--input-type=module', '-e', 'import("./dist/index.js").then((m) => { if (m.githubOnlyMarker !== "published") process.exit(1); })'], { cwd: consumer });
}

function testTypeScript() {
  const dir = path.join(WORK, 'consumers/typescript');
  write(path.join(dir, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2));
  run('npm', ['install', '--registry', 'http://npm-registry:4873', `@cortex-e2e/sdk@${VERSION}`], { cwd: dir });
  write(path.join(dir, 'index.mjs'), `
import { PetstoreApi } from '@cortex-e2e/sdk';
const client = new PetstoreApi({ baseUrl: '${API_URL}' });
const result = await client.pets.list(1);
if (!Array.isArray(result.data)) throw new Error('TypeScript list() did not return data');
`);
  run('node', ['index.mjs'], { cwd: dir });
}

function testMcp() {
  const dir = path.join(WORK, 'consumers/mcp');
  write(path.join(dir, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2));
  run('npm', ['install', '--registry', 'http://npm-registry:4873', `@cortex-e2e/mcp@${VERSION}`], { cwd: dir });
  write(path.join(dir, 'index.mjs'), `
import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const publishedPackage = require('@cortex-e2e/mcp');
if (typeof publishedPackage.createServer !== 'function') {
  throw new Error('Published MCP package does not export createServer()');
}

const transport = new StdioClientTransport({
  command: path.resolve('node_modules/.bin/cortex-publish-e2e-mcp'),
});
const client = new Client({ name: 'cortex-publish-e2e-consumer', version: '1.0.0' });
const timeout = setTimeout(() => {
  console.error('Published MCP server did not respond');
  process.exit(1);
}, 30000);

try {
  await client.connect(transport);
  const listed = await client.listTools();
  if (!listed.tools.some((tool) => tool.name === 'pets_list')) {
    throw new Error('Published MCP server did not expose pets_list');
  }
  const result = await client.callTool({ name: 'pets_list', arguments: { limit: 1 } });
  const text = result.content?.find((item) => item.type === 'text')?.text;
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.data)) throw new Error('Published MCP pets_list tool did not return data');
} finally {
  clearTimeout(timeout);
  await client.close();
}
`);
  run('node', ['index.mjs'], { cwd: dir });
}

function testPython() {
  const dir = path.join(WORK, 'consumers/python');
  fs.mkdirSync(dir, { recursive: true });
  run('python', ['-m', 'venv', '.venv'], { cwd: dir });
  const pip = path.join(dir, '.venv/bin/pip');
  const python = path.join(dir, '.venv/bin/python');
  run(pip, ['install', '--trusted-host', 'pypi-registry', '--index-url', 'http://pypi-registry:8080/simple/', '--extra-index-url', 'https://pypi.org/simple/', `cortex-e2e-sdk==${VERSION}`], { cwd: dir });
  write(path.join(dir, 'consumer.py'), `
from cortex_e2e_sdk import PetstoreApi
client = PetstoreApi(base_url="${API_URL}")
result = client.pets.list(limit=1)
assert len(result.data) > 0
`);
  run(python, ['consumer.py'], { cwd: dir });
}

function testGo() {
  const dir = path.join(WORK, 'consumers/go');
  run('git', ['clone', '--branch', `v${VERSION}`, '/shared/go-sdk.git', path.join(dir, 'sdk')]);
  write(path.join(dir, 'go.mod'), `module consumer\n\ngo 1.21\n\nrequire git.local/cortex/e2e-sdk v${VERSION}\nreplace git.local/cortex/e2e-sdk => ./sdk\n`);
  write(path.join(dir, 'main.go'), `
package main
import (
  "fmt"
  sdk "git.local/cortex/e2e-sdk"
)
func main() {
  client := sdk.NewPetstoreApi(sdk.WithBaseURL("${API_URL}"))
  limit := 1
  result, err := client.PetResource.List(&limit, nil)
  if err != nil { panic(err) }
  fmt.Println(result)
}
`);
  run('go', ['run', '.'], { cwd: dir });
}

function testJava() {
  const dir = path.join(WORK, 'consumers/java');
  write(path.join(dir, 'settings.xml'), `
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">
  <mirrors>
    <mirror><id>cortex-local</id><mirrorOf>cortex</mirrorOf><url>http://maven-registry:8080/releases</url></mirror>
  </mirrors>
</settings>
`);
  write(path.join(dir, 'pom.xml'), `
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>consumer</groupId><artifactId>consumer</artifactId><version>1.0.0</version>
  <properties><maven.compiler.source>17</maven.compiler.source><maven.compiler.target>17</maven.compiler.target></properties>
  <repositories><repository><id>cortex</id><url>http://maven-registry:8080/releases</url></repository></repositories>
  <dependencies><dependency><groupId>dev.cortex.e2e.java</groupId><artifactId>dev.cortex.e2e.java</artifactId><version>${VERSION}</version></dependency></dependencies>
</project>
`);
  write(path.join(dir, 'src/main/java/Consumer.java'), `
import dev.cortex.e2e.java.PetstoreApi;
import java.util.Map;
public class Consumer {
  public static void main(String[] args) throws Exception {
    PetstoreApi client = new PetstoreApi("${API_URL}", null, null);
    Object result = client.getPets().list(Map.of("limit", "1"));
    if (result == null) throw new IllegalStateException("Java list() returned null");
  }
}
`);
  run('mvn', ['--batch-mode', '--settings', 'settings.xml', 'package'], { cwd: dir });
  run('mvn', ['--batch-mode', '--settings', 'settings.xml', 'org.codehaus.mojo:exec-maven-plugin:3.5.0:java', '-Dexec.mainClass=Consumer'], { cwd: dir });
}

function testKotlin() {
  const dir = path.join(WORK, 'consumers/kotlin');
  write(path.join(dir, 'settings.gradle.kts'), 'rootProject.name = "consumer"\n');
  write(path.join(dir, 'build.gradle.kts'), `
plugins { kotlin("jvm") version "2.1.0"; application }
repositories { maven { url = uri("http://maven-registry:8080/releases"); isAllowInsecureProtocol = true }; mavenCentral() }
dependencies { implementation("dev.cortex.e2e.kotlin:dev.cortex.e2e.kotlin:${VERSION}") }
application { mainClass.set("ConsumerKt") }
`);
  write(path.join(dir, 'src/main/kotlin/Consumer.kt'), `
import dev.cortex.e2e.kotlin.PetstoreApi
fun main() {
  val client = PetstoreApi(baseUrl = "${API_URL}")
  val result = client.pets.list(mapOf("limit" to "1"))
  check(result.data.isNotEmpty())
}
`);
  run('gradle', ['run', '--no-daemon'], { cwd: dir });
}

function testRuby() {
  const dir = path.join(WORK, 'consumers/ruby');
  fs.mkdirSync(dir, { recursive: true });
  run('gem', ['install', 'cortex-e2e-sdk', '--version', VERSION, '--source', 'http://gem-registry:9292/private', '--source', 'https://rubygems.org', '--no-document'], { cwd: dir });
  write(path.join(dir, 'consumer.rb'), `
require "cortex_e2e_sdk"
client = CortexE2eSdk::PetstoreApi.new(base_url: "${API_URL}")
result = client.pets.list(limit: 1)
raise "Ruby list returned no data" if result.data.empty?
`);
  run('ruby', ['consumer.rb'], { cwd: dir });
}

function testPhp() {
  const dir = path.join(WORK, 'consumers/php');
  write(path.join(dir, 'composer.json'), JSON.stringify({
    repositories: [{ type: 'vcs', url: 'file:///shared/php-sdk.git' }],
    require: { 'cortex/e2e-sdk': VERSION },
  }, null, 2));
  run('composer', ['install', '--no-interaction', '--prefer-dist'], { cwd: dir });
  write(path.join(dir, 'consumer.php'), `<?php
require __DIR__ . '/vendor/autoload.php';
$client = new CortexE2eSdk\\PetstoreApi('${API_URL}');
$result = $client->pets()->list(['limit' => '1']);
if (count($result['data']) === 0) { throw new RuntimeException('PHP list returned no data'); }
`);
  run('php', ['consumer.php'], { cwd: dir });
}

function testCsharp() {
  const dir = path.join(WORK, 'consumers/csharp');
  run('dotnet', ['new', 'console', '--framework', 'net8.0', '--output', dir]);
  write(path.join(dir, 'NuGet.Config'), `
<configuration>
  <packageSources>
    <clear />
    <add key="cortex-local" value="/shared/nuget" />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
`);
  run('dotnet', ['add', 'package', 'Cortex.E2E.Sdk', '--version', VERSION], { cwd: dir });
  write(path.join(dir, 'Program.cs'), `
using CortexE2ESdk;
using var client = new PetstoreApi("${API_URL}");
var result = await client.Pets.ListAsync(new Dictionary<string, string> { ["limit"] = "1" });
if (result.Data.Count == 0) throw new Exception("C# list returned no data");
`);
  run('dotnet', ['run'], { cwd: dir });
}

function testRust() {
  const dir = path.join(WORK, 'consumers/rust');
  write(path.join(dir, '.cargo/config.toml'), `
[registries.cortex]
index = "sparse+http://cargo-registry:8000/index/"
[registry]
global-credential-providers = ["cargo:token"]
`);
  write(path.join(dir, 'Cargo.toml'), `
[package]
name = "consumer"
version = "0.1.0"
edition = "2021"
[dependencies]
cortex-e2e-sdk = { version = "${VERSION}", registry = "cortex" }
tokio = { version = "1", features = ["full"] }
`);
  write(path.join(dir, 'src/main.rs'), `
use cortex_e2e_sdk::PetstoreApi;
#[tokio::main]
async fn main() {
  let client = PetstoreApi::new("${API_URL}");
  let result = client.pets.list(&client, Some("1"), None).await.unwrap();
  println!("{:?}", result.data.len());
}
`);
  run('cargo', ['run'], { cwd: dir, env: { CARGO_REGISTRIES_CORTEX_TOKEN: process.env.CARGO_REGISTRY_TOKEN } });
}

function configureConan(dir) {
  const conanHome = path.join(dir, '.conan2');
  const env = { CONAN_HOME: conanHome };
  run('conan', ['profile', 'detect', '--force'], { cwd: dir, env });
  run('conan', ['remote', 'add', 'cortex-local', 'http://conan-registry:9300', '--force'], { cwd: dir, env });
  run('conan', ['remote', 'login', 'cortex-local', 'demo', '--password', 'demo'], { cwd: dir, env });
  return env;
}

function testCpp() {
  const dir = path.join(WORK, 'consumers/cpp');
  write(path.join(dir, 'conanfile.txt'), `[requires]\ncortex-e2e-sdk-cpp/${VERSION}\n[generators]\nCMakeDeps\nCMakeToolchain\n`);
  write(path.join(dir, 'CMakeLists.txt'), `
cmake_minimum_required(VERSION 3.20)
project(consumer LANGUAGES CXX)
find_package(cortex-e2e-sdk-cpp CONFIG REQUIRED)
add_executable(consumer main.cpp)
target_compile_features(consumer PRIVATE cxx_std_17)
target_link_libraries(consumer PRIVATE cortex-e2e-sdk-cpp::cortex-e2e-sdk-cpp)
`);
  write(path.join(dir, 'main.cpp'), `
#include <index.hpp>
int main() {
  sdk::ClientOptions options; options.base_url = "${API_URL}";
  sdk::PetstoreApi client(options);
  client.pets.list(std::optional<std::string>("1"), std::nullopt);
  return 0;
}
`);
  const env = configureConan(dir);
  run('conan', ['install', '.', '--build', 'missing', '--output-folder', 'build'], { cwd: dir, env });
  run('cmake', ['-S', '.', '-B', 'build', '-DCMAKE_TOOLCHAIN_FILE=build/conan_toolchain.cmake', '-DCMAKE_BUILD_TYPE=Release'], { cwd: dir, env });
  run('cmake', ['--build', 'build'], { cwd: dir, env });
  run(path.join(dir, 'build/consumer'), [], { cwd: dir, env });
}

function testC() {
  const dir = path.join(WORK, 'consumers/c');
  write(path.join(dir, 'conanfile.txt'), `[requires]\ncortex-e2e-sdk-c/${VERSION}\n[generators]\nCMakeDeps\nCMakeToolchain\n`);
  write(path.join(dir, 'CMakeLists.txt'), `
cmake_minimum_required(VERSION 3.20)
project(consumer LANGUAGES C)
find_package(cortex-e2e-sdk-c CONFIG REQUIRED)
add_executable(consumer main.c)
target_link_libraries(consumer PRIVATE cortex-e2e-sdk-c::cortex-e2e-sdk-c)
`);
  write(path.join(dir, 'main.c'), `
#include <index.h>
int main(void) {
  sdk_client_t client;
  sdk_client_init(&client, "${API_URL}");
  sdk_pets_list(&client, "1", NULL);
  sdk_client_free(&client);
  return 0;
}
`);
  const env = configureConan(dir);
  run('conan', ['install', '.', '--build', 'missing', '--output-folder', 'build'], { cwd: dir, env });
  run('cmake', ['-S', '.', '-B', 'build', '-DCMAKE_TOOLCHAIN_FILE=build/conan_toolchain.cmake', '-DCMAKE_BUILD_TYPE=Release'], { cwd: dir, env });
  run('cmake', ['--build', 'build'], { cwd: dir, env });
  run(path.join(dir, 'build/consumer'), [], { cwd: dir, env });
}

async function main() {
  await Promise.all([
    waitForPort('npm-registry', 4873),
    waitForPort('pypi-registry', 8080),
    waitForPort('maven-registry', 8080),
    waitForPort('gem-registry', 9292),
    waitForPort('cargo-registry', 8000),
    waitForPort('conan-registry', 9300),
  ]);

  const consumersOnly = process.env.PUBLISH_E2E_CONSUMERS_ONLY === '1';
  if (consumersOnly) {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
  } else {
    createProject();
    run('node', [CLI, 'generate', '--config', path.join(WORK, 'cortex.config.yml')]);
  }

  const mockServer = spawn('node', [path.join(ROOT, 'e2e/docker/mock-server.js')], {
    env: { ...process.env, MOCK_PORT: '4010' },
    stdio: 'inherit',
  });
  await waitForPort('localhost', 4010);

  try {
    if (!consumersOnly) {
      const publishArgs = [CLI, 'publish', '--config', path.join(WORK, 'cortex.config.yml')];
      if (process.env.PUBLISH_E2E_PUBLISH_TARGET === 'mcp') {
        publishArgs.push('--mcp');
      } else if (process.env.PUBLISH_E2E_PUBLISH_TARGET) {
        publishArgs.push('--sdk', process.env.PUBLISH_E2E_PUBLISH_TARGET);
      }
      run('node', publishArgs);

      const selectedTarget = process.env.PUBLISH_E2E_PUBLISH_TARGET;
      if (selectedTarget) assertGitHubVersion(selectedTarget, FIRST_VERSION);
      else for (const language of [...SDK_LANGUAGES, 'mcp']) assertGitHubVersion(language, FIRST_VERSION);

      if (fs.existsSync(path.join(WORK, '.cortex-versions.json'))) {
        throw new Error('Publish created a local release version state file');
      }

      if (!process.env.PUBLISH_E2E_PUBLISH_TARGET) {
        fs.rmSync(path.join(WORK, 'generated'), { recursive: true, force: true });
        run('node', [CLI, 'generate', '--config', path.join(WORK, 'cortex.config.yml')]);
        const unchangedOutput = run('node', publishArgs);
        if (!unchangedOutput.includes('All selected packages are unchanged')) {
          throw new Error('An unchanged generation was not skipped');
        }

        const changedSpec = yaml.load(fs.readFileSync(path.join(WORK, 'petstore.yaml'), 'utf8'));
        changedSpec.paths['/checksum-marker/{markerId}'] = {
          get: {
            operationId: 'getChecksumMarker',
            tags: ['metadata'],
            parameters: [
              {
                name: 'markerId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'verbose',
                in: 'query',
                required: false,
                schema: { type: 'boolean' },
              },
            ],
            responses: {
              200: {
                description: 'Checksum marker',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
              },
            },
          },
        };
        write(path.join(WORK, 'petstore.yaml'), yaml.dump(changedSpec));
        fs.rmSync(path.join(WORK, 'generated'), { recursive: true, force: true });
        run('node', [CLI, 'generate', '--config', path.join(WORK, 'cortex.config.yml')]);
        run('node', publishArgs);
        for (const language of [...SDK_LANGUAGES, 'mcp']) assertGitHubVersion(language, VERSION);

        testGithubOnlyPublishing();
      }
    }

    const consumers = [
      ['TypeScript', testTypeScript],
      ['Python', testPython],
      ['Go', testGo],
      ['Java', testJava],
      ['Kotlin', testKotlin],
      ['Ruby', testRuby],
      ['PHP', testPhp],
      ['C#', testCsharp],
      ['Rust', testRust],
      ['C++', testCpp],
      ['C', testC],
      ['MCP', testMcp],
    ];
    const startLanguage = process.env.PUBLISH_E2E_START_LANGUAGE;
    const startIndex = startLanguage
      ? consumers.findIndex(([name]) => name.toLowerCase() === startLanguage.toLowerCase())
      : 0;
    if (startIndex < 0) throw new Error(`Unknown consumer language: ${startLanguage}`);
    for (const [name, test] of consumers.slice(startIndex)) {
      console.log(`\n=== ${name} published-package consumer ===`);
      await test();
      console.log(`PASS: ${name}`);
    }
  } finally {
    mockServer.kill();
  }

  console.log('\nAll 11 SDK packages and the MCP server installed and executed in separate consumer projects.');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
