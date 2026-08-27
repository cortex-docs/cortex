import { test, expect } from '@playwright/test';

test.describe('Cloudflare Static Assets export', () => {
  test('serves the homepage and data without a Worker script', async ({ request }) => {
    for (const path of [
      '/',
      '/api/config',
      '/api/docs',
      '/api/docs-watch',
      '/api/mcp',
      '/api/sdk-snippets',
    ]) {
      const response = await request.get(path);
      expect(response.ok(), `${path} should be available`).toBeTruthy();
      expect(response.headers()['x-cortex-hosting']).toBe('cloudflare-static-assets');
    }
  });

  test('supports direct navigation to a generated API operation', async ({ page }) => {
    const response = await page.goto('/api-reference/rest-api-v1/listPets');
    expect(response?.headers()['x-cortex-hosting']).toBe('cloudflare-static-assets');
    await expect(page.getByText('List all pets').first()).toBeVisible();
  });

  test('supports client navigation between generated documentation pages', async ({ page }) => {
    await page.goto('/docs/quickstart');
    await expect(page).toHaveTitle('Petstore Docs');
    await expect(page.getByRole('heading', { name: 'Quickstart' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Configuration' })).toHaveCount(0);
  });

  test('serves generated MCP and SDK deep links', async ({ page }) => {
    await page.goto('/mcp/docs_quickstart');
    await expect(page.getByText('docs_quickstart').first()).toBeVisible();

    await page.goto('/mcp/sdk_typescript_petstore_typescript_client_sdk');
    await expect(
      page.getByText('sdk_typescript_petstore_typescript_client_sdk').first(),
    ).toBeVisible();

    await page.goto('/sdks/typescript');
    await expect(page.getByText('TypeScript').first()).toBeVisible();
  });

  test('matches the local demo documentation and MCP SDK tools', async ({ request }) => {
    const docsResponse = await request.get('/api/docs');
    const docs = await docsResponse.json();
    expect(docs.sections).toEqual([
      expect.objectContaining({
        section: 'Get started',
        documents: [expect.objectContaining({ title: 'Quickstart', slug: 'quickstart' })],
      }),
    ]);

    const mcpResponse = await request.get('/api/mcp');
    const mcp = await mcpResponse.json();
    const toolNames = mcp.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames.filter((name: string) => name.startsWith('docs_'))).toEqual([
      'docs_quickstart',
    ]);
    expect(toolNames.filter((name: string) => name.startsWith('sdk_'))).toHaveLength(11);
    expect(toolNames).toContain('sdk_typescript_petstore_typescript_client_sdk');
  });
});
