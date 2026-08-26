import { afterEach, describe, expect, it } from 'vitest';
import { dynamic, GET } from '@/app/api/docs-watch/route';

describe('docs watch route', () => {
  const originalStaticExport = process.env.CORTEX_STATIC_EXPORT;

  afterEach(() => {
    if (originalStaticExport === undefined) delete process.env.CORTEX_STATIC_EXPORT;
    else process.env.CORTEX_STATIC_EXPORT = originalStaticExport;
  });

  it('can be included in a static export without starting a file watcher', async () => {
    process.env.CORTEX_STATIC_EXPORT = '1';

    expect(dynamic).toBe('force-static');
    await expect(GET()).resolves.toMatchObject({ status: 204 });
  });
});
