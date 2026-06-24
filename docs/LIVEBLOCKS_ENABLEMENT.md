# LIVEBLOCKS_ENABLEMENT Runbook

**Task:** FN-021  
**Date:** 2026-06-24  
**Owner:** agisota  
**Status:** Production enablement runbook

---

## Prerequisites

- Infisical access (`infisical secrets list --env=prod`)
- `LIVEBLOCKS_SECRET_KEY` already rotated and stored in Infisical under `prod` environment
- `NEXT_PUBLIC_LIVEBLOCKS_ENABLED=true` flag deployed via existing feature-flag mechanism

---

## Production Deploy Sequence

1. Pull latest `main`
2. Verify no pending migrations: `bunx drizzle-kit status`
3. Build: `bun run build`
4. Deploy (platform-specific):
   - Web: `bunx turbo run deploy --filter=@rox/web`
   - API: `bunx turbo run deploy --filter=@rox/api`
5. Confirm both services report healthy (HTTP 200 on `/api/health`)

---

## Two-Client Smoke-Test Procedure

**Goal:** Verify Liveblocks presence + cursor sync + calendar card collaboration.

1. Open two independent browser sessions (Incognito + normal, or two different browsers).
2. Log in as two different users on `https://app.rox.one`.
3. Navigate both users to the same calendar view containing a shared card.
4. Verify:
   - Presence avatars appear for both users.
   - Cursor/selection indicators sync in real time.
   - Concurrent edits on a calendar card are reflected on the other client within <1s.

If any check fails → trigger rollback (see below).

---

## Flag Behavior Matrix

| `NEXT_PUBLIC_LIVEBLOCKS_ENABLED` | Expected Behavior |
|----------------------------------|-------------------|
| `true`                           | Live cursors, presence, and real-time card sync active |
| `false`                          | All Liveblocks features disabled; UI falls back to static mode; no network calls to Liveblocks |

---

## Rollback Steps

1. Unset `LIVEBLOCKS_SECRET_KEY` in Infisical (prod env) OR flip `NEXT_PUBLIC_LIVEBLOCKS_ENABLED=false`.
2. Redeploy affected services (`bunx turbo run deploy --filter=@rox/web --filter=@rox/api`).
3. Re-run two-client smoke-test to confirm Liveblocks features are disabled.
4. Monitor logs for absence of `liveblocks` connection errors.

---

## Health-Check Endpoints & Logs

- `/api/health` → must return `{ "status": "ok", "liveblocks": "connected|disabled" }`
- Watch logs for:
  - `liveblocks: connected`
  - `liveblocks: disabled (flag=false)`
  - Any `LiveblocksError` or 401/403 on Liveblocks endpoints → immediate rollback trigger

---

*End of runbook*