# Rox Super-App — поэтапный roadmap + углублённый дизайн

> Компаньон к утверждённому финальному плану `~/.claude/plans/cozy-kindling-sutherland.md`.
> Здесь: **Часть 1** — поэтапная дорога к финальному состоянию (волны поставки, зависимости, exit-критерии);
> **Часть 2** — углублённый дизайн (конкретная Drizzle-схема ядра графа, capture/AI-пайплайн, процессы/sidecar, UI-примитивы).
> Все 30 решений зафиксированы в финальном плане; здесь они только конкретизируются.

---

# Часть 1 — Поэтапный roadmap

Принцип: финал = единый граф `entities`+`edges`. Поэтому **сначала ядро графа**, затем домены волнами поверх него.
Каждая волна оставляет рабочий вертикальный срез. Инфра-рантайм (minio/qdrant/turso) нужен уже с Фазы 0 —
в Фазе 0 поднимаем его минимально, в Фазе 6 закаливаем (mesh/health/упаковка).

### Фаза 0 — Ядро графа (foundation)
**Зачем:** без `entities`/`edges`/поиска ни один домен не интегрируется «по-настоящему».
**Скоуп:**
- Таблицы `entities`, `edges`, `identities`+`identity_links`, `activity_events` + enum-расширения (см. Часть 2A).
- Миграция `knowledge_documents`→`notes`-detail под `entities`; `journal_entries` подключён как `kind=journal`.
- tRPC graph-router: `create / link / promote / resolveBacklinks / search`.
- Минимальный рантайм-бутстрап: **minio** (Drive) + **qdrant** (вектор) + **Turso/libSQL** (local) + embedder; единый семантический поиск (stub→рабочий).
- Sync: Postgres(cloud) ↔ Turso(local) ↔ клиент через Electric (cache-first правило AGENTS.md).
**Exit:** любой объект можно создать, связать, промоутнуть, найти семантически; существующие заметки/журнал/сессии видны как `entities`.
**Зависимости:** нет. **Риски:** sync-конфликты hybrid-стора; стоимость embeddings.

### Фаза 1 — Знание и задачи (PKM + GTD)
**Скоуп:** block/outliner-редактор (`notes`), markdown-on-disk sync (Tolaria/Obsidian), бэклинки/граф, Notion-style database-views; `tasks` (Things-модель Areas/Projects/Today/Upcoming/Anytime/Someday), kanban; sync Linear/Todoist.
**UI-примитивы:** block-editor, data-grid/DB-view, kanban.
**Разблокирует:** Logseq, Obsidian, Tolaria, Notion, Heptabase(частично), Things 3.
**Зависимости:** Фаза 0. **Риски:** двусторонний sync БД↔файлы (watcher/конфликты), CRDT блоков.

### Фаза 2 — Личный пакет (Mail / Calendar / Drive)
**Скоуп:** Drive поверх minio (`files`); почтовый клиент (JMAP/IMAP+SMTP, 3-pane, композер, `email_accounts` через `secret-store`); календарь (внутренний + CalDAV/Google two-way), задачи/сессии/journal на нём.
**UI-примитивы:** 3-pane inbox, calendar-views (расширить `calendar.tsx`), media/file-viewer.
**Разблокирует:** Skiff Mail/Calendar/Drive, minio.
**Зависимости:** Фаза 0 (entities/files), желательно `contact`-резолв. **Риски:** IMAP idle-sync, MIME, репутация отправки, рекуррентность/таймзоны.

### Фаза 3 — Захват и timeline (активность)
**Скоуп:** cross-platform screen-capture sidecar + app-usage sidecar; vision-summarizer → `activity_events`; unified timeline + frame-scrubber; дайджест в journal; Clicky self-аналитика.
**UI-примитивы:** unified timeline, frame-scrubber, analytics-дашборд.
**Разблокирует:** Dayflow/Rize/Qbserve, Clicky.
**Зависимости:** Фаза 0 (activity_events, minio для кадров). **Риски:** cross-platform захват, приватность/хранение кадров, vision-стоимость.

### Фаза 4 — Коммуникации и агент-сессии
**Скоуп:** нативный чат (каналы/треды/DM) на `packages/chat` + realtime (relay/streams/electric); индексатор локальных сессий (AgentSessions) + запуск/resume (Hermes) + Paperclip-дашборд оркестрации/стоимости (`economy`); overlay-ассистент (Pluely) + глобальный push-to-talk STT (handy: Groq Whisper via `api.zed.md/v1` → R1, локальный whisper-резерв).
**UI-примитивы:** thread/DM-UI, session-viewer, overlay-окно, hotkey-overlay.
**Разблокирует:** Mattermost, AgentSessions, Hermes, Paperclip, Pluely/Cluely, handy.
**Зависимости:** Фаза 0. **Риски:** realtime-масштаб/presence; cloaking screenshare (ToS/этика); парсинг форматов сессий; латентность ассистента.

### Фаза 5 — Граф-приложения и дизайн (OSINT / RSS / Design)
**Скоуп:** spatial canvas + node-graph (общий движок) для Heptabase-canvas + Maltego-графа + transforms (`workflow`); Folo RSS-ингест + дайджест + промоут; встроенный Open Design воркспейс (артефакты в minio как `file`).
**UI-примитивы:** node-graph canvas (общий с Фазой 1 canvas), artifact-preview.
**Разблокирует:** Maltego, Heptabase(canvas), Folo, Open Design.
**Зависимости:** Фаза 0 (граф), пересечение canvas с Фазой 1. **Риски:** легальность/безопасность transforms, масштаб графа, sandbox JSX/HTML.

### Фаза 6 — Инфра-закалка и дистрибуция
**Скоуп:** бандл контейнер-рантайма (OrbStack/Docker) + упаковка sidecar-бинарников on-demand; оркестрация через `host-provisioner`/`host-service`; SupportApp menu-bar health; Netbird-mesh (заменяет Tailscale-serve); финализация lazy-модулей + бюджет размера; апгрейд `local-db`→Turso/libSQL; cross-platform паритет.
**Разблокирует:** OrbStack, SupportApp, Netbird, Turso (полностью).
**Зависимости:** охватывает все фазы (рантайм-подмножество вынесено в Фазу 0). **Риски:** WireGuard/NAT, cross-platform tray/контейнеры, размер дистрибутива.

**Сквозные нити (через все фазы):** абстракция ИИ-провайдера (D12, per-service выбор + R1-пост-обработка); приватность/согласие на захват; ACL/мультитенант (org-scoped, уже паттерн); политика разрешения sync-конфликтов; единая телеметрия здоровья.

---

# Часть 2 — Углублённый дизайн

## 2A. Drizzle-схема ядра графа

Конвенции (как `agent.ts`/`knowledge.ts`/`journal.ts`): org-scoped cascade FK, `uuid().primaryKey().defaultRandom()`,
jsonb-тела, lifecycle-`status` enum, `created_at`/`updated_at` с `$onUpdate`, enums из `enums.ts`, `$inferInsert`/`$inferSelect`.
Файлы: `packages/db/src/schema/{entity,edges,identity,activity}.ts` + детальные `{mail,calendar,tasks,files,...}.ts`.

```ts
// enums.ts (добавить)
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

// entity.ts — универсальный узел
export const entities = pgTable("entities", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, { onDelete: "set null" }),
  kind: entityKind().notNull(),
  slug: text(),                              // для линкуемых kind (note/contact/...)
  title: text().notNull(),
  markdown: text(),                          // для note-подобных
  body: jsonb().$type<Record<string, unknown>>(),
  storageRef: jsonb("storage_ref").$type<{ bucket?: string; key?: string; mime?: string; size?: number }>(),
  sourceRef: jsonb("source_ref").$type<KnowledgeSourceRef>(), // переиспользуем тип из knowledge.ts
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

// edges.ts — типизированные связи (носитель «промоута»)
export const edges = pgTable("edges", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  sourceEntityId: uuid("source_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  targetEntityId: uuid("target_entity_id").references(() => entities.id, { onDelete: "set null" }), // null=unresolved
  targetSlug: text("target_slug"),           // сырой [[wikilink]] пока не резолвлен
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

// identity.ts — единый Contact-резолв (D6)
export const identityLinks = pgTable("identity_links", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactEntityId: uuid("contact_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }), // kind=contact
  kind: identityKind().notNull(),
  value: text().notNull(),                   // адрес/хендл/селектор
  verified: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("identity_links_contact_idx").on(t.contactEntityId),
  uniqueIndex("identity_links_org_kind_value_uniq").on(t.organizationId, t.kind, t.value),
]);

// activity.ts — append-only спина timeline (D7)
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

**Detail-таблицы (1:1 `entityId`)** — пример `tasks` (Things-модель), остальные по аналогии (`emails`, `calendar_events`, `files`, `feeds`, `channels`, `messages`, `design_artifacts`, `osint_entities`):

```ts
export const tasks = pgTable("tasks", {
  entityId: uuid("entity_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: taskStatus().notNull().default("open"),            // open/done/canceled
  bucket: taskBucket().notNull().default("anytime"),         // today/upcoming/anytime/someday
  areaEntityId: uuid("area_entity_id").references(() => entities.id, { onDelete: "set null" }),
  projectEntityId: uuid("project_entity_id").references(() => entities.id, { onDelete: "set null" }),
  due: date(),
  scheduled: date(),
  checklist: jsonb().$type<{ text: string; done: boolean }[]>().notNull().default([]),
  externalRef: jsonb("external_ref").$type<{ provider?: "linear" | "todoist"; id?: string }>(),
}, (t) => [ index("tasks_org_idx").on(t.organizationId), index("tasks_status_idx").on(t.status) ]);
```

**qdrant** (вне Postgres): point per searchable entity, payload `{ entityId, kind, orgId, userId? }`; коллекция единая, фильтрация по payload. Реиндекс по `updated_at`.

## 2B. Capture / AI-пайплайн (детально)

```
[screen-capture sidecar] --1fps,opt-in,exclusion--> [minio frames] --batch(15m)--> [vision-summarizer (provider)]
        |                                                                                   |
        +--> activity_events(screen_block, frameRefs[]) <----summary-----------------------+
[app-usage sidecar] --> activity_events(app_usage: app/window/url/duration)
[audio capture + overlay] --sys-audio+mic--> [STT] --> [R1 post-process] --> note/journal/answer
[global push-to-talk] --hotkey--> [Groq Whisper @api.zed.md/v1] --(резерв)--> [local whisper] --> [R1] --> active field
[indexer] --on entity upsert--> [embedder (provider)] --> qdrant
[summarizer] --daily--> journal_entries; --feed digest--> journal
```
- **Провайдер-абстракция (D12):** единый интерфейс `AIProvider` с per-capability выбором (vision / stt / summarize / embed); реализации: `zed-gateway` (api.zed.md/v1, R1 + Groq Whisper), `anthropic`, `gemini`, `openai`, `local` (Ollama/LM Studio/whisper). R1 — дефолт пост-обработки/summaries.
- **Приватность:** кадры шифруются, не покидают машину; политика хранения (удалять после саммари / retention); per-app/window exclusion-list; глобальный «privacy pause».
- **Cross-platform захват:** macOS ScreenCaptureKit, Windows Graphics.Capture/DXGI, Linux PipeWire — за общим интерфейсом sidecar.

## 2C. Процессы и модули (Electron, D29)

- **Main process:** окна, **глобальные хоткеи**, **overlay-окно** (прозрачное always-on-top, скрыто в screenshare), **tray/menu-bar** (health), запуск/надзор sidecar (через `host-service`).
- **Renderer:** **общее ядро** (entity-graph-клиент, UI-примитивы, command-bar, sync/live-queries) + **lazy feature-модули** (`notes/mail/calendar/tasks/chat/sessions/osint/feeds/design/activity/analytics/drive`) — динамический импорт по навигации.
- **Sidecar-процессы (отдельные ОС-процессы / контейнеры):** capture(screen/audio/app-usage), STT-runner, embedder/indexer, mail-sync, feed-poller, qdrant, minio, turso, electric, chat-relay, netbird-agent. Тяжёлое — вне bundle.
- **IPC:** typed bridge `apps/desktop/src/preload`; sidecar-менеджер поверх `host-provisioner`/`host-service`.
- **Упаковка размера:** базовый бандл = ядро + оболочка; feature-модули и sidecar-бинарники/модели — **on-demand** под включённую подсистему.

## 2D. Выбор UI-примитивов (рекомендации, packages/ui)

- **Block/outliner-редактор:** BlockNote (поверх ProseMirror) — блоки + markdown-сериализация (нужна для md-on-disk). Альтернатива: TipTap.
- **Spatial canvas + node-graph (общий для Heptabase + Maltego):** tldraw (богатый freeform-canvas) либо React Flow (строгий node-graph). Рекомендация: **tldraw** для canvas-заметок + слой графа поверх; React Flow если приоритет — OSINT-граф со связями.
- **3-pane inbox / thread:** собственная вёрстка на `resizable.tsx`+`scroll-area.tsx`.
- **Calendar:** расширить `calendar.tsx` до day/week/month + drag.
- **Kanban:** dnd-kit поверх `card.tsx`.
- **Data-grid/DB-view:** TanStack Table поверх `table.tsx` (Notion databases + Surrealist-explorer).
- **Timeline + frame-scrubber:** собственный виртуализированный компонент над `activity_events`.
- **Overlay/tray:** Electron BrowserWindow (overlay) + Tray API (menu-bar).

## 2E. Sync-топология и конфликты

- **Cloud Postgres/Neon** — общие/командные `entities`+`edges` (синхронизируются Electric вниз, cache-first).
- **Turso/libSQL (local)** — primary для приватного/тяжёлого (кадры-метаданные, `activity_events`, локальные сессии, тела писем) + embedded-реплика синхронизируемого.
- **minio (local S3)** — все бинарные объекты (`files`): вложения, кадры, записи, артефакты, экспорты.
- **Конфликты:** для заметок (md-on-disk ↔ блоки) — watcher + last-writer-wins на уровне блока с историей; для синхронизируемых entity — Electric/CRDT-подход; приватные данные не выходят за пределы local-стора.

## 2F. Открытые вопросы для следующего захода (не блокируют)
- Canvas-движок: tldraw vs React Flow (зависит от приоритета OSINT-графа).
- Block-редактор: BlockNote vs TipTap (зависит от строгости md-roundtrip).
- E2EE-объём для почты/Drive (Skiff-уровень) — нужен ли с первой версии.
- Точная схема `email_accounts`/OAuth-провайдеров (Gmail/JMAP) поверх `secret-store`.
