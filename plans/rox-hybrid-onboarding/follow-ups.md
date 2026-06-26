# Rox Hybrid Onboarding Follow-ups

Status: TRACKED
Owner: release follow-up

These items are intentionally outside PR #785. They must be handled in their
matching release or product slices instead of being buried in the integration
receipt.

## Production Migration

- Apply `packages/db/drizzle/0113_add_onboarding_progress.sql` through the normal
  release migration path.
- Verify `auth.users.onboarding_progress` exists before enabling persisted
  onboarding progress in production.

## First Agent Completion Signal

- Replace the explicit confirmation fallback on `/onboarding/first-agent-action`
  with a real first successful agent-run completion signal.
- Keep the manual confirmation as a temporary fallback only until that signal is
  shipped.

## Workspace Creation Callback

- Add a workspace creation modal callback that returns the exact new
  `workspaceId`.
- Use that callback to persist activation progress from the modal path, not only
  from the onboarding page flow.
