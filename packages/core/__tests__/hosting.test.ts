import { describe, expect, it } from 'vitest';
import {
  assertProjectName,
  parseRepository,
  repositoryPath,
  readRepositorySnapshot,
  sha256,
  validateManifest,
  specificationReferences,
} from '../src/hosting';

function githubFixture(
  options: {
    code?: string;
    doc?: string;
    config?: string;
    private?: boolean;
    push?: boolean;
    symlink?: boolean;
    missing?: boolean;
  } = {},
) {
  const config =
    options.config ??
    'project: example\ndocs:\n  - section: Guides\n    sources:\n      - title: Start\n        document: README.md\n';
  const files = [
    ...(!options.missing
      ? [
          {
            path: 'cortex.config.yml',
            type: 'blob',
            mode: options.symlink ? '120000' : '100644',
            sha: config,
            size: Buffer.byteLength(config),
          },
        ]
      : []),
    { path: 'README.md', type: 'blob', mode: '100644', sha: options.doc ?? 'markdown-v1', size: 7 },
    { path: 'src/main.ts', type: 'blob', mode: '100644', sha: options.code ?? 'code-v1', size: 12 },
  ];
  return async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('raw.githubusercontent.com')) return new Response(config);
    if (url.includes('/commits/'))
      return Response.json({
        sha: `commit-${options.code ?? 'one'}`,
        commit: { tree: { sha: 'tree' } },
      });
    if (url.includes('/git/trees/')) return Response.json({ truncated: false, tree: files });
    return Response.json({
      id: 42,
      private: options.private ?? false,
      default_branch: 'main',
      full_name: 'owner/repo',
      permissions: { push: options.push ?? true },
    });
  };
}

describe('public repository hosting inputs', () => {
  it('decodes specification references before validating local files', () => {
    expect(
      specificationReferences(
        'api.json',
        String.raw`{"components":{"schemas":{"Ref":{"$ref":"h\u0074tps://example.com/spec"}}}}`,
      ),
    ).toEqual(['https://example.com/spec']);
    expect(specificationReferences('api.yaml', 'schema:\n  $ref: "./types.yaml#/Item"\n')).toEqual([
      './types.yaml#/Item',
    ]);
  });
  it.each([
    'api',
    'UPPER',
    '-name',
    'name-',
    'with.dot',
    'with_space',
    'two words',
    'xn--example',
    'a'.repeat(64),
  ])('rejects invalid or reserved project %s', (name) =>
    expect(() => assertProjectName(name)).toThrow('project'),
  );
  it.each(['a', 'my-project', 'project42', 'a'.repeat(63)])('accepts project %s', (name) =>
    expect(() => assertProjectName(name)).not.toThrow(),
  );
  it('normalizes only public GitHub repository identifiers', () => {
    expect(parseRepository('git@github.com:owner/repo.git').url).toBe(
      'https://github.com/owner/repo',
    );
    expect(() => parseRepository('https://github.com/owner/repo/tree/main')).toThrow();
    expect(() => parseRepository('https://github.com.evil.test/owner/repo')).toThrow();
    for (const value of ['../secret', '/etc/passwd', 'a/../../b', 'https://example.com/a', 'a\\b'])
      expect(() => repositoryPath(value)).toThrow();
  });
  it('skips code-only changes but detects Markdown and configuration changes', async () => {
    const first = await readRepositorySnapshot('owner/repo', { fetcher: githubFixture() });
    const code = await readRepositorySnapshot('owner/repo', {
      fetcher: githubFixture({ code: 'different' }),
    });
    const docs = await readRepositorySnapshot('owner/repo', {
      fetcher: githubFixture({ doc: 'markdown-v2' }),
    });
    const config = await readRepositorySnapshot('owner/repo', {
      fetcher: githubFixture({ config: 'project: example\ntitle: Changed\n' }),
    });
    expect(code.commit).not.toBe(first.commit);
    expect(code.fingerprint).toBe(first.fingerprint);
    expect(docs.fingerprint).not.toBe(first.fingerprint);
    expect(config.fingerprint).not.toBe(first.fingerprint);
  });
  it('rejects private repositories, unauthorized maintainers, missing files and symlinks', async () => {
    await expect(
      readRepositorySnapshot('owner/repo', { fetcher: githubFixture({ private: true }) }),
    ).rejects.toThrow('public');
    await expect(
      readRepositorySnapshot('owner/repo', {
        fetcher: githubFixture({ push: false }),
        requirePush: true,
      }),
    ).rejects.toThrow('write access');
    await expect(
      readRepositorySnapshot('owner/repo', { fetcher: githubFixture({ missing: true }) }),
    ).rejects.toThrow('default branch');
    await expect(
      readRepositorySnapshot('owner/repo', { fetcher: githubFixture({ symlink: true }) }),
    ).rejects.toThrow('regular file');
  });
  it('rejects unsafe, duplicate or incomplete upload manifests', async () => {
    const file = { path: 'index.html', size: 1, sha256: await sha256('x') };
    expect(validateManifest([file])).toEqual([file]);
    expect(() => validateManifest([file, file])).toThrow();
    expect(() => validateManifest([{ ...file, path: '../index.html' }])).toThrow();
    expect(() => validateManifest([{ ...file, path: 'page.html' }])).toThrow('index.html');
  });
});
