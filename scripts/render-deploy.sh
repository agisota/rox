#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage: scripts/render-deploy.sh <service> [commit]

Services:
  api          srv-d8q3ju3sq97s73f48tsg
  api-runtime  srv-d8q3sqh194ac73del9u0
  web          srv-d8q3jv9kh4rs73c3fang
  marketing    srv-d8q3k0h194ac73debh30
  admin        srv-d8q3k2jsq97s73803o1g
  docs         srv-d8q3k1favr4c7381obn0

Examples:
  scripts/render-deploy.sh marketing
  scripts/render-deploy.sh marketing ea460202d8ac7e7a5ffb7049e5330eaf25346910
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

service="${1:-}"
commit="${2:-${RENDER_DEPLOY_COMMIT:-}}"

case "$service" in
api)
	service_id="srv-d8q3ju3sq97s73f48tsg"
	;;
api-runtime)
	service_id="srv-d8q3sqh194ac73del9u0"
	;;
web)
	service_id="srv-d8q3jv9kh4rs73c3fang"
	;;
marketing)
	service_id="srv-d8q3k0h194ac73debh30"
	;;
admin)
	service_id="srv-d8q3k2jsq97s73803o1g"
	;;
docs)
	service_id="srv-d8q3k1favr4c7381obn0"
	;;
*)
	usage >&2
	exit 64
	;;
esac

args=(deploys create "$service_id" --wait --confirm)
if [[ -n "$commit" ]]; then
	args+=(--commit "$commit")
fi

exec render "${args[@]}"
