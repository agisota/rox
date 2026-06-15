# Ouroboros/Codex release-state reconciliation pattern

Use this reference when a repo task uses Ouroboros/Codex to plan or execute a docs-only release/state reconciliation while the worktree already has local runtime artifacts.

## Pattern

1. Inspect live repo state first:
   - `git status --short --branch`
   - relevant task surface (`mise tasks`, then `package.json` scripts if no mise tasks exist)
   - presence of generated helper files and durable artifact copies.
2. Run the external agent in read-only mode for planning:
   - save prompt under `.ouroboros/requests/`
   - save output under `.ouroboros/outputs/`
   - record line count and SHA256.
3. If a root-level seed/helper file exists only because a tool needed a path near the target project, delete the root copy after confirming a durable copy exists under `.ouroboros/seeds/`.
4. Run baseline validation with existing repo scripts before editing, logging output under `.ouroboros/logs/`.
5. For docs-only reconciliation, run red/stale checks before edits. Example checks:
   - stale status grep: `rg -n "^Status: (IN PROGRESS|READY_TO_COMMIT)" <ticket files>`
   - stale commit-evidence grep: `rg -n "Commit exists \\| (Pending|PENDING)|Scoped Lore commit exists \\| (Pending|PENDING)" <worklog files>`
6. Apply a narrow docs-only patch: ticket/worklog metadata, release docs, and a worklog entry recording exact evidence.
7. Re-run the stale greps after edits. Empty output with `rg exit 1` means PASS for a no-match check.
8. Run `bun run validate:docs`, `git diff --check`, and `git status --short --branch` before claiming completion.
9. Do not stage runtime artifacts by default:
   - `.ouroboros/`
   - `.claude/`
   - `events.jsonl`
   - generated logs/seeds/temporary helper copies.

## Why this matters

Ouroboros/Codex workflows often leave useful evidence next to the repo. That evidence should be preserved for auditability but should not silently pollute the source commit. The final answer must distinguish verified source/docs changes from local/generated artifacts and user-owned dirty files.

## Commit boundary rule

If a prior ticket (for example `T094`) is already dirty and the current ticket (`T095`) adds a new reconciliation layer, keep the commit boundary explicit: either commit the prior ticket first or state that the current patch is uncommitted and must be staged selectively.
