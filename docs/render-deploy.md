# Render Deployments

Rox production services are deployed by Render, not Vercel.

The legacy GitHub Actions workflows named `Deploy Preview` and `Deploy Production` are intentionally no-op checks. They exist only to keep old PR gates green while the repository finishes migrating away from Vercel-owned deploy workflows.

## Services

| Service | Render id | Source | Auto deploy |
| --- | --- | --- | --- |
| `rox-api` | `srv-d8q3ju3sq97s73f48tsg` | `agisota/rox`, `main` | yes |
| `rox-api-runtime` | `srv-d8q3sqh194ac73del9u0` | image-backed | yes |
| `rox-web` | `srv-d8q3jv9kh4rs73c3fang` | `agisota/rox`, `main` | yes |
| `rox-marketing` | `srv-d8q3k0h194ac73debh30` | `agisota/rox`, `main` | yes |
| `rox-admin` | `srv-d8q3k2jsq97s73803o1g` | `agisota/rox`, `main` | yes |
| `rox-docs` | `srv-d8q3k1favr4c7381obn0` | `agisota/rox`, `main` | yes |

## Manual Deploy

Use the helper script when a specific service needs a deploy for a known commit.

```bash
scripts/render-deploy.sh marketing
scripts/render-deploy.sh marketing ea460202d8ac7e7a5ffb7049e5330eaf25346910
```

The helper runs:

```bash
render deploys create <service-id> [--commit <sha>] --wait --confirm
```

## Verification

Use Render CLI for service truth:

```bash
render services --output json
render deploys list srv-d8q3k0h194ac73debh30 --output json
```

For public production smoke, verify the actual public host, not an old Vercel preview URL:

```bash
curl -I https://rox.one
```

## Database Migrations

The old production GitHub workflow ran database migrations before Vercel deploys. That workflow is now disabled. Run migrations only through the explicit migration process for the target environment; do not reintroduce implicit production migrations in a deploy workflow.
