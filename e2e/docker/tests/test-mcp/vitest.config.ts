import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    fs: { allow: ['/', '/tmp'] },
  },
  test: {
    include: ['**/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    server: {
      deps: {
        external: ['@grpc/grpc-js', '@grpc/proto-loader', 'ws'],
      },
    },
  },
});
