# Foreign Branch Inventory — 2026-06-11

_Stream D deliverable of
[the finish-line plan](./2026-06-11-repo-green-and-motion-frame-finish.md).
Read-only audit (local git, refs as of 2026-06-11); merging any branch below
is an owner decision. Excludes `main` and the merged session branches._

## Summary table

| Branch | Ahead/Behind | Last commit | Conflicts | Recommendation |
|--------|---|---|---|---|
| claude/agents-catalog-bundle | 1 / 0 | 2026-06-11 | clean | MERGE-CANDIDATE |
| claude/billing-remove-paywall | 2 / 0 | 2026-06-11 | clean | MERGE-CANDIDATE |
| claude/bootstrap-presets | 27 / 1 | 2026-06-11 | clean | NEEDS-OWNER-REVIEW |
| claude/dvnet-topup-client | 28 / 1 | 2026-06-11 | clean | NEEDS-OWNER-REVIEW |
| claude/eager-meitner-K6A5C | 17 / 47 | 2026-06-09 | conflicts | REFRESH-FIRST |
| claude/execution-circuit-core | 1 / 19 | 2026-06-08 | clean | MERGE-CANDIDATE |
| claude/integr-github-provider | 28 / 1 | 2026-06-11 | clean | NEEDS-OWNER-REVIEW |
| claude/integr-linear-provider | 1 / 0 | 2026-06-11 | clean | MERGE-CANDIDATE |
| claude/keen-feynman-o2qcpb | 7 / 19 | 2026-06-08 | clean | MERGE-CANDIDATE |
| claude/local-only-auth | 1 / 19 | 2026-06-08 | clean | MERGE-CANDIDATE |
| claude/openpanel-renderer-sdk | 1 / 0 | 2026-06-11 | clean | MERGE-CANDIDATE |
| claude/sharp-fermat-sqcc84 | 34 / 0 | 2026-06-11 | clean | NEEDS-OWNER-REVIEW |
| claude/stoic-carson-z5vnbf | 27 / 1 | 2026-06-11 | clean | NEEDS-OWNER-REVIEW |
| cursor/fix-dev-password-8574 | 2 / 19 | 2026-06-09 | clean | MERGE-CANDIDATE |
| cursor/tailscale-serve-8574 | 4 / 19 | 2026-06-09 | clean | MERGE-CANDIDATE |
| epics/wave | 23 / 20 | 2026-06-08 | conflicts | REFRESH-FIRST |
| execution-circuit-mvp | 1 / 52 | 2026-06-07 | conflicts | REFRESH-FIRST |
| feat/automation-fabric | 0 / 55 | 2026-06-06 | clean | CLOSE |
| feat/motion-animations | 0 / 34 | 2026-06-07 | clean | CLOSE |
| fix-daemonclient-typecheck | 1 / 52 | 2026-06-07 | clean | MERGE-CANDIDATE |
| fix/electron-dialog-mock-leak | 1 / 1 | 2026-06-11 | clean | CLOSE (landed via #59/#60) |
| fix/web-auth-private-preview | 2 / 33 | 2026-06-08 | conflicts | REFRESH-FIRST |
| port-old-delta-to-set-verify | 5 / 52 | 2026-06-07 | conflicts | REFRESH-FIRST |
| rebrand/rox | 0 / 53 | 2026-06-07 | clean | CLOSE |
| refactor/audit-2026-06 | 12 / 67 | 2026-06-06 | conflicts | REFRESH-FIRST |
| rox-i18n-vibe | 0 / 13 | 2026-06-10 | clean | CLOSE |
| rox-rebrand-auth | 19 / 52 | 2026-06-10 | conflicts | REFRESH-FIRST |
| rox/cloud-dev-env-docs-5046 | 4 / 19 | 2026-06-09 | clean | MERGE-CANDIDATE |
| sim | 0 / 54 | 2026-06-06 | clean | CLOSE |

## Takeaways

- **11 MERGE-CANDIDATE** branches are small, fresh, conflict-free and could
  land with a quick review each.
- **6 CLOSE** branches carry nothing main doesn't already have (0 ahead, or
  landed via another PR) — safe to delete.
- **7 REFRESH-FIRST** branches have real content but conflict with `main` —
  rebase before considering.
- **5 NEEDS-OWNER-REVIEW** branches are large active epics (payments, top-up,
  integrations, money core) — all touched on 2026-06-11, so coordinate with
  their authors before any action.
