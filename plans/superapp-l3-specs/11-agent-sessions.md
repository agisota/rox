# 11 — Агент-сессии: L3 implementation-ready ТЗ

> Ссылается на `plans/superapp-l3-specs/00-shared-context.md` (далее «00»). Ядро графа (00 §2),
> конвенции (00 §3) и допущения A1–A8 (00 §4) — НЕ переопределяются, только используются/расширяются.
> Родительский дизайн: `plans/rox-superapp-roadmap-and-design.md` (Часть 2C/2E — процессы/sidecar/sync).

## 0. Резюме и границы

**Что входит (фаза 4).** Подсистема индексирует, отображает, возобновляет (resume) и тарифицирует
локальные агент-сессии внешних CLI-агентов (Claude Code / Codex / Hermes) и приравненных бэкендов
(`agent_sources`). Сессия — это first-class узел графа `entity(kind="agent_session")` с detail-таблицей
`agent_sessions` (1:1 к `entityId`). Поверх неё:
- **Индексатор транскриптов** (jsonl Claude Code/Codex/Hermes) → нормализованные `agent_session_events`
  (append-only) + сводный `agent_sessions` + `activity_events(kind="session")` (timeline-спина, 00 §2.5).
- **Resume/запуск** живой сессии через `@rox/pty-daemon` (Unix-socket, framed-протокол, уже в репо) —
  CLI-агент возобновляется в PTY, ввод/вывод стримится в Renderer.
- **Тарификация** прогонов в Rox-экономику: связь `agent_sessions ↔ usage_requests/rox_ledger` (00 §3:
  деньги в Decimal, не float) для Paperclip-дашборда стоимости.
- **tRPC-роутер `agentSession`** (новый, рядом с `agent`/`agentSource`) + расширение enum'ов ядра/домена.
- **UI** в desktop feature-модуле `sessions`: список сессий, просмотр транскрипта, живой терминал, дашборд
  стоимости.

**Что НЕ входит (out of scope).**
- Реестр бэкендов `agent_sources` (CRUD, секреты) — **уже реализован** (`router/agent-source`, `schema/agent.ts`).
  Эта спека его переиспользует, не переписывает.
- Сам framed-протокол pty-daemon и его supervision — **уже реализованы** (`packages/pty-daemon`,
  `apps/desktop/src/main/pty-daemon`). Мы только описываем контракт вызова и добавляем resume-семантику.
- Чат (#10), Capture (#8), STT/overlay (подсистема 12, см. 00 §4 A4) — отдельные спеки. Мы лишь пишем
  `activity_events(kind="session")` по контракту #8 и реиспользуем relay/streams (A3) для live-стрима.
- Биллинг/экономика как таковая (`economy.ts`: `rox_ledger/usage_requests/rox_balances`) — существует;
  мы только пишем туда атрибуцию по сессии и читаем агрегаты.

**Фаза:** 4. **Зависимости:** #1 (ядро графа: `entities/edges/activity_events` + graph-сервис `create/link/promote`),
#2 (рантайм: Turso/libSQL local-primary, Electric down-sync cache-first, minio для крупных транскриптов),
существующие `agent_sources`, `economy.ts`, `@rox/pty-daemon`, `apps/relay`/`apps/streams`.

**Принятые допущения (00 §4) + ревизируемость.**
- **A6** (формат-адаптеры за `SessionAdapter`, resume через pty-daemon/CLI) — принят как есть. Конкретный
  набор адаптеров v1: `claude_code`, `codex`, `hermes`. Ревизируемо: добавить `cursor`/`opencode` адаптеры
  (kind уже есть в `agentSourceKindValues`).
- **A3** (realtime = relay/streams/Electric, без нового стека) — live-вывод PTY идёт по существующему
  host↔client туннелю relay (`openWsChannel(hostId, path="/agent-session/{entityId}")`, см. §2 п.11 / §3.4 —
  сверено с `apps/relay/src/tunnel.ts`, а не отдельный именованный канал); метаданные сессии — Electric
  down-sync. Ревизируемо.
- **A8** (minio bucket `org-<orgId>`, префикс `sessions/`) — сырые/крупные транскрипты (>256 КБ) кладём в
  `sessions/<entityId>/transcript.jsonl`, `storageRef` в detail. Ревизируемо: порог инлайна.
- **Локальность (00 §2E):** `agent_sessions`/`agent_session_events` — local-primary в Turso (приватные,
  тяжёлые), синхронизируемая «шапка» (entity) реплицируется Electric вниз. Ревизируемо для командных сессий.

---

## 1. Доменная модель (полная схема БД)

### 1.1 Новые enum-значения (diff к 00 §2.1, файл `packages/db/src/schema/enums.ts`)

Ядро уже содержит `entity_kind="agent_session"` и `activity_event_kind="session"` (00 §2.1) — НЕ добавляем.
Из `edgeRelationValues` используем существующие `authored_by`, `references`, `derived_from`, `attached_to`,
`about`, `child_of` — НЕ добавляем. Добавляем **только** доменные enum'ы для detail-таблиц (append-only,
никогда не переупорядочивать/удалять — как помечено в `enums.ts`):

```ts
// enums.ts — ДОБАВИТЬ (Agent-sessions, фаза 4). pgEnum'ы объявляются в schema/agentSession.ts.

// Статус жизненного цикла агент-сессии (lifecycle вместо deleted_at).
export const agentSessionStatusValues = [
	"indexing", // транскрипт парсится/догружается
	"active",   // живая сессия в PTY (resume идёт прямо сейчас)
	"idle",     // импортирована/завершена, готова к resume
	"archived", // скрыта пользователем
	"failed",   // парсинг/resume упал
] as const;
export const agentSessionStatusEnum = z.enum(agentSessionStatusValues);
export type AgentSessionStatus = z.infer<typeof agentSessionStatusEnum>;

// Роль автора события транскрипта (нормализованная над всеми форматами).
export const agentSessionRoleValues = [
	"user",
	"assistant",
	"system",
	"tool",       // вызов инструмента/функции
	"tool_result",
] as const;
export const agentSessionRoleEnum = z.enum(agentSessionRoleValues);
export type AgentSessionRole = z.infer<typeof agentSessionRoleEnum>;

// Тип нормализованного события транскрипта.
export const agentSessionEventKindValues = [
	"message",       // текстовая реплика (user/assistant/system)
	"tool_call",     // запрос на инструмент
	"tool_result",   // результат инструмента
	"reasoning",     // thinking/reasoning-блок
	"file_edit",     // diff/патч файла
	"command",       // bash/shell-команда внутри агента
	"usage",         // токены/стоимость шага
	"error",         // ошибка шага
] as const;
export const agentSessionEventKindEnum = z.enum(agentSessionEventKindValues);
export type AgentSessionEventKind = z.infer<typeof agentSessionEventKindEnum>;

// Формат-источник транскрипта (какой SessionAdapter распарсил).
export const agentTranscriptFormatValues = [
	"claude_code",
	"codex",
	"hermes",
] as const;
export const agentTranscriptFormatEnum = z.enum(agentTranscriptFormatValues);
export type AgentTranscriptFormat = z.infer<typeof agentTranscriptFormatEnum>;
```

> `agentSourceKindValues` (`claude_code/codex/cursor/opencode/mcp/external_http`) и `chatSessionStatusValues`
> уже существуют — НЕ дублировать. `agentTranscriptFormatValues` — **независимый доменный enum форматов
> jsonl-транскрипта v1** (`claude_code/codex/hermes`); он пересекается с `agentSourceKindValues` лишь
> частично: значения `claude_code`/`codex` совпадают по имени, а `hermes` **отсутствует** в
> `agentSourceKindValues` (проверено: там `claude_code/codex/cursor/opencode/mcp/external_http`, без `hermes`).
> То есть transcript-format ≠ source-kind: это два разных перечисления, не «подмножество». Если позже
> понадобится `hermes` как тип источника, его добавляют отдельным diff к `agentSourceKindValues` ядра.

### 1.2 Detail-таблицы (новый файл `packages/db/src/schema/agentSession.ts`)

Узел всегда создаётся в ядре (`entities`, kind=`agent_session`) через graph-сервис; ниже — **только** detail
1:1 к `entityId` + append-only события. Конвенции зеркалят `agent.ts`/`economy.ts` (00 §3).

```ts
/**
 * Agent-sessions (фаза 4) — detail-таблицы поверх entity(kind="agent_session").
 *
 * `agent_sessions`        → 1:1 шапка сессии (метаданные, агрегаты, привязка к источнику/проекту/PTY).
 * `agent_session_events`  → append-only нормализованный транскрипт (по одному ряду на шаг).
 *
 * Узел графа (entities) НЕ дублируется здесь — он создаётся graph-сервисом ядра; `entityId` = FK на него.
 * Конвенции (как agent.ts/economy.ts): org cascade FK + org index, timestamptz created/updated с $onUpdate,
 * enums из enums.ts, lifecycle status вместо deleted_at, $inferInsert/$inferSelect.
 *
 * NOTE: никогда не править миграции руками — менять этот файл и запускать
 * `bunx drizzle-kit generate --name="..."` (см. AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { agentSources } from "./agent";
import { organizations, users } from "./auth";
import {
	agentSessionEventKindValues,
	agentSessionRoleValues,
	agentSessionStatusValues,
	agentTranscriptFormatValues,
} from "./enums";
// ВНИМАНИЕ: импорты разведены по реальным файлам схемы (проверено по репо):
//  - `v2Projects` и `agentCommands` объявлены в `./schema`;
//  - `usageRequests` — в `./economy` (НЕ в `./schema`);
//  - `entities` — ядро графа #1 (`./entity`), ещё НЕ реализовано → TODO-зависимость.
// Когда #1 смержится, импорт `entities` берётся из `./entity` (или из агрегатора `@rox/db`,
// т.к. `index.ts` реэкспортирует все файлы схемы). До этого PR-1 (§8) блокируется на #1.
import { usageRequests } from "./economy";
import { entities } from "./entity"; // TODO(#1): появится с ядром графа
import { v2Projects } from "./schema";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const agentSessionStatus = pgEnum(
	"agent_session_status",
	agentSessionStatusValues,
);
export const agentSessionRole = pgEnum(
	"agent_session_role",
	agentSessionRoleValues,
);
export const agentSessionEventKind = pgEnum(
	"agent_session_event_kind",
	agentSessionEventKindValues,
);
export const agentTranscriptFormat = pgEnum(
	"agent_transcript_format",
	agentTranscriptFormatValues,
);

// ---------------------------------------------------------------------------
// agent_sessions — 1:1 шапка поверх entity(kind="agent_session")
// ---------------------------------------------------------------------------

export const agentSessions = pgTable(
	"agent_sessions",
	{
		// PK == FK на узел графа (1:1). Каскад при удалении узла.
		entityId: uuid("entity_id")
			.primaryKey()
			.references(() => entities.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, {
			onDelete: "set null",
		}),
		// Бэкенд-источник (Claude Code/Codex/...). Может быть null для ad-hoc импорта.
		agentSourceId: uuid("agent_source_id").references(() => agentSources.id, {
			onDelete: "set null",
		}),

		status: agentSessionStatus().notNull().default("idle"),
		format: agentTranscriptFormat().notNull(),

		// Стабильный идентификатор сессии у внешнего агента (для дедупа реимпорта).
		externalSessionId: text("external_session_id"),
		// Абсолютный путь исходного транскрипта на машине пользователя (для resume/реиндекса).
		transcriptPath: text("transcript_path"),
		// Если транскрипт ушёл в minio (крупный) — ссылка; иначе события в agent_session_events.
		storageRef: jsonb("storage_ref").$type<{
			bucket?: string;
			key?: string;
			mime?: string;
			size?: number;
		}>(),

		// Рабочая директория и команда запуска для resume через pty-daemon.
		cwd: text(),
		resumeArgv: jsonb("resume_argv").$type<string[]>(),
		resumeEnvKeys: jsonb("resume_env_keys")
			.$type<string[]>()
			.notNull()
			.default([]),

		model: text(), // основной модельный id прогона (для атрибуции стоимости)
		gitBranch: text("git_branch"),
		gitRemote: text("git_remote"),

		// Производные агрегаты (пересчитываются индексатором; деньги — Decimal, не float).
		eventCount: integer("event_count").notNull().default(0),
		messageCount: integer("message_count").notNull().default(0),
		toolCallCount: integer("tool_call_count").notNull().default(0),
		tokensIn: bigint("tokens_in", { mode: "number" }).notNull().default(0),
		tokensOut: bigint("tokens_out", { mode: "number" }).notNull().default(0),
		usdCost: numeric("usd_cost", { precision: 20, scale: 6 })
			.notNull()
			.default("0"),
		roxCost: numeric("rox_cost", { precision: 20, scale: 6 })
			.notNull()
			.default("0"),

		// Временные границы прогона (UTC, 00 §3).
		startedAt: timestamp("started_at", { withTimezone: true }),
		lastEventAt: timestamp("last_event_at", { withTimezone: true }),

		// Дедуп-хэш контента транскрипта (sha256 hex) — идемпотентность реимпорта.
		contentHash: text("content_hash"),
		summary: text(), // R1-сводка (см. #8/A4 провайдер summarize)

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("agent_sessions_org_idx").on(t.organizationId),
		index("agent_sessions_user_idx").on(t.userId),
		index("agent_sessions_project_idx").on(t.v2ProjectId),
		index("agent_sessions_source_idx").on(t.agentSourceId),
		index("agent_sessions_status_idx").on(t.status),
		index("agent_sessions_last_event_idx").on(t.lastEventAt),
		// Дедуп реимпорта: один externalSessionId на org/format.
		uniqueIndex("agent_sessions_org_format_external_uniq")
			.on(t.organizationId, t.format, t.externalSessionId)
			.where(sql`${t.externalSessionId} IS NOT NULL`),
	],
);

export type InsertAgentSession = typeof agentSessions.$inferInsert;
export type SelectAgentSession = typeof agentSessions.$inferSelect;

// ---------------------------------------------------------------------------
// agent_session_events — append-only нормализованный транскрипт (1 ряд на шаг)
// ---------------------------------------------------------------------------

export const agentSessionEvents = pgTable(
	"agent_session_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		sessionEntityId: uuid("session_entity_id")
			.notNull()
			.references(() => agentSessions.entityId, { onDelete: "cascade" }),

		// Порядковый номер шага в рамках сессии (монотонный, из исходного jsonl).
		seq: integer().notNull(),
		kind: agentSessionEventKind().notNull(),
		role: agentSessionRole(),

		// Текстовое тело (markdown/plain) — для поиска и рендера; крупный bin — в storageRef сессии.
		text: text(),
		// Сырой нормализованный блок шага (tool args/result, diff, usage и пр.).
		payload: jsonb()
			.$type<{
				toolName?: string;
				toolInput?: Record<string, unknown>;
				toolResult?: unknown;
				diff?: string;
				filePath?: string;
				command?: string;
				exitCode?: number;
				tokensIn?: number;
				tokensOut?: number;
				model?: string;
				error?: string;
			}>()
			.notNull()
			.default({}),

		// Привязка usage-шага к строке экономики (если затарифицирован).
		usageRequestId: uuid("usage_request_id").references(
			() => usageRequests.id,
			{ onDelete: "set null" },
		),

		ts: timestamp({ withTimezone: true }), // время шага из транскрипта (UTC)
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		index("agent_session_events_org_idx").on(t.organizationId),
		index("agent_session_events_kind_idx").on(t.kind),
		// Основной курсор просмотра/пагинации: сессия + порядок.
		uniqueIndex("agent_session_events_session_seq_uniq").on(
			t.sessionEntityId,
			t.seq,
		),
	],
);

export type InsertAgentSessionEvent = typeof agentSessionEvents.$inferInsert;
export type SelectAgentSessionEvent = typeof agentSessionEvents.$inferSelect;
```

### 1.3 Использование ядра графа (kind / relation)

- **kind:** `agent_session` (узел сессии). При промоуте упоминаний создаются/линкуются узлы `note`, `task`,
  `contact`, `file` (kind ядра) — но создаёт их graph-сервис ядра, не эта подсистема.
- **relation (edges, 00 §2.3) — используем существующие, новых НЕ вводим:**
  - `authored_by` — `agent_session → contact` (кто запустил; контакт текущего юзера по identity).
  - `references` — `agent_session → file|note|task` (артефакты, на которые сессия ссылается/редактирует).
  - `derived_from` — `note|task → agent_session` (промоут: заметка/задача, рождённая из сессии).
  - `attached_to` — `agent_session → project` (узел проекта), если сессия привязана к проекту графа.
  - `about` — `agent_session → <любой узел>` (тема). `child_of` — sub-session (Hermes orchestration).

### 1.4 Маппинг на qdrant (00 §2A: единая коллекция, фильтр по payload)

- **Что индексируется:** один point на `agent_session` (не на каждое событие, чтобы не раздувать индекс).
- **embed-ится:** `title + summary + конкатенация первых N user/assistant message.text` (truncate ~8 КБ).
- **payload:** `{ entityId, kind: "agent_session", orgId, userId, format, agentSourceId?, v2ProjectId?,
  updatedAt }` — фильтрация поиска по org/user/project/format.
- Реиндекс по `agent_sessions.updatedAt` (общий индексатор #2, по upsert узла). Реализация эмбеддинга —
  в индексаторе рантайма (#2), здесь только контракт payload.

---

## 2. API-контракты (tRPC)

**Новый роутер** `packages/trpc/src/router/agent-session/` (рядом с `agent/` и `agent-source/`); схемы —
`agent-session/schema.ts`. Регистрация в корневом `appRouter` как `agentSession`. Существующие
`agent`/`agentSource` НЕ ломаем. Все мутации с побочкой — идемпотентны по ключу.

Общие правила: `protectedProcedure`; `organizationId` обязателен и проверяется
`verifyOrgMembership`/`verifyOrgAdmin` — конкретный импорт
`import { verifyOrgMembership, verifyOrgAdmin } from "../integration/utils"`
(каталог `integration`, единственное число; проверено по репо — функции живут именно там, а не в
`agentSource.ts`); запись — через `dbWs`, чтение — `db`; все границы валидируются Zod (00 §3). Ошибки: `UNAUTHORIZED`/`FORBIDDEN` (нет членства/прав),
`NOT_FOUND` (нет сессии в org), `BAD_REQUEST` (нет полей/невалидный курсор), `CONFLICT`
(дедуп/идемпотентность), `PRECONDITION_FAILED` (resume без `cwd`/`resumeArgv`), `TOO_MANY_REQUESTS`
(rate-limit resume, 429 + Retry-After, 00 §3).

| # | Процедура | Тип | Назначение |
|---|---|---|---|
| 1 | `list` | query | Список сессий org (фильтры: project/source/format/status, keyset-пагинация) |
| 2 | `get` | query | Шапка одной сессии + агрегаты |
| 3 | `events` | query | Страница транскрипта (keyset по `seq`) — cache-first |
| 4 | `importTranscript` | mutation | Импорт/реиндекс транскрипта (идемпотентно по `contentHash`) |
| 5 | `appendEvents` | mutation | Дозапись событий живой сессии (идемпотентно по `(sessionEntityId, seq)`) |
| 6 | `promote` | mutation | Промоут фрагмента сессии → `note`/`task` через graph-сервис ядра |
| 7 | `setStatus` | mutation | Сменить lifecycle-статус (archive/unarchive/failed) |
| 8 | `requestResume` | mutation | Поставить команду resume в `agent_commands` (исполняет desktop) |
| 9 | `attachUsage` | mutation | Привязать usage-шаг к `usage_requests`/`rox_ledger` (тарификация) |
| 10 | `costSummary` | query | Агрегат стоимости по фильтру (Paperclip-дашборд) |
| 11 | `liveOutput` | subscription | SSE-стрим живого PTY-вывода (через relay-канал) |

### 2.1 Zod-контракты (вход/выход), бизнес-правила

```ts
// agent-session/schema.ts (выдержки — компилируемые Zod-схемы)
import { z } from "zod";
import {
	agentSessionEventKindEnum,
	agentSessionRoleEnum,
	agentSessionStatusEnum,
	agentTranscriptFormatEnum,
} from "@rox/db/enums";

const orgScoped = z.object({ organizationId: z.string().uuid() });
const sessionRef = orgScoped.extend({ sessionEntityId: z.string().uuid() });

// Нормализованное событие, как его прислал адаптер/индексатор.
const eventInput = z.object({
	seq: z.number().int().nonnegative(),
	kind: agentSessionEventKindEnum,
	role: agentSessionRoleEnum.optional(),
	text: z.string().max(1_000_000).optional(),
	payload: z.record(z.string(), z.unknown()).default({}),
	ts: z.coerce.date().optional(),
});
```

**1) `list`** — input: `orgScoped & { v2ProjectId?, agentSourceId?, format?, status?, limit?(1..100=50),
cursor?({ lastEventAt: Date, entityId: uuid }) }`. output: `{ items: SessionCard[], nextCursor? }`, где
`SessionCard = { entityId, title, status, format, model?, eventCount, messageCount, toolCallCount, tokensIn,
tokensOut, usdCost, roxCost, startedAt?, lastEventAt?, v2ProjectId?, agentSourceId? }` (агрегаты строкой
Decimal). Правило: keyset по `(lastEventAt desc, entityId desc)`; `title`/`status` берём из join `entities`.

**2) `get`** — input: `sessionRef`. output: `SessionCard & { cwd?, gitBranch?, gitRemote?, summary?,
transcriptPath?, storageRef? }`. Ошибка `NOT_FOUND` если нет в org.

**3) `events`** — input: `sessionRef & { afterSeq?(int>=0), limit?(1..200=100), kinds?(eventKind[]) }`.
output: `{ items: SessionEvent[], nextAfterSeq? }`. **cache-first (00 §3, AGENTS.md правило 9):** клиент
рендерит уже синхронизированные события из Electric/TanStack DB даже при `isReady=false`; этот endpoint —
backfill «холодного хвоста»/серверный fallback. Курсор — `seq` (стабилен из
`agent_session_events_session_seq_uniq`).

**4) `importTranscript`** — input: `orgScoped & { format, externalSessionId?, transcriptPath?,
v2ProjectId?, agentSourceId?, cwd?, model?, gitBranch?, gitRemote?, contentHash(sha256 hex, 64),
events: eventInput[](<=5000 на батч), storageRef? }`. output: `{ sessionEntityId, created: boolean,
eventCount }`.
Правила/идемпотентность:
- Дедуп по `(organizationId, format, externalSessionId)` (uniqueIndex) **или** по `contentHash`, если
  `externalSessionId` отсутствует. Повторный импорт того же `contentHash` → `created:false`, события не
  дублируются (no-op), не ошибка.
- Если узла нет — создаём через **graph-сервис ядра** `graph.create({ kind:"agent_session", title,
  v2ProjectId })`, затем `agent_sessions` insert, затем bulk-insert `agent_session_events`
  (`onConflictDoNothing` по `(sessionEntityId, seq)`), затем `graph.link` рёбер (`authored_by` к контакту
  текущего юзера, `attached_to` к проекту) и одну `activity_events(kind="session")` строку. Всё в
  `dbWs.transaction`.
- Пересчёт агрегатов (`eventCount/messageCount/toolCallCount/tokensIn/tokensOut/startedAt/lastEventAt`)
  по импортированным событиям.
- Крупные транскрипты: если `storageRef` задан (адаптер уже залил в minio, A8 `sessions/`), `events` может
  быть пустым/частичным (lazy-подгрузка). Иначе события приходят инлайн.

**5) `appendEvents`** — input: `sessionRef & { events: eventInput[](<=500) }`. output: `{ appended:number,
nextSeq:number }`. Для живой сессии (desktop стримит шаги по мере появления). Идемпотентно:
`onConflictDoNothing` по `(sessionEntityId, seq)`; обновляет `lastEventAt`.

**Пересчёт агрегатов — только по реально вставленным строкам (исправление ревью).** Наивный инкремент
`+= events.length` **завышает** счётчики при дублях в батче (повторная доставка/реконнект → те же `seq`
отбрасываются `onConflictDoNothing`, но в длину батча всё ещё входят). Алгоритм (та же транзакция):

```ts
// 1. вставляем, возвращаем ТОЛЬКО фактически вставленные строки
const inserted = await tx
  .insert(agentSessionEvents)
  .values(rows)
  .onConflictDoNothing({ target: [agentSessionEvents.sessionEntityId, agentSessionEvents.seq] })
  .returning({ kind: agentSessionEvents.kind, payload: agentSessionEvents.payload, ts: agentSessionEvents.ts });

// 2. дельты считаем по `inserted`, НЕ по исходному батчу
const dMsg  = inserted.filter((e) => e.kind === "message").length;
const dTool = inserted.filter((e) => e.kind === "tool_call").length;
const dIn   = inserted.reduce((s, e) => s + (e.payload.tokensIn ?? 0), 0);
const dOut  = inserted.reduce((s, e) => s + (e.payload.tokensOut ?? 0), 0);
const dLast = inserted.reduce<Date | null>((m, e) => (e.ts && (!m || e.ts > m) ? e.ts : m), null);

// 3. инкремент в той же транзакции (bigint-накопитель для токенов, §2 п.9)
await tx.update(agentSessions).set({
  eventCount:    sql`${agentSessions.eventCount}    + ${inserted.length}`,
  messageCount:  sql`${agentSessions.messageCount}  + ${dMsg}`,
  toolCallCount: sql`${agentSessions.toolCallCount} + ${dTool}`,
  tokensIn:      sql`${agentSessions.tokensIn}  + ${dIn}`,
  tokensOut:     sql`${agentSessions.tokensOut} + ${dOut}`,
  lastEventAt:   dLast ? sql`GREATEST(${agentSessions.lastEventAt}, ${dLast})` : undefined,
}).where(eq(agentSessions.entityId, sessionEntityId));
// `appended = inserted.length`.
```

Альтернатива при подозрении на рассинхрон — полный COUNT/SUM из `agent_session_events` в той же транзакции
(дороже, но самовосстанавливающийся). Тот же принцип применяется к `importTranscript` (§2 п.4).

**6) `promote`** — input: `sessionRef & { target: z.enum(["note","task"]), seqFrom:int, seqTo:int,
title:string.min(1).max(200) }`. output: `{ entityId, edgeId }`. Делегирует **graph-сервису ядра**:
`graph.create({ kind: target, title, markdown: <склейка text событий [seqFrom..seqTo]> })` +
`graph.promote/link` ребром `derived_from` (`note|task → agent_session`). Узел сессии не дублируется.
Ошибка `BAD_REQUEST` если `seqFrom>seqTo` или диапазон пуст.

**7) `setStatus`** — input: `sessionRef & { status: agentSessionStatusEnum }`. output: `SessionCard`.
Правила переходов: `idle↔archived` свободно; `→active` запрещён вручную (ставится только runtime при resume),
иначе `BAD_REQUEST`; `failed` можно сбросить в `idle` (повторный импорт). Зеркалит `entities.status`
(`archived`→`entities.status="archived"`).

**8) `requestResume`** — input: `sessionRef & { targetDeviceId?: z.string(), idempotencyKey:
z.string().uuid() }`. output: `{ commandId, status }`. Бизнес-правила:
- `PRECONDITION_FAILED`, если у сессии нет `cwd` или `resumeArgv` (нечего возобновлять).
- Rate-limit: не более N resume/мин на пользователя → `TOO_MANY_REQUESTS` + `Retry-After`.
- **Адресация устройства (исправление ревью):** `agent_commands` выбирается исполнителем по индексу
  `(target_device_id, status)` — без `targetDeviceId` команда не будет адресно подхвачена desktop-executor'ом.
  Источник `deviceId`: транскрипт привязан к машине, где лежат `transcriptPath`/`cwd`, поэтому
  (а) клиент передаёт `targetDeviceId` явно (desktop знает свой id), либо (б) сервер резолвит устройство
  пользователя по последнему активному `agent_commands`/presence источника. При INSERT проставляем
  `targetDeviceId` и `targetDeviceType="desktop"`. Если устройство не резолвится — `PRECONDITION_FAILED`.
- Действие: вставка строки в существующую `agent_commands` (`tool="agent_session.resume"`,
  `targetDeviceId`, `targetDeviceType="desktop"`, `params={ sessionEntityId, cwd, argv, envKeys,
  idempotencyKey }`, `status="pending"`, `timeoutAt`). Desktop-исполнитель читает её через Electric по
  `(target_device_id, status="pending")`, поднимает PTY через `@rox/pty-daemon` и обновляет статус через
  `agentRouter.updateCommand` (уже существует). Секреты (env) — НЕ в `params`; имена ключей в `envKeys`,
  значения тянутся на устройстве из `secret-store`/`getDecryptedConfig` источника.

**Идемпотентность (00 §3, POST с побочкой) — атомарная, через выделенную колонку.** Хранение ключа в
`agent_commands.params.idempotencyKey` (jsonb, без unique-индекса) **не даёт** работающей идемпотентности:
`SELECT-then-INSERT` создаёт дубль при гонке параллельных запросов (проверено: `agent_commands` имеет
индексы только `(user,status)`, `(target_device,status)`, `(org,created)` — никакого уникального по ключу).
Поэтому идемпотентность реализуется атомарно на уровне БД — см. **§5.1 (расширение ядра: колонка
`idempotency_key` + partial uniqueIndex + `INSERT ... ON CONFLICT DO NOTHING RETURNING`)**. Повтор с тем же
ключом возвращает существующую команду (тот же `commandId`), без второй строки и без гонки.

**9) `attachUsage`** — input: `sessionRef & { seq:int, modelId:string, tokensIn:int.max(2_147_483_647),
tokensOut:int.max(2_147_483_647), usdCost:string(Decimal), roxCost:string(Decimal), idempotencyKey:uuid }`.
output: `{ usageRequestId, ledgerId }`. Создаёт строку `usage_requests` (00 economy) + `rox_ledger`
(kind=`usage`, `deltaRox = -roxCost`) в транзакции, проставляет `agent_session_events.usageRequestId`,
инкрементит агрегаты сессии.

- **Типы токенов (исправление ревью): per-step = int32, агрегат сессии = bigint.** `usage_requests.tokensIn/
  tokensOut` — `integer` (проверено в `economy.ts`), а `agent_sessions.tokensIn/tokensOut` — `bigint`. Поэтому
  `attachUsage` принимает **per-step** значения и Zod-валидирует их верхней границей `int32`
  (`.max(2_147_483_647)`); запись в `usage_requests` хранит ровно эти небольшие per-step числа. `bigint`-поля
  `agent_sessions` — **накопитель** (`+= step`), который может перерасти `2^31` без переполнения, т.к. это
  отдельный bigint. Так агрегаты сессии и сумма per-step `usage_requests` не расходятся: контракт «один шаг —
  одна строка `usage_requests` с int32, накопленный bigint — сумма шагов».
- **Атрибуция usage → сессии (исправление ревью): прямой обратной ссылки нет, фиксируем источник истины.**
  `usage_requests` исторически связан с `chat_sessions` (`chatSessionId`), но **не** с entity агент-сессии;
  единственная связь — обратная, через `agent_session_events.usageRequestId`. Чтобы не блокироваться на правке
  ядра economy, фиксируем: (1) **источник истины стоимости сессии** — денормализованные агрегаты
  `agent_sessions` (`usdCost/roxCost/tokensIn/tokensOut`) + per-event `agent_session_events.usageRequestId`;
  (2) для обратной трассировки/аудита пишем `sessionEntityId` в `usage_requests.trace.sessionEntityId`
  (jsonb, без FK) — это даёт выборку «usage_requests данной сессии» по `trace->>'sessionEntityId'`;
  (3) реконсиляция (сумма строк economy ↔ агрегат) идёт через `agent_session_events.usageRequestId`.
- **Идемпотентность (00 §3) — атомарная.** Хранение ключа в `usage_requests.trace.idempotencyKey` (jsonb, без
  unique-индекса) **не защищает** от гонки (SELECT-then-INSERT → дубль строки economy + двойное списание
  `rox_ledger`). Реализуется атомарно через выделенную колонку `idempotency_key` + partial uniqueIndex +
  `INSERT ... ON CONFLICT DO NOTHING RETURNING` — см. **§5.2 (расширение ядра economy)**. Повтор с тем же
  ключом → no-op (тот же `usageRequestId`, без второго списания).

**10) `costSummary`** — input: `orgScoped & { v2ProjectId?, agentSourceId?, from?:Date, to?:Date }`.
output: `{ tokensIn, tokensOut, usdCost, roxCost, sessionCount }` (Decimal-строки). Агрегация по
`agent_sessions`. Только чтение.

**11) `liveOutput`** — subscription, input: `sessionRef`. yield: `{ chunk: string, at: Date }`. Это
read-side relay-подписки (A3). **Сверка с фактическим API relay (исправление ревью):** в `apps/relay` нет
именованного pub/sub по `entityId`; канал открывается как туннель host↔client
`tunnelManager.openWsChannel(hostId, path, query, clientWs): channelId` (см. `apps/relay/src/tunnel.ts`),
далее `sendWsFrame(hostId, channelId, data)` / `closeWsChannel(hostId, channelId)`. Поэтому маппинг такой:
- **hostId** = id desktop-устройства, поднявшего PTY (тот же `targetDeviceId` из `requestResume`).
- **path** = `"/agent-session/" + sessionEntityId` (логический адрес стрима внутри туннеля; entityId едет в
  path, а НЕ как имя глобального канала).
- **publisher** = desktop-executor: он подключён к relay как host и шлёт `ws:frame` с UTF-8 байтами вывода
  PTY в открытый `channelId`.
- **subscriber** = api (этот endpoint): открывает ws-канал к relay (`openWsChannel(hostId, path)`),
  читает входящие фреймы и форвардит их клиенту как SSE `{ chunk, at }`.
- **закрытие:** на `exit` PTY desktop шлёт close → `closeWsChannel` → SSE-подписка завершается.

PTY-ввод идёт НЕ через tRPC, а напрямую desktop↔pty-daemon (см. §3). То есть relay используется как
существующий host↔client туннель (адресация по `hostId`+`path`), без введения нового именованного канала
`session:{id}`.

### 2.2 Интеграция с graph-сервисом ядра

Узел сессии **никогда** не пишется напрямую в `entities` из этого роутера — только через `graph.create`
(00 §2.6). Рёбра — через `graph.link`/`graph.promote`. Эта подсистема владеет лишь `agent_sessions` +
`agent_session_events` + строкой `activity_events(kind="session")`. Это сохраняет инвариант «один писатель
узла» из 00 §2.

---

## 3. Сервисы/процессы/протоколы

### 3.1 SessionAdapter (формат-адаптеры, A6) — единый интерфейс

Пакет `packages/scripts` (CLI-тулинг) или новый `packages/agent-sessions` — адаптеры за общим интерфейсом;
вызываются desktop-индексатором.

```ts
export interface ParsedSession {
	format: AgentTranscriptFormat;
	externalSessionId?: string;
	title: string;
	cwd?: string;
	model?: string;
	resumeArgv?: string[];
	gitBranch?: string;
	gitRemote?: string;
	events: InsertAgentSessionEvent[]; // нормализованные (seq, kind, role, text, payload, ts)
	contentHash: string;               // sha256 сырого файла
}
export interface SessionAdapter {
	readonly format: AgentTranscriptFormat;
	canParse(path: string, head: string): boolean; // дешёвая проверка по первым строкам
	parse(path: string): Promise<ParsedSession>;    // потоковый разбор jsonl
	resumeArgv(session: ParsedSession): string[];   // как возобновить через CLI
}
```

Реализации v1: `ClaudeCodeAdapter`, `CodexAdapter`, `HermesAdapter` — читают свои jsonl-форматы и маппят на
`agentSessionEventKindValues`/`agentSessionRoleValues`. Регистр адаптеров выбирает первый `canParse`.

### 3.2 Индексатор (desktop, фоновый watcher)

- **Назначение:** наблюдает каталоги транскриптов (`~/.claude/projects/**`, аналоги Codex/Hermes),
  на новый/изменённый файл вызывает `SessionAdapter.parse`, считает `contentHash`, и шлёт
  `agentSession.importTranscript` (или `appendEvents` для активных).
- **Дедуп:** `contentHash` → no-op при совпадении (идемпотентность §2 п.4).
- **Крупные файлы (A8):** при `size>256 КБ` адаптер заливает сырой jsonl в minio
  `org-<orgId>/sessions/<entityId>/transcript.jsonl`, в `importTranscript` передаёт `storageRef`, инлайн —
  только «хвост»/индекс-события.
- **Supervision:** индексатор — часть desktop main-процесса; перезапуск через `host-service` как прочие
  sidecar (00 §2C/Часть 2C).

### 3.3 Resume через pty-daemon (контракт, уже реализован в репо)

`@rox/pty-daemon` — Unix-socket, framed-протокол v2 (header JSON + binary tail; ввод/вывод — в tail, не
base64). Контракт (из `packages/pty-daemon/src/protocol/messages.ts`):
- handshake `hello`/`hello-ack`;
- `open {id, meta:{ shell, argv, cwd, env, cols, rows }}` → `open-ok {id, pid}` — запуск resume-команды
  CLI-агента (`argv` из `SessionAdapter.resumeArgv`);
- `input {id}` (+ tail) — клавиатура; `output {id}` (+ tail) — вывод; `resize`; `subscribe {id, replay}` —
  переподключение с реплеем буфера; `exit`/`closed`.

**Поток resume (end-to-end):**
```
[UI «Resume»] → agentSession.requestResume → INSERT agent_commands(tool="agent_session.resume",
                                              targetDeviceId, pending)
      → (Electric down-sync, выборка по (target_device_id, status)) → [desktop executor]
      → читает secret-store env по resumeEnvKeys → pty-daemon.open(argv,cwd,env)
      → стрим output байтов → relay ws:frame в openWsChannel(hostId=device,
                              path="/agent-session/{entityId}")  ──┐
      → agentRouter.updateCommand(status="running"|"done")          │
[UI терминал] ← agentSession.liveOutput (SSE) ← relay ws-подписка ──┘
[UI ввод] → desktop preload bridge → pty-daemon.input  (НЕ через tRPC)
```
Десктоп при появлении новых шагов параллельно зеркалит их в граф через `appendEvents` (чтобы транскрипт
жил и после закрытия PTY).

### 3.4 Sync/realtime топология (00 §2E, A3)

- **Turso/libSQL (local-primary):** `agent_sessions`, `agent_session_events` — приватные/тяжёлые, живут
  локально; «шапка» (узел `entities`) реплицируется Electric **вниз** (cache-first).
- **Postgres/Neon:** канонические `entities`/`edges`/`activity_events`/`usage_requests`/`rox_ledger`.
- **relay/streams (A3):** живой PTY-вывод идёт по существующему host↔client туннелю relay
  (`openWsChannel(hostId, path="/agent-session/{entityId}")` — см. §2 п.11, сверено с
  `apps/relay/src/tunnel.ts`; НЕ именованный канал `session:{entityId}`) + presence «сессия активна». Новый
  realtime-стек НЕ вводим.
- **Конфликт-резолюция:** `agent_session_events` append-only → конфликтов контента нет (уникальность по
  `(sessionEntityId, seq)`, реимпорт = no-op). Агрегаты `agent_sessions` — last-writer-wins (пересчёт
  идемпотентен из событий). `status` — last-writer-wins, но `active` устанавливает только runtime.

---

## 4. UI-спецификация

Feature-модуль desktop `sessions` (lazy, 00 §2C). Экраны рендерятся через live-queries (Electric/TanStack DB)
с **cache-first** (AGENTS.md правило 9): уже синхронизированные строки показываем сразу, `isReady` влияет
только на ветку «данных ещё нет».

### 4.1 Экраны/панели

| Экран | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **SessionsList** | список сессий org/проекта | skeleton-строки только при `!isReady && data.length===0` | «Нет сессий — запусти агента или импортируй» | баннер + Retry | таблица `SessionCard` (TanStack Table), сорт по `lastEventAt`; при `!isReady && data.length>0` — рендер данных + тонкий progress |
| **SessionDetail** | транскрипт + агрегаты | skeleton при пустом кэше | «Транскрипт пуст / в minio — Загрузить» | inline-error + Retry | виртуализированный список событий (по `seq`), бейджи kind/role, кнопки Promote/Resume |
| **LiveTerminal** | живой PTY (resume) | «Подключение к сессии…» | — | «PTY завершился (code N)» | xterm.js-вьюпорт, ввод→preload bridge, вывод←`liveOutput` |
| **CostDashboard** (Paperclip) | стоимость/токены | skeleton-карточки | «Нет затарифицированных прогонов» | inline-error | карточки `costSummary` + разбивка по source/model |

### 4.2 UI-примитивы (`packages/ui`, выбранные библиотеки — 00 §2D)

- **Data-grid** сессий: **TanStack Table** поверх `table.tsx` (как в 2D). Новый компонент
  `packages/ui/src/components/SessionTable/SessionTable.tsx` (+ `index.ts`).
- **Терминал:** **xterm.js** в новом `packages/ui/.../Terminal/Terminal.tsx` (DOM-рендер; ввод/вывод —
  через пропсы-колбэки, без прямого доступа к pty в UI-слое).
- **Транскрипт:** виртуализация `@tanstack/react-virtual` поверх `scroll-area.tsx`; бейджи — `badge.tsx`.
- Дашборд — `card.tsx` + существующие графики.

```ts
// Контракт пропсов ключевых компонентов
export interface SessionTableProps {
	data: SessionCard[];
	isReady: boolean;                       // cache-first: НЕ скрывать data при false
	onOpen(entityId: string): void;
	onResume(entityId: string): void;
	onArchive(entityId: string): void;
}
export interface TerminalProps {
	output: string;                          // накопленный вывод (из liveOutput)
	onData(bytes: string): void;             // ввод пользователя → preload bridge
	onResize(cols: number, rows: number): void;
	status: "connecting" | "live" | "exited";
	exitCode?: number | null;
}
export interface TranscriptViewProps {
	events: SessionEvent[];
	isReady: boolean;
	onPromote(range: { seqFrom: number; seqTo: number }, target: "note" | "task"): void;
}
```

### 4.3 User-flows (на уровне кликов)

1. **Импорт+просмотр:** пользователь открывает `sessions` → индексатор уже подхватил
   `~/.claude/projects/...` → в SessionsList появляется строка (cache-first) → клик по строке → SessionDetail
   рендерит события из кэша мгновенно, догружает хвост через `events` → скролл транскрипта.
2. **Resume:** SessionDetail → кнопка «Resume» → (нет `cwd`→тост `PRECONDITION_FAILED`) → иначе спиннер на
   кнопке → `requestResume(idempotencyKey)` → открывается LiveTerminal («Подключение…») → как только desktop
   поднял PTY и relay пошёл — статус `live`, вывод стримится → пользователь печатает (ввод→preload→pty) →
   по `exit` статус `exited(code)`.
3. **Promote → задача:** в TranscriptView выделение диапазона событий (shift-клик по `seq`) → «Promote → Task»
   → диалог с предзаполненным title → `promote` → тост со ссылкой на новый узел `task`; в графе появляется
   ребро `derived_from`.

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- SessionsList: полноценная клавиатурная навигация (↑/↓ строки, Enter — открыть, `R` — resume, `E` —
  archive); видимый focus-ring; `role="grid"`, `aria-rowindex`; live-region для «N новых сессий».
- LiveTerminal: xterm имеет встроенный a11y-режим (screen-reader buffer); экранное уведомление о
  подключении/выходе через `aria-live="polite"`; Esc — расфокус терминала (чтобы не перехватывал хоткеи).
- TranscriptView: каждое событие — `role="article"` с `aria-label` (роль+kind+время); кнопки Promote/Resume
  достижимы Tab; контраст бейджей ≥ 4.5:1.
- Все интерактивы — `<button>`/`<a>` (не div), таргеты ≥ 24×24 px (WCAG 2.2 «Target Size»).

---

## 5. Миграция и обратная совместимость

- **Характер:** в основном аддитивная миграция — две новые таблицы (`agent_sessions`,
  `agent_session_events`), четыре новых pgEnum (`agent_session_status`, `agent_session_role`,
  `agent_session_event_kind`, `agent_transcript_format`). Ядро графа и enum'ы
  (`entityKind="agent_session"`/`activityEventKind="session"`) — **не изменяются** (уже в `enums.ts`).
  **Исключение (исправление ревью):** для атомарной идемпотентности `requestResume`/`attachUsage` к двум
  существующим таблицам добавляются по одной нулевой/`NULL`-колонке + partial uniqueIndex — это аддитивное
  расширение ядра (см. §5.1, §5.2), а не изменение семантики существующих колонок. Существующие
  `agent_sources`, `chat_sessions` — без изменений.

### 5.1 Расширение ядра: `agent_commands.idempotency_key` (для `requestResume`)

Хранение idempotency-ключа в `agent_commands.params.idempotencyKey` (jsonb) **не даёт** атомарной
идемпотентности (SELECT-then-INSERT → дубль при гонке; уникального индекса по jsonb-полю нет — проверено,
у таблицы лишь `(user,status)`/`(target_device,status)`/`(org,created)`). Поэтому добавляем выделенную
колонку и partial uniqueIndex в `packages/db/src/schema/schema.ts` (где живёт `agentCommands`):

```ts
// schema.ts — ДОБАВИТЬ в pgTable("agent_commands", { ... }) и его index-список:
idempotencyKey: uuid("idempotency_key"), // nullable: только resume-команды его проставляют
// ...
uniqueIndex("agent_commands_org_idempotency_uniq")
  .on(table.organizationId, table.idempotencyKey)
  .where(sql`${table.idempotencyKey} IS NOT NULL`),
```

Реализация в `requestResume` — атомарный upsert (без гонки):

```ts
const [row] = await dbWs
  .insert(agentCommands)
  .values({
    userId, organizationId, targetDeviceId, targetDeviceType: "desktop",
    tool: "agent_session.resume", status: "pending", idempotencyKey, timeoutAt,
    params: { sessionEntityId, cwd, argv, envKeys, idempotencyKey },
  })
  .onConflictDoNothing({ target: [agentCommands.organizationId, agentCommands.idempotencyKey] })
  .returning({ id: agentCommands.id, status: agentCommands.status });
// row === undefined → конфликт по ключу → SELECT существующей команды по (org, idempotencyKey)
// и возврат её commandId. Гонки нет: уникальность гарантируется БД.
```

### 5.2 Расширение ядра economy: `usage_requests.idempotency_key` (для `attachUsage`)

Симметрично §5.1: `usage_requests.trace.idempotencyKey` (jsonb) не защищает от двойного списания
`rox_ledger` при гонке. Добавляем колонку + partial uniqueIndex в `packages/db/src/schema/economy.ts`:

```ts
// economy.ts — ДОБАВИТЬ в pgTable("usage_requests", { ... }) и его index-список:
idempotencyKey: uuid("idempotency_key"), // nullable: проставляют только idempotent-вызовы (attachUsage)
// ...
uniqueIndex("usage_requests_org_idempotency_uniq")
  .on(t.organizationId, t.idempotencyKey)
  .where(sql`${t.idempotencyKey} IS NOT NULL`),
```

`attachUsage` использует `INSERT ... ON CONFLICT (organization_id, idempotency_key) DO NOTHING RETURNING`
для `usage_requests`; при конфликте — no-op (тот же `usageRequestId`, без второго `rox_ledger`-списания).
Обратная трассировка к сессии — `trace.sessionEntityId` (§2 п.9), это остаётся в jsonb (только для аудита,
не для уникальности).

- **Команда генерации:** изменить `packages/db/src/schema/agentSession.ts` + `enums.ts` (§1),
  `schema.ts` (§5.1) и `economy.ts` (§5.2), добавить экспорт detail-таблиц в
  `packages/db/src/schema/index.ts` (агрегатор схемы), затем
  `bunx drizzle-kit generate --name="agent_sessions_detail"` (offline diff, 00 §3 — миграции руками не
  править). Колонки `idempotency_key` добавляются как `NULL`-аемые → существующие строки валидны без backfill.
- **Backfill (опциональный, не блокирующий):** одноразовый CLI-скрипт в `packages/scripts` прогоняет
  существующие локальные транскрипты через `SessionAdapter` → `importTranscript`. Полностью идемпотентен
  по `contentHash` (повторный прогон безопасен).
- **Обратная совместимость:** новых обязательных полей в существующих таблицах нет → старые клиенты
  работают без изменений; feature-модуль `sessions` lazy-загружается, отсутствие данных = пустой список.
- **Down-миграция (концепт):** `DROP TABLE agent_session_events; DROP TABLE agent_sessions;
  DROP TYPE agent_session_event_kind, agent_session_role, agent_session_status, agent_transcript_format;`
  плюс откат расширений ядра: `DROP INDEX agent_commands_org_idempotency_uniq;
  ALTER TABLE agent_commands DROP COLUMN idempotency_key;` и аналогично для `usage_requests` (§5.1/§5.2) —
  обе колонки `NULL`-аемые, дроп безопасен. Узлы `entities(kind="agent_session")` и их рёбра остаются (ядро
  их владелец) — их чистка отдельным шагом graph-сервиса. Данные тарификации в `economy.*` сохраняются
  (ссылки `set null`).

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Создание узла через ядро.** Given валидный транскрипт; When `importTranscript`; Then создаётся ровно один
   `entities(kind="agent_session")` (через graph-сервис), одна `agent_sessions`, N `agent_session_events`,
   одно `activity_events(kind="session")`; прямых INSERT в `entities` из роутера нет.
2. **Идемпотентность импорта.** Given сессия импортирована; When повтор `importTranscript` с тем же
   `contentHash`; Then `created:false`, число `agent_session_events` не меняется, ошибки нет.
3. **Дедуп по external id.** Given две попытки импорта с одинаковыми `(organizationId, format,
   externalSessionId)`; When вторая; Then та же `entityId`, события домерживаются без дублей `(seq)`.
4. **Пагинация транскрипта.** Given 250 событий; When `events(limit=100)` трижды с `afterSeq`; Then получены
   все 250 строго по возрастанию `seq`, без пропусков/дублей.
5. **Cache-first рендер.** Given live-query вернула строки при `isReady=false`; When рендер SessionsList;
   Then строки видны сразу (data не скрыта), скелетон показан только при `data.length===0 && !isReady`.
6. **Promote.** Given диапазон `[seqFrom..seqTo]`; When `promote(target="task")`; Then создан `entities(kind=
   "task")` через ядро + ребро `derived_from` (task→agent_session); ответ содержит `entityId,edgeId`.
7. **Resume idempotent (атомарно).** Given две **параллельные** `requestResume` с одним `idempotencyKey`;
   Then за счёт `INSERT ... ON CONFLICT (organization_id, idempotency_key) DO NOTHING` (§5.1) создаётся ровно
   одна `agent_commands`, оба ответа с тем же `commandId` (без гонки/дубля), и у строки задан `targetDeviceId`.
8. **Resume precondition.** Given сессия без `cwd`/`resumeArgv`; When `requestResume`; Then
   `PRECONDITION_FAILED`, команда не создаётся.
9. **Resume rate-limit.** Given превышен лимит resume/мин; When `requestResume`; Then `TOO_MANY_REQUESTS` с
   `Retry-After`.
10. **Live-вывод.** Given desktop поднял PTY и шлёт `ws:frame` байты в relay-туннель
    `openWsChannel(hostId=device, path="/agent-session/{entityId}")`; When клиент подписан на `liveOutput`;
    Then чанки приходят по порядку; при `exit` → `closeWsChannel` → подписка закрывается.
11. **Секреты не утекают.** Given resume; Then в `agent_commands.params` нет значений секретов — только
    `resumeEnvKeys` (имена); значения резолвятся на устройстве из secret-store; в логах токенов нет.
12. **Тарификация.** Given `attachUsage(roxCost="1.5")`; Then создан `usage_requests` + `rox_ledger(kind=
    "usage", delta=-1.5)`, `agent_session_events.usageRequestId` проставлен, агрегаты сессии увеличены
    (bigint-накопитель `tokens*`), `usage_requests.trace.sessionEntityId` записан; `costSummary` отражает
    прирост. Повтор с тем же `idempotencyKey` — атомарный no-op (§5.2): ни второй `usage_requests`, ни второго
    списания `rox_ledger`.
13. **Org-изоляция.** Given сессия в org A; When любой вызов с `organizationId=B` пользователем A; Then
    `NOT_FOUND`/`FORBIDDEN`, данные A не возвращаются.
14. **Деньги/время.** Then все денежные поля — `numeric(20,6)` (строки Decimal), времена — `timestamptz`
    (UTC); нет `float`/локального времени.
15. **Lint/типы.** Then `bun run lint` = 0, `bun run typecheck` = 0; `$inferInsert`/`$inferSelect`
    экспортированы; миграция сгенерирована `drizzle-kit generate` (не правлена руками).

---

## 7. Тест-план

**Unit (Bun, ко-локация):**
- `agent-session/schema.test.ts` — Zod: границы (limit, seq>=0, Decimal-строки, uuid), reject невалидных.
- `adapters/*.test.ts` — `ClaudeCodeAdapter`/`CodexAdapter`/`HermesAdapter`: фикстуры jsonl → ожидаемые
  нормализованные события (`seq/kind/role`), стабильный `contentHash`, `resumeArgv`.
- Чистые функции агрегации (пересчёт `eventCount/tokens*` из событий).

**Integration (neon-branch, 00 §3 / AGENTS.md «DB migrations»):** поднять временную neon-ветку, указать root
`.env` (никогда не прод), прогнать миграцию `agent_sessions_detail`, затем:
- `importTranscript` happy-path + идемпотентность (AC 1–3) — проверить таблицы напрямую.
- `events` keyset (AC 4), `promote` ребро `derived_from` (AC 6) против реального ядра/мока graph-сервиса.
- `requestResume` идемпотентность/precondition/rate-limit (AC 7–9) против `agent_commands`.
- `attachUsage` → `usage_requests`+`rox_ledger` (AC 12), `costSummary` агрегаты.
- Зеркалить дисциплину секрет-проекции из существующего `agentSource.test.ts` (encrypted/секреты не в выдаче).

**e2e-сценарий (desktop):** импорт реального транскрипта Claude Code → строка в SessionsList → открыть →
Resume → LiveTerminal получает вывод → ввод команды → `exit` → транскрипт дозаписан в граф (`appendEvents`).

**Команды:**
```bash
bun test packages/trpc/src/router/agent-session     # роутер + схемы
bun test packages/agent-sessions                    # адаптеры (или packages/scripts)
bun test packages/db                                 # smoke миграции/типы
bun run lint && bun run typecheck                    # CI-гейт (00 §3)
```
Целевое покрытие изменённого кода — ≥ 80% веток (00 §3): акцент на адаптерах, идемпотентности импорта/resume,
тарификации.

---

## 8. Задачи реализации (ordered work-list, PR-able срезы)

1. **PR-1 (enums + схема + расширения ядра).** `packages/db/src/schema/enums.ts` (+4 enum-набора §1.1),
   `packages/db/src/schema/agentSession.ts` (§1.2), **+ колонка `idempotency_key` и partial uniqueIndex в
   `schema.ts` (`agent_commands`, §5.1) и `economy.ts` (`usage_requests`, §5.2)**, экспорт detail-таблиц в
   `packages/db/src/schema/index.ts`; `bunx drizzle-kit generate --name="agent_sessions_detail"`.
   **Блокирующая зависимость: ядро #1** (`entities` из `./entity` — импорт в §1.2 помечен TODO(#1)); PR-1
   стартует только после мержа #1.
2. **PR-2 (Zod-схемы роутера).** `packages/trpc/src/router/agent-session/schema.ts` (§2.1) + unit-тесты.
3. **PR-3 (роутер: чтение/импорт).** `agent-session/agentSession.ts`: `list`/`get`/`events`/`importTranscript`/
   `appendEvents`/`setStatus`; интеграция с graph-сервисом ядра; регистрация в корневом `appRouter`.
   Integration-тесты (neon-branch). Зависит от PR-1, PR-2.
4. **PR-4 (промоут + тарификация).** `promote`, `attachUsage`, `costSummary`; связь с `economy.*`. Зависит
   от PR-3.
5. **PR-5 (resume-команды).** `requestResume` (+ атомарная идемпотентность через
   `agent_commands.idempotency_key` §5.1, `targetDeviceId`-адресация §2 п.8, precondition/rate-limit) поверх
   `agent_commands`; reuse `agentRouter.updateCommand`. Зависит от PR-1 (колонка), PR-3.
6. **PR-6 (SessionAdapter + индексатор).** `packages/agent-sessions` (или `packages/scripts`): интерфейс
   `SessionAdapter` (§3.1) + 3 адаптера + desktop-watcher (§3.2) с дедупом и minio-offload (A8). Зависит
   от PR-3.
7. **PR-7 (UI-примитивы).** `packages/ui`: `SessionTable`, `Terminal` (xterm.js), `TranscriptView` (§4.2) +
   stories/тесты.
8. **PR-8 (desktop feature-модуль `sessions`).** Экраны §4.1, live-queries cache-first, preload-bridge
   ввод↔pty-daemon, подписка `liveOutput`. Зависит от PR-3..PR-7.
9. **PR-9 (CostDashboard / Paperclip).** Экран стоимости поверх `costSummary`. Зависит от PR-4.

**Ключевые точки изменения файлов:** `packages/db/src/schema/{enums.ts,agentSession.ts,index.ts}`;
`packages/db/src/schema/schema.ts` (+`agent_commands.idempotency_key`, §5.1);
`packages/db/src/schema/economy.ts` (+`usage_requests.idempotency_key`, §5.2);
`packages/db/drizzle/*` (только авто-генерация); `packages/trpc/src/router/agent-session/*`;
`packages/trpc/src/router/integration/utils.ts` (reuse `verifyOrgMembership`/`verifyOrgAdmin`);
`packages/trpc/src/root.ts` (регистрация `agentSession`); `packages/agent-sessions/*` (адаптеры/индексатор);
`packages/ui/src/components/{SessionTable,Terminal,TranscriptView}/*`;
`apps/desktop/src/.../features/sessions/*`; `apps/desktop/src/preload/*` (bridge к `@rox/pty-daemon`).

---

## 9. Риски и открытые вопросы

**Риски + митигейшн.**
- **Дрейф форматов транскриптов** (Claude Code/Codex/Hermes меняют jsonl). → Версионировать адаптеры,
  `canParse` по сигнатуре, golden-фикстуры в тестах; неизвестный формат → `status="failed"` без падения
  индексатора.
- **Раздувание `agent_session_events`** на больших сессиях. → minio-offload крупных транскриптов (A8),
  инлайн только индекс-события; виртуализация в UI; индекс `(sessionEntityId, seq)` для keyset.
- **Гонки resume / зомби-PTY.** → Идемпотентность по `idempotencyKey`, `timeoutAt` на `agent_commands`,
  supervision pty-daemon (`prepare-upgrade`/replay уже в протоколе); один активный resume на сессию (проверка
  `status="active"` перед стартом).
- **Утечка секретов в `agent_commands`/логи.** → В `params` только `resumeEnvKeys`; значения — из secret-store
  на устройстве; PII/токены не логируются (00 §3).
- **Стоимость без usage в транскрипте** (агент не отдаёт токены). → `attachUsage` опционален; агрегаты с
  нулями; дашборд помечает «cost unknown».
- **Cache-first регресс** (скрытие данных при `isReady=false`). → Явный пропс `isReady` в компонентах + AC 5
  + ревью по AGENTS.md правилу 9.

**Не-блокирующие открытые вопросы.**
- Хранить ли `agent_session_events` в Postgres-зеркале для командных сессий, или строго local-Turso
  (00 §2E)? v1 — local-primary; командный шеринг — позже.
- Гранулярность qdrant: point-per-session (выбрано) vs дополнительный point-per-tool_call для семантического
  поиска по инструментам — отложено.
- Единый `packages/agent-sessions` vs размещение адаптеров в `packages/scripts` — уточнить при PR-6 (зависит
  от того, нужен ли рантайму import вне CLI).
- Точный rate-limit resume (N/мин) и retention сырых транскриптов в minio — параметры конфигурации,
  согласовать с #2/приватностью (Часть 2B).
