# 00 — Общий контракт L3-спецификаций Rox Super-App

> **Назначение.** Единый источник истины для пакета L3 implementation-ready ТЗ по подсистемам
> **1, 2, 3, 4, 8, 10, 11, 15**. Каждая отдельная спека ОБЯЗАНА ссылаться на этот файл и **не переопределять**
> зафиксированные здесь контракты (ядро графа, enum'ы, конвенции, допущения). Если спеке нужно расширить enum —
> она добавляет значения, а не меняет существующие.
>
> Родительские документы (контекст, НЕ дублировать, ссылаться):
> - `plans/rox-superapp-roadmap-and-design.md` — поэтапный roadmap + углублённый дизайн (Часть 2).
> - `~/.claude/plans/cozy-kindling-sutherland.md` — финальное состояние, 30 решений (D1–D30), Part C–J.

---

## 1. Карта подсистем пакета

| # | Подсистема | Фаза | Файл спеки | Модель/API уже в коде |
|---|---|---|---|---|
| 1 | Ядро графа (entities/edges/identity/activity + поиск) | 0 | `01-core-graph.md` | частично: `knowledge.ts`, `journal.ts`, `relations.ts` |
| 2 | Инфра-рантайм (minio/qdrant/Turso/Electric/embedder/sync) | 0 | `02-infra-runtime.md` | `local-db`, `host-provisioner`, `host-service`, `electric-proxy`, `relay`, `streams` |
| 3 | Знание/Заметки (PKM) | 1 | `03-pkm-notes.md` | `knowledge.ts` + router `notes` + `knowledge` |
| 4 | Задачи (GTD) | 1 | `04-tasks-gtd.md` | router `task` |
| 8 | Захват (Capture/timeline-спина) | 3 | `08-capture.md` | `macos-process-metrics` (native addon.cc), `pty-daemon` |
| 10 | Чат (нативный) | 4 | `10-chat.md` | `packages/chat` (client/server/shared) + router `chat` + `relay`/`streams` |
| 11 | Агент-сессии | 4 | `11-agent-sessions.md` | `agent.ts` + router `agent`/`agent-source` + `economy.ts` + `pty-daemon` |
| 15 | Design-воркспейс (Open Design) | 5 | `15-design-workspace.md` | MCP `open-design` подключён; `mcp`/`mcp-v2` пакеты |

Зависимости: **все 7 доменных подсистем (3,4,8,10,11,15) зависят от #1 (ядро графа) и #2 (рантайм)**.
Поэтому #1 — каноничен по схеме `entities/edges/identity_links/activity_events`; остальные определяют
только свои **detail-таблицы 1:1 к `entityId`** и НЕ переопределяют ядро.

---

## 2. Фиксированный контракт ядра графа (ground truth — НЕ менять)

Файлы ядра: `packages/db/src/schema/{entity,edges,identity,activity}.ts` + расширение `enums.ts`.
Конвенции зеркалят `agent.ts`/`knowledge.ts`/`journal.ts`.

### 2.1 Enum-расширения (`enums.ts`)
```ts
export const entityKindValues = [
  "note","email","email_thread","message","channel","task","project","area",
  "calendar_event","agent_session","activity_event","feed","feed_item","file",
  "design_artifact","contact","osint_entity","tag","journal",
] as const;
export const edgeRelationValues = [
  "links_to","derived_from","attached_to","scheduled_as","blocks","mentions",
  "authored_by","participant_of","replies_to","child_of","tagged_with","about",
  "references","embeds","captured_from",
] as const;
export const entityStatusValues = ["active","archived","trashed"] as const;
export const identityKindValues = ["email","chat","attendee","git","selector","phone","domain"] as const;
export const activityEventKindValues = ["screen_block","app_usage","session","calendar","comms","feed_read","journal","file_op"] as const;
```

### 2.2 `entities` — универсальный узел
```ts
export const entities = pgTable("entities", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, { onDelete: "set null" }),
  kind: entityKind().notNull(),
  slug: text(),
  title: text().notNull(),
  markdown: text(),
  body: jsonb().$type<Record<string, unknown>>(),
  storageRef: jsonb("storage_ref").$type<{ bucket?: string; key?: string; mime?: string; size?: number }>(),
  sourceRef: jsonb("source_ref").$type<KnowledgeSourceRef>(),
  status: entityStatus().notNull().default("active"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("entities_org_idx").on(t.organizationId),
  index("entities_kind_idx").on(t.kind),
  index("entities_project_idx").on(t.v2ProjectId),
  uniqueIndex("entities_org_kind_slug_uniq").on(t.organizationId, t.kind, t.slug).where(sql`${t.slug} IS NOT NULL`),
]);
```

### 2.3 `edges` — типизированные связи (носитель «промоута»)
```ts
export const edges = pgTable("edges", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  sourceEntityId: uuid("source_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  targetEntityId: uuid("target_entity_id").references(() => entities.id, { onDelete: "set null" }),
  targetSlug: text("target_slug"),
  resolved: boolean().notNull().default(false),
  relation: edgeRelation().notNull(),
  metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("edges_org_idx").on(t.organizationId),
  index("edges_source_idx").on(t.sourceEntityId),
  index("edges_target_idx").on(t.targetEntityId),
  index("edges_relation_idx").on(t.relation),
  uniqueIndex("edges_source_target_relation_uniq").on(t.sourceEntityId, t.targetEntityId, t.relation),
]);
```

### 2.4 `identity_links` — резолв контактов (D6)
```ts
export const identityLinks = pgTable("identity_links", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactEntityId: uuid("contact_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  kind: identityKind().notNull(),
  value: text().notNull(),
  verified: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("identity_links_contact_idx").on(t.contactEntityId),
  uniqueIndex("identity_links_org_kind_value_uniq").on(t.organizationId, t.kind, t.value),
]);
```

### 2.5 `activity_events` — append-only спина timeline (D7)
```ts
export const activityEvents = pgTable("activity_events", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ts: timestamp({ withTimezone: true }).notNull(),
  durationMs: integer("duration_ms"),
  kind: activityEventKind().notNull(),
  sourceEntityId: uuid("source_entity_id").references(() => entities.id, { onDelete: "set null" }),
  payload: jsonb().$type<{ app?: string; window?: string; url?: string; summary?: string; frameRefs?: string[] }>().notNull().default({}),
}, (t) => [
  index("activity_events_user_ts_idx").on(t.userId, t.ts),
  index("activity_events_kind_idx").on(t.kind),
  index("activity_events_source_idx").on(t.sourceEntityId),
]);
```

### 2.6 graph-router (tRPC, ядро) — методы
`create / link / promote / resolveBacklinks / search` (+ `get`, `update`, `archive`, `listByKind`). Каждая
detail-спека добавляет СВОЙ доменный роутер, переиспользуя `entities`/`edges` через graph-сервис, а не дублируя
запись узла.

---

## 3. Конвенции репозитория (обязательны во всех спеках)

**Стек/инструменты (из `AGENTS.md`):**
- Bun (НЕ npm/yarn/pnpm). Turborepo. Biome (`bun run lint:fix`, CI падает на warning).
- Drizzle ORM + Neon Postgres (cloud) + Turso/libSQL (local). Миграции: **только** `bunx drizzle-kit generate --name="<snake_case>"` (offline diff). НИКОГДА не редактировать `packages/db/drizzle/` вручную; не запускать `migrate`/`push` на проде.
- Схема — в `packages/db/src/schema/`. Enums — в `enums.ts`. Zod — `zod.ts`. Relations — `relations.ts`.
- Next.js 16: перехват запросов — `proxy.ts`, НИКОГДА `middleware.ts`.
- TanStack DB / Electric live-queries — **cache-first**: рендерить существующие строки даже при `isReady=false`; строгую готовность ждать только для записи/seeding (см. AGENTS.md правило 9).
- tRPC роутеры — `packages/trpc/src/router/<domain>/`; интеграции с секретами — паттерн `secret-store` (`packages/trpc/src/lib/integrations/secret-store.ts`) + provider-router + OAuth-callback в `apps/api/.../integrations/*`.
- Структура компонентов: одна папка на компонент, `index.ts` barrel, ко-локация тестов/хуков/утилит (см. AGENTS.md «Project Structure»). shadcn — `packages/ui` (`bunx shadcn@latest add`).

**Drizzle-конвенции таблиц (как `agent.ts`/`knowledge.ts`/`journal.ts`):**
- org-scoped cascade FK на `organizations.id`; `uuid().primaryKey().defaultRandom()`; jsonb-тела;
- lifecycle `status` enum ВМЕСТО `deleted_at` (soft-delete = `status='trashed'`/`archived`);
- `created_at`/`updated_at` с `.$onUpdate(() => new Date())`; типы через `$inferInsert`/`$inferSelect`;
- индексы на org + частые фильтры; uniqueIndex на естественные ключи.

**Данные/безопасность (из user CLAUDE.md):**
- Деньги/стоимость — целые (cents) или Decimal, не float. Время — UTC в хранилище.
- Секреты только из env/`secret-store`; не логировать PII/токены. Валидация входов на границе (Zod).
- Идемпотентность для POST с побочными эффектами; rate-limit публичных API (429 + Retry-After).

---

## 4. Принятые допущения по открытым развилкам (зафиксированы для этого пакета)

Пользователь попросил автономное исполнение → спорные развилки решены так (каждая спека повторяет это в разделе «Принятые допущения» и помечает как ревизируемое):

- **A1. Block-редактор (для #3) = BlockNote** (поверх ProseMirror). Причина: нужен markdown-roundtrip для md-on-disk sync; BlockNote даёт блочную сериализацию в markdown из коробки. TipTap — задокументированная альтернатива.
- **A2. Хранилище блоков заметки = `blockTree` jsonb** (ProseMirror/BlockNote JSON) + производный `markdown` text для поиска/диска. Источник истины при конфликте — последняя запись на уровне блока (last-writer-wins) с историей.
- **A3. Realtime для #10/#11 = существующие `apps/relay` + `apps/streams` + Electric** (НЕ вводить новый realtime-стек). Presence/typing — через relay-каналы.
- **A4. STT/overlay (подсистема 12) — ВНЕ пакета.** #8 (Capture) покрывает screen-capture + app-usage + vision-summarizer → `activity_events`. #8 обязана определить контракт `activity_events`, на который подсистема 12 будет опираться.
- **A5. Capture cross-platform sidecar**: интерфейс единый; реализации — macOS ScreenCaptureKit, Windows Graphics.Capture/DXGI, Linux PipeWire. App-usage — расширение `macos-process-metrics` (native) + Win/Linux эквиваленты. В этом ТЗ детально специфицируется **контракт sidecar↔Rox (IPC/протокол) и pipeline**, бинарная per-OS реализация — отдельный имплементационный таск, но её интерфейс описать полностью.
- **A6. Sessions (#11) парсинг форматов** = Claude Code / Codex / Hermes (jsonl-транскрипты); формат-адаптеры за единым интерфейсом `SessionAdapter`. Resume — через `pty-daemon`/CLI.
- **A7. Design (#15)** = встроенный Open Design воркспейс; артефакты (JSX/HTML/CSS) хранятся как `file` в minio, узел `design_artifact`; sandbox исполнения — изолированный iframe/worker. MCP `open-design` уже даёт интерфейс — переиспользовать его модель проектов/файлов/артефактов.
- **A8. minio bucket-конвенция**: один bucket на org `org-<orgId>`, префиксы по домену (`files/`, `frames/`, `recordings/`, `artifacts/`, `exports/`). `storageRef` в `entities`/detail хранит `{bucket,key,mime,size}`.

---

## 5. ОБЯЗАТЕЛЬНЫЙ шаблон L3-ТЗ (структура каждой спеки)

Каждый файл `NN-*.md` ДОЛЖЕН содержать ВСЕ разделы ниже. Цель уровня L3 = «можно отдать исполнителю и он реализует без додумывания». Пустых разделов быть не должно; если что-то неприменимо — явно «N/A + причина».

```
# NN — <Подсистема>: L3 implementation-ready ТЗ

## 0. Резюме и границы
- Что входит / что явно НЕ входит (out of scope). Фаза. Зависимости (от #1/#2 и др.).
- Принятые допущения (со ссылкой на 00-shared-context §4) + что ревизируемо.

## 1. Доменная модель (полная схема БД)
- Полный Drizzle-код ВСЕХ detail-таблиц (1:1 entityId) + новых enum-значений (как diff к §2.1).
- Индексы, уникальные ключи, FK, jsonb-типы ($type<...>), $inferInsert/$inferSelect.
- Какие kind/relation использует из ядра; какие добавляет.
- Маппинг на qdrant (если индексируется): payload-поля, что embed-ится.

## 2. API-контракты (tRPC)
- Полный список процедур роутера: имя, тип (query/mutation/subscription), Zod input, Zod output.
- Бизнес-правила/валидации/ошибки (коды) на каждую процедуру. Идемпотентность где нужно.
- Интеграция с graph-сервисом ядра (как создаёт entity+edge, промоут).
- Где расширяется существующий роутер (notes/task/chat/agent/...), а где новый.

## 3. Сервисы/процессы/протоколы
- Sidecar/фоновые процессы (если есть): назначение, протокол IPC, формат сообщений, lifecycle, supervision (host-service).
- Внешние интеграции: протокол (IMAP/CalDAV/OAuth/CLI/MCP), потоки данных, диаграмма pipeline.
- Sync/realtime: топология (Postgres↔Turso↔client / relay / Electric), конфликт-резолюция.

## 4. UI-спецификация
- Список экранов/панелей; для каждого: назначение, состояния (loading/empty/error/ready — с учётом cache-first), ключевые элементы.
- Новые UI-примитивы (packages/ui) с выбранной библиотекой; контракт пропсов основных компонентов.
- User-flows на уровне кликов для 2–3 ключевых сценариев.
- Доступность (WCAG 2.2 AA), клавиатурная навигация для ключевых виджетов.

## 5. Миграция и обратная совместимость
- Если расширяет существующее (knowledge_documents, agent_sources, chat и т.п.): пошаговый план миграции данных, backfill, обратная совместимость, drizzle-kit generate имя миграции.
- Что удаляется/депрекейтится; стратегия отката (down-миграция концептуально).

## 6. Приёмочные критерии (Given/When/Then)
- Нумерованный список AC, проверяемых машинно/вручную. Покрыть happy-path + ключевые edge-cases.

## 7. Тест-план
- Unit (что), integration (что, какие фикстуры/neon-branch), e2e-сценарий.
- Команды запуска (bun test <path>, smoke). Целевое покрытие изменённого кода ≥80% веток.

## 8. Задачи реализации (ordered work-list)
- Упорядоченный список инкрементов (PR-able срезы), с зависимостями.
- Точки изменения файлов (конкретные пути).

## 9. Риски и открытые вопросы
- Риски + митигейшн. Не-блокирующие открытые вопросы (если остались).
```

**Стиль:** русский, технические идентификаторы — в оригинале. Код — реальный компилируемый Drizzle/TS/Zod
по конвенциям репо. Объём — насколько нужно для L3 (ориентир 250–600 строк на спеку). Не выдумывать
несуществующие пакеты/пути — сверяться с реальной структурой (раздел 1 + чтение кода).
