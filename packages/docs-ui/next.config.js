const path = require('node:path');
const docsUiRoot = process.env.CORTEX_DOCS_UI_ROOT || __dirname;

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  serverExternalPackages: ['@cortex/core', '@cortex/codegen', '@apidevtools/swagger-parser'],
  output: process.env.CORTEX_STANDALONE_BUILD === '1' ? 'standalone' : undefined,
  distDir: process.env.CORTEX_DIST_DIR || '.next',
  outputFileTracingRoot: path.resolve(docsUiRoot, '../..'),
};
