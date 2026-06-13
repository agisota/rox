# Host-service container image for the `rox-self` provisioner (path B: remote
# one-click host on infra we control). The published tag of this image is what
# `ROX_SELF_HOST_IMAGE` points at (default ghcr.io/agisota/rox-host-service:latest);
# the RoxSelfProvisioner creates a container from it via the Docker Engine API.
#
# Build from the monorepo root so the Bun workspace resolves:
#   docker build -f packages/host-service/Dockerfile -t rox-host-service .

# --- builder: install workspace deps and build the host-service bundle --------
FROM oven/bun:1.3.11 AS builder
WORKDIR /app

# Copy the whole monorepo (Bun workspaces need the root manifests + linked
# packages to resolve `workspace:*` deps). .dockerignore keeps this lean.
COPY . .

# Install all workspace dependencies (frozen lockfile for reproducible builds).
RUN bun install --frozen-lockfile

# Produce the single-file host-service bundle (validates the build).
RUN bun run --filter @rox/host-service build:host

# --- runtime: minimal image that runs the host-service ------------------------
FROM oven/bun:1.3.11-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Bring over the installed workspace (incl. native addons better-sqlite3 /
# node-pty built for this base) and the host-service sources + migrations.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/host-service ./packages/host-service

# host-service listens on PORT (default 4879). Runtime config (ORGANIZATION_ID,
# AUTH_TOKEN, HOST_DB_PATH, HOST_MIGRATIONS_FOLDER, ROX_API_URL, …) is injected
# by the provisioner / operator at container-run time, not baked into the image.
ENV PORT=4879
EXPOSE 4879

CMD ["bun", "run", "packages/host-service/src/serve.ts"]
