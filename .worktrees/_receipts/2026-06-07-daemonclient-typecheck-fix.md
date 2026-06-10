# DaemonClient Typecheck Fix Receipt

Date: 2026-06-07

## Scope

Worktree:
- Path: `/Users/marklindgreen/Projects/set-for-projects/set/.worktrees/daemonclient-typecheck-fix`
- Branch: `fix-daemonclient-typecheck`
- Base: `origin/main` at `f76b58c5c976c283a241207f0dc0e9ca2228ed34`

Commit:

```text
05ed5f179 Normalize daemon socket chunks before decoding
```

## Change

File:
- `packages/host-service/src/terminal/DaemonClient/DaemonClient.ts`

Patch summary:
- Normalize `net.Socket` `"data"` chunks with `Buffer.from(chunk)` before passing them to `DaemonClient.onData`.
- Keep `FrameDecoder` binary-only; the decoder still receives `Buffer` and continues to parse length-prefixed daemon protocol frames with `readUInt32BE`.

Reason:
- TypeScript stream typings allow `"data"` chunks to be `string | NonSharedBuffer`.
- `FrameDecoder.push` expects `Buffer`.
- Full repo typecheck previously failed at:
  `../host-service/src/terminal/DaemonClient/DaemonClient.ts(86,44): error TS2345`.

## Verification

Passed:

```text
bunx turbo typecheck --filter=@superset/workspace-client --filter=@superset/host-service
bun run lint
bun run typecheck
```

Full typecheck result:

```text
Tasks: 31 successful, 31 total
Cached: 10 cached, 31 total
Time: 1m17.963s
```

## Environment Notes

The first `bun install` in this new worktree failed during native rebuild because the host filesystem was nearly full:

```text
No space left on device
```

Recovery:
- Removed only the new worktree's partial `node_modules`.
- Symlinked `node_modules` to the sibling verified worktree:
  `../port-old-delta-to-set-verify/node_modules`

No source files outside `DaemonClient.ts` were changed.

## Remaining Gap

Runtime daemon socket E2E was not run after this one-line type normalization. Type-level proof is strong, but a daemon E2E smoke is still useful before release.

## Stack Status

This commit is now also stacked into:

```text
port-old-delta-to-set-verify
```

The old-delta stacked branch passed full typecheck after including this fix:

```text
Tasks: 31 successful, 31 total
Cached: 25 cached, 31 total
Time: 36.708s
```

## PR-ready Summary

Title:

```text
Fix daemon socket chunk type for full typecheck
```

Body:

```text
## Summary
- normalizes DaemonClient net.Socket data chunks with Buffer.from before frame decoding
- keeps FrameDecoder binary-only for the length-prefixed daemon protocol
- fixes the baseline TS2345 blocker in workspace-client/host-service typecheck

## Verification
- bunx turbo typecheck --filter=@superset/workspace-client --filter=@superset/host-service
- bun run lint
- bun run typecheck

## Notes
- no runtime behavior change is expected for binary socket chunks
- daemon socket E2E smoke was not run
```
