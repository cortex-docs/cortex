#!/bin/bash
# C# integration test — validates generated SDK source files + exercises all protocol methods
set -e

BASE="${MOCK_URL:-http://localhost:4010}"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_GEN="$TEST_DIR/generated"
GEN="${GEN_DIR:-/tmp/cortex-e2e-sdks/generated}"
if [ -d "$LOCAL_GEN/csharp/src" ]; then GEN="$LOCAL_GEN"; fi
CS_SRC="$GEN/csharp/src"

echo ""
echo "C# — validate generated SDK + call all protocol methods"
echo ""

if [ ! -d "$CS_SRC" ]; then echo "  ✗ SDK source not found"; exit 1; fi
echo "  ✓ SDK source found"

echo "  Restoring and running tests..."
cd "$TEST_DIR"
GEN_DIR="$GEN" MOCK_URL="$BASE" dotnet test --verbosity normal --logger "console;verbosity=detailed" 2>&1
