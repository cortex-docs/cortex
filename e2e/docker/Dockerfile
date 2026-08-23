FROM cortex-base

WORKDIR /cortex

COPY package.json package-lock.json ./
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/codegen/package.json ./packages/codegen/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/docs-site/package.json ./packages/docs-site/package.json
COPY packages/docs-ui/package.json ./packages/docs-ui/package.json
COPY packages/mcp-gen/package.json ./packages/mcp-gen/package.json
RUN npm install

# Pre-build Rust test deps (slow, cache it)
COPY e2e/docker/tests/test-rust/Cargo.toml e2e/docker/tests/test-rust/Cargo.lock ./e2e/docker/tests/test-rust/
COPY e2e/docker/tests/test-rust/src/main.rs ./e2e/docker/tests/test-rust/src/main.rs
RUN cd e2e/docker/tests/test-rust && cargo build --release 2>/dev/null; exit 0

# Pre-restore C# deps
COPY e2e/docker/tests/test-csharp/TestCsharp.csproj ./e2e/docker/tests/test-csharp/TestCsharp.csproj
RUN cd e2e/docker/tests/test-csharp && dotnet restore TestCsharp.csproj 2>/dev/null; exit 0

COPY . .

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
