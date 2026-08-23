#!/bin/bash
set -e

BASE="${MOCK_URL:-http://localhost:4010}"
GQL_URL="${MOCK_GQL_URL:-${BASE}/graphql}"
GQL_WS_URL=$(echo "$GQL_URL" | sed 's|^http|ws|')
WS_URL="${MOCK_WS_URL:-ws://localhost:4010/ws}"
GRPC_ADDR="${MOCK_URL:-http://localhost:4010}"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_GEN="$TEST_DIR/generated"
GEN="${GEN_DIR:-/tmp/cortex-e2e-sdks/generated}"
if [ -d "$LOCAL_GEN/c/src" ]; then GEN="$LOCAL_GEN"; fi
C_SRC="$GEN/c/src"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo ""
echo "C -- compile REAL generated SDK + run all protocol tests"
echo ""

if [ ! -d "$C_SRC" ]; then echo "  FAIL: SDK source not found at $C_SRC"; exit 1; fi
echo "  OK: SDK source found at $C_SRC"
echo "  Files in $C_SRC:"
ls -1 "$C_SRC" 2>/dev/null
if [ -d "$C_SRC/resources" ]; then
  echo "  Files in $C_SRC/resources:"
  ls -1 "$C_SRC/resources" 2>/dev/null
fi

# Copy SDK source to build dir, renaming hyphens to underscores
mkdir -p "$TMP/sdk" "$TMP/sdk/resources" "$TMP/sdk/cjson"
for f in "$C_SRC"/*.h; do
  [ -f "$f" ] || continue
  fname=$(basename "$f" | sed 's/-/_/g')
  cp "$f" "$TMP/sdk/$fname"
done
if [ -d "$C_SRC/resources" ]; then
  for f in "$C_SRC/resources"/*.h; do
    [ -f "$f" ] || continue
    fname=$(basename "$f" | sed 's/-/_/g')
    cp "$f" "$TMP/sdk/resources/$fname"
  done
fi

# Fix include paths in SDK files (hyphens -> underscores)
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "gql-client\.h"|#include "gql_client.h"|g' {} +
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "gql-types\.h"|#include "gql_types.h"|g' {} +
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "gql-query-builder\.h"|#include "gql_query_builder.h"|g' {} +
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "grpc-client\.h"|#include "grpc_client.h"|g' {} +
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "grpc-types\.h"|#include "grpc_types.h"|g' {} +
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "ws-client\.h"|#include "ws_client.h"|g' {} +
find "$TMP/sdk" -name '*.h' -exec sed -i 's|#include "ws-types\.h"|#include "ws_types.h"|g' {} +

# Download cJSON library
wget -q https://raw.githubusercontent.com/DaveGamble/cJSON/v1.7.18/cJSON.h -O "$TMP/sdk/cjson/cJSON.h"
wget -q https://raw.githubusercontent.com/DaveGamble/cJSON/v1.7.18/cJSON.c -O "$TMP/sdk/cjson/cJSON.c"

# Copy test source
cp "$TEST_DIR/src/tests.c" "$TMP/tests.c"

echo "  SDK files in build dir:"
ls "$TMP/sdk/" 2>/dev/null
echo ""

echo "  Compiling C tests..."
gcc -std=c11 -pthread \
  -I"$TMP/sdk" \
  -DMOCK_URL="\"$BASE\"" \
  -DMOCK_GQL_URL="\"$GQL_URL\"" \
  -DMOCK_GQL_WS_URL="\"$GQL_WS_URL\"" \
  -DMOCK_WS_URL="\"$WS_URL\"" \
  -DGRPC_ADDR="\"$GRPC_ADDR\"" \
  "$TMP/tests.c" "$TMP/sdk/cjson/cJSON.c" \
  -lcurl -lm \
  -o "$TMP/test_runner"

echo "  OK: Compilation succeeded"
echo "  Running tests..."
"$TMP/test_runner"
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "  FAIL: C tests failed"
  exit 1
fi

echo "  OK: All C SDK tests passed"
