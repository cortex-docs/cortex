#!/bin/bash
set -e

GEN="${GEN_DIR:-/tmp/cortex-e2e-sdks/generated}"
BASE="${MOCK_URL:-http://localhost:4010}"
GQL_URL="${MOCK_GQL_URL:-${BASE}/graphql}"
GQL_WS_URL=$(echo "$GQL_URL" | sed 's|^http|ws|')
WS_URL="${MOCK_WS_URL:-ws://localhost:4010/ws}"
GRPC_ADDR="${MOCK_URL:-http://localhost:4010}"
CPP_SRC="$GEN/cpp/src"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo ""
echo "C++ -- compile REAL generated SDK + run all protocol tests"
echo ""

if [ ! -d "$CPP_SRC" ]; then echo "  FAIL: SDK source not found at $CPP_SRC"; exit 1; fi
echo "  OK: SDK source found at $CPP_SRC"
echo "  Files in $CPP_SRC:"
ls -1 "$CPP_SRC" 2>/dev/null
if [ -d "$CPP_SRC/resources" ]; then
  echo "  Files in $CPP_SRC/resources:"
  ls -1 "$CPP_SRC/resources" 2>/dev/null
fi

# Copy SDK source to build dir, renaming hyphens to underscores
mkdir -p "$TMP/sdk" "$TMP/sdk/resources"
for f in "$CPP_SRC"/*.hpp; do
  [ -f "$f" ] || continue
  fname=$(basename "$f" | sed 's/-/_/g')
  cp "$f" "$TMP/sdk/$fname"
done
if [ -d "$CPP_SRC/resources" ]; then
  for f in "$CPP_SRC/resources"/*.hpp; do
    [ -f "$f" ] || continue
    fname=$(basename "$f" | sed 's/-/_/g')
    cp "$f" "$TMP/sdk/resources/$fname"
  done
fi

# Fix include paths in SDK files (hyphens -> underscores)
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "gql-client\.hpp"|#include "gql_client.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "gql-types\.hpp"|#include "gql_types.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "gql-query-builder\.hpp"|#include "gql_query_builder.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "grpc-client\.hpp"|#include "grpc_client.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "grpc-types\.hpp"|#include "grpc_types.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "ws-client\.hpp"|#include "ws_client.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include "ws-types\.hpp"|#include "ws_types.hpp"|g' {} +

# Fix nlohmann/json and httplib includes to use system paths
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include <nlohmann/json.hpp>|#include "nlohmann/json.hpp"|g' {} +
find "$TMP/sdk" -name '*.hpp' -exec sed -i 's|#include <httplib.h>|#include "httplib.h"|g' {} +

# Download header-only dependencies
mkdir -p "$TMP/sdk/nlohmann"
wget -q https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.18.3/httplib.h -O "$TMP/sdk/httplib.h"
wget -q https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp -O "$TMP/sdk/nlohmann/json.hpp"

# Copy test source
cp "$TEST_DIR/src/tests.cpp" "$TMP/tests.cpp"

echo "  SDK files in build dir:"
ls "$TMP/sdk/" 2>/dev/null
echo ""

echo "  Compiling C++ tests..."
g++ -std=c++20 -pthread -O1 \
  -I"$TMP/sdk" \
  -DMOCK_URL="\"$BASE\"" \
  -DMOCK_GQL_URL="\"$GQL_URL\"" \
  -DMOCK_GQL_WS_URL="\"$GQL_WS_URL\"" \
  -DMOCK_WS_URL="\"$WS_URL\"" \
  -DGRPC_ADDR="\"$GRPC_ADDR\"" \
  "$TMP/tests.cpp" \
  -o "$TMP/test_runner"

echo "  OK: Compilation succeeded"
echo "  Running tests..."
"$TMP/test_runner"
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "  FAIL: C++ tests failed"
  exit 1
fi

echo "  OK: All C++ SDK tests passed"
