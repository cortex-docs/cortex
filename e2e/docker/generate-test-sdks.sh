#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/packages/cli/dist/main.js"
SPECS="$ROOT/packages/core/__fixtures__"
TESTS="$ROOT/e2e/docker/tests"

if [ ! -f "$CLI" ]; then
  echo "CLI not built. Running npm run build..."
  (cd "$ROOT" && npm run build)
fi

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "Generating SDKs..."
cd "$TMP"
node "$CLI" init test-project \
  --open-api "$SPECS/petstore.yaml" \
  --async-api "$SPECS/chat-asyncapi.yaml" \
  --graphql "$SPECS/petstore.graphql" \
  --grpc "$SPECS/petstore.proto" \
  --no-mcp \
  2>&1 | head -20

LANGUAGES=(typescript python go java kotlin ruby php csharp rust cpp c)

for lang in "${LANGUAGES[@]}"; do
  src="$TMP/generated/$lang"
  dest="$TESTS/test-$lang/generated/$lang"
  if [ -d "$src" ]; then
    rm -rf "$TESTS/test-$lang/generated"
    mkdir -p "$dest"
    cp -r "$src/." "$dest/"
    echo "  ✓ $lang → test-$lang/generated/$lang/"
  fi
done

# Install TypeScript deps
if [ -d "$TESTS/test-typescript/generated/typescript" ]; then
  (cd "$TESTS/test-typescript/generated/typescript" && npm install --ignore-scripts 2>/dev/null)
fi

echo "Done."
