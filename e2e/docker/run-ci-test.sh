#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: run-ci-test.sh <test-script>" >&2
  exit 2
fi

npm ci --no-audit --no-fund
npm run build:cli
exec node "$1"
