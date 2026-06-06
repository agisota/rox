# Design — Capability-port slice 1: Agents-as-entities + Sources + Policies into Superset

> Status: **approved (design)** · Date: 2026-05-29 · Owner: agisota
> Repo: `superset-sh/superset` @ `main` · Spec home: `agentic-pipeline/instances/superset/`
> Source analysis: [`../UNDERSTAND.md`](../UNDERSTAND.md) · Plan: [`../integration-plan.json`](../integration-plan.json)

## 0. Locked decisions (from brainstorm 2026-05-29)

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Единица интеграции (дом) | **Superset = хаб-оболочка**; second/alook живут внутри него |
| Q2 | Механизм интеграции | **D — порт возможностей в backend Superset, UI рисуем свой нативно** (никаких webview/iframe, никакого отдельного деплоя second/alook) |
| Q3 | Первый срез | **Агенты-как-сущности + источники-инструменты + permission-политики** (+ привязка скиллов) |
| Q4 | Дом UI | **Общий UI в `packages/ui`** — монтируется и в `apps/web`, и в `apps/desktop` с самого старта |

**Что это НЕ значит:** мы не встраиваем браузеры, не форкаем second/alook, не держим их как отдельные сервисы. Мы переносим их **модель и возможности** в backend Superset как референс и строим родной UI.

## 1. Problem / Why

Superset сегодня: агент — **эфемерная** сущность (terminal preset + chat session + `agentCommands`, синкаемые в executor через Electric). Нет долгоживущего «агента-сущности», нет реестра источников-инструментов (только `automations.mcpScope` jsonb), нет enforce-able прав на уровне tool-call. alook уже моделирует агента как first-class (`agent_runtime`, `agent_whitelist`, `channel`), craft — sources/MCP + permission-modes. Переносим эту модель, чтобы Superset-хаб получил: **долгоживущих агентов с инструментами под безопасными правами** — фундамент для срезов 2 (email/calendar) и 3 (app-building/review).

## 2. Goals / Non-goals

**Goals (slice 1):**
- `agent` как хранимая org-scoped сущность (имя, персона/prompt, defaultModel, статус), связанная с workspace/skill/source и с существующими `automations`/`chatSessions`.
- Реестр `sources` (MCP stdio/http/sse, API, local-folder) ≠ `integrationConnections`; их инвентарь инструментов и реальный health.
- `permission_policies/rules/decisions` с enforce **в момент tool-call** и аудитом решений; precedence org→project→workspace→source.
- `skills/skill_versions/skill_bindings` — версионируемые скиллы, привязка к агенту, требуемые источники.
- Нативный UI (shared в `packages/ui`): Agents, Sources (+health/tools), Policy editor (presets-first), Skills.
- **Runtime-config foundation:** endpoints конфигурируются в рантайме (убрать build-time привязку к `superset.sh`) — закладываем сразу.

**Non-goals (отложено):**
- Каналы достижимости агента (email/calendar/meetings) — срез 2 (из alook).
- App-building / review-gated publish / collaborators — срез 3 (из second).
- Webview/iframe-встраивание, отдельный деплой second/alook — исключено решением Q2.
- Десктоп-нативные модули ABI-переезд под продакшн — отдельный трек (см. Risks).

## 3. Architecture

```
                 ┌───────────────────────── Superset hub ─────────────────────────┐
 packages/ui ───▶│  Agents · Sources · Policies · Skills  (shared React, shadcn)   │
 (shared UI)     │        mounted in  apps/web   AND   apps/desktop                 │
                 └───────────────┬───────────────────────────────┬─────────────────┘
                                 │ tRPC (@superset/trpc)          │
                 ┌───────────────▼──────────────┐   ┌─────────────▼───────────────┐
                 │ apps/api (Next 16)            │   │ packages/host-service       │
                 │  agents/sources/policies tRPC │   │  RuntimeSourceAdapter:      │
                 │  policy resolution            │   │  test / listTools / callTool│
                 └───────────────┬──────────────┘   └─────────────┬───────────────┘
                                 │ Drizzle                        │ enforce policy @ call
                 ┌───────────────▼────────────────────────────────▼───────────────┐
                 │ packages/db  (Postgres + ElectricSQL)                            │
                 │  + agents, agent_bindings                                        │
                 │  + sources, source_tools, source_bindings, source_health_checks  │
                 │  + permission_policies, permission_rules, permission_decisions   │
                 │  + skills, skill_versions, skill_bindings                        │
                 └──────────────────────────────────────────────────────────────────┘
```

**Units (single-purpose, testable in isolation):**
1. `packages/db` schema additions — pure data contracts (+ relations + zod).
2. **Policy resolver** (pure fn): `(policies, context) → effectivePolicy`; precedence org→project→workspace→source. No I/O.
3. `RuntimeSourceAdapter` (host-service) — per-kind adapter; `callTool` consults policy; emits decisions.
4. **tRPC routers** (apps/api) — thin orchestration over db + host-service.
5. **Shared UI** (packages/ui) — presentational screens consuming tRPC; no business logic.

## 4. Data model (`packages/db/src/schema`)

All org-scoped, soft-delete for user-facing, UTC, UUID PK. Migrations via `drizzle-kit generate` only; **never hand-edit `packages/db/drizzle/`**.

| Table | Purpose | Key relations |
|---|---|---|
| `agents` | first-class agent: name, persona, defaultModel, status, createdBy | org, (optional) defaultWorkspace |
| `agent_bindings` | agent ↔ workspace / skill / source enablement | agent → target scope |
| `sources` | MCP/API/local source registry (≠ integrationConnections) | org, owner, optional host/project/workspace |
| `source_tools` | tool inventory per source | source, name, opType, schema, mutability |
| `source_bindings` | enable source for workspace/session/automation/agent | source → target scope |
| `source_health_checks` | tested state, latency, error, toolCount | source, host, ts |
| `permission_policies` | named policy (Explore/Safe/Ask/Allow/custom) | org/project/workspace/source scope |
| `permission_rules` | allow/block patterns (tool/api/bash/path) | policy, effect, pattern |
| `permission_decisions` | runtime decision audit | session/run/toolcall/user |
| `skills` | skill metadata/ownership | org/workspace/project |
| `skill_versions` | versioned instructions/refs (content hash) | skill |
| `skill_bindings` | enable skill for agent/workspace, required sources | skill → target scope |

**Reuse / wire into existing:** FK `automations.agent` (currently free `text`) → `agents.id` (migration-safe, nullable bridge first). Relate `agents` ↔ `chatSessions`/`agentCommands` so existing runtime keeps working. `sources` is explicitly distinct from `integrationConnections` (SaaS account) per UNDERSTAND §1.

## 5. Runtime

```ts
interface RuntimeSourceAdapter {
  test(): Promise<SourceHealth>                          // writes source_health_checks
  listTools(): Promise<SourceTool[]>                     // upserts source_tools
  callTool(req: ToolCall, policy: EffectivePolicy): Promise<ToolResult> // enforces + audits
}
```
- Adapters per kind: `mcp-stdio | mcp-http | mcp-sse | api | local-folder`, in `packages/host-service` (local MCP isolated, secrets via `secrets` table refs).
- **Enforcement at call time**, not a badge: `callTool` resolves `EffectivePolicy` (pure resolver §3.2) and writes a `permission_decisions` row (allow/deny + reason). Default posture: Explore/read-only; explicit escalation.
- Health is a real probe (writes `source_health_checks`); UI shows last result, not static text.

## 6. Surfaces (shared UI, `packages/ui` → web + desktop)

- **Agents**: list + detail (bindings, effective policy, attached sources/skills, recent runs).
- **Sources**: registry, health filter/status, tool inventory; **policy presets up front**, regex editor behind "advanced".
- **Skills**: registry + versions + bind-to-agent (with required sources surfaced).
- Components live in `packages/ui/src/components/...` (folder-per-component) and `ui/` shadcn primitives (kebab-case). Web mounts under `apps/web/src/app/(agents)/...`; desktop mounts via its renderer routes. Same React, one theme. WCAG 2.2 AA + error boundaries.

## 7. Anti-decorative contract (per RULES §9)

Every shipped module declares the five fields, e.g. `sources`:
`owner_scope=org · target_scope=workspace/session/automation/agent · runtime_consumer=host-service adapters · event_emissions=[source.created, source.bound, tool.called, tool.denied] · audit_events=[source.created, source.deleted, permission.decided]`.
A module that can't fill all five = decorative = not done.

## 8. Foundation: runtime configuration (decouple from superset.sh/tailnet)

Prereq workstream (from prior session decision):
- `apps/desktop/src/main/env.main.ts`: drop prod-baked `.default("https://api.superset.sh")` etc.; source endpoints from env → `~/.superset/config.json` → first-run server picker; pass to renderer via preload (`window.__SUPERSET_CONFIG__`).
- `apps/web`: serve runtime `/config.js` (`window.__SUPERSET_CONFIG__`, `no-store`) read from server env at request time; migrate client `NEXT_PUBLIC_*` reads off build-time inlining where they are endpoints.
- Result: one artifact → any backend (superset.sh / tailnet / future cloud) without rebuild.

## 9. Verification (per agentic-pipeline contracts)

- Tests: unit (policy resolver precedence), integration (migrations up+down; source bind/read; adapter health; denied tool-call audited), e2e (agent → bound source → policy-gated call).
- Visual proof: Playwright over tailscale (`bit-1.blenny-gar.ts.net:8460`) — Agents/Sources/Policy screens render + happy/denied path screenshots; artifacts under `instances/superset/evidence/`.
- Each task records `branch-results` waves; failures route through `evaluation → critique → respec` (no human in loop) until conformant.

## 10. Mapping to pipeline tasks (update `integration-plan.json`)

| Task | Stream | Slice-1 content |
|---|---|---|
| `T-FND-000` (new) | runtime | Runtime-config foundation (§8) |
| `T-ENT-001` | entities | sources/source_tools/source_bindings/source_health_checks |
| `T-ENT-003` | entities | permission_policies/rules/decisions + skills/versions/bindings |
| `T-ENT-004` (new) | entities | agents + agent_bindings; FK automations.agent |
| `T-FEA-001` | features | RuntimeSourceAdapter + tRPC + enforcement + audit |
| `T-UI-002` (new) | ui | shared Agents/Sources/Policy/Skills components (web+desktop) |

Parallel wave-1 starters (own branches/worktrees): `T-FND-000`, `T-ENT-001`, `T-ENT-004`. `T-ENT-003`→after `T-ENT-001`; `T-FEA-001`→after ENT-001/003/004; `T-UI-002`→after FEA-001 surfaces stabilize.

## 11. Risks & mitigations

- **ELv2 (Superset) vs Apache-2.0 (craft) vs own (alook/second):** reimplement *patterns*, preserve notices, no proprietary asset copy. Kit lives outside Superset source.
- **Upstream drift:** keep changes additive + behind the runtime-config + new tables; avoid rewriting core flows.
- **Desktop native-module ABI** (node-pty/better-sqlite3 vs electron 40): out of slice-1 scope (UI is shared React; runtime runs server/host-service side). Tracked separately.
- **Multi-tenant isolation:** all new tables org-scoped; cross-tenant reads return 404 (guard-and-tenancy).
- **Policy misuse (regex allowlists):** presets-first UI, default read-only, decisions audited.

## 12. Rollout

Wave 1 = this slice (agents/sources/policies/skills + runtime-config + shared UI). Wave 2 = channels (email/calendar) from alook. Wave 3 = app-building/review/collaborators from second. Each wave = its own spec → plan → implement → verify, compounded append-only in `pipeline-state.json`.
