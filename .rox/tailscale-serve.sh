#!/usr/bin/env bash
# Expose the local Rox dev stack to your tailnet via `tailscale serve`.
# Requires: tailscale CLI, tailscaled, logged-in tailnet (TS_AUTHKEY or `tailscale up`).
#
# Cloud VMs: start userspace tailscaled first (no TUN in nested containers):
#   tailscaled --tun=userspace-networking \
#     --outbound-http-proxy-listen=localhost:1054 \
#     --socks5-server=localhost:1055 &
#   export ALL_PROXY=socks5h://localhost:1055/
#   export HTTP_PROXY=http://localhost:1054/
#   export HTTPS_PROXY=http://localhost:1054/
set -euo pipefail

ROX_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$ROX_SCRIPT_DIR/.." && pwd)"

# shellcheck source=/dev/null
source "$ROX_SCRIPT_DIR/lib/common.sh"

cd "$ROOT_DIR" || exit 1

TS_WEB_SERVE_PORT="${TS_WEB_SERVE_PORT:-443}"
TS_API_SERVE_PORT="${TS_API_SERVE_PORT:-8443}"
TS_ELECTRIC_SERVE_PORT="${TS_ELECTRIC_SERVE_PORT:-8444}"
TAILSCALE_ENV_MARKER="# ===== Tailscale serve overrides (tailscale-serve.sh) ====="

ts_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    tailscale "$@"
  else
    sudo tailscale "$@"
  fi
}

ts_ensure_daemon() {
  if ts_cmd status --json &>/dev/null; then
    return 0
  fi

  # Userspace tailscaled may already be running (socket present) but needs proxy env.
  if [ -S /var/run/tailscale/tailscaled.sock ]; then
    export ALL_PROXY=socks5h://localhost:1055/
    export HTTP_PROXY=http://localhost:1054/
    export HTTPS_PROXY=http://localhost:1054/
    if ts_cmd status --json &>/dev/null; then
      success "Using existing tailscaled (userspace proxy env set)"
      return 0
    fi
  fi

  echo "  Starting userspace tailscaled..."
  nohup sudo tailscaled --tun=userspace-networking \
    --outbound-http-proxy-listen=localhost:1054 \
    --socks5-server=localhost:1055 \
    >/tmp/tailscaled.log 2>&1 &
  sleep 2
  export ALL_PROXY=socks5h://localhost:1055/
  export HTTP_PROXY=http://localhost:1054/
  export HTTPS_PROXY=http://localhost:1054/
  if ts_cmd status --json &>/dev/null; then
    success "userspace tailscaled started (see /tmp/tailscaled.log)"
    return 0
  fi
  error "tailscaled failed to start — check /tmp/tailscaled.log"
  return 1
}

ts_ensure_logged_in() {
  echo "🔐 Checking Tailscale login..."
  if ts_cmd status --json 2>/dev/null | jq -e '.BackendState == "Running"' >/dev/null 2>&1; then
    success "Tailscale connected"
    return 0
  fi

  local hostname="rox-dev-$(echo "${ROX_WORKSPACE_NAME:-$(basename "$PWD")}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-48)"
  if [ -n "${TS_AUTHKEY:-}" ]; then
    echo "  Logging in with TS_AUTHKEY..."
    if [ -n "${ALL_PROXY:-}" ]; then
      sudo -E tailscale up --auth-key="$TS_AUTHKEY" --hostname="$hostname"
    else
      TS_AUTHKEY="$TS_AUTHKEY" ts_cmd up --auth-key="$TS_AUTHKEY" --hostname="$hostname"
    fi
  else
    error "Tailscale is not logged in."
    echo ""
    echo "Option A — auth key (headless / cloud VM):"
    echo "  export TS_AUTHKEY=tskey-auth-..."
    echo "  ./.rox/tailscale-serve.sh"
    echo ""
    echo "Option B — interactive login:"
    if [ -n "${ALL_PROXY:-}" ]; then
      sudo -E tailscale up --hostname="$hostname" || true
    else
      ts_cmd up --hostname="$hostname" || true
    fi
    echo ""
    echo "Open the login URL above in a browser, then re-run this script."
    return 1
  fi

  if ts_cmd status --json 2>/dev/null | jq -e '.BackendState == "Running"' >/dev/null 2>&1; then
    success "Tailscale connected"
    return 0
  fi
  error "Tailscale login did not complete"
  return 1
}

ts_load_ports() {
  if [ ! -f .env ]; then
    error ".env not found — run ./.rox/setup.local.sh first"
    return 1
  fi
  # shellcheck disable=SC1091
  set -a && source .env && set +a
  WEB_PORT="${WEB_PORT:-3000}"
  API_PORT="${API_PORT:-3001}"
  CADDY_ELECTRIC_PORT="${CADDY_ELECTRIC_PORT:-}"
  success "Ports: web=$WEB_PORT api=$API_PORT electric-caddy=${CADDY_ELECTRIC_PORT:-n/a}"
}

ts_configure_serve() {
  echo "🌐 Configuring tailscale serve..."
  ts_cmd serve reset 2>/dev/null || true

  ts_cmd serve --bg --https="$TS_WEB_SERVE_PORT" "http://127.0.0.1:$WEB_PORT"
  sleep 1
  ts_cmd serve --bg --https="$TS_API_SERVE_PORT" "http://127.0.0.1:$API_PORT"
  sleep 1
  if [ -n "${CADDY_ELECTRIC_PORT:-}" ]; then
    ts_cmd serve --bg --https="$TS_ELECTRIC_SERVE_PORT" "https+insecure://127.0.0.1:$CADDY_ELECTRIC_PORT"
    sleep 1
  fi

  ts_cmd serve status
  success "Tailscale serve configured"
}


ts_update_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null || grep -q "^${key}="" "$file" 2>/dev/null; then
    awk -v k="$key" -v v="$value" '
      BEGIN { replaced=0 }
      $0 ~ "^" k "=" { print k "="" v """; replaced=1; next }
      { print }
      END { if (!replaced) print k "="" v """ }
    ' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
  else
    write_env_var "$key" "$value" >> "$file"
  fi
}

ts_remove_env_section() {
  if [ ! -f .env ]; then
    return 0
  fi
  awk -v marker="$TAILSCALE_ENV_MARKER" '
    $0 == marker { skip=1; next }
    skip && /^# ===== / { skip=0 }
    !skip { print }
  ' .env > .env.tmp && mv .env.tmp .env
}

ts_write_env_urls() {
  echo "📝 Writing Tailscale URLs to .env..."
  local dns
  dns="$(ts_cmd status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
  if [ -z "$dns" ] || [ "$dns" = "null" ]; then
    error "Could not read Tailscale DNS name"
    return 1
  fi

  local web_url="https://${dns}"
  local api_url="https://${dns}:${TS_API_SERVE_PORT}"
  local electric_url=""
  if [ -n "${CADDY_ELECTRIC_PORT:-}" ]; then
    electric_url="https://${dns}:${TS_ELECTRIC_SERVE_PORT}"
  fi

  ts_remove_env_section
  {
    echo ""
    echo "$TAILSCALE_ENV_MARKER"
  } >> .env
  ts_update_env_var "NEXT_PUBLIC_WEB_URL" "$web_url" .env
  ts_update_env_var "NEXT_PUBLIC_API_URL" "$api_url" .env
  ts_update_env_var "ROX_WEB_URL" "$web_url" .env
  ts_update_env_var "NEXT_PUBLIC_COOKIE_DOMAIN" "$dns" .env
  if [ -n "$electric_url" ]; then
    ts_update_env_var "NEXT_PUBLIC_ELECTRIC_URL" "$electric_url" .env
    ts_update_env_var "NEXT_PUBLIC_ELECTRIC_PROXY_URL" "$electric_url" .env
  fi
  ts_update_env_var "TS_SERVE_WEB_URL" "$web_url" .env
  ts_update_env_var "TS_SERVE_API_URL" "$api_url" .env
  if [ -n "$electric_url" ]; then
    ts_update_env_var "TS_SERVE_ELECTRIC_URL" "$electric_url" .env
  fi

  cat > "$ROX_SCRIPT_DIR/tailscale-urls.json" <<JSON
{
  "dnsName": "$dns",
  "webUrl": "$web_url",
  "apiUrl": "$api_url",
  "electricUrl": "$electric_url",
  "servePorts": {
    "web": $TS_WEB_SERVE_PORT,
    "api": $TS_API_SERVE_PORT,
    "electric": ${TS_ELECTRIC_SERVE_PORT:-null}
  }
}
JSON

  success "Tailscale URLs written to .env and .rox/tailscale-urls.json"
  echo ""
  echo "  Web:       $web_url"
  echo "  API:       $api_url"
  if [ -n "$electric_url" ]; then
    echo "  Electric:  $electric_url"
  fi
  echo ""
  warn "Restart dev servers: ./.rox/restart-dev.sh  (or kill old processes, then bun run dev)"
}

main() {
  echo "🚀 Tailscale serve for Rox dev stack"
  echo ""
  command -v tailscale &>/dev/null || { error "tailscale CLI not installed"; return 1; }
  command -v jq &>/dev/null || { error "jq required"; return 1; }
  ts_ensure_daemon || exit 1
  ts_ensure_logged_in || exit 1
  ts_load_ports || exit 1
  ts_configure_serve || exit 1
  ts_write_env_urls || exit 1
  echo ""
  success "Done — open the Web URL from a device on your tailnet"
}

main "$@"
