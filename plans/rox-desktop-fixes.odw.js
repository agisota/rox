export const meta = {
  name: 'rox-desktop-fixes',
  description: 'Sequential codex agents fix desktop in-place: host-service startup, UI/UX defaults, ROX-1+providers',
  phases: [{ title: 'Fix' }],
}

const COMMON = `You are working IN PLACE in the real "Rox" monorepo working tree (Bun + Turbo, scope @rox, fork of superset rebranded to Rox), on branch main. Earlier agents in this run may have already changed files — build on the current state. Make your code changes directly. Do NOT git commit, do NOT git push, do NOT revert other agents' work. Be type-safe (no \`any\`). Do NOT edit packages/db/drizzle applied snapshots. Do NOT hardcode secrets.

When done, run \`bun turbo run typecheck --filter=@rox/desktop\` plus any package you edited, and \`bun run lint\`.

Return strictly: { "summary": <concise per-file description of what you changed>, "filesChanged": <array of file paths you edited>, "typecheckExit": <0 if pass else nonzero>, "lintExit": <0 if clean else nonzero>, "notes": <anything unfinished or risky> }.`

const DOMAINS = [
  {
    key: 'host-service',
    prompt: `${COMMON}

TASK — Fix host-service startup (root cause of: Hosts add error, Project create "локальный хост-сервис недоступен / Статус: запускается", Teams no-redirect after create, import-agent crash "Что-то пошло не так").

EVIDENCE: No \`~/.rox/**/host.db\` is ever created → the spawned host-service child crashes on startup before creating its DB. The child's stderr is NOT logged anywhere, so the crash is invisible. local-db migrations were already fixed (0037 journal tag). host-service drizzle migrations are consistent.

WHERE: apps/desktop/src/main/lib/host-service-coordinator.ts spawns it (spawn(process.execPath,[scriptPath],{env:childEnv}); HOST_DB_PATH=<orgDir>/host.db, HOST_MIGRATIONS_FOLDER=resources/host-migrations when packaged). Entry: packages/host-service/src/serve.ts, app.ts, db/db.ts (drizzle migrate()).

DO:
1. REQUIRED: capture the spawned child's stdout+stderr in host-service-coordinator.ts and append them to a log file at \`<rox-home>/host-service.log\` so startup crashes become visible.
2. Find and fix the actual startup crash so host.db is created and the service reaches "ready". Inspect: env validation (HOST_SERVICE_SECRET, AUTH_TOKEN, ROX_API_URL, ORGANIZATION_ID, CORS_ORIGINS), migrate() throwing, scriptPath resolution in packaged mode, any unhandled rejection before listen.
3. Make the failure surface to the UI as a real message rather than generic "no such table: settings" / silent "запускается".

STAY WITHIN: packages/host-service/** and apps/desktop/src/main/lib/host-service-*. Do NOT touch model/provider settings, fonts/theme, branch-prefix, onboarding, or skills.`,
  },
  {
    key: 'defaults',
    prompt: `${COMMON}

TASK — Change out-of-the-box DEFAULTS in apps/desktop (persisted defaults for every new user, set in settings schema/default config — not just UI toggles), and disable Slack.

1. Git branch prefix default = \`rox\` (currently "Без префикса"). New branches/worktrees default to \`rox/\`. (Likely @rox/local-db settings schema default + Settings "Git и worktrees" UI + new-branch-name generation.)
2. "Rox v2" ON by default for everyone, REMOVE it from experimental (Settings "Эксперименты" → "Попробовать Rox v2"). v2 workspace UI becomes the base default.
3. "Монитор ресурсов" ON by default (Settings "Общие").
4. Fonts defaults: UI = "SF UI Display Pro", terminal = "Monospace Argon", default sizes = 12pt (UI + terminal). (Settings "Внешний вид" + "Терминал".)
5. Glass surfaces ON by default at 80% (Settings "Внешний вид").
6. Disable Slack: remove Slack from the Integrations UI (Settings "Интеграции") and its connect entry points. Keep Linear + GitHub.

Persist defaults properly: if stored in @rox/local-db settings with a default, set the schema default; if a new column/default is needed add a migration via \`bunx drizzle-kit generate\` (do NOT hand-edit applied snapshots). Typecheck @rox/desktop AND @rox/local-db.

STAY WITHIN: desktop settings/appearance/terminal/git-worktree/experimental/integrations + their default config + local-db settings defaults/migrations. Do NOT touch host-service or model/provider code.`,
  },
  {
    key: 'models',
    prompt: `${COMMON}

TASK — Models/providers (Settings "Модели" currently only offers Anthropic + OpenAI).

1. Add ROX-1 as a built-in FREE default model for every user with no setup; Rox is the default provider. ROX-1 is OpenAI-compatible at base URL https://api.rox.one/v1, model id \`r1\`; the API key is read from env/config (e.g. ROX_AI_API_KEY) — never hardcode. ROX-1 must appear by default and be the default selected model.
2. Add provider entries so users can add their own keys: Groq and Google Gemini (follow the existing provider-config shape; also DeepSeek if already scaffolded). Currently only Anthropic+OpenAI are surfaced.

Find the provider/model registry (packages/shared or desktop models config) + Settings "Модели" renderer page; follow the existing provider definition pattern. Typecheck @rox/desktop and any package you edit.

STAY WITHIN: model/provider config + Models settings UI. Do NOT touch host-service, defaults (fonts/glass/v2/branch-prefix), onboarding, or skills.`,
  },
]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    typecheckExit: { type: 'integer' },
    lintExit: { type: 'integer' },
    notes: { type: 'string' },
  },
  required: ['summary', 'filesChanged', 'typecheckExit', 'lintExit'],
}

phase('Fix')
// concurrency=1 in odw.config.json -> these run one-at-a-time, in-place, accumulating in main.
const out = await parallel(
  DOMAINS.map((d) => () => agent(d.prompt, { label: d.key, phase: 'Fix', schema: SCHEMA, adapter: 'codex' })),
)

return DOMAINS.map((d, i) => ({ domain: d.key, result: out[i] }))
