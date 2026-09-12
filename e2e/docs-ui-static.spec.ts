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

  test('embeds analytics settings without tracking the local preview', async ({ page }) => {
    await page.goto('/');

    expect(await page.content()).toContain('G-KQW4ERPLHB');
    await expect(page.locator('#cortex-google-analytics')).toHaveCount(0);
    await expect(page.locator('.cortex-cookie-settings-button')).toHaveCount(0);
  });

  test('supports client navigation between generated documentation pages', async ({ page }) => {
    await page.goto('/docs/quickstart');
    await expect(page).toHaveTitle('Petstore Docs');
    await expect(page.getByRole('heading', { name: 'Quickstart' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Configuration' })).toHaveCount(0);
  });

  test('serves generated MCP and SDK deep links', async ({ page }) => {
    const mcp = await (await page.request.get('/api/mcp')).json();
    for (const tool of [
      'docs_quickstart',
      'sdk_typescript_petstore_typescript_client_sdk',
      mcp.tools.at(-1).name,
    ]) {
      await page.goto(`/mcp/${tool}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator(`[id="mcp-${tool}"]`)).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toContainText(tool);
      await expect(page).toHaveURL(new RegExp(`/mcp/${tool}$`));
    }

    await page.goto('/sdks/typescript');
    await expect(page.getByText('TypeScript').first()).toBeVisible();
  });

  for (const width of [320, 390]) {
    test(`keeps documentation readable and navigation usable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/docs/quickstart');
      await expect(page.getByRole('heading', { name: 'Quickstart', exact: true })).toBeVisible();
      const article = await page.locator('article').boundingBox();
      expect(article?.width).toBeGreaterThanOrEqual(width - 40);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('button', { name: 'Search documentation' })).toBeInViewport({
        ratio: 1,
      });

      await page.getByRole('button', { name: 'Open documentation navigation' }).click();
      const navigation = page.getByRole('dialog', { name: 'Documentation', exact: true });
      await expect(navigation).toBeVisible();
      await navigation.getByRole('link', { name: 'Quickstart', exact: true }).click();
      await expect(navigation).not.toBeVisible();

      await page.getByRole('button', { name: 'Search documentation' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  }

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
