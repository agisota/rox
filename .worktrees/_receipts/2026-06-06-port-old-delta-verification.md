# Port Old Superset Delta Verification Receipt

Date: 2026-06-06

## Scope

Verification worktree:
- Path: `/Users/marklindgreen/Projects/set-for-projects/set/.worktrees/port-old-delta-to-set-verify`
- Branch: `port-old-delta-to-set-verify`
- Base: `origin/main` at `f76b58c5c976c283a241207f0dc0e9ca2228ed34`

Source patch:
- Resolved patch exported from the earlier spaced-path worktree:
  `/tmp/old-superset-selected-product-docs-runtime-resolved.patch`
- Applied with:
  `git apply --index --3way /tmp/old-superset-selected-product-docs-runtime-resolved.patch`

No push was performed.

## Split Commits

Current verification branch is `ahead 5` from `origin/main` after stacking the baseline `DaemonClient.ts` fix:

```text
43d5b4d08 Route local database proxy through loopback
c49da787a Apply sanitized app rebrand copy
5ff07308b Centralize product URLs without placeholder domains
eceadf5cd Carry forward old Superset runtime notes
05ed5f179 Normalize daemon socket chunks before decoding
```

Commit split:
- `05ed5f179`: baseline `DaemonClient.ts` typecheck fix.
- `eceadf5cd`: runtime setup + planning/spec documents only.
- `5ff07308b`: shared constants and URL abstraction, sanitized to avoid fake fork domains; includes folded formatter fix formerly in `4828c98ed`.
- `c49da787a`: app/docs/marketing/web/desktop/admin visible rebrand and RU locale/copy.
- `43d5b4d08`: isolated DB local-proxy runtime change.

Backup ref before fold:

```text
port-old-delta-to-set-verify-before-fold-20260607
```

Backup ref before stacking on `fix-daemonclient-typecheck`:

```text
port-old-delta-before-daemonclient-stack-20260607
```

Branch diff summary after split:

```text
84 files changed, 1741 insertions(+), 627 deletions(-)
```

## Conflict Resolution

Resolved:
- `bun.lock`: keep newer target/fork package versions.
  - `apps/desktop`: `1.12.3`
  - `packages/host-service`: `0.8.19`
- `apps/desktop/package.json`: keep old-delta rebrand metadata, but keep newer target version `1.12.3`.
- `packages/shared/src/constants.ts`: keep `WEB_REMOTE_CONTROL_ACCESS` with platform-user wording and keep target `RELAY_URL_OVERRIDE`.
- `plans/20260605-agent-controlled-browser-feature.md`: remove trailing blank line flagged by `git diff --check`.

Marker scan:
- No conflict markers found after resolution.

## Placeholder / Dropped Surfaces

Dropped from the branch before verification:
- `README.md`: contained public links to `agent-station.example.com`.
- `package.json`: contained `homepage: https://agent-station.example.com`.
- `apps/api/src/app/api/integrations/slack/manifest.json`: contained Slack endpoint and unfurl placeholder domains.
- `apps/desktop/electron-builder.canary.ts`: contained unconfirmed `agent-station` release owner/repo/artifact identity.
- `apps/desktop/electron-builder.ts`: contained unconfirmed app id, release owner/repo, and artifact identity.
- `apps/desktop/src/main/lib/auto-updater.ts`: contained unconfirmed update feed repository.
- `apps/marketing/content/legal/privacy.mdx`: contained placeholder legal entity/email.
- `apps/marketing/content/legal/subprocessors.mdx`: contained placeholder Agent Station legal copy.
- `apps/marketing/content/legal/terms.mdx`: contained placeholder legal entity/email.
- `apps/marketing/src/app/components/WallOfLoveSection/constants.ts`: wiped testimonials without replacement proof.

Dropped patch preserved for inspection:

```text
/tmp/port-old-delta-dropped-release-legal-placeholders.patch
```

Branch-wide placeholder scan after split:

```text
git diff origin/main...HEAD | rg -n 'agent-station\.example\.com|support@agent-station|privacy@agent-station|legal@agent-station|github.com/agent-station|agent-station/app|DEFAULT_UPDATE_FEED_URL|Agent-Station|com\.agentstation'
```

Result: no matches.

## Verification

Passed:

```text
git diff origin/main...HEAD | rg -n 'agent-station\.example\.com|support@agent-station|privacy@agent-station|legal@agent-station|github.com/agent-station|agent-station/app|DEFAULT_UPDATE_FEED_URL|Agent-Station|com\.agentstation'
rg -n '^(<<<<<<<|\|\|\|\|\|\||=======|>>>>>>>)' . --glob '!node_modules/**' --glob '!dist/**' --glob '!out/**' --glob '!release/**' --glob '!*.patch'
bun run lint
bunx turbo typecheck --filter=@superset/admin --filter=@superset/api --filter=@superset/db --filter=@superset/desktop --filter=@superset/docs --filter=@superset/marketing --filter=@superset/shared --filter=@superset/web
bun run typecheck
```

Targeted touched-package typecheck result:

```text
Tasks: 8 successful, 8 total
Cached: 0 cached, 8 total
Time: 961ms (cached after prior post-fold run)
```

Global typecheck result after stacking `05ed5f179`:

```text
Tasks: 31 successful, 31 total
Cached: 25 cached, 31 total
Time: 36.708s
```

Result: passed. The prior `DaemonClient.ts(86,44)` blocker is no longer present because the branch is stacked on `05ed5f179`.

Spaced-path blocker:
- `bun install` failed in `/Users/marklindgreen/Projects/Set for Projects/...` because native rebuild cannot handle the space in `Set for Projects`.
- No-space verification worktree fixed that environment blocker.

## Semantic Review Summary

Keep now:
- `.superset/lib/setup/steps.sh`: useful for avoiding reused occupied port allocations in parallel worktrees.
- `plans/**` and `specs/**`: useful as backlog/reference docs, not implementation truth.
- Shared constants direction: `COMPANY`, service URL constants, locale constants, and runtime URL indirection are useful as architecture primitives.

Keep concept, rewrite before merge:
- `packages/shared/src/constants.ts`: centralization is useful, but placeholder production defaults such as `agent-station.example.com` are risky.
- Runtime URL fallback changes in web/desktop/API: useful pattern, but must use real domains/env contract before release.
- RU-first locale/copy: useful if fork identity is RU-first, but current UX is mixed.

Kept as isolated runtime commit, still needs targeted smoke:
- `packages/db/src/local-proxy.ts`: may be a valid local Neon proxy fix, but needs DB local-proxy smoke because it rewrites incoming host to `localhost`.

Do not merge as-is:
- Legal pages under `apps/marketing/content/legal/**`: placeholder legal entity/domain/email.
- Slack manifest under `apps/api/.../manifest.json`: placeholder `agent-station.example.com` deployment-facing config.
- Desktop release/update identity: `electron-builder*`, auto-updater, app IDs/repo targets need release-channel decision.
- Marketing testimonials removal: loses public proof unless replaced with real testimonials.
- Placeholder root README/package metadata with `agent-station.example.com`.

## Current State

Verification worktree is clean:
- Branch: `port-old-delta-to-set-verify`
- Status: `ahead 5` from `origin/main`
- No staged or unstaged files.

Main no-space clone had pre-existing unrelated dirty files before this verification lane:
- `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts`
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/layout.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx`
- `packages/cli/.18b6879ebdbffe7b-00000000.bun-build`

Do not confuse those with this worktree branch.

## Recommended Next Action

For a real merge branch:
1. Review the five stacked commits in order.
2. Decide real fork identity before reintroducing README, legal, Slack manifest, release builder, updater feed, and testimonial changes.
3. Run DB local-proxy smoke before relying on `packages/db/src/local-proxy.ts` in a release branch.

## PR-ready Summary

Title:

```text
Port sanitized old Superset product/runtime delta into set
```

Body:

```text
## Summary
- fixes the pre-existing DaemonClient socket chunk typecheck blocker
- carries forward old Superset runtime setup docs/specs
- centralizes product/company/service URL constants while keeping real upstream defaults instead of placeholder domains
- applies sanitized RU-first product copy across app, docs, marketing, web, desktop, and admin surfaces
- isolates the local DB proxy loopback runtime change

## Intentionally dropped
- README/root package fake public domains
- legal pages with placeholder legal entity/email
- Slack manifest placeholder endpoints
- desktop release builder/app id/updater feed placeholders
- testimonial wipe without replacement proof

## Verification
- placeholder-domain scan: no matches
- conflict-marker scan: no matches
- bun run lint
- bun run typecheck

## Notes
- release/legal/Slack/README identity needs real domain, legal entity, release repository, and endpoint decisions before reintroduction
- packages/db/src/local-proxy.ts still needs DB local-proxy smoke
```
