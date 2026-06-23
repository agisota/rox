# 04 — Задачи (GTD): L3 implementation-ready ТЗ

> Ссылается на `plans/superapp-l3-specs/00-shared-context.md` (далее «00»). Ядро графа (00 §2),
> конвенции (00 §3) и допущения A1–A8 (00 §4) — НЕ переопределяются, только используются/расширяются.
> Родительский дизайн: `plans/rox-superapp-roadmap-and-design.md` (Часть 1 «Фаза 1»; Часть 2A — пример
> detail-таблицы `tasks` Things-модели; 2D — UI-примитивы kanban/data-grid; 2E — sync-топология).
> Заземление по коду: `packages/trpc/src/router/task/{task,schema,statuses}.ts`,
> `packages/db/src/schema/schema.ts` (legacy `tasks`/`task_statuses`), `packages/db/src/schema/enums.ts`,
> `packages/trpc/src/lib/integrations/sync/tasks.ts` (`syncTask`), `packages/shared/src/task-slug.ts`.

---

## 0. Резюме и границы

**Что входит (Фаза 1, GTD).** Things-модель задач поверх ядра графа: `Areas / Projects / Today / Upcoming /
Anytime / Someday`, чек-листы, kanban и Notion-style database-view, двусторонний sync с Linear/Todoist.

- Задача = first-class узел графа `entity(kind="task")` с detail-таблицей **`gtd_tasks`** (1:1 к `entityId`).
  Имя `gtd_tasks` (не `tasks`) выбрано осознанно: legacy-таблица `tasks` (Linear-модель, `schema.ts:114`)
  остаётся параллельно на время миграции (раздел 5); переименовывать её внутри одной миграции с переносом
  FK/sync рискованно. **Ревизируемо**: после полного перехода legacy `tasks` депрекейтится и `gtd_tasks`
  может быть переименована в `tasks` отдельным релизом.
- `Area`/`Project` — это узлы ядра `entity(kind="area")`/`entity(kind="project")`; их «принадлежность»
  выражается ребром `child_of` (task→project, project→area) **и** денормализованными FK
  `areaEntityId`/`projectEntityId` в `gtd_tasks` (для быстрых GTD-выборок без обхода графа).
- Чек-листы (подпункты) — `jsonb` внутри `gtd_tasks` (не отдельные узлы; Things-семантика «sub-items»).
- Kanban-доска по `bucket`/статусу + ручной порядок (`sortKey`); Notion-database-view (TanStack Table).
- Двусторонний sync Linear/Todoist через `externalRef` — **новый** конвейер `sync/gtd-tasks.ts`
  (`syncGtdTask(entityId)`), а НЕ переиспользование legacy `syncTask`: legacy `syncTask(taskId)`
  (`lib/integrations/sync/tasks.ts`) жёстко завязан на таблицу `tasks` (`db.query.tasks.findFirst` по `id`),
  Upstash QStash и `PROVIDER_ENDPOINTS` (где есть только `linear`, Todoist отсутствует). GTD оперирует
  `entityId`/`gtd_tasks`, модели несовместимы. Конвейер GTD заимствует только транспорт (QStash) и паттерн
  webhook-приёмника, но это отдельный код (§3.2). Todoist в фазе 1 — **ревизируемо** (см. §3.2: при
  отсутствии готового Todoist-эндпоинта фаза 1 ограничивается Linear, Todoist — ОВ-5).
- Доменный роутер **`gtdTask`** (новый) поверх graph-сервиса #01; интеграция «промоут заметки/сессии → task».
- Семантический поиск задач — через graph-search ядра (qdrant), без своей коллекции.

**Что НЕ входит (out of scope).**
- Сам graph-сервис ядра (`create/link/promote/resolveBacklinks/search`) и таблицы `entities/edges` —
  поставляет #01; здесь они потребляются, не переопределяются (00 §2).
- Рантайм qdrant/minio/embedder/Electric/Turso — поставляет #02; здесь потребляется их контракт.
- **Legacy `task`-роутер** (`router/task/task.ts`, Linear-модель `tasks`/`task_statuses` + `syncTask`) —
  НЕ удаляется и НЕ переписывается в этой фазе; на время совместимости работает параллельно. Этот ТЗ задаёт
  GTD-надстройку и план миграции данных, а не рефактор legacy CRUD.
- Заметки/PKM (#03), агент-сессии (#11), календарь (Фаза 2) — отдельные спеки; здесь только рёбра
  `references` (note→task), `derived_from` (task→agent_session) и `scheduled_as` (task→calendar_event) как
  потребитель чужих узлов.
- Под-задачи как отдельные узлы графа (`task child_of task`) — **в скоупе схемы** (ребро поддержано), но
  глубокая иерархия/rollup-прогресс на UI — ревизируемо (раздел 9, ОВ-3); v1 фокус — Things-плоскость
  Project→Tasks + чек-лист.

**Фаза:** 1. **Зависимости:** #01 (ядро графа: `entities/edges`, graph-router `create/link/promote/search`),
#02 (qdrant-индексатор, Electric down-sync cache-first, Turso local-primary). Существующие:
`syncTask`-конвейер (`lib/integrations/sync/tasks.ts`), `@rox/shared/task-slug`, `secret-store` (для
Linear/Todoist-токенов), `requireActiveOrgMembership`/`verifyOrgMembership`.

**Принятые допущения (00 §4) + ревизируемость.**
- **Things-модель (Часть 2A)** принята как канон: статус `open/done/canceled`, bucket
  `today/upcoming/anytime/someday`, `Areas/Projects` как узлы графа. Ревизируемо: «Logbook»/«Trash» как
  отдельные UI-фильтры поверх `status`.
- **Имя detail-таблицы `gtd_tasks`** (а не `tasks`) — во избежание коллизии с legacy `tasks` (00 §3:
  detail 1:1 к `entityId`, тогда как legacy `tasks.id` — собственный PK без `entityId`). Ревизируемо.
- **A8** — minio bucket `org-<orgId>`, префикс `files/` для вложений задачи (через `file`-узлы +
  `attached_to`); вложения инлайн в `gtd_tasks` не храним.
- **Sync-направление по умолчанию** — двусторонний best-effort через существующий `syncTask`; конфликт
  поля → last-writer-wins по `updatedAt` источника (раздел 3). Ревизируемо до «external wins».
- **Идемпотентность POST** — на ключе `idempotencyKey` через **собственную** таблицу `gtd_idempotency_keys`
  (§1.2.1, поставляется в PR-1, без зависимости от #01): `unique(org, key)` → повтор за 24ч возвращает ранее
  созданную сущность. Дедуп по `(org, kind, slug)` (`entities_org_kind_slug_uniq`, 00 §2.2) остаётся
  **вторым** стражем гонки на slug, но НЕ заменяет idempotency-ключ (разный title → разный slug → он не сработал
  бы как идемпотентность). `importExternal` дополнительно идемпотентен по `(org, provider, externalId)`.
  Ревизируемо: когда #01 поставит общий механизм — `gtd_idempotency_keys` мигрируется на него (ОВ-1).

---

## 1. Доменная модель (полная схема БД)

Задача = узел ядра (`entities`, kind=`task`) — **узел НЕ дублируется**, его пишет graph-сервис #01.
Подсистема добавляет **только** detail-таблицу 1:1 к `entityId`. Файл: `packages/db/src/schema/gtdTask.ts`.

### 1.1 Enum-расширения (diff к 00 §2.1, файл `packages/db/src/schema/enums.ts`)

Ядро уже содержит `entityKindValues ⊇ {task, project, area}` и `edgeRelationValues ⊇ {blocks, child_of,
references, about, scheduled_as, derived_from, tagged_with, attached_to}` — GTD их **переиспользует, не
добавляет**. Legacy `taskStatusEnumValues` (8 значений Linear) и `taskPriorityValues` уже есть — **не
трогаем** (они принадлежат legacy `tasks`). Добавляем **только** доменные enum'ы GTD (append-only, никогда не
переупорядочивать/удалять):

```ts
// enums.ts — ДОБАВИТЬ (GTD, фаза 1). pgEnum'ы объявляются в schema/gtdTask.ts. z уже импортирован в enums.ts.

/** Статус задачи в Things-модели (отдельно от legacy taskStatusEnumValues). */
export const gtdTaskStatusValues = ["open", "done", "canceled"] as const;
export const gtdTaskStatusEnum = z.enum(gtdTaskStatusValues);
export type GtdTaskStatus = z.infer<typeof gtdTaskStatusEnum>;

/** GTD-bucket (Things «список»). */
export const gtdTaskBucketValues = ["today", "upcoming", "anytime", "someday"] as const;
export const gtdTaskBucketEnum = z.enum(gtdTaskBucketValues);
export type GtdTaskBucket = z.infer<typeof gtdTaskBucketEnum>;

/** Внешний провайдер двустороннего sync задачи (подмножество integrationProviderValues). */
export const gtdTaskExternalProviderValues = ["linear", "todoist"] as const;
export const gtdTaskExternalProviderEnum = z.enum(gtdTaskExternalProviderValues);
export type GtdTaskExternalProvider = z.infer<typeof gtdTaskExternalProviderEnum>;
```

> `entities.status` (active/archived/trashed, 00 §2.2) — это lifecycle узла (видимость/корзина).
> `gtd_tasks.status` (open/done/canceled) — это **доменное состояние выполнения** (Things). Они
> ортогональны: `done`-задача остаётся `entities.status="active"` (видна в Logbook); удалённая —
> `entities.status="trashed"`. Отдельного `deleted_at` НЕ вводим (00 §3).

### 1.2 Detail-таблица `gtd_tasks` (1:1 `entityId`)

```ts
// packages/db/src/schema/gtdTask.ts
/**
 * GTD-tasks (фаза 1) — detail-таблица поверх entity(kind="task"), Things-модель.
 *
 * Узел графа (entities) НЕ дублируется здесь — он создаётся graph-сервисом ядра; entityId = FK на него.
 * Area/Project — тоже узлы ядра (kind="area"/"project"); здесь только денормализованные FK + ребро child_of.
 * Конвенции (как agent.ts/economy.ts/knowledge.ts, 00 §3): org cascade FK + org index, timestamptz
 * created/updated с $onUpdate, enums из enums.ts, lifecycle через entities.status (не deleted_at),
 * $inferInsert/$inferSelect.
 *
 * NOTE: миграции руками не править — менять этот файл и запускать
 * `bunx drizzle-kit generate --name="..."` (AGENTS.md / 00 §3).
 */
import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity"; // из ядра #01
import {
  gtdTaskBucketValues,
  gtdTaskExternalProviderValues,
  gtdTaskStatusValues,
} from "./enums";

export const gtdTaskStatus = pgEnum("gtd_task_status", gtdTaskStatusValues);
export const gtdTaskBucket = pgEnum("gtd_task_bucket", gtdTaskBucketValues);
export const gtdTaskExternalProvider = pgEnum(
  "gtd_task_external_provider",
  gtdTaskExternalProviderValues,
);

/** Подпункт чек-листа Things (sub-item). id — клиентский nanoid для стабильного diff/реордера. */
export type GtdChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  sortKey: string; // лексикографический ключ порядка (LexoRank-подобный)
};

/** Привязка к внешней системе (двусторонний sync). */
export type GtdExternalRef = {
  provider: (typeof gtdTaskExternalProviderValues)[number];
  externalId: string; // id задачи в Linear/Todoist
  externalKey?: string; // человекочитаемый ключ ("SUPER-172", "#123")
  externalUrl?: string;
  lastSyncedAt?: string; // ISO UTC
  syncError?: string;
} & Record<string, unknown>;

export const gtdTasks = pgTable(
  "gtd_tasks",
  {
    // PK == FK на узел графа (1:1). Каскад при удалении узла.
    entityId: uuid("entity_id")
      .primaryKey()
      .references(() => entities.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    status: gtdTaskStatus().notNull().default("open"),
    bucket: gtdTaskBucket().notNull().default("anytime"),

    // Денормализованные ссылки на узлы Area/Project (kind="area"/"project") — для быстрых GTD-выборок.
    // Каноничная связь дублируется ребром child_of (см. §1.4); FK = производный кэш.
    areaEntityId: uuid("area_entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    projectEntityId: uuid("project_entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),

    // Планирование (Things). due — дедлайн; scheduled — дата активации в Today/Upcoming.
    due: date(),
    scheduled: date(),
    // Якорь времени для напоминаний (UTC); момент, а не день.
    remindAt: timestamp("remind_at", { withTimezone: true }),

    // Ручной порядок внутри bucket/project (LexoRank-подобный ключ; дефолт — середина диапазона).
    sortKey: text("sort_key").notNull().default("U"),

    // Чек-лист подпунктов (Things sub-items). НЕ узлы графа.
    checklist: jsonb().$type<GtdChecklistItem[]>().notNull().default([]),

    // Двусторонний sync. null = локальная задача.
    externalRef: jsonb("external_ref").$type<GtdExternalRef>(),

    // Денормализованные счётчики для UI-бейджа (пересчёт при изменении checklist).
    checklistDoneCount: integer("checklist_done_count").notNull().default(0),
    checklistTotalCount: integer("checklist_total_count").notNull().default(0),

    // Временные отметки выполнения (UTC, 00 §3).
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("gtd_tasks_org_idx").on(t.organizationId),
    index("gtd_tasks_status_idx").on(t.status),
    index("gtd_tasks_bucket_idx").on(t.bucket),
    index("gtd_tasks_area_idx").on(t.areaEntityId),
    index("gtd_tasks_project_idx").on(t.projectEntityId),
    index("gtd_tasks_due_idx").on(t.due),
    index("gtd_tasks_scheduled_idx").on(t.scheduled),
    // Композитный для основной GTD-выборки «Today/Upcoming по организации».
    index("gtd_tasks_org_bucket_status_idx").on(
      t.organizationId,
      t.bucket,
      t.status,
    ),
    // Дедуп двустороннего sync: один externalId на org/provider.
    uniqueIndex("gtd_tasks_org_provider_external_uniq")
      .on(
        t.organizationId,
        sql`(${t.externalRef} ->> 'provider')`,
        sql`(${t.externalRef} ->> 'externalId')`,
      )
      .where(sql`${t.externalRef} IS NOT NULL`),
  ],
);

export type InsertGtdTask = typeof gtdTasks.$inferInsert;
export type SelectGtdTask = typeof gtdTasks.$inferSelect;
```

#### 1.2.1 `gtd_idempotency_keys` — собственная idempotency-таблица (PR-1, не ждать #01)

Контракт 00 §3 / user CLAUDE.md требует Idempotency-Key на POST с побочкой. У ядра `entities`
**нет** колонки `idempotencyKey`, а общий механизм #01 ещё не существует (R5/ОВ-1). Дедуп по
`(org, kind, slug)` идемпотентности по ключу **не даёт**: два `create` с разным `title` (→ разный `slug`)
и одним `idempotencyKey` создали бы две задачи. Поэтому подсистема вводит **собственную** лёгкую таблицу
(в том же файле `gtdTask.ts`, как часть PR-1) — без зависимости от #01:

```ts
/** Idempotency-ключи POST-процедур GTD (create/createProject/createArea/importExternal). */
export const gtdIdempotencyKeys = pgTable(
  "gtd_idempotency_keys",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: uuid("key").notNull(), // клиентский idempotencyKey
    // Какую сущность вернул первый успешный вызов (для воспроизведения ответа).
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "cascade",
    }),
    // Имя процедуры — разводит коллизии ключей между create/importExternal.
    procedure: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Натуральный ключ идемпотентности: один ключ на org (+процедуру) = один результат.
    uniqueIndex("gtd_idempotency_org_key_uniq").on(t.organizationId, t.key),
    index("gtd_idempotency_created_idx").on(t.createdAt), // для TTL-чистки (24ч)
  ],
);

export type InsertGtdIdempotencyKey = typeof gtdIdempotencyKeys.$inferInsert;
export type SelectGtdIdempotencyKey = typeof gtdIdempotencyKeys.$inferSelect;
```

> **Семантика:** первый вызов с `(org, key)` в одной транзакции `INSERT`-ит строку (`ON CONFLICT DO NOTHING`)
> и, если вставка прошла, создаёт сущность и записывает её `entityId`. Повтор с тем же ключом ловит конфликт
> uniqueIndex → читает сохранённый `entityId` → возвращает ранее созданную сущность (без второй вставки).
> TTL-чистка строк старше 24ч — фоновым job'ом (по `gtd_idempotency_created_idx`); это даёт обещанный
> «дубликат ключа в org за 24ч → возврат ранее созданной» **в фазе 1, не дожидаясь #01**. Когда #01 поставит
> общий механизм — таблица мигрируется/депрекейтится (ОВ-1), но контракт идемпотентности не блокируется.

> `sql` — импорт из `drizzle-orm` (как 00 §2.2). Частичный uniqueIndex по `externalRef->>'provider'`/`externalId`
> гарантирует «1 внешняя задача = 1 узел» и идемпотентность импорта sync.

> **Slug живёт в `entities`, не в `gtd_tasks`** (см. §1.4). Поэтому:
> - **Все `*Card`-выборки** (`GtdTaskCard`/`ProjectCard`/`AreaCard`) делают **JOIN `gtd_tasks` ↔ `entities`
>   ON `gtd_tasks.entityId = entities.id`** и тянут `slug`/`title`/`status`(lifecycle)/`markdown` из `entities`,
>   а GTD-поля — из `gtd_tasks`. JOIN дешёвый: `gtd_tasks.entityId` = PK, а `entities.id` = PK ⇒ обе стороны
>   индексированы PK, это PK-merge без доп. индекса.
> - **`get({slug})`** резолвится через ядровый `entities_org_kind_slug_uniq`
>   (`uniqueIndex(organizationId, kind, slug) WHERE slug IS NOT NULL`, 00 §2.2): предикат
>   `WHERE organizationId=? AND kind='task' AND slug=?` **обязан включать `kind='task'`** — иначе индекс по
>   `(org, kind, slug)` не покрывает запрос (ведущая колонка `kind` пропущена) и возможен seq-scan/коллизия с
>   другим kind (note/project с тем же slug). С явным `kind='task'` индекс покрывает get-by-slug полностью.
> - Доп. индекса на `entities.slug` ядру **не требуется** — `entities_org_kind_slug_uniq` достаточен; если
>   профилирование покажет иное, запросить у #01 индекс `(org, slug)` (не вводим здесь — ядро не переопределяем).

### 1.3 Маппинг на qdrant (через индексатор #02, не свой)

Индексирование выполняет **общий индексатор ядра** (#01/#02) по upsert `entities` kind=`task`. GTD лишь
декларирует контракт payload и embed-текста:
- **Точка на задачу** в единой коллекции ядра; **id точки = `entities.id`**.
- **payload:** `{ entityId, kind: "task", orgId, userId?: createdByUserId, status, bucket, projectEntityId?,
  areaEntityId?, due?, updatedAt }`. Фильтрация поиска — `orgId` (обяз.) + опц. `status`/`bucket`/`projectEntityId`.
- **Embed-текст:** `title + "\n\n" + (markdown ?? "")` (markdown задачи — заметка-описание в `entities.markdown`)
  `+ "\n" + checklist.map(c => c.text).join("\n")`. Реиндекс по `entities.updatedAt`.
- Семантический поиск задач = вызов graph-router `search({ kinds:["task"], ... })`; своей qdrant-коллекции
  GTD не заводит (00 §2.6).

### 1.4 Использование ядра графа (kind / relation)

| Сущность ядра | Как использует GTD |
|---|---|
| `entities` kind=`task` | сам узел задачи; `title`/`markdown`(описание)/`slug`/`status`(lifecycle)/`v2ProjectId` — в ядре; GTD-поля — в `gtd_tasks`. Пишется через graph-сервис `create/update`. |
| `entities` kind=`project` | узел проекта (Things «Project»). Создаётся через graph-сервис; `gtd_tasks.projectEntityId` ссылается на него. |
| `entities` kind=`area` | узел сферы (Things «Area»). Аналогично. |
| `edges` relation=`child_of` | каноничная иерархия: `task → project`, `project → area`, опц. `task → task` (под-задача). FK в `gtd_tasks` — денормализованный кэш этого ребра. |
| `edges` relation=`blocks` | зависимость `task → task` (блокирует/заблокирована). |
| `edges` relation=`references` | `note → task` (заметка ссылается на задачу) / `task → file` (артефакт). Создаётся при промоуте из #03/#11. |
| `edges` relation=`derived_from` | `task → agent_session` / `task → note` (промоут: задача рождена из сессии/заметки, см. #11 §2 п.6). |
| `edges` relation=`scheduled_as` | `task → calendar_event` (Фаза 2; здесь только потребляется/создаётся ребро). |
| `edges` relation=`tagged_with` | `task → tag` (теги задачи как first-class узлы, как в #03). |
| `edges` relation=`about` | `task → <любой узел>` (произвольная тематическая связь). |

**Новые kind/relation:** нет — GTD целиком укладывается в зафиксированный enum ядра. Добавлены только
**detail-enum'ы** (`gtd_task_status`/`gtd_task_bucket`/`gtd_task_external_provider`), не пересекающиеся с
ядровыми и с legacy `task_status`/`task_priority`.

---

## 2. API-контракты (tRPC)

**Где новый, где расширение.**
- **Новый роутер `gtdTask`** — `packages/trpc/src/router/gtd-task/` (схемы — `gtd-task/schema.ts`,
  логика — `gtd-task/gtdTask.ts`, граф-линки/хелперы — `gtd-task/links.ts`). Регистрация в корневом
  `appRouter` (`packages/trpc/src/root.ts`) как `gtdTask`, рядом с legacy `task`.
- **Существующий `task`-роутер** (`router/task/task.ts`, Linear-модель) — НЕ ломаем и НЕ проксируем в этой
  фазе (раздел 5: миграция данных идёт backfill-скриптом, а не двойной записью роутеров — у моделей разные
  поля/семантика).
- Все процедуры — `protectedProcedure`, org-scope через `requireActiveOrgMembership(ctx)` (как `task.ts`) или
  `verifyOrgMembership(userId, orgId)` для явного `organizationId`. Создание/мутация узлов/рёбер — **только**
  через `graphService` ядра; GTD пишет лишь `gtd_tasks` в той же транзакции (`dbWs.transaction`). Чтение — `db`.

Zod-схемы — `packages/trpc/src/router/gtd-task/schema.ts`, переиспользуя `@rox/shared/task-slug`
(`generateBaseTaskSlug`/`generateUniqueTaskSlug`) и новые `gtdTaskStatusEnum`/`gtdTaskBucketEnum`.

```ts
// gtd-task/schema.ts (выдержки — компилируемые Zod-схемы)
import { gtdTaskBucketEnum, gtdTaskExternalProviderEnum, gtdTaskStatusEnum } from "@rox/db/enums";
import { z } from "zod";

export const checklistItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(2000),
  done: z.boolean().default(false),
  sortKey: z.string().min(1).max(64),
});
export const gtdSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case slug");
```

| # | Процедура | Тип | Input (Zod) | Output (Zod) |
|---|---|---|---|---|
| 1 | `list` | query | `{ bucket?: gtdTaskBucketEnum, status?: gtdTaskStatusEnum, projectEntityId?: uuid, areaEntityId?: uuid, tag?: gtdSlug, dueBefore?: date, search?: str(1..200), cursor?: { sortKey: str, entityId: uuid }, limit?: int(1..200)=50 }` | `{ items: GtdTaskCard[], nextCursor?: cursor }` |
| 2 | `today` | query | `{ tz: str(IANA) }` | `{ overdue: GtdTaskCard[], today: GtdTaskCard[], evening?: GtdTaskCard[] }` |
| 3 | `upcoming` | query | `{ tz: str(IANA), days?: int(1..90)=30 }` | `{ groups: { date: date, items: GtdTaskCard[] }[] }` |
| 4 | `get` | query | `{ slug: gtdSlug } \| { entityId: uuid }` (union, ровно одно) | `GtdTaskFull` |
| 5 | `create` | mutation | `{ idempotencyKey: uuid, title: str(1..300), slug?: gtdSlug, markdown?: str, bucket?: gtdTaskBucketEnum=anytime, status?: gtdTaskStatusEnum=open, projectEntityId?: uuid, areaEntityId?: uuid, due?: date, scheduled?: date, remindAt?: datetime, checklist?: checklistItem[], tags?: gtdSlug[], sortKey?: str, v2ProjectId?: uuid }` | `GtdTaskFull` |
| 6 | `update` | mutation | `{ entityId: uuid, title?: str, markdown?: str, bucket?: gtdTaskBucketEnum, projectEntityId?: uuid\|null, areaEntityId?: uuid\|null, due?: date\|null, scheduled?: date\|null, remindAt?: datetime\|null, checklist?: checklistItem[] }` | `GtdTaskFull` |
| 7 | `setStatus` | mutation | `{ entityId: uuid, status: gtdTaskStatusEnum }` | `GtdTaskCard` |
| 8 | `move` | mutation | `{ entityId: uuid, bucket?: gtdTaskBucketEnum, projectEntityId?: uuid\|null, beforeEntityId?: uuid, afterEntityId?: uuid }` | `{ entityId, bucket, projectEntityId?, sortKey }` |
| 9 | `archive` | mutation | `{ entityId: uuid, status: z.enum(["active","archived","trashed"]) }` | `{ entityId, entityStatus }` |
| 10 | `setTags` | mutation | `{ entityId: uuid, tags: gtdSlug[] }` | `{ entityId, tags: gtdSlug[] }` |
| 11 | `toggleChecklistItem` | mutation | `{ entityId: uuid, itemId: str, done: bool }` | `{ entityId, checklistDoneCount, checklistTotalCount }` |
| 12 | `createProject` | mutation | `{ idempotencyKey: uuid, title: str(1..200), slug?: gtdSlug, areaEntityId?: uuid }` | `{ entityId, slug, kind: "project" }` |
| 13 | `createArea` | mutation | `{ idempotencyKey: uuid, title: str(1..200), slug?: gtdSlug }` | `{ entityId, slug, kind: "area" }` |
| 14 | `listProjects` | query | `{ areaEntityId?: uuid, includeArchived?: bool=false }` | `{ projects: ProjectCard[], areas: AreaCard[] }` |
| 15 | `board` | query | `{ projectEntityId?: uuid, bucket?: gtdTaskBucketEnum }` | `{ columns: { key: str, title: str, items: GtdTaskCard[] }[] }` |
| 16 | `search` | query | `{ query: str(1..200), mode?: z.enum(["semantic","keyword"])=semantic, status?: gtdTaskStatusEnum, projectEntityId?: uuid, limit?: int(1..50)=25 }` | `{ hits: GtdTaskSearchHit[], degraded: bool }` |
| 17 | `linkExternal` | mutation | `{ entityId: uuid, provider: gtdTaskExternalProviderEnum, externalId: str, externalKey?: str, externalUrl?: str }` | `GtdTaskCard` |
| 18 | `importExternal` | mutation | `{ idempotencyKey: uuid, provider: gtdTaskExternalProviderEnum, externalId: str, title: str, markdown?: str, status?: gtdTaskStatusEnum, due?: date, externalKey?: str, externalUrl?: str, v2ProjectId?: uuid }` | `{ entityId, created: bool }` |

Output-типы (Zod-схемы в `schema.ts`):
`GtdTaskCard = { entityId, slug, title, status, bucket, due?, scheduled?, sortKey, projectEntityId?,
areaEntityId?, checklistDoneCount, checklistTotalCount, tags: string[], entityStatus, updatedAt }`;
`GtdTaskFull = GtdTaskCard & { markdown?, checklist: GtdChecklistItem[], remindAt?, externalRef?, v2ProjectId?,
blockedBy: { entityId, title }[], blocks: { entityId, title }[] }`;
`ProjectCard = { entityId, slug, title, areaEntityId?, openTaskCount, entityStatus }`;
`AreaCard = { entityId, slug, title, entityStatus }`;
`GtdTaskSearchHit = GtdTaskCard & { score?: number, snippet?: string }`.

**Бизнес-правила / валидации / коды ошибок (по процедуре).**

1. **`list`** — фильтр по `organizationId` обязателен; **JOIN `gtd_tasks ↔ entities` ON entityId=id** за
   `slug`/`title`/`entityStatus` (см. §1.2: PK-merge без доп. индекса); keyset-пагинация по
   `(sortKey asc, entityId asc)` (стабильный ручной порядок — он же tie-break при равных `sortKey`, см. §2 п.8);
   `tag` фильтрует через join `edges tagged_with`; `search` → `ilike` по `entities.title`. **cache-first**
   (00 §3, AGENTS.md §9): клиент рендерит из Electric-кэша даже при `isReady=false`, `list` — серверная
   гидратация. Ошибка `UNAUTHORIZED` без активной org.
2. **`today`** — серверная классификация по `tz` (IANA): `overdue` = `due < today(tz)` И `status=open`;
   `today` = `bucket="today"` ИЛИ `scheduled = today(tz)` ИЛИ `due = today(tz)`, `status=open`. Дата считается
   в `tz` пользователя, хранение — UTC/`date` (00 §3). Ошибка `BAD_REQUEST` (невалидный tz).
3. **`upcoming`** — группировка `open`-задач с `scheduled`/`due` в `(today, today+days]` по дням в `tz`.
4. **`get`** — union «ровно одно из slug/entityId»; `BAD_REQUEST` если оба/ни одного. Ветка `{slug}` резолвит
   через `entities_org_kind_slug_uniq` с **обязательным `kind='task'`** в предикате
   (`WHERE organizationId=? AND kind='task' AND slug=?`, см. §1.2 — иначе индекс не покрывает); ветка
   `{entityId}` — по PK `entities.id` + JOIN `gtd_tasks`. `NOT_FOUND` если узел не kind=`task` или чужая org.
   `trashed` возвращается (для корзины), помечен `entityStatus`. `blockedBy`/`blocks` — из `edges relation=blocks`.
5. **`create`** — **идемпотентность обязательна** (POST с побочкой): `idempotencyKey` (uuid). Реализация —
   `gtd_idempotency_keys` (§1.2.1): первым шагом транзакции `INSERT … ON CONFLICT DO NOTHING` по `(org, key)`;
   при конфликте — читаем сохранённый `entityId` и возвращаем ранее созданную задачу (200) без второй вставки.
   Дубликат ключа в org за 24ч → та же задача.
   Порядок в одной `dbWs.transaction`: (a) валидация: `due`/`scheduled` — корректные даты; если
   `projectEntityId` задан — проверка, что это узел kind=`project` в той же org (`BAD_REQUEST` иначе);
   (b) `slug` — если не задан, `generateUniqueTaskSlug(generateBaseTaskSlug(title), existingSlugs)`, где
   **`existingSlugs = SELECT slug FROM entities WHERE organizationId=? AND kind='task' AND slug IS NOT NULL`**
   (множество дедупа = строго `kind='task'`, совпадает с partial unique `entities_org_kind_slug_uniq`; НЕ
   глобально по всем kind — note(slug=x)/task(slug=x) сосуществуют легально). Slug присваивает **GTD-роутер**
   (резолвит уникальность по `kind='task'` и передаёт готовый `slug` в `graphService.create`), а не граф-сервис:
   ядро `create` принимает slug как есть и опирается на тот же uniqueIndex как на финальный страж гонки
   (при гонке двух вставок — `CONFLICT`, клиент ретраит). Явный занятый slug → `CONFLICT`;
   (c) `graphService.create({ kind:"task", title, slug, markdown, v2ProjectId,
   status:"active" })` → `entity`; (d) `INSERT gtd_tasks` с `entityId`, `status`, `bucket`, `due`, `scheduled`,
   `sortKey` (если не задан — `midpoint` для bucket), `checklist` (+ пересчёт `checklistDoneCount/Total`);
   (e) рёбра через `graphService.link`: `child_of` (task→project и project→area, если заданы), `tagged_with`
   (lazy `tag`-узлы). Ошибки: `BAD_REQUEST` (невалид дата/project), `CONFLICT` (slug занят),
   `PAYLOAD_TOO_LARGE` (checklist > 1000 элементов или сериализованно > 256 КБ).
6. **`update`** — мутация detail-полей + проброс `title`/`markdown` в узел через `graphService.update`. При
   смене `projectEntityId`/`areaEntityId` — пересоздание ребра `child_of` (delete old + link new) и
   обновление денормализованного FK атомарно. `checklist` — полная замена массива + пересчёт счётчиков.
   `updatedAt` авто (`$onUpdate`). Если у задачи есть `externalRef` — постановка в `syncTask`-очередь
   (раздел 3) после коммита. Ошибки: `NOT_FOUND`, `BAD_REQUEST`.
7. **`setStatus`** — `open→done`: `status="done"`, `completedAt=now()`; `open→canceled`: `canceledAt=now()`;
   `done/canceled→open`: сброс `completedAt`/`canceledAt`. Узел остаётся `entities.status="active"` (Logbook).
   Идемпотентно (тот же статус → 200 без изменений). Если `externalRef` — sync статуса наружу. Ошибка
   `NOT_FOUND`.
8. **`move`** — kanban/реордер: вычисление `sortKey` между `beforeEntityId`/`afterEntityId` (LexoRank между
   их ключами; если соседей нет — край диапазона). Опц. смена `bucket`/`projectEntityId` (с пересозданием
   `child_of`). Атомарно в транзакции. Идемпотентно по результату. **Конкурентные `move`/cache-first
   оптимистичные реордеры:** `sortKey` намеренно **НЕ уникален** (нет `uniqueIndex` на `(org, bucket,
   sortKey)`) — два клиента, вставляющие между одной парой, могут получить равные ключи, и это допустимо.
   Детерминизм порядка обеспечивается **tie-break'ом keyset-пагинации `list`: `(sortKey asc, entityId asc)`**
   (§2 п.1): при равных `sortKey` порядок рвётся по `entityId`, поэтому вывод стабилен и воспроизводим. Ошибки:
   `NOT_FOUND`, `BAD_REQUEST` (before/after в другом проекте/bucket).
9. **`archive`** — мост к `graphService` (смена `entities.status` active/archived/trashed). Идемпотентно.
   Узел и рёбра сохраняются. Ошибка `NOT_FOUND`.
10. **`setTags`** — diff текущих `tagged_with` рёбер vs новый набор; lazy-создание `tag`-узлов
    (kind=`tag`, slug=нормализованный), add/remove `edges`. Идемпотентно. Ошибка `NOT_FOUND`.
11. **`toggleChecklistItem`** — точечная мутация одного подпункта в `checklist` jsonb (по `itemId`) +
    пересчёт `checklistDoneCount/Total`. Идемпотентно (тот же `done` → no-op). Ошибки: `NOT_FOUND`
    (задача/`itemId`).
12. **`createProject`** — идемпотентно (`idempotencyKey`); создаёт `entity(kind="project")` через
    graph-сервис; с `areaEntityId` — ребро `child_of` (project→area). `CONFLICT` при занятом slug.
    detail-таблицы у project нет (всё в `entities`); если позже понадобятся поля проекта (дедлайн/заметка) —
    отдельная `gtd_projects` (ОВ-2).
13. **`createArea`** — идемпотентно; создаёт `entity(kind="area")` через graph-сервис. `CONFLICT` при занятом
    slug. detail-таблицы у area нет.
14. **`listProjects`** — проекты+сферы org из `entities` (kind in project/area), фильтр по `areaEntityId`
    (через `child_of`); `openTaskCount` — агрегат `gtd_tasks` где `projectEntityId=…` и `status=open`.
    cache-first. Без ошибок (пустые массивы).
15. **`board`** — kanban-колонки. По умолчанию колонки = `bucket` (today/upcoming/anytime/someday) либо, если
    задан `projectEntityId`, — колонки по `status` (open/done/canceled). Внутри колонки — сортировка по
    `sortKey`. cache-first. Ошибка `NOT_FOUND` (проект чужой org).
16. **`search`** — `mode=semantic` → `graphService.search({ query, kinds:["task"], filters:{ status,
    projectEntityId }, limit })` (qdrant). `mode=keyword` → `ilike` по `entities.title`/`entities.markdown`.
    При недоступном embedder semantic авто-переходит в keyword с `degraded:true` (не ошибка). Ошибка
    `BAD_REQUEST` (пустой query).
17. **`linkExternal`** — привязка существующей задачи к внешней (заполняет `externalRef`); срабатывает
    uniqueIndex-дедуп (`CONFLICT`, если эта внешняя задача уже привязана к другому узлу). Ставит начальный
    `syncTask`. Ошибки: `NOT_FOUND`, `CONFLICT`.
18. **`importExternal`** — приём задачи из внешнего провайдера (вызывается **sync-воркером**, не из
    пользовательской сессии). **Принципал/контекст:** вебхук Linear/Todoist приходит без `ctx.session`;
    поэтому процедура вызывается **не как `protectedProcedure`**, а через серверный service-context
    (system principal + `organizationId`, резолвленный из `integration_connections` по payload подписанного
    webhook — см. §3.2). Реализационно — отдельный internal-роутер `gtdTaskInternal` (вне `protectedProcedure`,
    вызываемый только сервером после `verify signature`), переиспользующий тот же `ensureGtdTaskRow`/graph-хелперы.
    **Идемпотентность по `(orgId, provider, externalId)`** (uniqueIndex) **и** `idempotencyKey`
    (`gtd_idempotency_keys`, procedure=`importExternal`): повтор → `created:false`, без дубля (no-op). Иначе:
    `graphService.create({ kind:"task", title, markdown, … })` + `INSERT gtd_tasks` с `externalRef`. Ошибка
    `BAD_REQUEST` (нет title/externalId).

**Интеграция с graph-сервисом ядра.** Узлы (`entities` kind in task/project/area) и рёбра (`edges`) GTD
создаёт/мутирует **исключительно** через graph-сервис #01 (`create/update/link/promote/search`, 00 §2.6).
GTD-роутер владеет только `gtd_tasks`. «Промоут» (note/agent_session → task) реализуют #03/#11 вызовом
`graphService.promote(sourceEntityId, { toKind:"task", … })` (создаёт `task`-узел + ребро `derived_from`);
GTD затем дописывает `gtd_tasks`-detail через внутренний хелпер `ensureGtdTaskRow(tx, entityId, defaults)`
(экспортируется из `gtd-task/links.ts` для переиспользования #03/#11). `link`/`resolveBacklinks`/`search`
используются вместо прямых INSERT в `edges`. **Rate-limit:** write-процедуры (`create`/`update`/`move`/
`importExternal`) — per-user лимит на tRPC-middleware (429 + Retry-After, 00 §3).

---

## 3. Сервисы/процессы/протоколы

### 3.1 LexoRank / sortKey-хелперы (чистые функции, юнит-тестируемые без БД)

Новый модуль `packages/shared/src/task/sortkey.ts`:
- `midpoint(): string` — стартовый ключ (середина диапазона, напр. `"U"`).
- `between(prev?: string, next?: string): string` — лексикографический ключ строго между соседями
  (LexoRank-подобный; при исчерпании разрешения — расширение длины ключа). Детерминирован.
- `rebalance(keys: string[]): string[]` — перераспределение при деградации (массовый `move`).

Используются в `create`/`move`/`board` для стабильного ручного порядка без перезаписи всех строк.

### 3.2 Двусторонний sync Linear/Todoist (НОВЫЙ конвейер `sync/gtd-tasks.ts`)

**Назначение:** двусторонняя синхронизация GTD-задач с Linear/Todoist; outbound при локальной мутации,
inbound — по вебхуку/поллингу провайдера.

> **Это новый конвейер, а НЕ переиспользование legacy `syncTask`.** Legacy
> `packages/trpc/src/lib/integrations/sync/tasks.ts` (`syncTask(taskId)`) читает `db.query.tasks.findFirst`
> по `tasks.id`, ставит job в Upstash QStash (`env.QSTASH_TOKEN`) на `PROVIDER_ENDPOINTS`, где определён
> **только** `linear` — Todoist-эндпоинта в коде нет. GTD-модель оперирует `entityId`/`gtd_tasks` и
> `externalRef`-jsonb — она несовместима с `tasks.id`. Поэтому вводится **отдельный** `syncGtdTask(entityId)`;
> от legacy заимствуются только транспорт (QStash, тот же `env.QSTASH_TOKEN`) и паттерн webhook-приёмника.

- **Конвейер (новый файл `packages/trpc/src/lib/integrations/sync/gtd-tasks.ts`):** после коммита
  `create/update/setStatus`/`move` с непустым `externalRef` вызывается `syncGtdTask(entityId)`. Он:
  (a) читает `gtd_tasks` **по `entityId`** (не `tasks.id`) + узел `entities` (title/markdown);
  (b) читает провайдер-токен из `secret-store` (00 §3; токены НЕ логируются);
  (c) ставит job в QStash (`env.QSTASH_TOKEN`) на расширенный `PROVIDER_ENDPOINTS`. **Требуется добавить**
  в `PROVIDER_ENDPOINTS` запись `todoist` и завести новый эндпоинт-приёмник джоба
  `apps/api/.../integrations/todoist/jobs/sync-gtd-task` (Linear-аналог — расширить существующий
  `linear/jobs/*` GTD-веткой либо завести `linear/jobs/sync-gtd-task`). Маппинг полей:
  `status open/done/canceled ↔ Linear state / Todoist completed`; `title/markdown/due` — прямой маппинг;
  `bucket`/`checklist`/`sortKey` — Rox-специфичны (в провайдер не уходят либо как метки).
- **Inbound:** вебхук провайдера (`apps/api/.../integrations/<provider>/webhook`, паттерн как существующий
  Linear-sync) с **валидацией подписи** (`X-Hub-Signature-256`/Linear-signature, 00 §3) → резолвит
  `organizationId` из `integration_connections` по payload (см. §2 п.18: вызов под system-context, не
  `protectedProcedure`) → вызывает внутренний `gtdTask.importExternal`/`update`. Идемпотентность — uniqueIndex
  по `(orgId, provider, externalId)`.
- **Todoist в фазе 1 — ревизируемо (ОВ-5):** если к моменту PR-4 Todoist-эндпоинт/webhook не готовы, фаза 1
  поставляется с **Linear-only** sync, а `gtdTaskExternalProviderValues` остаётся `["linear","todoist"]`
  (append-only enum), но активным остаётся только `linear`. Это снимает зависимость от несуществующего кода.
- **Конфликт-резолюция:** last-writer-wins по `updatedAt`/`lastSyncedAt` источника поля; ошибка пуша пишется
  в `externalRef.syncError` (не throw наружу), баннер в UI. Полный field-level merge — ревизируемо.
- **Поток данных:**
```
[UI mutate] → gtdTask.update → commit → syncGtdTask(entityId)
      → secret-store(token) → Linear/Todoist API (outbound)            [outbound]
[Linear/Todoist webhook] → verify signature → gtdTask.importExternal/update  [inbound]
      → graphService.create/update + gtd_tasks(externalRef)
```

### 3.3 Sync/realtime топология (00 §2E)

- **Cloud Postgres/Neon** — канон `entities`/`edges`/`gtd_tasks` (org/командные). Вниз к клиенту — через
  **Electric** (cache-first, AGENTS.md §9): рендерим существующие строки даже при `isReady=false`; строгую
  готовность ждём только перед записью/seeding (напр. создание дефолтного «Inbox»-проекта).
- **Turso/libSQL (local)** — embedded-реплика синхронизируемого + быстрый локальный кэш GTD-выборок (Today).
  Поставляется #02.
- **minio** — вложения задач (`files/`) через `file`-узлы + `attached_to` (A8). В `gtd_tasks` бинарей нет.
- **Конфликты:** между клиентами — Electric/last-writer-wins на уровне строки `gtd_tasks`; чек-лист — замена
  массива (поле целиком), точечный `toggleChecklistItem` — серверный merge по `itemId` (idempotent); внешний
  sync — §3.2. Приватные данные не выходят за local-стор.

---

## 4. UI-спецификация

Feature-модуль `tasks` (lazy, 00 §2C) в `apps/web` и переиспользуется в `apps/desktop`. Компоненты — по
структуре AGENTS.md (папка/компонент + `index.ts`), shadcn-примитивы из `packages/ui`.

### 4.1 Экраны/панели

| Экран | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **TasksLayout** (sidebar: Inbox/Today/Upcoming/Anytime/Someday + Areas→Projects · контент) | оболочка GTD | скелет панелей | — | error-boundary на route | каркас сразу |
| **TaskList** (вирт. список Today/Project) | список задач | скелет-строки **только если data пуст И !isReady** | «Нет задач» + CTA «Добавить» (когда `isReady && data.length===0`) | inline-ретрай | рендерим кэш-строки немедленно, чек-бокс/реордер оптимистично |
| **TodayView** | overdue + today + evening | скелет если кэш пуст | «На сегодня ничего» | inline | секции из `today`; чек-бокс → `setStatus done` оптимистично |
| **UpcomingView** | задачи по дням | скелет | «Ничего не запланировано» | inline | группы по датам из `upcoming` |
| **TaskBoard** (kanban, dnd-kit) | доска по bucket/статусу | скелет-колонки | «Пусто» | inline | колонки из `board`; drag→`move` оптимистично |
| **TaskDetail** (правая панель/модал) | поля задачи + чек-лист + блокировки | скелет если узла нет в кэше | — | toast + read-only | поля из кэша; автосейв debounce 600 мс → `update`; чек-лист inline-добавление |
| **DatabaseView** (TanStack Table) | Notion-таблица задач | скелет-таблица | «Пусто» | inline | строки из кэша; колонки status/bucket/project/due/tags |
| **ProjectHeader** | прогресс проекта (open/total) | — | — | — | счётчик из `listProjects.openTaskCount` |

### 4.2 UI-примитивы (packages/ui, выбранные библиотеки — 00 §2D)

- **Kanban** — **dnd-kit** поверх `card.tsx`: новый `packages/ui/src/components/KanbanBoard/KanbanBoard.tsx`
  (+ `index.ts`). Для DatabaseView переиспользуем `DataGridView` из #03 (TanStack Table) — не дублируем.
- **TaskRow** — `packages/ui/src/components/TaskRow/TaskRow.tsx`: чек-бокс (`checkbox.tsx`) + title + due-бейдж
  (`badge.tsx`) + checklist-прогресс. Контракты пропсов:
  ```ts
  export interface TaskRowProps {
    task: GtdTaskCard;
    onToggleDone(entityId: string, done: boolean): void;   // оптимистично → setStatus
    onOpen(entityId: string): void;
    selected?: boolean;
    "aria-label"?: string;
  }
  export interface KanbanBoardProps {
    columns: { key: string; title: string; items: GtdTaskCard[] }[];
    isReady: boolean;                          // cache-first: НЕ скрывать data при false
    onMove(entityId: string, to: { columnKey: string; beforeId?: string; afterId?: string }): void;
    onOpen(entityId: string): void;
  }
  export interface ChecklistEditorProps {
    items: GtdChecklistItem[];
    onToggle(itemId: string, done: boolean): void;
    onAdd(text: string): void;
    onRemove(itemId: string): void;
    onReorder(itemId: string, beforeId?: string, afterId?: string): void;
    editable?: boolean;
  }
  ```
- Sidebar-дерево Areas→Projects — собственная вёрстка на `resizable.tsx` + `scroll-area.tsx` (00 §2D);
  date-picker для `due`/`scheduled` — `calendar.tsx` (существующий).

### 4.3 User-flows (на уровне кликов)

**Flow A — быстрый ввод задачи в Today:**
1. В TodayView клик «+ Добавить» (или хоткей `N`) → inline-строка, фокус в title (idempotencyKey генерится
   клиентом).
2. Печать заголовка → Enter → оптимистичная строка + `create({ bucket:"today" })`.
3. Параллельно строка уже в кэше Electric (cache-first) → live-подтверждение с сервера, slug проставлен.

**Flow B — kanban-перенос между статусами:**
1. В TaskBoard (проект) drag карточки из «open» в «done».
2. Отпуск → оптимистичный перенос + `move`/`setStatus done` → `completedAt` проставлен; карточка уходит в
   Logbook-колонку; связанная заметка обновляется live (Electric).
3. Если карточка имеет `externalRef` — после коммита `syncGtdTask` пушит статус в Linear (баннер «синхронизация»).

**Flow C — промоут из агент-сессии в задачу (межсистемно, #11):**
1. В session-viewer выделение диапазона → «Promote → Task» (#11 §2 п.6).
2. `agentSession.promote(target="task")` → `graphService.create(kind="task") + edge derived_from` →
   `ensureGtdTaskRow` создаёт `gtd_tasks` (bucket=anytime).
3. Тост со ссылкой; задача появляется в TaskList (cache-first), в графе — ребро `derived_from`.

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- **TaskList:** `role="listbox"`, ↑/↓ навигация, Enter — открыть, Space — toggle done, `E` — archive;
  видимый focus-ring (контраст ≥3:1); live-region «N задач выполнено».
- **TaskBoard (kanban):** dnd-kit имеет клавиатурный сенсор — перенос карточек с клавиатуры (Space — взять,
  стрелки — двигать между колонками, Space — отпустить); `aria-roledescription="sortable"`; объявление
  колонки/позиции через `aria-live`. Цвет колонки — не единственный признак (подпись/иконка).
- **ChecklistEditor:** каждый пункт — `<li>` с чек-боксом `<input type=checkbox>` + label; Enter в поле —
  добавить пункт; Tab-порядок последовательный.
- **TaskDetail (модал):** focus-trap, Esc закрывает, `aria-modal`, заголовок связан `aria-labelledby`;
  date-picker достижим с клавиатуры.
- Контраст текста ≥4.5:1, бейджей ≥4.5:1; цели нажатия ≥24×24 CSS-px (WCAG 2.2 «Target Size»); все
  интерактивы — `<button>`/`<a>` (не div); `axe-core` в CI на TasksLayout/TaskBoard/TaskDetail.

---

## 5. Миграция и обратная совместимость

Аддитивно вводим GTD-надстройку на ядре графа **рядом** с legacy `tasks` (Linear-модель). Существующие
`tasks`/`task_statuses`/`task`-роутер/`syncTask` — **не изменяются** на старте; данные переносятся
backfill-скриптом.

**Имя миграции (drizzle-kit generate):** изменить `packages/db/src/schema/gtdTask.ts` + `enums.ts` (+3
enum-набора §1.1), добавить экспорт в `packages/db/src/schema/index.ts`, relations в `relations.ts`, затем
`bunx drizzle-kit generate --name="gtd_tasks_detail"` (offline diff; таблицы ядра `entities`/`edges` создаёт
миграция #01). Никогда не редактировать `packages/db/drizzle/` вручную (00 §3 / AGENTS.md).

**Пошаговый план (backfill-скрипт `packages/scripts/src/migrate-tasks-to-gtd.ts`, запускается на neon-branch,
не на проде):**
1. Деплой схемы (`entities`/`edges` от #01 + `gtd_tasks` + 3 pgEnum). Legacy `task`-API продолжает писать в
   `tasks` без изменений — **фаза параллельного существования** (не двойная запись: модели несовместимы).
2. Backfill узлов: для каждого `tasks` (где `deletedAt IS NULL`) → `graphService.create({ kind:"task", title,
   slug, markdown: description, v2ProjectId: null, status:"active", createdByUserId: creatorId })`
   (идемпотентно по `(orgId, kind, slug)` через `entities_org_kind_slug_uniq`). **Дедуп slug при backfill** —
   тем же `generateUniqueTaskSlug(base, existingSlugs)`, где `existingSlugs = SELECT slug FROM entities WHERE
   organizationId=? AND kind='task'` (строго `kind='task'`, как в §2 п.5b — согласовано с runtime-create).
   Замечание: legacy `tasks` имеет уникальность `(org, slug)` БЕЗ kind (`tasks_org_slug_unique`, schema.ts:186),
   поэтому два legacy-таска с одинаковым slug невозможны; коллизия может возникнуть лишь с уже
   мигрированными `kind='task'`-узлами — её и ловит `existingSlugs`/uniqueIndex. Маппинг legacy→GTD:
   - `status` (8-значный Linear) → `gtd_tasks.status`: `completed→done`, `canceled→canceled`, прочие→`open`;
   - `dueDate`(timestamp) → `gtd_tasks.due`(date, UTC-день); `priority`/`estimate`/`labels` — в
     `entities.body` или теги (`labels[]`→`tagged_with`), `branch`/`prUrl` — в `entities.body`;
   - `externalProvider/externalId/externalKey/externalUrl/lastSyncedAt/syncError` → `gtd_tasks.externalRef`
     (только если `externalProvider in {linear}`; иначе локальная задача);
   - `assigneeId` → ребро `authored_by`/`participant_of` к contact-узлу (если резолвится) — опционально.
3. Backfill `gtd_tasks`-строк: `INSERT gtd_tasks` с `entityId`, `bucket="anytime"` (Linear-задачи без
   GTD-bucket), `sortKey=between(...)`, `checklist:[]`, счётчики 0; `completedAt`/`canceledAt` из
   `completedAt`/деривации.
4. Переключение чтения: UI/клиенты переводятся на `gtdTask`-роутер. Legacy `task`-роутер остаётся для
   shipped-CLI/sync (его процедуры уже помечены `@deprecated` в `task.ts:271`/`task.ts:393` — соответствует).
5. Депрекейт: после стабилизации — legacy `task`-роутер write-path помечается deprecated; `tasks`/
   `task_statuses` остаются read-only legacy ≥1 релиз, затем удаляются отдельной миграцией
   `drop_legacy_tasks` (вместе с переездом `syncTask` на `syncGtdTask`).

**Что депрекейтится:** legacy `task`-роутер (write-path), таблицы `tasks`/`task_statuses` (после grace-периода).
`syncTask` → `syncGtdTask` (миграция конвейера в том же релизе, что drop legacy).

**Обратная совместимость:** slug-схема и `@rox/shared/task-slug` (`generateBaseTaskSlug`/`generateUniqueTaskSlug`)
переиспользуются — slug стабилен и служит ключом маппинга. Внешние интеграции (Linear) продолжают работать:
`externalRef` несёт те же `externalId`/`externalKey`, что и legacy-колонки.

**Откат (down, концептуально):** `gtd_tasks_detail` обратима — `DROP TABLE gtd_tasks; DROP TYPE
gtd_task_status, gtd_task_bucket, gtd_task_external_provider;`. Узлы `entities(kind="task")` и рёбра остаются
(ядро — их владелец); их чистка — отдельный шаг graph-сервиса при необходимости. Legacy `tasks` не
затрагивается, поэтому данные восстановимы из него (потому держим legacy read-only до полной уверенности).
Backfill-скрипт идемпотентен (`ON CONFLICT DO NOTHING` по естественным ключам), повторно-безопасен.
Концептуальный «down» = ручной reverse-скрипт, тестируется на neon-branch перед прод-деплоем.

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Создание узла через ядро.** Given активная org; When `gtdTask.create` с уникальным slug; Then создаётся
   ровно один `entities(kind="task")` (через graph-сервис) + одна `gtd_tasks`-row; прямых INSERT в `entities`
   из роутера нет. Повтор с тем же `idempotencyKey` (через `gtd_idempotency_keys`, §1.2.1) возвращает ту же
   задачу без второй вставки; разный `title` + тот же `idempotencyKey` → НЕ создаёт вторую задачу (ключ важнее
   slug).
2. **Project/Area как узлы.** Given `createArea` затем `createProject(areaEntityId)`; Then существуют
   `entities(kind="area")` и `entities(kind="project")` + ребро `child_of` (project→area); `gtd_tasks` у них нет.
3. **child_of денормализация.** Given `create({ projectEntityId })`; Then `gtd_tasks.projectEntityId`
   проставлен И существует ребро `edges relation=child_of` (task→project); смена проекта в `update`
   пересоздаёт ребро и FK атомарно.
4. **Today-классификация.** Given задача `due=вчера, status=open`; When `today(tz)`; Then она в `overdue`;
   задача `scheduled=сегодня` — в `today`; даты считаются в `tz`, хранение UTC/date.
5. **Статус-переходы.** Given `open`; When `setStatus(done)`; Then `status="done"`, `completedAt` проставлен,
   `entities.status` остаётся `"active"` (Logbook); `setStatus(open)` сбрасывает `completedAt`. Идемпотентно.
6. **Реордер (move).** Given три задачи в bucket; When `move(B, before=A)`; Then `B.sortKey` строго между
   соседями (LexoRank), порядок `list` отражает перестановку без перезаписи остальных строк. **Tie-break:** при
   конкурентных `move`, давших двум задачам равный `sortKey`, `list` сортирует детерминированно по
   `(sortKey asc, entityId asc)` (равные ключи допустимы, `sortKey` НЕ unique — рвутся по `entityId`).
7. **Kanban-перенос меняет bucket/project.** Given `move(entityId, bucket="today")`; Then `gtd_tasks.bucket`
   обновлён, задача появляется в `today`/`board` колонке «today».
8. **Чек-лист.** Given задача с 3 пунктами; When `toggleChecklistItem(done=true)`; Then соответствующий
   `checklist[i].done=true`, `checklistDoneCount` инкрементирован; повтор с тем же `done` — no-op.
9. **Теги.** Given `setTags(["работа"])`; Then существует `tag`-узел slug=`работа` (lazy) + `edges tagged_with`;
   повторный тот же набор — no-op; удаление из набора удаляет ребро.
10. **Семантический поиск + degraded.** Given задача проиндексирована; When `search semantic`; Then hits
    отфильтрованы по `orgId`; при недоступном embedder ответ `degraded:true` в keyword-режиме (без throw).
11. **Lifecycle/корзина.** Given задача; When `archive(status=trashed)`; Then `entities.status="trashed"`,
    задача исчезает из `list` (по умолчанию active-only), но доступна в `get`; рёбра сохранены.
12. **Внешний импорт идемпотентен.** Given `importExternal(provider="linear", externalId="X")`; When повтор с
    тем же `(orgId, provider, externalId)`; Then `created:false`, дубля узла/`gtd_tasks` нет (uniqueIndex).
13. **Outbound sync.** Given задача с `externalRef`; When `setStatus(done)`; Then после коммита вызван
    `syncGtdTask`, токен взят из `secret-store` (не в логах), статус ушёл в провайдер; ошибка пуша пишется в
    `externalRef.syncError` без throw.
14. **Webhook-подпись.** Given inbound webhook Linear без валидной подписи; Then запрос отклонён (нет вызова
    `importExternal`); с валидной — задача создаётся/обновляется.
15. **Cache-first рендер.** Given live-query вернула строки при `isReady=false`; When рендер TaskList/Kanban;
    Then строки видны сразу (data не скрыта), скелетон — только при `data.length===0 && !isReady` (AGENTS.md §9).
16. **Backfill идемпотентен.** Given backfill на neon-branch; When запущен повторно; Then дубликатов
    `entities`/`gtd_tasks`/`edges` нет (естественные ключи), legacy `tasks` не изменён.
17. **Время/типы.** Then все времена — `timestamptz`/`date` (UTC), нет локального времени; денежных полей в
    GTD нет (N/A — задачи без стоимости; стоимость живёт в #11 economy). `$inferInsert`/`$inferSelect`
    экспортированы; миграция сгенерирована `drizzle-kit generate` (не правлена руками).
18. **Клавиатура/a11y.** Given TaskBoard; When навигация и перенос карточки только с клавиатуры (dnd-kit
    keyboard sensor); Then перенос выполним, `axe-core` без нарушений на TasksLayout/TaskBoard/TaskDetail.

---

## 7. Тест-план

**Unit (Bun, ко-локация, без БД):**
- `packages/shared/src/task/sortkey.test.ts` — `between`/`midpoint`/`rebalance`: ключ строго между соседями,
  стабильность, расширение при исчерпании разрешения (AC6).
- `packages/trpc/src/router/gtd-task/schema.test.ts` — Zod-границы (limit, checklist≤1000, slug-regex, uuid,
  union slug/entityId), reject невалидных.
- Idempotency-логика `create`/`importExternal` (мок graph-сервиса) — повторный ключ/external → один insert
  (AC1, AC12).
- Today-классификация (чистая функция `classifyToday(tasks, tz)`) — overdue/today/evening по tz (AC4).
- Legacy→GTD маппинг статусов (`mapLegacyStatus`) — completed→done, canceled→canceled, прочие→open (AC16).

**Integration (tRPC + Drizzle на neon-branch; фикстуры org/user; паттерн как `task.test.ts`/`knowledge.test.ts`):**
- Фикстура: новый neon-branch (root `.env` → branch, не прод; AGENTS.md «DB migrations»), прогон миграции
  `gtd_tasks_detail`, seed org+user+ядро (`entities`/`edges`).
- **Smoke миграции (expression-unique).** Ассерт, что сгенерированный `drizzle-kit generate` SQL для
  `gtd_tasks` содержит ожидаемый `CREATE UNIQUE INDEX "gtd_tasks_org_provider_external_uniq" … (organization_id,
  (external_ref->>'provider'), (external_ref->>'externalId')) WHERE external_ref IS NOT NULL` (drizzle-kit
  исторически ненадёжно эмитит expression-based unique по `sql\`\`` с `WHERE` + `->>`; в `agent.ts`/`knowledge.ts`
  таких примеров нет — только колоночные). Если конкретная версия `drizzle-kit` в репо НЕ эмитит DDL корректно
  — **запасной вариант:** материализовать `external_ref->>'provider'`/`->>'externalId'` в обычные/`generated`
  колонки `externalProvider`/`externalId` и индексировать их (надёжнее для drizzle-kit), оставив `externalRef`
  jsonb для прочих полей; решается по факту прогона `generate` в PR-1.
- `gtdTask.create/update/get/list/setStatus/move/archive/setTags/toggleChecklistItem` happy-path + ошибки
  (`CONFLICT`/`NOT_FOUND`/`BAD_REQUEST`/`PAYLOAD_TOO_LARGE`).
- `createProject`/`createArea`/`listProjects` + `child_of` рёбра (AC2–AC3) против реального ядра/мока
  graph-сервиса.
- `move`-реордер: вставка между/в край, смена bucket/project (AC6–AC7).
- `importExternal`/`linkExternal` идемпотентность и дедуп uniqueIndex (AC12); проекция секретов как в
  `agentSource.test.ts` (токены не в выдаче).
- `today`/`upcoming` по нескольким tz (AC4).
- Backfill-скрипт повторно-безопасен (AC16) — прогон дважды, ассерт отсутствия дублей, legacy `tasks` не тронут.

**e2e (Playwright, `apps/web`):** Flow A (быстрый ввод в Today + live-подтверждение), Flow B (kanban-перенос
open→done + Logbook). Sync (Flow C/промоут) — интеграционный с #11, отдельный сценарий; webhook-подпись —
integration-тест на `apps/api`.

**Команды:**
```bash
bun test packages/shared/src/task                  # unit (sortkey/classify)
bun test packages/trpc/src/router/gtd-task         # integration (neon-branch via .env)
bun test packages/db                               # smoke миграции/типы
bun run lint && bun run typecheck                  # обязательный pre-merge gate (CI=0 warnings)
```
**Целевое покрытие изменённого кода ≥80% веток** (новые `gtdTask`-роутер, `links.ts`, `sortkey.ts`,
classify/mapping, sync-ветвь). Smoke перед push: `bun test packages/shared/src/task packages/trpc/src/router/gtd-task`.

---

## 8. Задачи реализации (ordered work-list, PR-able срезы)

1. **PR-1 — Enum + detail-схема + idempotency.** `packages/db/src/schema/enums.ts` (+`gtd_task_status`/
   `gtd_task_bucket`/`gtd_task_external_provider`), `packages/db/src/schema/gtdTask.ts` (`gtd_tasks` +
   **`gtd_idempotency_keys`** §1.2.1 + типы `GtdChecklistItem`/`GtdExternalRef`), экспорт в
   `packages/db/src/schema/index.ts`, relations в `relations.ts`. `bunx drizzle-kit generate
   --name="gtd_tasks_detail"`. **Smoke-проверка миграции** (см. §7): сгенерированный SQL содержит ожидаемый
   `CREATE UNIQUE INDEX … ((external_ref->>'provider')) … WHERE external_ref IS NOT NULL`. Зависит от: схема
   ядра #01 (`entity.ts`/`edges.ts`).
2. **PR-2 — sortkey-утилиты.** `packages/shared/src/task/sortkey.ts` (+`between`/`midpoint`/`rebalance`) +
   тесты; экспорт в `packages/shared/src/task/index.ts`. Без БД.
3. **PR-3 — `gtdTask`-роутер (CRUD + проекты/области на ядре).** `packages/trpc/src/router/gtd-task/
   {schema,gtdTask,links,index}.ts`; процедуры **1–16** (§2); `ensureGtdTaskRow`-хелпер; интеграция с
   graph-сервисом #01; регистрация в `packages/trpc/src/root.ts`. Integration-тесты на neon-branch. Зависит
   от PR-1, PR-2, graph-router #01. **`search`(п.16) зависит от graph-search ядра (#01) + qdrant (#02):** если
   к моменту PR-3 они не готовы, `mode=semantic` деградирует в `mode=keyword` (`ilike` по
   `entities.title`/`markdown`) с `degraded:true` — это уже заложено в п.16; поэтому PR-3 НЕ блокируется
   готовностью qdrant, semantic-ветка включается, когда #01/#02 поставлены. (Процедуры 17–18 — в PR-4.)
4. **PR-4 — Sync Linear/Todoist.** `packages/trpc/src/lib/integrations/sync/gtd-tasks.ts` (`syncGtdTask`),
   ветвь в `sync/tasks.ts`; процедуры `linkExternal`/`importExternal` (§2 п.17–18); webhook-приёмник в
   `apps/api/.../integrations/<provider>/` с валидацией подписи; токены через `secret-store`. Зависит от PR-3.
5. **PR-5 — Backfill legacy→GTD.** `packages/scripts/src/migrate-tasks-to-gtd.ts`; маппинг статусов/полей
   (§5); тест идемпотентности; прогон на neon-branch. Зависит от PR-3.
6. **PR-6 — UI core (списки + Today/Upcoming + detail).** `apps/web` feature-модуль `tasks`
   (TasksLayout/TaskList/TodayView/UpcomingView/TaskDetail/DatabaseView), Electric live-queries (cache-first),
   `packages/ui/src/components/TaskRow/`, `ChecklistEditor/`; command-bar быстрый ввод. e2e Flow A. Зависит
   от PR-3.
7. **PR-7 — Kanban + a11y.** `packages/ui/src/components/KanbanBoard/` (dnd-kit, keyboard sensor),
   `TaskBoard`-экран; axe-core в CI; WCAG-доводка (§4.4). e2e Flow B. Зависит от PR-6.
8. **PR-8 — Депрекейт legacy.** План `drop_legacy_tasks` + миграция `syncTask`→`syncGtdTask` (после
   grace-периода, отдельный релиз); пометка legacy `task`-роутера deprecated. Зависит от PR-5 + подтверждения
   переключения чтения.

**Ключевые точки изменения файлов:** `packages/db/src/schema/{enums.ts,gtdTask.ts,index.ts,relations.ts}`;
`packages/db/drizzle/*` (только авто-генерация); `packages/trpc/src/router/gtd-task/*`;
`packages/trpc/src/root.ts` (регистрация `gtdTask`); `packages/trpc/src/lib/integrations/sync/{tasks.ts,gtd-tasks.ts}`;
`packages/shared/src/task/sortkey.ts`; `packages/scripts/src/migrate-tasks-to-gtd.ts`;
`packages/ui/src/components/{TaskRow,KanbanBoard,ChecklistEditor}/*`; `apps/web/.../features/tasks/*`;
`apps/api/.../integrations/<provider>/webhook`.

---

## 9. Риски и открытые вопросы

**Риски + митигейшн.**
- **R1. Коллизия имени `tasks`** (legacy Linear-таблица vs GTD detail). *Митигейшн:* detail назван `gtd_tasks`;
  переименование/слияние — отдельный релиз после полного перехода (раздел 5); до того обе модели сосуществуют.
- **R2. Двойственность `child_of` (ребро) и денормализованных FK** (`projectEntityId`/`areaEntityId`) —
  риск рассинхрона. *Митигейшн:* ребро и FK пишутся атомарно в одной транзакции (`create`/`update`/`move`);
  ребро — канон, FK — производный кэш; интеграционный тест на согласованность (AC3).
- **R3. LexoRank-деградация** при частых вставках в одну точку. *Митигейшн:* `between` расширяет длину ключа;
  `rebalance` при достижении порога; ключи на org+bucket/project, не глобальные.
- **R4. Конфликты двустороннего sync** (Rox↔Linear/Todoist расходятся). *Митигейшн:* last-writer-wins по
  `updatedAt` источника; `externalRef.syncError` + UI-баннер; Rox-специфичные поля (bucket/checklist) наружу
  не уходят (нет обратного конфликта). Field-level merge — ревизируемо.
- **R5. Идемпотентность POST** — у `entities` нет колонки `idempotencyKey`, общий механизм #01 ещё не
  существует. *Митигейшн:* подсистема владеет собственной `gtd_idempotency_keys` (§1.2.1, в PR-1), `unique(org,
  key)` → возврат ранее созданной сущности за 24ч — контракт 00 §3 выполняется в фазе 1 без блокировки на #01.
  Дедуп по `(org, kind, slug)` — лишь второй страж гонки на slug, не замена idempotency-ключа. Когда #01
  поставит общий механизм — мигрировать на него (ОВ-1).
- **R6. Утечка секретов sync** в логи/`externalRef`. *Митигейшн:* токены только из `secret-store` на сервере;
  `externalRef` хранит лишь публичные id/url; PII/токены не логируются (00 §3).
- **R7. Размер `checklist` jsonb** для гигантских списков. *Митигейшн:* лимит `PAYLOAD_TOO_LARGE` (≤1000
  пунктов / 256 КБ); глубокая декомпозиция — под-задачи (`task child_of task`), не чек-лист.

**Не-блокирующие открытые вопросы.**
- **ОВ-1.** Будущий **общий** механизм идемпотентности POST в ядре (отдельная таблица vs `edges.metadata`) —
  решает владелец #01. Фаза 1 этим **не блокируется**: GTD поставляет собственную `gtd_idempotency_keys`
  (§1.2.1). Когда ядро #01 даст общий механизм — `gtd_idempotency_keys` мигрируется/депрекейтится, контракт
  `create`/`importExternal` (общий с #03) согласуется с владельцем #01.
- **ОВ-2.** Нужна ли detail-таблица `gtd_projects` (дедлайн проекта, заметка, иконка) сверх `entities`-узла —
  отложено до требований UI; пока всё в `entities`.
- **ОВ-3.** Глубина под-задач (`task child_of task`) и rollup-прогресс на UI — v1 плоский Project→Tasks +
  чек-лист; иерархия — отдельный таск.
- **ОВ-4.** Финальное имя detail-таблицы после депрекейта legacy: переименовать `gtd_tasks`→`tasks` или
  оставить — решается в релизе `drop_legacy_tasks`.
- **ОВ-5.** Todoist-webhook vs polling (у Todoist sync-API свои лимиты) — параметр конфигурации
  sync-воркера; согласовать с #02/rate-limit провайдера.
- **ОВ-6.** Перенос legacy-полей (`priority`/`estimate`) в GTD: теги/`entities.body` vs выделенные колонки —
  уточнить по реальному использованию в shipped-CLI.
