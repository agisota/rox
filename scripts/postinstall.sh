#!/bin/bash
# Prevent infinite recursion during postinstall
# electron-builder install-app-deps can trigger nested bun installs
# which would re-run postinstall, spawning hundreds of processes

if [ -n "$ROX_POSTINSTALL_RUNNING" ]; then
  exit 0
fi

export ROX_POSTINSTALL_RUNNING=1

# Run sherif for workspace validation
sherif

# GitHub CI runs multiple Bun install jobs that do not need desktop native rebuilds.
# Running electron-builder here can trigger nested Bun installs while the main
# install is still materializing packages, which has been flaky with native deps.
if [ -n "$CI" ]; then
  exit 0
fi

# Heal any Bun store slots whose payload Bun's isolated install left dangling
# (observed for better-sqlite3) so @electron/rebuild below can find and compile
# the native binary. Best-effort; install:deps still runs regardless.
bun run --filter=@rox/desktop heal:native-store || true

# Install native dependencies for desktop app
bun run --filter=@rox/desktop install:deps
