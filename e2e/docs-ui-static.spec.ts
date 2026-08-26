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
    await expect(page.getByText('Getting Started').first()).toBeVisible();
    await page
      .getByRole('link', { name: /Configuration/ })
      .last()
      .click();
    await expect(page).toHaveURL(/\/docs\/configuration/);
    await expect(page.getByRole('heading', { name: 'Configuration' }).first()).toBeVisible();
  });

  test('serves generated MCP and SDK deep links', async ({ page }) => {
    await page.goto('/mcp/docs_quickstart');
    await expect(page.getByText('docs_quickstart').first()).toBeVisible();

    await page.goto('/sdks/typescript');
    await expect(page.getByText('TypeScript').first()).toBeVisible();
  });
});
