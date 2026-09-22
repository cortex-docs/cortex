// Pass this file's contents, with the `export` keyword removed, as the code
// argument to mcp__playwright__browser_run_code_unsafe. Create outputDir first,
// then save the returned scenes array there as scenes.json for render.py.
// No browser is launched outside the Playwright MCP session.

export async function captureOverview(
  page,
  { outputDir = '.playwright-mcp/overview', baseUrl = 'https://demo.cortexdocs.dev' } = {},
) {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto(`${baseUrl}/?appearance=dark`);
  await page.evaluate(() => {
    localStorage.setItem('cortex.cookie-consent.v1', 'denied');
    window.dispatchEvent(new CustomEvent('cortex:consent-changed', { detail: 'denied' }));
  });
  const scenes = [];
  const nav = (name) => page.locator('header').getByRole('link', { name, exact: true });

  async function capture(name, label, step, duration, next) {
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
      scale: 'css',
      animations: 'disabled',
    });
    scenes.push({
      name,
      label,
      step,
      duration,
      url: page.url(),
      target: box ? [box.x + box.width / 2, box.y + box.height / 2] : null,
    });
    if (next) await next.click();
  }

  await page.getByRole('heading', { name: 'Petstore Docs', exact: true }).waitFor();
  await capture(
    'home',
    'Explore the live demo',
    1,
    1500,
    page.getByRole('link', { name: 'Getting Started', exact: true }),
  );
  await page.getByRole('heading', { name: 'Quickstart', exact: true }).waitFor();
  await capture('quickstart', 'Help developers get started', 1, 2400, nav('API Reference'));

  await page.getByRole('heading', { name: 'REST API V1', exact: true }).waitFor();
  await capture(
    'reference',
    'Browse your API reference',
    2,
    1200,
    page.getByRole('button', { name: 'GET List all pets', exact: true }),
  );
  await page.waitForURL('**/api-reference/rest-api-v1/listPets');
  await page.getByRole('button', { name: 'Try now', exact: true }).waitFor();
  await capture('endpoint', 'Inspect schemas and typed code samples', 2, 2800, nav('SDKs'));

  await page.getByRole('heading', { name: 'TypeScript SDKs', exact: true }).waitFor();
  await capture(
    'sdks',
    'Choose from 11 SDK languages',
    3,
    1700,
    page.getByText('@petstore/typescript-client-sdk', { exact: true }),
  );
  await page.getByRole('heading', { name: 'Installation', exact: true }).waitFor();
  await capture('sdk-guide', 'Install a typed SDK and start building', 3, 2600, nav('MCP'));

  await page.getByRole('heading', { name: 'Client Setup Guide', exact: true }).waitFor();
  await capture(
    'mcp',
    'Connect your AI coding tools',
    4,
    2400,
    page.getByRole('button', { name: 'Tools', exact: true }),
  );
  await page.waitForURL('**/mcp/docs_quickstart');
  await capture('mcp-tools', 'Give agents API tools, SDK guides, and docs', 4, 2800, nav('Home'));
  await page.getByRole('heading', { name: 'Petstore Docs', exact: true }).waitFor();
  await capture('end', 'Try it yourself at demo.cortexdocs.dev', 4, 2000);

  return { outputDir, scenes };
}
