# Agent-native (craft agents) — план реализации

_Ветка: `feat/agent-native`. Worktree: `/home/dev/1/rox-agent-native`._
_Синтез из 4 research-отчётов в `plans/agent-native/research/`. Дата: 2026-06-15._

> **Статус:** research завершён, кода нет. Этот документ — единый исполняемый план.
> Строим «снизу вверх»: БД → tRPC → MCP-прокси → UI. Между волнами — gate
> (`bun run typecheck && bun run lint`), отчёт, подтверждение.

---

## 0. Цель и объём

Сделать rox **agent-native**: внешние агентские «Источники» (Sources) становятся
first-class объектами с хранимыми (шифрованными) кредами; их инструменты
проксируются в MCP под namespace `mcp__{slug}__{tool}`; чат-сессии получают
статус и метки; композер в `apps/web` получает кнопки Source/Skills/Labels/Status
и чипы.

Четыре рабочих потока (= 4 research-отчёта):

1. **AgentSource registry** — таблица `agent_sources` + tRPC `agentSource`.
2. **MCP-прокси** — пул MCP-клиентов + namespacing `mcp__{slug}__{tool}`.
3. **Chat session status/labels** — миграция + расширение `chat` tRPC.
4. **Composer UI** — кнопки и чипы в композере `apps/web`.

**Вне объёма (этой ветки):** реальный рантайм исполнения внешних агентов
(только заглушки/типы), миграции против production, мобильный композер.

---

## 1. Открытые решения (нужны до Волны 1)

Эти развилки меняют схему БД — закрыть до генерации миграций.

- **OD-1. Хранение кред источника.** Рекомендация research: своя колонка
  `encrypted_config`/`encrypted_credentials` (AES-256-GCM, `SECRETS_ENCRYPTION_KEY`)
  по модели `secrets`, НЕ plaintext как `integration_connections`
  (`trpc-integrations.md` §6, §7.1). Альтернатива — FK
  `integration_connection_id → integration_connections` для OAuth-источников.
  **Предлагаю: оба** — `integrationConnectionId` (nullable, для OAuth-провайдеров)
  + `encryptedConfig` (для api-key/endpoint источников).
- **OD-2. Sources как отдельная таблица vs как skills.** `skill_bindings.surface`
  уже содержит `mcp`/`agent_tool` (`db-schema-workflow.md` §3, `enums.ts:193-200`).
  Research рекомендует **отдельную таблицу `agent_sources`** (реестр источников) +
  переиспользование skill-биндингов для экспозиции. Принимаем это.
- **OD-3. Значения `chat_session_status`.** Предлагаю минимум
  `["active","archived"]` (inbox/archive). Расширяемо (append-only). Подтвердить
  набор у owner.
- **OD-4. `objectType` для графа.** Добавлять ли `"agent_source"` в
  `objectTypeValues` (`enums.ts:249-264`)? Нужно только если источники участвуют
  в `object_relations`/`skill_bindings.objectType`. **Предлагаю добавить** —
  дёшево (append-only) и пригодится для рёбер `(agent_source)--exposes-->(skill)`.

> Решения помечены как предложения; перед Волной 1 уточнить OD-1/OD-3 у owner
> через `ask_user`/обычный вопрос.

---

## 2. Волна 1 — Фундамент БД (`packages/db`)

**Зависит от:** OD-1..OD-4. **Блокирует:** все остальные волны.

### Задачи
- [ ] **W1.1** В `enums.ts` (append-only, не переупорядочивать — `enums.ts:56,329,379`):
  - `agentSourceKindValues = ["claude_code","codex","cursor","opencode","mcp","external_http"]`
  - `agentSourceStatusValues = ["draft","active","deprecated","archived"]`
  - `chatSessionStatusValues = ["active","archived"]` (см. OD-3)
  - (OD-4) добавить `"agent_source"` в конец `objectTypeValues`
  - Для каждого: `export const xEnum = z.enum(xValues); export type X = z.infer<…>`
- [ ] **W1.2** Таблица `agent_sources` — новый модуль `src/schema/agent.ts`
  (re-export в `index.ts`) ИЛИ в `workflow.ts`. Колонки по эскизу
  `db-schema-workflow.md` §7: `id uuid defaultRandom`, `organizationId` (cascade) +
  индекс, `v2ProjectId` (nullable, cascade), `ownerUserId` (cascade), `slug`,
  `name`, `description?`, `kind` (enum), `status` (enum, default `active`),
  `integrationConnectionId?` (set null), `encryptedConfig text?` (OD-1),
  `config jsonb $type<Record<string,unknown>> notNull default {}`,
  `capabilities jsonb $type<string[]> notNull default []`, `endpointUrl?`,
  `version?`, `createdAt/updatedAt` **timestamptz** + `$onUpdate`.
  Индексы: `uniqueIndex(org, v2_project, slug)`, idx(org), idx(v2_project), idx(kind).
  `export type InsertAgentSource/SelectAgentSource`.
- [ ] **W1.3** `chat_sessions` (`schema.ts:785-817`): добавить
  `status: chatSessionStatus().notNull().default("active")` и
  `labels: jsonb().$type<string[]>().default([])` (по образцу `tasks.labels`,
  `schema.ts:300`); индекс `(organizationId, status)`.
  ⚠️ `chat_sessions` использует **bare `timestamp`** — новые колонки статуса/меток
  тип timestamp не трогают, но стиль таблицы не менять.
- [ ] **W1.4** `relations.ts`: блок `agentSourcesRelations` (org `one`, owner `one`,
  integrationConnection `one`); в `organizationsRelations` (`relations.ts:98-122`)
  добавить `agentSources: many(agentSources)`.
- [ ] **W1.5** Сгенерировать миграцию (offline, НЕ трогает БД):
  `cd packages/db && bunx drizzle-kit generate --name="add_agent_sources_and_chat_status"`
  → файл ляжет в `packages/db/drizzle/NNNN_*.sql` + snapshot + journal.
  **Не редактировать `drizzle/` вручную. НЕ запускать `migrate`/`push` против prod.**

### Verification (gate W1)
- `bun run typecheck` (минимум `packages/db`).
- Глазами проверить сгенерированный SQL: только `CREATE TABLE agent_sources`,
  `ALTER TABLE chat_sessions ADD COLUMN status/labels`, новые enum-типы. Ничего
  лишнего/деструктивного.
- (опц.) применить на свежей Neon-ветке (не prod) и `db:seed-dev`.

---

## 3. Волна 2 — tRPC (`packages/trpc`)

**Зависит от:** W1 (типы `SelectAgentSource`, новые колонки). **Блокирует:** W3, частично W4.

### Задачи
- [ ] **W2.1 (общий crypto).** Поднять `encryptSecret`/`decryptSecret` из
  `router/project/secrets/utils/crypto.ts` в shared `packages/trpc/src/lib/crypto.ts`
  (или `packages/shared`), реэкспорт из старого места для обратной совместимости.
  Источник — `trpc-integrations.md` §6.B.
- [ ] **W2.2 Роутер `agentSource`** — `src/router/agent-source/` (`agentSource.ts`,
  `schema.ts`, `index.ts`, `*.test.ts`), по образцу `skill/`
  (`trpc-integrations.md` §4). Все процедуры `protectedProcedure` +
  `verifyOrgMembership` (запись — `verifyOrgAdmin`):
  - `list({ organizationId, v2ProjectId? })` → `SelectAgentSource[]` **без** кред
    (column-projection, как `integration.list`, `integration.ts:36-44`).
  - `get({ id, organizationId })`.
  - `create(createAgentSourceSchema)` → шифрует креды через `encryptSecret`,
    `dbWs.insert`.
  - `update` / `setStatus` / `delete` (org-scoped).
  - `getDecryptedConfig({ id, organizationId })` — серверный read-path, не отдаёт
    `sensitive` наружу (паттерн `secrets.getDecrypted`).
- [ ] **W2.3** Зарегистрировать в `root.ts` (`root.ts:33-63`):
  `import { agentSourceRouter } from "./router/agent-source";` + ключ
  `agentSource: agentSourceRouter`. Типы `AppRouter/RouterInputs/RouterOutputs`
  обновятся инференсом.
- [ ] **W2.4 Расширить `chat` роутер** (`router/chat/chat.ts`): `updateSession`
  сейчас принимает только `{ title? }` (`chat-labels-status.md` §2) — добавить
  `status?`, `labels?`; новые процедуры `setStatus`, `setLabels` (или объединить).
  Все org-scoped.
- [ ] **W2.5** Тесты: `agent-source/*.test.ts` (CRUD, шифрование round-trip,
  проекция кред), chat status/labels happy-path.

### Verification (gate W2)
- `bun run typecheck && bun run lint` (0 вывода) на `packages/trpc`.
- `bun test packages/trpc` (или таргетно по новым тестам).
- Проверить: `list`/`get` НИКОГДА не возвращают `encryptedConfig`.

---

## 4. Волна 3 — MCP-прокси (`packages/mcp-v2`)

**Зависит от:** W1, W2 (источники в БД + роутер для их перечисления).

> Три шва из `mcp-runtime.md` §7: `defineTool` (`define-tool.ts:96-148`),
> `registerTools` (`tools/register.ts:73-81`), `createInMemoryMcpClient`
> (`in-memory.ts:28-109`). Недостающее — **реестр источников** и **пул клиентов**.

### Задачи
- [ ] **W3.1 AgentSource resolver** — функция, читающая активные `agent_sources`
  для org (через `createMcpCaller(ctx).agentSource.list` или прямой запрос) и
  отдающая список `{ slug, kind, endpointUrl, connect() }`.
- [ ] **W3.2 Пул MCP-клиентов** — `src/agent-source-pool.ts`: `Map<slug, Client>`,
  обобщить `createInMemoryMcpClient` (`in-memory.ts:28-109`). Для локального
  `rox-v2` — in-memory транспорт; для `mcp`/`external_http` источников — реальный
  транспорт к `endpointUrl` с `authInfo.extra.mcpContext` (креды из
  `getDecryptedConfig`). Возвращает `{ client, cleanup }` на источник.
- [ ] **W3.3 Proxy-регистратор** — поверх `defineTool`: для каждого пула
  `client.listTools()`, и на каждый инструмент
  `defineTool(server, { name: \`mcp__${slug}__${tool.name}\`, description,
  inputSchema, handler: (input, ctx) => pooled.callTool({ name: tool.name,
  arguments: input }) })`. На входящем вызове срезать префикс `mcp__{slug}__`.
  Телеметрия (`McpToolCallEvent`) идёт бесплатно через `defineTool`
  (`define-tool.ts:21-32`).
- [ ] **W3.4** Точка включения: расширить `createMcpServer`
  (`server.ts:10`) опцией `agentSources`, либо отдельная фабрика
  `createProxyMcpServer`. HTTP-граница — `resolveMcpContext` (`auth.ts:164`) +
  хендлер в `apps/api` (вне пакета).
- [ ] **W3.5** Тесты: namespacing (prefix↔strip), проксирование вызова до
  downstream-клиента (мок), изоляция ошибок одного источника.

### Verification (gate W3)
- `bun run typecheck && bun run lint` на `packages/mcp-v2`.
- `bun test packages/mcp-v2`.
- Ручной smoke: in-memory клиент видит `mcp__{slug}__{tool}` и вызов доходит.

---

## 5. Волна 4 — Composer UI (`apps/web`)

**Зависит от:** W2 (tRPC для источников/скиллов/статусов/меток).

> Композер: `apps/web/src/app/(agents)/components/` — `AgentPromptInput`,
> `PreviewPromptComposer`, `PlusMenu` (`chat-labels-status.md` §1). Сейчас
> preview-режим (`disabled`). Всё компонуется из примитивов
> `@rox/ui/ai-elements/prompt-input` — **без правок `@rox/ui`**.

### Задачи
- [ ] **W4.1** Кнопки **Source / Skills / Labels / Status** — в слот `footerTools`
  (левый `PromptInputTools`) рядом с `ModelPicker`, либо новым рядом через
  `afterComposer` (как Repo/Branch). Использовать `PromptInputButton`,
  `PromptInputSelect*`/`PromptInputCommand*` (`prompt-input.tsx`).
- [ ] **W4.2** Чипы выбранного (источник/скиллы/метки) — в `PromptInputHeader`
  (`prompt-input.tsx:1077`, `align="block-end"`, рендерится над textarea) —
  сейчас не используется, это «полка» под чипы.
- [ ] **W4.3** Пункты в `PlusMenu` (`ResponsiveDropdown items`) — добавить
  источники/скиллы как пункты.
- [ ] **W4.4** Данные через tRPC: `agentSource.list`, `skill.listBindings`
  (`surface:"agent_tool"`/`"mcp"`), `chat.*` для статусов/меток. Соблюсти
  cache-first правило Electric/TanStack DB (AGENTS.md §9): сначала рендерить
  существующие строки, `isReady` — только для пустого состояния.
- [ ] **W4.5** Снять `disabled` там, где функционал реально подключён.

### Verification (gate W4)
- `bun run typecheck && bun run lint` на `apps/web`.
- Визуальная проверка композера (скриншот через chrome-devtools/playwright).
- a11y: кнопки с label, навигация с клавиатуры (WCAG 2.2 AA — eng rules).

---

## 6. Сквозные правила (из AGENTS.md / eng rules)

- **Миграции:** менять только `src/schema/`, генерировать `drizzle-kit generate`;
  НИКОГДА не редактировать `drizzle/` руками; `migrate`/`push` к prod — только с
  явного подтверждения owner.
- **Lint перед push:** `bun run lint:fix` → `bun run lint` exit 0 (CI валит на
  warning).
- **No `any`**, strict TS. Креды — только шифрованно, не в логах, не в ответах
  клиенту (column-projection).
- **Атомарные коммиты**, Conventional Commits, ветка `feat/agent-native`,
  через PR (не пушить в main).
- **Скоуп по org** во всех запросах; FK delete-поведение по образцу
  (`cascade`/`set null`/`restrict`).
- **`ask_user`** для любых вопросов owner внутри Rox UI.

## 7. Порядок исполнения и коммиты

1. `chore(agent-native): commit research notes` — зафиксировать `research/` + этот план.
2. `feat(db): agent_sources table + chat session status/labels` (Волна 1).
3. `feat(trpc): agentSource router + chat status/labels + shared crypto` (Волна 2).
4. `feat(mcp-v2): agent source pool + namespaced mcp proxy tools` (Волна 3).
5. `feat(web): composer source/skills/labels/status controls` (Волна 4).

Каждый коммит — после своего gate (typecheck+lint+test зелёные).

## 8. Риски

- **R1.** Расхождение конвенций UUID: eng-rule требует v7, но репозиторий —
  строго v4 `defaultRandom()` (`db-schema-workflow.md` §2). Следуем репозиторию.
- **R2.** Реальный транспорт к внешним MCP-источникам (W3.2) — самый
  неопределённый кусок; для external_http может потребоваться отдельный round
  research/прототип. Допустимо начать с in-memory `rox-v2` и заглушки внешних.
- **R3.** `secrets` crypto требует `SECRETS_ENCRYPTION_KEY` (32 байта base64) в
  env — проверить наличие до Волны 2.
- **R4.** `chat_sessions` bare-timestamp стиль — не «осовременивать» на tz, чтобы
  не плодить шум в миграции.
