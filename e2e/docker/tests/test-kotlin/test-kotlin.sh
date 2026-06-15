#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_DIR="$DIR/generated/kotlin"

# Copy test file into Gradle project test source set
mkdir -p "$SDK_DIR/src/test/kotlin"
cp "$DIR/TestKotlin.kt" "$SDK_DIR/src/test/kotlin/"

# Create settings.gradle.kts if missing
if [ ! -f "$SDK_DIR/settings.gradle.kts" ]; then
    echo 'rootProject.name = "test-project-kotlin"' > "$SDK_DIR/settings.gradle.kts"
fi

cd "$SDK_DIR"
gradle test --no-daemon 2>&1
