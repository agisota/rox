# Rox Release Train Receipt - 2026-06-16

## Current State

- Worktree: `.worktrees/share-auth-branding`
- Branch: `issue/share-auth-branding`
- Base: `origin/main` at `1c7b425a90faf2ce21922ccd819c2d25a484e6fd`
- Lane state: share/auth/branding lane has product code for public share management, artifact share publishing from desktop settings, public share revocation, and anonymous `/s/:slug` rendering proof.
- Receipt state: this file travels with the lane PR because the separate release-train receipt worktree was not present in the active checkout.

## Target State

- Public chat/artifact snapshots are shareable through `public_shares` without exposing live private resources.
- Owners can list/copy/revoke their shares; org admins can manage org public shares.
- Desktop exposes a settings surface for public links and artifact sharing.
- Anonymous visitors can open only non-revoked snapshots on `/s/:slug`.
- The lane is reviewable as a single PR with local, targeted, and browser-visible evidence.

## Gap / Transformation

- `packages/trpc` now exposes `share.listPublic` and `share.revokePublic`, with creator/admin scoping and revoked-link filtering.
- Desktop settings now has a `shares` section, settings search metadata, sidebar entry, and `SharesSettings` UI for list/copy/revoke plus artifact publish/copy actions.
- Desktop collections now include read-only org-scoped `artifacts` so the share UI can operate on existing artifact snapshots.
- Local smoke seeds one immutable `public_shares` row and verifies the public web route renders the serialized snapshot through portless.

## Share Lane Verification Proof

- `./.rox/setup.local.sh`: passed; created ignored local `.env`, started `rox-share-auth-branding` Docker DB stack, applied local migrations, seeded `admin@local.test`.
- Seeded local `public_shares` row:
  - slug: `rox-share-smoke-20260616-mqg3da8s`
  - resource type: `chat_session`
  - title: `Rox Share Smoke 2026-06-16`
- Portless route:
  - command: `PORTLESS_TLD=t portless --name rox-share-smoke --app-port 3020 bun run --cwd apps/web dev`
  - verified URL: `https://rox-share-smoke.t/s/rox-share-smoke-20260616-mqg3da8s`
  - evidence: `curl -k -sS -o /tmp/rox-share-smoke.html https://rox-share-smoke.t/s/rox-share-smoke-20260616-mqg3da8s`
  - status: `200`
  - content checks: `Rox Share Smoke 2026-06-16`, `rox-share-smoke-20260616-mqg3da8s`, `Browser-visible share smoke request`, and `Rox share smoke response visible through /s/:slug` were present in `/tmp/rox-share-smoke.html`.
  - browser-visible proof: `open https://rox-share-smoke.t/s/rox-share-smoke-20260616-mqg3da8s` exited 0 and opened the verified local portless URL in the default browser.

## Automated Verification

- `bunx @biomejs/biome@2.4.2 check --write --unsafe <touched share files>`: passed, 13 files, no fixes.
- `bun test packages/trpc/src/router/share/share.test.ts`: passed, 11 tests, 23 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts`: passed, 8 tests, 13 expects.
- `bun test apps/desktop/src/renderer/routes/_authenticated/settings/shares/components/SharesSettings/share-artifacts.test.ts`: passed, 3 tests, 5 expects.
- `bun run generate:routes` from `apps/desktop`: passed.
- `bun run typecheck` from `packages/trpc`: passed.
- `bun run typecheck` from `apps/web`: passed.
- `bun run typecheck` from `apps/desktop`: passed.
- `bun run lint` from repo root: passed, 5044 files, no fixes.

## Remaining Blockers

- #27, #28, #29, #30, and #32 still require their own lane receipts and PRs.
- #34/#35 remain gated until billing interfaces stabilize.
- This lane did not run full `bun test` or `bun run build`; those are reserved for the final integration train gate after all lane PRs settle.
- Local DB migrations were applied only to the per-worktree Docker database. No production database or remote deployment was touched.
