# Transcribe-worker dispatcher image.
#
# RUNTIME = NODE (not Bun): @deepgram/sdk@5.4.0's realtime websocket sets the `ws`
# `binaryType = "blob"`, which Bun's WebSocket rejects, so the streaming worker MUST
# run on Node. `@livekit/rtc-node` is a native Node addon (prebuilt for linux-x64).
# We install node_modules with Bun (fast, deterministic via bun.lock) in a builder
# stage, then run on a slim Node image. The process is started with `tsx` (esbuild
# loader on Node) because plain `node` fails on this worker's extensionless TS ESM
# imports while tsx resolves them.
#
# STANDALONE: this worker is NOT in the bun/turbo workspace, so we copy only this
# directory — no monorepo prune, no root lockfile touched.

# ── Stage 1: install node_modules with Bun ──────────────────────────────────────
FROM oven/bun:1.3.14 AS deps
WORKDIR /app

# Only the manifest + lockfile first, for layer-cache friendliness.
COPY package.json bun.lock ./
# --frozen-lockfile: fail if bun.lock is stale (reproducible). The worker has its OWN
# lockfile; this never reaches the root monorepo install.
RUN bun install --frozen-lockfile

# ── Stage 2: Node runtime ───────────────────────────────────────────────────────
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Non-root runtime user.
RUN groupadd --system --gid 1001 worker \
	&& useradd --system --uid 1001 --gid worker worker

# node_modules from the Bun install stage (includes tsx + @livekit/rtc-node native
# bindings + @deepgram/sdk + livekit-server-sdk).
COPY --from=deps --chown=worker:worker /app/node_modules ./node_modules
# Source + manifest.
COPY --chown=worker:worker package.json ./
COPY --chown=worker:worker src ./src

USER worker

# The dispatcher is a WORKER, not an HTTP service. It exposes an OPTIONAL /health
# server ONLY when PORT is set (see fly.toml). EXPOSE documents that contract.
EXPOSE 8080

# Boot the per-room dispatcher on Node via tsx. It polls LiveKit for active voice
# rooms and spawns one `tsx src/index.ts <room>` child per room.
CMD ["node_modules/.bin/tsx", "src/dispatch.ts"]
