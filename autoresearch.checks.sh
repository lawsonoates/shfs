#!/bin/bash
set -euo pipefail

bun test test/compiler >/tmp/autoresearch-bun-test.log 2>&1 || {
  tail -80 /tmp/autoresearch-bun-test.log
  exit 1
}

bun run typecheck >/tmp/autoresearch-typecheck.log 2>&1 || {
  tail -80 /tmp/autoresearch-typecheck.log
  exit 1
}
