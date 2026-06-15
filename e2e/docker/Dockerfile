FROM cortex-base

WORKDIR /cortex
COPY . .

# Pre-build Rust test deps (slow, cache it)
RUN cd e2e/docker/tests/test-rust && cargo build --release 2>/dev/null; exit 0

# Pre-restore C# deps
RUN cd e2e/docker/tests/test-csharp && dotnet restore TestCsharp.csproj 2>/dev/null; exit 0

RUN npm install
RUN npx tsc -p packages/core/tsconfig.json && \
    npx tsc -p packages/codegen/tsconfig.json && \
    for dir in packages/codegen/src/languages/*/templates; do \
      lang=$(basename $(dirname $dir)); \
      mkdir -p packages/codegen/dist/languages/$lang && \
      cp -r $dir packages/codegen/dist/languages/$lang/; \
    done && \
    npx tsc -p packages/mcp-gen/tsconfig.json && \
    cp -r packages/mcp-gen/templates packages/mcp-gen/dist/templates && \
    npx tsc -p packages/cli/tsconfig.json

ENTRYPOINT ["node", "e2e/docker/run-sdk-tests.js"]
