const path = require('node:path');
const docsUiRoot = process.env.CORTEX_DOCS_UI_ROOT || __dirname;
const staticExport = process.env.CORTEX_STATIC_EXPORT === '1';
const cloudflareBuild = process.env.CORTEX_CLOUDFLARE === '1';
const productionBuild = process.env.CORTEX_DIST_DIR === '.next-build';

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  typescript:
    staticExport && cloudflareBuild
      ? { tsconfigPath: 'tsconfig.cloudflare.json' }
      : productionBuild
        ? { tsconfigPath: 'tsconfig.build.json' }
        : undefined,
  transpilePackages: ['@cortex-docs/docs-ui'],
  webpack(config) {
    config.resolve.alias['@'] = __dirname;
    return config;
  },
  images: {
    unoptimized: staticExport,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static.cortexdocs.dev',
        port: '',
        pathname: '/images/built-with-cortex.svg',
        search: '',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        pathname: '/images/built-with-cortex.svg',
        search: '',
      },
    ],
  },
  serverExternalPackages: [
    '@cortex-docs/core',
    '@cortex-docs/codegen',
    '@apidevtools/swagger-parser',
  ],
  output: staticExport ? 'export' : undefined,
  distDir: process.env.CORTEX_DIST_DIR || '.next',
  outputFileTracingRoot: path.resolve(docsUiRoot, '../..'),
  outputFileTracingIncludes: {
    '/*': ['./.cortex-demo/**/*', './.cortex-docs-site/**/*'],
  },
};
