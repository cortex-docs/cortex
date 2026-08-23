const path = require('node:path');

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  serverExternalPackages: ['@cortex/core', '@cortex/codegen', '@apidevtools/swagger-parser'],
  output: process.env.CORTEX_STANDALONE_BUILD === '1' ? 'standalone' : undefined,
  distDir: process.env.CORTEX_DIST_DIR || '.next',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
};
