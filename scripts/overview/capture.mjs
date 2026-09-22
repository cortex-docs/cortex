// Pass this file's contents, with the `export` keyword removed, as the code
// argument to mcp__playwright__browser_run_code_unsafe. Create outputDir first,
// then save the returned scenes array there as scenes.json for render.py.
// No browser is launched outside the Playwright MCP session.

export async function captureOverview(
  page,
  { outputDir = '.playwright-mcp/overview', baseUrl = 'https://demo.cortexdocs.dev' } = {},
) {
  const context = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: 1200, height: 700 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
  try {
    return await capturePages(await context.newPage(), outputDir, baseUrl);
  } finally {
    await context.close();
  }

  async function capturePages(page, outputDir, baseUrl) {
    await page.goto(`${baseUrl}/?appearance=dark`);
    await page.evaluate(() => {
      localStorage.setItem('cortex.cookie-consent.v1', 'denied');
      window.dispatchEvent(new CustomEvent('cortex:consent-changed', { detail: 'denied' }));
    });
    const scenes = [];
    const nav = (name) => page.locator('header').getByRole('link', { name, exact: true });

    async function capture(name, duration, next) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      });
      // Let navigation, syntax highlighting, and scroll positioning finish.
      await page.waitForTimeout(1400);
      if (name === 'endpoint') {
        // Keep the endpoint method visible below the sticky breadcrumb.
        await page.locator('main main').evaluate((element) => {
          element.scrollBy({ top: -48, behavior: 'instant' });
        });
      }
      await page.mouse.move(1190, 690);
      const box = next ? await next.boundingBox() : null;
      if (next && !box) throw new Error(`Missing navigation target for ${name}`);
      await page.screenshot({
        path: `${outputDir}/${name}.png`,
        scale: 'device',
        animations: 'disabled',
      });
      scenes.push({
        name,
        duration,
        url: page.url(),
        target: box ? [box.x + box.width / 2, box.y + box.height / 2] : null,
      });
      if (next) await next.click();
    }

    await page.getByRole('heading', { name: 'Petstore Docs', exact: true }).waitFor();
    await capture('home', 1500, page.getByRole('link', { name: 'Getting Started', exact: true }));
    await page.getByRole('heading', { name: 'Quickstart', exact: true }).waitFor();
    await capture('quickstart', 2400, nav('API Reference'));

    await page.getByRole('heading', { name: 'REST API V1', exact: true }).waitFor();
    await capture(
      'reference',
      1200,
      page.getByRole('button', { name: 'GET List all pets', exact: true }),
    );
    await page.waitForURL('**/api-reference/rest-api-v1/listPets');
    await page.getByRole('button', { name: 'Try now', exact: true }).waitFor();
    await capture('endpoint', 2800, nav('SDKs'));

    await page.getByRole('heading', { name: 'TypeScript SDKs', exact: true }).waitFor();
    await capture('sdks', 1700, page.getByText('@petstore/typescript-client-sdk', { exact: true }));
    await page.getByRole('heading', { name: 'Installation', exact: true }).waitFor();
    await capture('sdk-guide', 2600, nav('MCP'));

    await page.getByRole('heading', { name: 'Client Setup Guide', exact: true }).waitFor();
    await capture('mcp', 2400, page.getByRole('button', { name: 'Tools', exact: true }));
    await page.waitForURL('**/mcp/docs_quickstart');
    await capture('mcp-tools', 2800, nav('Home'));
    await page.getByRole('heading', { name: 'Petstore Docs', exact: true }).waitFor();
    await capture('end', 2000);

    return { outputDir, scenes };
  }
}
