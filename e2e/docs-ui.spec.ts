import { test, expect } from '@playwright/test';

test.describe('Docs UI', () => {
  test('renders the header with API Reference nav', async ({ page }) => {
    await page.goto('/api-reference');
    await expect(page.locator('header')).toContainText('API Reference');
  });

  test('renders the Petstore API title', async ({ page }) => {
    await page.goto('/api-reference');
    await expect(page.locator('text=Petstore API')).toBeVisible({ timeout: 15000 });
  });

  test('shows API operations in sidebar', async ({ page }) => {
    await page.goto('/api-reference');
    await expect(page.locator('text=List all pets').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Create a pet').first()).toBeVisible();
  });

  test('moves only the right sidebar below when the projected center reaches 280px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 932, height: 900 });
    await page.goto('/api-reference');
    await expect(page.locator('text=List all pets').first()).toBeVisible({ timeout: 15000 });

    const leftSidebar = page.locator('[data-api-reference-left-sidebar]');
    const rightSidebar = page.locator('[data-api-reference-right-sidebar]');
    const bottomCodePanel = page.locator('[data-api-reference-bottom-code-panel]');

    await expect(leftSidebar).toHaveAttribute('data-layout-mode', 'inline');
    await expect(rightSidebar).toHaveCount(0);
    await expect(bottomCodePanel).toBeVisible();

    await page.setViewportSize({ width: 933, height: 900 });
    await expect(leftSidebar).toHaveAttribute('data-layout-mode', 'inline');
    await expect(rightSidebar).toBeVisible();
    await expect(bottomCodePanel).toHaveCount(0);
  });

  test('displays server URL', async ({ page }) => {
    await page.goto('/api-reference');
    await expect(page.locator('text=http://localhost:4010').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('uses the Worker-native demo API', async ({ request }) => {
    const response = await request.get('http://localhost:4010/health');
    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      runtime: 'cloudflare-worker',
    });
  });

  test('renders custom head HTML and serves project assets', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('head meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#ffffff',
    );
    await expect(page.locator('head link[href="/assets/custom.css"]')).toHaveAttribute(
      'rel',
      'stylesheet',
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--cortex-custom-head-loaded')
            .trim(),
        ),
      )
      .toBe('yes');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.cortexCustomHead))
      .toBe('loaded');
  });

  test('loads the transparent Built with Cortex logo inside a theme-aware card', async ({
    page,
  }) => {
    await page.goto('/docs/quickstart');
    const logoCard = page.getByRole('link', { name: 'Built with Cortex' });
    const logoImage = logoCard.getByRole('img', { name: 'Built with Cortex' });

    await expect(logoCard).toHaveAttribute('href', 'https://cortexdocs.dev');
    await logoCard.scrollIntoViewIfNeeded();
    await expect(logoCard).toHaveClass(/dark:bg-zinc-950/);
    await expect(logoImage).toHaveAttribute(
      'src',
      'http://localhost:4010/images/built-with-cortex.svg',
    );
    await expect(logoImage).toHaveClass(/dark:invert/);
    await expect
      .poll(() => logoImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(128);

    await expect(logoCard.locator('xpath=ancestor::footer')).toHaveClass(/mt-\[160px\]/);
  });

  test('shows authentication info', async ({ page }) => {
    await page.goto('/api-reference');
    await expect(page.locator('text=bearerAuth').first()).toBeVisible({ timeout: 15000 });
  });

  test('theme toggle button exists', async ({ page }) => {
    await page.goto('/api-reference');
    const toggleButton = page.locator('button[aria-label="Toggle theme"]');
    await expect(toggleButton).toBeVisible();
  });

  test('dark mode toggles correctly', async ({ page }) => {
    await page.goto('/api-reference');
    const html = page.locator('html');
    await page.locator('button[aria-label="Toggle theme"]').click();
    await expect(html).toHaveClass(/dark/);
    await page.locator('button[aria-label="Toggle theme"]').click();
    await expect(html).toHaveClass(/light|^(?!.*dark)/);
  });

  test('appearance query selects dark mode on a nested docs route', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme', 'light'));

    await page.goto('/docs/quickstart?appearance=dark');

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.colorScheme))
      .toBe('dark');
  });

  test('appearance query selects light mode on an API route', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    await page.goto('/api-reference?source=embed&appearance=light');

    await expect(page.locator('html')).toHaveClass(/light/);
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.colorScheme))
      .toBe('light');
  });

  test('API spec endpoint returns valid content', async ({ request }) => {
    const response = await request.get('/api/spec');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('Petstore API');
    expect(body).toContain('openapi');
  });

  test('HTTP method badges are color-coded', async ({ page }) => {
    await page.goto('/api-reference');
    await expect(page.locator('text=GET').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=POST').first()).toBeVisible();
  });

  test('old /reference redirects to /api-reference', async ({ page }) => {
    await page.goto('/reference');
    await expect(page).toHaveURL(/\/api-reference/, { timeout: 15000 });
  });

  test.describe('Search', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/api-reference');
      await page.waitForFunction(() => (window as any).__searchIndexReady === true, null, {
        timeout: 20000,
      });
    });

    test('search index builds on page load', async ({ page }) => {
      const docCount = await page.evaluate(() => (window as any).__searchDocCount);
      expect(docCount).toBeGreaterThan(0);
    });

    test('opens search dialog with Cmd+K', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      await expect(page.locator('[cmdk-input]')).toBeVisible();
    });

    test('shows placeholder when search is empty and no recent', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      await expect(page.locator('[cmdk-input]')).toBeVisible();
      await expect(page.locator('[cmdk-empty]')).toContainText('Start typing to search');
    });

    test('returns relevant results for REST endpoint search', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      const input = page.locator('[cmdk-input]');
      await input.fill('pets');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 500 });
      const firstResult = await page.locator('[cmdk-item]').first().textContent();
      expect(firstResult?.toLowerCase()).toContain('pet');
    });

    test('returns relevant results for fuzzy search', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      const input = page.locator('[cmdk-input]');
      await input.fill('creat');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 500 });
      const texts = await page.locator('[cmdk-item]').allTextContents();
      const hasCreate = texts.some((t) => t.toLowerCase().includes('create'));
      expect(hasCreate).toBe(true);
    });

    test('shows empty state for nonsense query', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      const input = page.locator('[cmdk-input]');
      await input.fill('zzzzxxxxxnonexistent');
      await expect(page.locator('[cmdk-empty]')).toBeVisible({ timeout: 500 });
      await expect(page.locator('[cmdk-empty]')).toContainText('No results found');
    });

    test('search query executes under 5ms', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      const input = page.locator('[cmdk-input]');
      await input.fill('pets');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 500 });
      const duration = await page.evaluate(() => (window as any).__lastSearchDuration);
      expect(duration).toBeLessThan(5);
    });

    test('search result selection saves to recent', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      const input = page.locator('[cmdk-input]');
      await input.fill('list');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 500 });
      await page.locator('[cmdk-item]').first().click();
      await expect(page.locator('[cmdk-input]')).not.toBeVisible();

      await page.keyboard.press('Meta+k');
      await expect(page.locator('text=Recent')).toBeVisible();
      await expect(page.locator('[cmdk-item]').first()).toBeVisible();
    });

    test('search indexes descriptions and keywords', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      const input = page.locator('[cmdk-input]');
      await input.fill('petId');
      await expect(page.locator('[cmdk-item]').first()).toBeVisible({ timeout: 500 });
    });
  });
});
