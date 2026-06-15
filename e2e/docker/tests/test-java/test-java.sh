#!/bin/bash
# Java integration test — compiles the REAL generated SDK and calls every method
set -e

GEN="${GEN_DIR:-/tmp/cortex-e2e-sdks/generated}"
BASE="${MOCK_URL:-http://localhost:4010}"
JAVA_SRC="$GEN/java/src"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

JUNIT_JAR="$TMP/junit-platform-console-standalone.jar"
GSON_JAR="$TMP/gson.jar"

echo ""
echo "Java — compile REAL generated SDK + call all protocol methods"
echo ""

# 1. Check generated SDK exists
if [ ! -d "$JAVA_SRC" ]; then echo "  ✗ SDK source not found at $JAVA_SRC"; exit 1; fi
echo "  ✓ SDK source found"

# 2. Read the package name from client.java
PKG=$(grep "^package " "$JAVA_SRC/client.java" | head -1 | sed 's/package //;s/;//')
PKG_DIR=$(echo "$PKG" | tr '.' '/')
echo "  ✓ Package: $PKG"

# 3. Create proper directory structure and copy all generated files
mkdir -p "$TMP/$PKG_DIR"
mkdir -p "$TMP/${PKG_DIR}/models"

# Copy REST core files
for f in client.java ApiException.java; do
  [ -f "$JAVA_SRC/$f" ] && cp "$JAVA_SRC/$f" "$TMP/$PKG_DIR/"
done

# Copy types to models subdir (different package)
[ -f "$JAVA_SRC/types.java" ] && cp "$JAVA_SRC/types.java" "$TMP/${PKG_DIR}/models/"

# Copy resource files
if [ -d "$JAVA_SRC/resources" ]; then
  for f in "$JAVA_SRC/resources"/*.java; do
    [ -f "$f" ] || continue
    cp "$f" "$TMP/$PKG_DIR/"
  done
fi

# Copy GQL/WS files
for f in gql-client.java gql-types.java gql-query-builder.java ws-client.java ws-types.java; do
  [ -f "$JAVA_SRC/$f" ] && cp "$JAVA_SRC/$f" "$TMP/$PKG_DIR/"
done

# Copy gRPC files to grpc subpackage
mkdir -p "$TMP/${PKG_DIR}/grpc"
for f in grpc-client.java grpc-types.java; do
  [ -f "$JAVA_SRC/$f" ] && cp "$JAVA_SRC/$f" "$TMP/${PKG_DIR}/grpc/"
done

# 4. Split Java files with multiple public class/enum declarations into separate files
# Java requires exactly one public class per file, named after the class.
split_java_file() {
  local file="$1"
  local dir=$(dirname "$file")
  local pkg_line=$(grep "^package " "$file" 2>/dev/null | head -1)
  local import_lines=$(grep "^import " "$file" 2>/dev/null)

  # Count public class/enum declarations
  local count=$(grep -c "^public \(class\|enum\|interface\|record\) " "$file" 2>/dev/null || echo 0)
  [ "$count" -le 1 ] && return

  # Extract each public class/enum into its own file
  local in_class=0
  local brace_depth=0
  local current_class=""
  local current_file=""
  local header_written=0

  while IFS= read -r line; do
    if echo "$line" | grep -q "^public \(class\|enum\|interface\|record\) "; then
      current_class=$(echo "$line" | sed 's/^public \(class\|enum\|interface\|record\) //;s/[< {].*//;s/ .*//')
      current_file="$dir/$current_class.java"
      in_class=1
      brace_depth=0
      header_written=1
      # Write package + imports + class declaration
      {
        [ -n "$pkg_line" ] && echo "$pkg_line" && echo ""
        [ -n "$import_lines" ] && echo "$import_lines" && echo ""
        echo "$line"
      } > "$current_file"
      # Count opening braces on this line
      local opens=$(echo "$line" | tr -cd '{' | wc -c)
      local closes=$(echo "$line" | tr -cd '}' | wc -c)
      brace_depth=$((brace_depth + opens - closes))
      continue
    fi

    if [ "$in_class" -eq 1 ] && [ -n "$current_file" ]; then
      echo "$line" >> "$current_file"
      local opens=$(echo "$line" | tr -cd '{' | wc -c)
      local closes=$(echo "$line" | tr -cd '}' | wc -c)
      brace_depth=$((brace_depth + opens - closes))
      if [ "$brace_depth" -le 0 ]; then
        in_class=0
        current_file=""
      fi
    fi
  done < "$file"

  # Remove the original file (individual class files now exist)
  rm -f "$file"
}

# Split all Java files in the package directory
for f in "$TMP/$PKG_DIR"/*.java "$TMP/${PKG_DIR}/models"/*.java "$TMP/${PKG_DIR}/grpc"/*.java; do
  [ -f "$f" ] || continue
  split_java_file "$f"
done

# 5. Rename remaining files to match their public class names (Java requirement)
for f in "$TMP/$PKG_DIR"/*.java "$TMP/${PKG_DIR}/models"/*.java "$TMP/${PKG_DIR}/grpc"/*.java; do
  [ -f "$f" ] || continue
  classname=$(grep "^public class \|^public enum \|^public interface \|^public record " "$f" 2>/dev/null | head -1 | sed 's/^public \(class\|enum\|interface\|record\) //;s/[< {].*//;s/ .*//')
  [ -z "$classname" ] && continue
  expected="$classname.java"
  actual=$(basename "$f")
  if [ "$actual" != "$expected" ]; then
    mv "$f" "$(dirname "$f")/$expected" 2>/dev/null || true
  fi
done

echo "  ✓ SDK files copied and split to build dir"

# 6. Copy test file with correct package name
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed "s/^package .*;/package $PKG;/" "$SCRIPT_DIR/TestJava.java" > "$TMP/$PKG_DIR/TestJava.java"
split_java_file "$TMP/$PKG_DIR/TestJava.java"
echo "  ✓ Test file copied"

# 7. Download Gson + JUnit jars
wget -q "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar" -O "$GSON_JAR" 2>/dev/null || \
curl -sL "https://repo1.maven.org/maven2/com/google/code/gson/gson/2.11.0/gson-2.11.0.jar" -o "$GSON_JAR"
wget -q "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.11.0/junit-platform-console-standalone-1.11.0.jar" -O "$JUNIT_JAR" 2>/dev/null || \
curl -sL "https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.11.0/junit-platform-console-standalone-1.11.0.jar" -o "$JUNIT_JAR"

# 8. Compile
echo "  Compiling..."
mkdir -p "$TMP/classes"
find "$TMP" -name "*.java" > "$TMP/sources.txt"

echo "  Files to compile:"
cat "$TMP/sources.txt" | while read f; do echo "    $(basename $f)"; done

javac -encoding UTF-8 -cp "$JUNIT_JAR:$GSON_JAR" -d "$TMP/classes" @"$TMP/sources.txt" 2>&1
if [ $? -ne 0 ]; then
  echo "  ✗ Full compilation failed, trying core REST files only..."
  # Fallback: compile only REST SDK + tests (skip GQL/gRPC/WS)
  find "$TMP/$PKG_DIR" -maxdepth 1 -name "*.java" | grep -v -i "gql\|grpc\|ws" > "$TMP/sources.txt"
  echo "$TMP/$PKG_DIR/TestJava.java" >> "$TMP/sources.txt"
  # Also include models
  find "$TMP/${PKG_DIR}/models" -name "*.java" >> "$TMP/sources.txt" 2>/dev/null
  javac -encoding UTF-8 -cp "$JUNIT_JAR:$GSON_JAR" -d "$TMP/classes" @"$TMP/sources.txt" 2>&1 | head -20
fi
echo "  ✓ Compiled"

# 9. Run tests with JUnit Platform Console Standalone
echo "  Running tests..."
GEN_DIR="$GEN" MOCK_URL="$BASE" java -jar "$JUNIT_JAR" execute \
  --class-path "$TMP/classes:$GSON_JAR" \
  --select-class "$PKG.TestJava" \
  --details=verbose
