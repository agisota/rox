#!/usr/bin/env bash
# Stop Rox dev servers on workspace ports and restart `bun run dev`.
set -euo pipefail

ROX_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$ROX_SCRIPT_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$ROX_SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR" || exit 1

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi

PORTS=(
  "${WEB_PORT:-3000}"
  "${API_PORT:-3001}"
  "${WRANGLER_PORT:-}"
  "${CADDY_ELECTRIC_PORT:-}"
  "${DESKTOP_VITE_PORT:-}"
)

echo "🛑 Stopping dev servers on workspace ports..."
for port in "${PORTS[@]}"; do
  [ -n "$port" ] || continue
  if command -v fuser &>/dev/null; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
done

pkill -f "turbo run dev dev:caddy" 2>/dev/null || true
pkill -f "next dev --port ${WEB_PORT:-3000}" 2>/dev/null || true
pkill -f "next dev --port ${API_PORT:-3001}" 2>/dev/null || true
pkill -f "caddy run --config Caddyfile" 2>/dev/null || true
pkill -f "wrangler dev --port" 2>/dev/null || true
sleep 2

for port in "${WEB_PORT:-3000}" "${API_PORT:-3001}"; do
  if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    error "Port ${port} still in use — kill the process manually"
    ss -tlnp | grep ":${port} " || true
    exit 1
  fi
done
success "Ports free"

echo "🚀 Starting bun run dev..."
export PATH="${HOME}/.bun/bin:${PATH}"
exec bun run dev
