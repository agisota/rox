#!/bin/bash
# Wrapper for biome check that fails on ANY diagnostic (info, warn, or error)

biome_bin="./node_modules/.bin/biome"

if [ -x "$biome_bin" ]; then
  output=$("$biome_bin" check "$@" 2>&1)
else
  output=$(bunx @biomejs/biome@2.4.2 check "$@" 2>&1)
fi

exit_code=$?

echo "$output"

# Check if there are any diagnostics (errors, warnings, or infos)
if echo "$output" | grep -qE "Found [0-9]+ (error|info|warning)"; then
  exit 1
fi

./scripts/check-desktop-git-env.sh
./scripts/check-git-ref-strings.sh
bash ./scripts/check-simple-git-usage.sh

exit $exit_code
