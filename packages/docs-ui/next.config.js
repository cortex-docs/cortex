const path = require('node:path');

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  serverExternalPackages: ['@cortex/core', '@cortex/codegen', '@apidevtools/swagger-parser'],
  output: process.env.CORTEX_OUTPUT_DIR ? 'export' : undefined,
  distDir: process.env.CORTEX_OUTPUT_DIR || '.next',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
};
