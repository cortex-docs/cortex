import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Command, CommandRunner } from 'nest-commander';
import {
  assertProjectName,
  HOSTING_API,
  parseRepository,
  readRepositorySnapshot,
  sha256,
  validateManifest,
  type UploadFile,
} from '@cortex-docs/core/hosting';
import { DocsBuildCommand } from '../docs/build.command';
import { LoggerService } from '../../services/logger.service';
import {
  materializeRepository,
  assertLocalSpecReferences,
  rewriteRepositoryMarkdown,
  mapConcurrent,
} from '../../services/repository-docs';

export function githubToken(): string | undefined {
  const fromEnvironment = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnvironment) return fromEnvironment;
  try {
    return (
      execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

export function hostingApi(): string {
  const url = new URL(process.env.CORTEX_HOSTING_API ?? HOSTING_API);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    throw new Error(
      'CORTEX_HOSTING_API must be an HTTPS origin (HTTP is allowed only on localhost).',
    );
  return url.origin;
}

export async function deploymentRequest(
  api: string,
  route: string,
  token: string,
  init: RequestInit = {},
): Promise<Record<string, any>> {
  const response = await fetch(`${api}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  let data: Record<string, any>;
  try {
    data = (await response.json()) as Record<string, any>;
  } catch {
    throw new Error(`Hosting service returned HTTP ${response.status}.`);
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string' ? data.error : `Hosting request failed (${response.status}).`,
    );
  return data;
}

export async function buildManifest(directory: string): Promise<UploadFile[]> {
  const files: UploadFile[] = [];
  async function walk(relative: string): Promise<void> {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      const filename = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Static output contains a symlink: ${filename}`);
      if (entry.isDirectory()) await walk(filename);
      else {
        const bytes = fs.readFileSync(path.join(directory, filename));
        files.push({ path: filename, size: bytes.byteLength, sha256: await sha256(bytes) });
      }
    }
  }
  await walk('');
  return validateManifest(files.sort((a, b) => a.path.localeCompare(b.path)));
}

@Command({
  name: 'deploy',
  arguments: '[repository]',
  description:
    'Deploy default-branch documentation from a public GitHub repository to cortexdocs.dev',
})
export class DeployCommand extends CommandRunner {
  constructor(
    private readonly logger: LoggerService,
    private readonly build: DocsBuildCommand,
  ) {
    super();
  }

  async run(params: string[]): Promise<void> {
    this.logger.header('Cortex Open Source Hosting');
    const input =
      params[0] ??
      execFileSync('git', ['remote', 'get-url', 'origin'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    const repository = parseRepository(input).url;
    const token = githubToken();
    if (!token)
      throw new Error(
        'Sign in with gh auth login, or set GITHUB_TOKEN with write access to this public repository.',
      );
    const api = hostingApi();
    const snapshot = await readRepositorySnapshot(repository, { token, requirePush: true });
    assertProjectName(snapshot.config.project);
    this.logger.info(
      `Repository: ${repository} (${snapshot.branch} @ ${snapshot.commit.slice(0, 8)})`,
    );
    const request = { repository, fingerprint: snapshot.fingerprint };
    let result = await deploymentRequest(api, '/v1/deployments', token, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (result.status !== 'unchanged') {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-deploy-'));
      let pending: { id: string; token: string } | undefined;
      try {
        await materializeRepository(snapshot, directory);
        assertLocalSpecReferences(snapshot, directory);
        rewriteRepositoryMarkdown(snapshot, directory);
        const output = path.join(directory, '.site');
        await this.build.run([], {
          output,
          config: path.join(directory, 'cortex.config.yml'),
          repository,
        });
        const files = await buildManifest(output);
        result = await deploymentRequest(api, '/v1/deployments', token, {
          method: 'POST',
          body: JSON.stringify({ ...request, files }),
        });
        if (result.status !== 'unchanged') {
          if (typeof result.deploymentId !== 'string' || typeof result.uploadToken !== 'string')
            throw new Error('Hosting service returned an invalid upload session.');
          pending = { id: result.deploymentId, token: result.uploadToken };
          const session = pending;
          this.logger.info(`Uploading ${files.length} files...`);
          await mapConcurrent(files, 4, async (file) => {
            await deploymentRequest(
              api,
              `/v1/deployments/${session.id}/files/${encodeURIComponent(file.path)}`,
              session.token,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: fs.readFileSync(path.join(output, file.path)),
              },
            );
          });
          result = await deploymentRequest(api, `/v1/deployments/${session.id}/finalize`, token, {
            method: 'POST',
          });
          pending = undefined;
        }
      } finally {
        if (pending)
          await deploymentRequest(api, `/v1/deployments/${pending.id}`, pending.token, {
            method: 'DELETE',
          }).catch(() => {});
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    this.logger.success(
      `${result.status === 'unchanged' ? 'Unchanged — skipped build and upload' : 'Deployed'}: ${result.url}`,
    );
    this.logger.info('Updates become visible across the edge within 30 seconds.');
    const domain = await deploymentRequest(
      api,
      `/v1/projects/${snapshot.config.project}/domain`,
      token,
      { method: 'POST' },
    );
    if (domain.status !== 'not_configured') {
      this.logger.info(`Custom domain: ${domain.hostname} (${domain.status})`);
      if (domain.status !== 'active') {
        for (const record of domain.records ?? [])
          this.logger.info(`${record.type} ${record.name} → ${record.value}`);
        if (domain.validationRecords)
          this.logger.info(`Certificate validation: ${JSON.stringify(domain.validationRecords)}`);
        if (domain.ownershipVerification)
          this.logger.info(`Hostname validation: ${JSON.stringify(domain.ownershipVerification)}`);
        this.logger.info('Add the DNS records, then rerun cortex deploy to check activation.');
      }
    }
    this.logger.info(`Local MCP: npx -y @cortex-docs/cli mcp-serve ${repository}`);
  }
}
