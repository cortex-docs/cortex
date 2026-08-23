FROM cortex-base

WORKDIR /cortex
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/codegen/package.json packages/codegen/package.json
COPY packages/mcp-gen/package.json packages/mcp-gen/package.json
COPY packages/cli/package.json packages/cli/package.json

RUN npm install

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/codegen packages/codegen
COPY packages/mcp-gen packages/mcp-gen
COPY packages/cli packages/cli
COPY e2e/docker/mock-server.js e2e/docker/mock-server.js
COPY e2e/publish e2e/publish

RUN npx tsc -p packages/core/tsconfig.json && \
    npx tsc -p packages/codegen/tsconfig.json && \
    for dir in packages/codegen/src/languages/*/templates; do \
      lang=$(basename $(dirname $dir)); \
      mkdir -p packages/codegen/dist/languages/$lang; \
      cp -r $dir packages/codegen/dist/languages/$lang/; \
    done && \
    npx tsc -p packages/mcp-gen/tsconfig.json && \
    cp -r packages/mcp-gen/templates packages/mcp-gen/dist/templates && \
    npx tsc -p packages/cli/tsconfig.json

ENTRYPOINT ["node", "e2e/publish/run-publish-tests.js"]
