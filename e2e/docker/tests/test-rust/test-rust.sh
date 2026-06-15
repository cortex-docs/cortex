#!/bin/bash
# Rust integration test -- compiles the REAL generated SDK and runs tests
# that import and call the generated GqlClient, types, and REST client.
set -e

GEN="${GEN_DIR:-/tmp/cortex-e2e-sdks/generated}"
BASE="${MOCK_URL:-http://localhost:4010}"
RS_SRC="$GEN/rust/src"
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo ""
echo "Rust -- compile REAL generated SDK + run all protocol tests"
echo ""

if [ ! -d "$RS_SRC" ]; then echo "  FAIL: SDK source not found at $RS_SRC"; exit 1; fi
echo "  OK: SDK source found at $RS_SRC"
echo "  Files in $RS_SRC:"
ls -1 "$RS_SRC" 2>/dev/null
if [ -d "$RS_SRC/resources" ]; then
  echo "  Files in $RS_SRC/resources:"
  ls -1 "$RS_SRC/resources" 2>/dev/null
fi

# Create Cargo project
mkdir -p "$TMP/src"
cat > "$TMP/Cargo.toml" << 'EOF'
[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]
reqwest = { version = "0.12", features = ["json", "blocking"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
futures-util = "0.3"
thiserror = "2"
url = "2"
EOF

# Copy ALL generated SDK source files directly into src/, renaming hyphens to underscores
for f in "$RS_SRC"/*.rs; do
  [ -f "$f" ] || continue
  fname=$(basename "$f" | sed 's/-/_/g')
  cp "$f" "$TMP/src/$fname"
done
if [ -d "$RS_SRC/resources" ]; then
  for f in "$RS_SRC/resources"/*.rs; do
    [ -f "$f" ] && cp "$f" "$TMP/src/$(basename "$f" | sed 's/-/_/g')"
  done
fi

# Post-process grpc_types.rs:
# 1. Strip enum type prefixes from variant names (e.g. SPECIES_DOG -> Dog)
# 2. Add serde aliases for flexible JSON deserialization (accept "DOG", "SPECIES_DOG", "Dog")
# 3. Add PartialEq to struct derives (needed for assert comparisons)
if [ -f "$TMP/src/grpc_types.rs" ]; then
  TMP="$TMP" node << 'NODEEOF'
    const fs = require('fs');
    const filePath = process.env.TMP + '/src/grpc_types.rs';
    let src = fs.readFileSync(filePath, 'utf-8');

    // Add PartialEq to all struct derives, plus camelCase rename and default for JSON compat with mock
    src = src.replace(
      /#\[derive\(Debug, Clone, Serialize, Deserialize\)\]/g,
      '#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]\n#[serde(rename_all = "camelCase", default)]'
    );

    // Add Default to enum derives (needed for struct Default derivation)
    src = src.replace(
      /#\[derive\(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash\)\]/g,
      '#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Default)]'
    );

    // Fix enum variant names and add serde aliases for flexible deserialization.
    // The codegen runs toPascalCase on e.g. SPECIES_DOG -> SPECIESDOG.
    // We strip the enum-name prefix to get e.g. Dog, then add aliases for "DOG" and "SPECIES_DOG".
    // Also marks the first variant (= 0) with #[default] for the Default derive.
    src = src.replace(
      /pub enum (\w+)\s*\{([^}]*)\}/g,
      (match, enumName, body) => {
        const prefix = enumName.toUpperCase();
        // Convert enumName to UPPER_SNAKE for building proto-style prefixed aliases
        // e.g. PetStatus -> PET_STATUS
        const snakePrefix = enumName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
        let isFirst = true;
        const newBody = body.replace(
          /(\n[ \t]+)(\w+)(\s*=\s*\d+)/g,
          (m, ws, variant, rest) => {
            const upper = variant.toUpperCase();
            if (upper.startsWith(prefix) && upper.length > prefix.length) {
              const rawSuffix = variant.slice(prefix.length);
              const stripped = rawSuffix.charAt(0).toUpperCase() + rawSuffix.slice(1).toLowerCase();
              const screaming = stripped.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
              const prefixedScreaming = snakePrefix + '_' + screaming;
              let attrs = '#[serde(alias = "' + screaming + '", alias = "' + prefixedScreaming + '")]';
              if (isFirst) {
                attrs = '#[default]' + ws + attrs;
                isFirst = false;
              }
              return ws + attrs + ws + stripped + rest;
            }
            return m;
          }
        );
        return 'pub enum ' + enumName + ' {' + newBody + '}';
      }
    );

    fs.writeFileSync(filePath, src);
NODEEOF
fi

# Create grpc.rs that re-exports grpc_client and grpc_types into a unified grpc module
if [ -f "$TMP/src/grpc_client.rs" ] && [ -f "$TMP/src/grpc_types.rs" ]; then
  cat > "$TMP/src/grpc.rs" << 'GRPCEOF'
// Re-export all gRPC types at the grpc module level
pub use super::grpc_types::*;

// Re-export each service client as a submodule
pub use super::grpc_client::*;
GRPCEOF
fi

# Build lib.rs: module declarations first, then test content
# Remove any existing index.rs since we generate our own lib.rs
rm -f "$TMP/src/index.rs"

echo "// Auto-generated lib.rs" > "$TMP/src/lib.rs"

# Declare all SDK modules
for f in "$TMP/src"/*.rs; do
  mod=$(basename "$f" .rs)
  [ "$mod" = "lib" ] && continue
  # grpc_client and grpc_types are private — they are re-exported via the grpc module
  if [ "$mod" = "grpc_client" ] || [ "$mod" = "grpc_types" ]; then
    echo "mod $mod;" >> "$TMP/src/lib.rs"
  else
    echo "pub mod $mod;" >> "$TMP/src/lib.rs"
  fi
done

# Re-export types at the crate root
echo "" >> "$TMP/src/lib.rs"
echo "pub use types::*;" >> "$TMP/src/lib.rs"

# Append the test content, fixing crate self-references
echo "" >> "$TMP/src/lib.rs"
sed 's/test_project::/crate::/g' "$TEST_DIR/src/tests.rs" >> "$TMP/src/lib.rs"

echo "  Generated source files:"
ls -la "$RS_SRC/" 2>/dev/null | head -20
echo "  SDK files in build dir:"
ls "$TMP/src/" 2>/dev/null
echo "  lib.rs header:"
head -20 "$TMP/src/lib.rs" 2>/dev/null
echo "  grpc.rs contents:"
cat "$TMP/src/grpc.rs" 2>/dev/null || echo "  (no grpc.rs)"
echo "  OK: Generated SDK files copied"
echo "  Compiling and running tests..."
cd "$TMP" && MOCK_URL="$BASE" GRPC_ADDR="$BASE" cargo test -- --test-threads=1 2>&1
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "  FAIL: Rust tests failed"
  exit 1
fi

echo "  OK: All Rust SDK tests passed"
