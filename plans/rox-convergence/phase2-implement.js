// phase2-implement.js
// Rox Convergence — Phase 2 parallel implementation driver (Claude Code workflow dialect).
//
// Runs the 15 workstreams (WS-A..WS-O) in three waves (P0 -> P1 -> P2). Within a
// wave, independent workstreams run concurrently via parallel(); each agent gets
// its OWN git worktree (opts.isolation: "worktree") so parallel writes never
// collide. After each wave, a single verify agent confirms the wave's PRs are
// lint/typecheck/build green before the next wave starts.
//
// Ordering for shared/append-only files is encoded via wave membership + an
// explicit `after` note baked into each prompt (schema before consumers; Stripe
// consumer removal before the table drop; root.ts order WS-E -> WS-J -> WS-L;
// app.ts/router.ts integrate-last via WS-D after WS-B; serialized drizzle generate).
//
// Run:  odw run plans/rox-convergence/phase2-implement.js --wait
//   or: odw run plans/rox-convergence/phase2-implement.js --args '{"waves":["P0"]}'

export const meta = {
  name: 'rox-convergence-phase2',
  description:
    'Implement the 15 convergence workstreams in P0->P1->P2 waves, one isolated worktree + one PR per workstream, with a verify gate between waves.',
  phases: [
    { title: 'P0 implement' },
    { title: 'P0 verify' },
    { title: 'P1 implement' },
    { title: 'P1 verify' },
    { title: 'P2 implement' },
    { title: 'P2 verify' },
  ],
}

// ---------------------------------------------------------------------------
// Workstream definitions. `wave` selects P0/P1/P2 membership. `deps` documents
// the cross-workstream sequencing the executor must honor (encoded into the
// prompt so a worktree agent knows what must already be merged). `seq` (optional)
// forces a within-wave dependency: that workstream waits for the named ones to
// finish in this same wave before it dispatches.
// ---------------------------------------------------------------------------
const WORKSTREADS = [
  // ----- P0: foundation -----
  {
    id: 'WS-O',
    wave: 'P0',
    title: 'Org schema: skill libraries, dashboards, per-user feature-flag overrides + integration cleanup',
    branch: 'ws-o/org-schema-libraries-dashboards-flags',
    deps: 'Blocks WS-J / WS-F / WS-E schema work. Author tables only; run `bunx drizzle-kit generate` (OFFLINE) — NEVER migrate/push. Include the grant/bonus ledger enum value in enums.ts that WS-E/WS-F need.',
  },
  {
    id: 'WS-A',
    wave: 'P0',
    title: 'Desktop UI inventory & screen decomposition (docs only)',
    branch: 't/ws-a-desktop-ui-inventory',
    deps: 'Pure docs under plans/rox-convergence/inventory/**. No source edits.',
  },
  {
    id: 'WS-B',
    wave: 'P0',
    title: 'Hybrid host: freeze HostClient contract (T1), RelayTransport (T2), uniform (agents) gate / 404 fix (T6)',
    branch: 'feat/ws-b-hybrid-host-web-convergence',
    deps: 'P0 scope = T1 (FREEZE packages/shared/src/host-client/** contract first), T2, T6 ONLY. Do not bind the cabinet to real hosts yet (that is P1). app.ts edits are append-only/integrate-last.',
  },
  {
    id: 'WS-C',
    wave: 'P0',
    title: 'Relay P0: shared JWT verify (C1), declarative electric scoping (C2), cache-isolation test (C3)',
    branch: 'ws-c/relay-remote-hosts-productization',
    deps: 'P0 scope = C1/C2/C3 only. Owns apps/relay/**, apps/electric-proxy/**, packages/host-service/src/tunnel/**, new packages/shared/src/jwt-verify.ts.',
  },
  {
    id: 'WS-E',
    wave: 'P0',
    title: 'Economy P0: toLedgerKind (T1), settlement service (T2), balance/ledger/usage router (T3), admin grant (T6), tier decouple (T9)',
    branch: 'feat/ws-e-economy-router',
    deps: 'P0 scope = T1,T2,T3,T6,T9. Register `economy` in packages/trpc/src/root.ts (append-only, root.ts order is WS-E then WS-J then WS-L). Use the WS-O grant/bonus enum value for admin grant. NO Stripe removal in P0.',
  },
  {
    id: 'WS-G',
    wave: 'P0',
    title: 'Mobile light-up: Tasks list/detail + Workspaces list/detail on live Electric collections (T1-T6)',
    branch: 'ws-g/mobile-tasks-workspaces-lightup',
    deps: 'P0 scope = T1-T6 (no v2Workspaces collection yet). collections.ts edits additive only.',
  },
  {
    id: 'WS-J',
    wave: 'P0',
    title: 'MCP v2 P0: point seeded agents at v2 (T1), proxy degradation visibility (T7)',
    branch: 'feat/ws-j-mcp-v2-org-collaboration',
    deps: 'P0 scope = T1 (host-service setup-mcp.ts seed cutover) + T7 (proxy-tools degradation). No new routers/tables in P0.',
  },
  {
    id: 'WS-K',
    wave: 'P0',
    title: 'Chat: add .codex/commands as a slash-command source (+ workflow-core gap memo)',
    branch: 'ws-k/chat-codex-slash-source',
    deps: 'Self-contained: three files under packages/chat/src/server/desktop/slash-commands/. NOTE: CORE_BLOCKS is 12 (not 13); 6 of 7 classifyCard types are non-core.',
  },
  {
    id: 'WS-H',
    wave: 'P0',
    title: 'Docs P0: self-host, security, economy sections (RU) describing shipped code',
    branch: 'docs/convergence-coverage-ws-h',
    deps: 'P0 scope = self-host + security + economy MDX. STARTING_BALANCE_ROX lives in packages/shared/src/rox-pricing.ts (not economy.ts). Do NOT use <Collapsible>/<AsideLink> in MDX (unregistered).',
  },
  {
    id: 'WS-L',
    wave: 'P0',
    title: 'Collab/RTC P0: motion doc+contract test, @rox/collab + @rox/rtc scaffolds, PresenceStack (T1,T2,T3,T6,T9)',
    branch: 'feat/ws-l-collab-rtc-motion-language',
    deps: 'P0 scope = T1,T2,T3,T6,T9. REUSE existing experimental-features keys (LIVEBLOCKS_SECRET_KEY, NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY, LIVEKIT_API_KEY/SECRET, NEXT_PUBLIC_LIVEKIT_URL) — they already exist; do not invent new ones. @rox/collab env uses the dependency-light read() pattern, not createEnv.',
  },
  {
    id: 'WS-D-pkg',
    wave: 'P0',
    title: 'Agent-state package: scaffold @rox/agent-state core/host/client/sync/claims (T1-T6, isolated, no host-service edits)',
    branch: 'feat/ws-d-agent-state-turso-cross-host',
    deps: 'P0 scope = the standalone @rox/agent-state package (T1-T6) only. libSQL migrations under packages/agent-state/drizzle/ (NOT packages/db/drizzle). Host-service integration (T7/T8) is P1.',
  },

  // ----- P1: host attach + product wiring -----
  {
    id: 'WS-B-p1',
    wave: 'P1',
    title: 'Hybrid host P1: bind agents cabinet to real local-host attach (T3,T4,T5) + continue-on-desktop deep-link (T8)',
    branch: 'feat/ws-b-hybrid-host-web-convergence',
    deps: 'Requires WS-C/WS-D host procedures. Reuse the frozen HostClient contract from P0. app.ts is append-only/integrate-last (WS-D integrates after you).',
  },
  {
    id: 'WS-C-p1',
    wave: 'P1',
    title: 'Relay P1: sandbox_images threading (C4), managed-host relay dial (C5), streaming pass-through (C6)',
    branch: 'ws-c/relay-remote-hosts-productization',
    deps: 'C5 needs a bootstrap-token design (coordinate WS-B). C6 lands tunnel-protocol.ts streaming change first, then relay, then host.',
  },
  {
    id: 'WS-D-p1',
    wave: 'P1',
    title: 'Agent-state host-service seam: runtime manager (T7), tRPC router (T8), real claim path (T6)',
    branch: 'feat/ws-d-agent-state-turso-cross-host',
    deps: 'Edits packages/host-service/src/app.ts + trpc/router/router.ts APPEND-ONLY, integrate AFTER WS-B P1. Claim path behind a ClaimTransport stub if WS-C claim proc not yet merged.',
  },
  {
    id: 'WS-E-p1',
    wave: 'P1',
    title: 'Economy P1: topup (T4), dv.net webhook (T5), model catalog sync (T7), accountOverview migrate (T8), Stripe removal (T10)',
    branch: 'feat/ws-e-topup-webhook-stripe-removal',
    deps: 'STRICT ORDER: do the Stripe CONSUMER removal (integration/utils.ts verifyOrgMembershipWithSubscription, utils/active-org.ts requireActiveOrgMembershipWithSubscription, membership.ts, billing.ts) — reuse the EXISTING findOrgMembership at membership.ts:8. WS-O drops the subscriptions table separately AFTER your consumer edits merge. Serialize your drizzle generate AFTER WS-O org-tables generate.',
    seq: ['WS-O'],
  },
  {
    id: 'WS-F-p1',
    wave: 'P1',
    title: 'Admin P1: per-user drilldown + flag toggle (T5) + bonus topup wiring (T6) + real revenue (T9)',
    branch: 'ws-f/admin-expansion',
    deps: 'T5 needs WS-O user_feature_flags table + resolveUserFlag/upsertUserFlagOverride. T6 calls WS-E economy.admin.grant. T9: MANDATORY extract getRevenueTrend into a WS-F helper so analytics.ts edit is a single import+call swap (sequence after WS-E so roxTopups reads exist).',
    seq: ['WS-O', 'WS-E-p1'],
  },
  {
    id: 'WS-J-p1',
    wave: 'P1',
    title: 'MCP v2 P1: skillLibrary router (T2), dashboard router (T3), mcpAdmin introspection (T6)',
    branch: 'feat/ws-j-mcp-v2-org-collaboration',
    deps: 'Requires WS-O tables (skill_libraries*, dashboards*, dashboard_section_kind enum). Use the requireActiveOrgMembership pattern (skill router), NOT agentSource verifyOrgMembership. Register routers in root.ts append-only (order: after WS-E).',
    seq: ['WS-O'],
  },
  {
    id: 'WS-I-p1',
    wave: 'P1',
    title: 'Email: translate all 12 @rox/email templates to RU + deprecate Stripe billing emails',
    branch: 'ws-i/email-ru-translation-refresh',
    deps: 'Leaf package packages/email/**. Render-smoke test MUST set NEXT_PUBLIC_MARKETING_URL before importing templates (env throws at module-eval otherwise). Deprecate-only for billing emails (WS-E owns no top-up email).',
  },
  {
    id: 'WS-N-p1',
    wave: 'P1',
    title: 'Infra polish: aerial video wallpapers (N1-N5), NETWORK_FILTER flag shell (N6-N7), per-branch browser history (N9-N11)',
    branch: 't/ws-n-infra-polish-aerials-netfilter-branchbrowser',
    deps: 'WS-N lands the FEATURE_FLAGS key add in constants.ts (coordinate WS-F/WS-O). Per-branch browserHistory needs a COMPOSITE (url, workspaceId) unique, not just a nullable column. browser-history hooks live under BrowserToolbar/hooks in v1 AND v2 trees.',
  },
  {
    id: 'WS-L-p1',
    wave: 'P1',
    title: 'Collab/RTC P1: server auth helper (T4), collab.authRoom + rtc.token tRPC routers (T5/T7), web env keys (T8)',
    branch: 'feat/ws-l-collab-rtc-motion-language',
    deps: 'Routers live in packages/trpc/src/router/{collab,rtc}/** (NOT apps/api). Register in root.ts append-only (order: AFTER WS-E and WS-J). apps/web/src/env.ts keys additive (after WS-B). Wire to the EXISTING experimental-features gate.',
    seq: ['WS-E-p1', 'WS-J-p1'],
  },
  {
    id: 'WS-G-p1',
    wave: 'P1',
    title: 'Mobile P1: add v2Workspaces Electric collection (T7) + task create/edit (T8)',
    branch: 'ws-g/mobile-tasks-workspaces-lightup',
    deps: 'collections.ts additive only. v2_workspaces (not legacy workspaces) is the target shape.',
  },
  {
    id: 'WS-H-p1',
    wave: 'P1',
    title: 'Docs P1: platform/* (web-app, hybrid-host, cloud-hosts, mobile) + api/overview + SDK-mirrored API domains',
    branch: 'docs/convergence-coverage-ws-h',
    deps: 'Author after the corresponding impl PRs merge so docs match shipped behavior. Router count is 38.',
  },

  // ----- P2: polish + advanced -----
  {
    id: 'WS-B-p2',
    wave: 'P2',
    title: 'Hybrid host P2: sandbox-backed hosts in the cabinet + Turso cross-host agent-state surfacing',
    branch: 'feat/ws-b-hybrid-host-web-convergence',
    deps: 'Needs WS-C provisioner + sandbox_images build (P1) and WS-D agent-state tRPC (P1).',
  },
  {
    id: 'WS-C-p2',
    wave: 'P2',
    title: 'Relay P2: admin/metrics endpoints (C7), optional direct-endpoint connect (C8)',
    branch: 'ws-c/relay-remote-hosts-productization',
    deps: 'Standalone (C7) + C8 depends on C5 resolver.',
  },
  {
    id: 'WS-D-p2',
    wave: 'P2',
    title: 'Agent-state P2: async libSQL TanStack-DB collection adapter (swap point documented in T9)',
    branch: 'feat/ws-d-agent-state-turso-cross-host',
    deps: 'Enhancer; desktop already ships @tanstack/db. Keep host API swappable without renderer churn.',
  },
  {
    id: 'WS-E-p2',
    wave: 'P2',
    title: 'Economy P2: settlement/reconciliation poll job + metering call-site integration with host WS',
    branch: 'feat/ws-e-topup-webhook-stripe-removal',
    deps: 'Metering call-site is a thin hook the host WS adds; WS-E owns settleRequest.',
  },
  {
    id: 'WS-J-p2',
    wave: 'P2',
    title: 'MCP v2 P2: native MCP read tools for skill libraries (T4) + dashboard (T5), v1 parity/freeze (T8)',
    branch: 'feat/ws-j-mcp-v2-org-collaboration',
    deps: 'Depend on WS-J P1 routers (T2/T3).',
    seq: ['WS-J-p1'],
  },
  {
    id: 'WS-L-p2',
    wave: 'P1',
    title: 'Collab/RTC: mount LiveBlocks presence on the web dashboard surface (T10) — moved to P1 per D3 (do BOTH LiveBlocks + LiveKit now)',
    branch: 'feat/ws-l-collab-rtc-motion-language',
    deps: 'Per D3 (DECISIONS.md): LiveBlocks + LiveKit ship now, not P2. Depends on WS-J P1 dashboard router; if the dashboard surface is not ready, land the RoxRoomProvider + PresenceStack wrapper behind the EXISTING experimental-features gate so it is inert until the surface exists. Routers in packages/trpc/src/router/{collab,rtc}/**, registered in root.ts after WS-E and WS-J.',
    seq: ['WS-J-p1', 'WS-L-p1'],
  },
  {
    id: 'WS-M',
    wave: 'P2',
    title: 'SDK/CLI explainer + MIRROR.md + parity guardrail test + version single-sourcing',
    branch: 'docs/ws-m-sdk-cli-explainer-roadmap',
    deps: 'MIRROR rows: agents.create maps to tRPC agents.run (not agents.create); workspaces.update/list are DIRECT not relay. Land parity test after first convergence procedures so it encodes the real surface.',
  },
  {
    id: 'WS-H-p2',
    wave: 'P2',
    title: 'Docs P2: remaining API domains + thin-page backfill (cli/env-vars, browser, overview) + mcp-tools catalog',
    branch: 'docs/convergence-coverage-ws-h',
    deps: 'Integrations page must cover all 7 providers, not just discord.',
  },
  {
    id: 'WS-F-p2',
    wave: 'P2',
    title: 'Admin P2: lightweight admin audit trail (T10, coordinate WS-O)',
    branch: 'ws-f/admin-expansion',
    deps: 'If WS-O ships admin_audit, wire deleteUser/setUserFlag/topup to append; else leave a one-line seam.',
  },
]

// ---------------------------------------------------------------------------
// Prompt builder — every worktree agent gets the same concrete contract.
// ---------------------------------------------------------------------------
const SPEC_DIR = 'plans/rox-convergence'

function implementPrompt(ws) {
  return [
    `You are implementing convergence workstream ${ws.id} (${ws.wave}): ${ws.title}.`,
    ``,
    `READ FIRST, then follow exactly (read DECISIONS.md before your spec — where they disagree, DECISIONS.md WINS):`,
    `  - ${SPEC_DIR}/DECISIONS.md  (the 8 resolved owner/technical forks D1-D8 — OBEY these alongside your spec; your spec's "### Decision updates" note maps which decisions touch you)`,
    `  - ${SPEC_DIR}/${ws.id.replace(/-p\d$|-pkg$/, '')}-spec.md  (sections 3 = tasks, 4 = file ownership)`,
    `  - ${SPEC_DIR}/MASTER-PLAN.md  (the consolidated file-ownership matrix + merge protocol — your merge-safety contract)`,
    ``,
    `Sequencing for this workstream: ${ws.deps}`,
    ``,
    `HARD RULES:`,
    `  1. Modify ONLY files in your spec's section-4 ownership list. Treat every shared/append-only file (packages/trpc/src/root.ts, packages/host-service/src/app.ts + router.ts, apps/web/src/env.ts, packages/shared/src/constants.ts FEATURE_FLAGS, apps/mobile/lib/collections/collections.ts, apps/docs/content/docs/meta.json) as APPEND-ONLY single-line hunks — do not refactor or reorder them.`,
    `  2. Follow TDD: write/extend tests first, then implement until green.`,
    `  3. NEVER run \`drizzle-kit migrate\` or \`drizzle-kit push\`. \`bunx drizzle-kit generate\` (offline) is allowed only if your spec says so; never hand-edit packages/db/drizzle/**.`,
    `  4. Next.js 16: use proxy.ts, never middleware.ts. Bun only (no npm/yarn/pnpm).`,
    ``,
    `VERIFY before committing (all must pass):`,
    `  - bun run lint < /dev/null     (stdin MUST be redirected or rg hangs; CI treats warnings as errors)`,
    `  - bun run typecheck`,
    `  - the bun test target(s) named in your spec (e.g. \`bun test <your package/path>\`)`,
    ``,
    `THEN: commit your changes, push the branch \`${ws.branch}\`, and open ONE pull request via the gh CLI using the spec's exact PR title (spec section 6). The PR body must list the files you changed and confirm lint/typecheck/test are green. Output the PR URL.`,
  ].join('\n')
}

function verifyPrompt(wave, ids) {
  return [
    `You are the ${wave} verification gate for the Rox convergence Phase 2.`,
    `The following workstreams just opened PRs in this wave: ${ids.join(', ')}.`,
    ``,
    `For the current repository state, confirm the wave is green before the next wave starts:`,
    `  1. Run \`bun run lint < /dev/null\` and report any output (CI fails on warnings).`,
    `  2. Run \`bun run typecheck\` and report failures with file:line.`,
    `  3. Run \`bun run build\` (or \`bunx turbo run build\`) and report failures.`,
    `  4. Sanity-check the merge contract: verify no two ${wave} workstreams wrote the same non-append-only file, and that append-only shared files (packages/trpc/src/root.ts, packages/host-service/src/app.ts, packages/host-service/src/trpc/router/router.ts, apps/web/src/env.ts, packages/shared/src/constants.ts) contain only additive hunks.`,
    ``,
    `Return a concise PASS/FAIL verdict per check with evidence. If FAIL, name the exact workstream + file + error so it can be fixed before the next wave.`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Wave runner. Honors within-wave `seq` dependencies: a workstream with `seq`
// waits for those ids to finish in this wave first, then dispatches. Everything
// without unmet seq deps runs concurrently.
// ---------------------------------------------------------------------------
const ONLY_IDS =
  args && Array.isArray(args.only) && args.only.length > 0 ? new Set(args.only) : null

async function runWave(wave, phaseTitle) {
  const inWave = WORKSTREADS.filter(
    (w) => w.wave === wave && (!ONLY_IDS || ONLY_IDS.has(w.id)),
  )
  if (inWave.length === 0) return { wave, prs: [] }

  phase(phaseTitle)
  log(`${wave}: dispatching ${inWave.length} workstreams (isolated worktrees)`) // progress

  const idsInWave = new Set(inWave.map((w) => w.id))
  const done = {} // id -> result
  let remaining = inWave.slice()

  // Drain in rounds: each round runs every workstream whose in-wave seq deps are
  // satisfied. Reduction is order-independent (we key results by id), preserving
  // determinism per the dialect's rule.
  while (remaining.length > 0) {
    const ready = remaining.filter((w) =>
      (w.seq || []).every((dep) => !idsInWave.has(dep) || done[dep] !== undefined),
    )
    if (ready.length === 0) {
      log(`${wave}: WARNING unmet within-wave deps for ${remaining.map((w) => w.id).join(', ')} — dispatching anyway`)
      ready.push(...remaining)
    }

    const results = await parallel(
      ready.map((w) => () =>
        agent(implementPrompt(w), {
          label: `${w.id} (${wave})`,
          phase: phaseTitle,
          isolation: 'worktree',
        }),
      ),
    )

    ready.forEach((w, i) => {
      done[w.id] = results[i] === undefined ? null : results[i]
    })
    const readyIds = new Set(ready.map((w) => w.id))
    remaining = remaining.filter((w) => !readyIds.has(w.id))
  }

  return {
    wave,
    prs: inWave.map((w) => ({ id: w.id, branch: w.branch, result: done[w.id] })),
  }
}

async function verifyWave(wave, phaseTitle, prs) {
  if (prs.length === 0) return { wave, verdict: 'SKIP (no workstreams)' }
  phase(phaseTitle)
  const verdict = await agent(verifyPrompt(wave, prs.map((p) => p.id)), {
    label: `${wave} verify`,
    phase: phaseTitle,
    isolation: 'worktree',
  })
  return { wave, verdict }
}

// ---------------------------------------------------------------------------
// Driver: P0 implement -> P0 verify -> P1 -> P1 verify -> P2 -> P2 verify.
// `args.waves` (e.g. ["P0"]) optionally restricts which waves run.
// ---------------------------------------------------------------------------
const wantWaves =
  args && Array.isArray(args.waves) && args.waves.length > 0
    ? new Set(args.waves)
    : new Set(['P0', 'P1', 'P2'])

const summary = { waves: [] }

for (const [implPhase, verifyPhase, wave] of [
  ['P0 implement', 'P0 verify', 'P0'],
  ['P1 implement', 'P1 verify', 'P1'],
  ['P2 implement', 'P2 verify', 'P2'],
]) {
  if (!wantWaves.has(wave)) continue

  const impl = await runWave(wave, implPhase)
  const verify = await verifyWave(wave, verifyPhase, impl.prs)
  summary.waves.push({
    wave,
    workstreams: impl.prs.map((p) => ({ id: p.id, branch: p.branch })),
    verify: verify.verdict,
  })
  log(`${wave} complete — verdict captured. Proceeding only if green.`)
}

return summary
