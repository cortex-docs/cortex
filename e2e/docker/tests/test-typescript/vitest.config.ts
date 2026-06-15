import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    fs: { allow: ['/', '/tmp'] },
  },
  test: {
    include: ['**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: './globalSetup.ts',
    server: {
      deps: {
        external: ['ws'],
      },
    },
  },
});
