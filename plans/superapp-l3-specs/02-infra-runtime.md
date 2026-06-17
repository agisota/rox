# 02 — Инфра-рантайм (minio/qdrant/Turso/Electric/embedder/sync): L3 implementation-ready ТЗ

> Опирается на `plans/superapp-l3-specs/00-shared-context.md` (далее «00-SC»): §2 — фиксированный контракт ядра графа (НЕ переопределять; enum только расширять diff'ом), §3 — конвенции репо, §4 — допущения A1–A8, §5 — этот шаблон.
> Родительский дизайн: `plans/rox-superapp-roadmap-and-design.md` Часть 1 (Фаза 0) + Часть 2B/2C/2E (capture/AI-пайплайн, процессы/sidecar, sync-топология).
> Заземление по коду: `docker-compose.yml`, `.rox/setup.local.sh`, `apps/electric-proxy/src/{index,auth,where,electric,types}.ts`, `apps/relay/src/*`, `apps/streams`, `packages/local-db/src/schema/*`, `packages/host-service/src/daemon/DaemonSupervisor.ts` + `daemon/manifest.ts` + `ports/static-ports.ts`, `packages/host-provisioner/src/{types,rox-self,factory}.ts`, `packages/trpc/src/lib/{crypto.ts,integrations/secret-store.ts}`, `packages/db/src/schema/{enums,knowledge,economy}.ts`, `packages/trpc/src/root.ts`.

---

## 0. Резюме и границы

**Роль подсистемы.** #02 — это **рантайм-фундамент Фазы 0**: поднимает и обслуживает локальные/контейнерные сервисы данных, поверх которых работают все доменные подсистемы (#1/#3/#4/#8/#10/#11/#15). #02 НЕ владеет доменными узлами графа — она предоставляет **сервисы хранения, индексации и синхронизации** и тонкий control-plane (tRPC + схема) для их состояния.

**Что входит (Фаза 0):**
- **Object storage (minio, S3-совместимый)** — единственный сток бинарных объектов (`files/`, `frames/`, `recordings/`, `artifacts/`, `exports/`, `sessions/`), bucket-конвенция `org-<orgId>` (A8). Контракт presigned-URL и server-side кладки/удаления.
- **Vector store (qdrant)** — единая коллекция `rox_entities`, point-per-searchable-entity, payload-фильтрация по org/kind (00-SC §2A). Реиндекс по `updated_at`.
- **Embedder** — провайдер-абстракция `AIProvider.embed` (D12): дефолт-реализация `local` (ONNX/fastembed in-process), опц. `zed-gateway`/`openai`/`gemini`; очередь эмбеддинга и индексатор `entities`→qdrant.
- **Local-DB апгрейд → Turso/libSQL** — `packages/local-db` (сейчас SQLite через `sqliteTable`, dialect `sqlite`) переключается на embedded-реплику синхронизируемого + primary для приватного/тяжёлого (00-SC §2E). Контракт sync-engine клиента.
- **Electric down-sync (cache-first)** — расширение allowlist `apps/electric-proxy` (`entities`, `edges`, `identity_links`, `activity_events`) с org-scoped where-clause; контракт shape-подписок. relay/streams (A3) переиспользуются как есть для realtime-каналов (presence/typing/live-output) — НЕ заводим новый стек.
- **Runtime control-plane**: detail-таблицы `storage_objects` (1:1 к `entityId`-узлу `file`), `embedding_jobs` (очередь индексации), `runtime_services` (реестр поднятых sidecar-сервисов и health), `sync_cursors` (курсоры down-sync на клиента). tRPC-роутер `runtime` (новый).
- **Supervision sidecar** — оркестрация minio/qdrant/embedder через существующий `host-service` DaemonSupervisor + `host-provisioner` (контейнеры). Health-snapshot.

**Что явно НЕ входит (out of scope):**
- Сам graph-сервис ядра (`create/link/promote/resolveBacklinks/search`) и таблицы `entities/edges/identity_links/activity_events` — поставляет **#01**; #02 их потребляет (Electric-репликация, qdrant-индексация) и НЕ переопределяет (00-SC §2).
- Доменные detail-таблицы (`notes`, `tasks`, `agent_sessions`, `emails`, …) — поставляют профильные подсистемы. #02 даёт только `storage_objects`/`embedding_jobs`/`runtime_services`/`sync_cursors`.
- pty-daemon framed-протокол и его supervision — **уже реализованы** (`@rox/pty-daemon`, `host-service/src/daemon`); #02 переиспользует DaemonSupervisor-паттерн для НЕ-PTY сервисов, контракт описан, протокол не дублируется.
- Семантика поиска/ранжирования (что считать релевантным) — определяет вызывающий домен через graph-router `search`; #02 даёт лишь vector-upsert/query примитив.
- Capture-кадры/STT (подсистема #8/#12, 00-SC §4 A4/A5) — #02 лишь предоставляет `frames/`-bucket и `embedding_jobs` для vision-summary; конвейер захвата — в #8.
- Netbird-mesh, дистрибутив-упаковка, cross-platform паритет sidecar-бинарей — **Фаза 6** (закалка). Здесь — минимальный рабочий бутстрап (Фаза 0).
- E2EE приватного контента (Skiff-уровень) — ревизируемо (00-SC §2F), не Фаза 0.

**Фаза:** 0. **Зависимости:** #01 (схема ядра `entities` — `storage_objects.entityId` ссылается на `entities.id` kind=`file`; индексатор слушает upsert `entities`). Обратная: все домены зависят от #02. Технологически независим от доменов — поднимается первым вместе с #01.

**Принятые допущения (00-SC §4), все ревизируемы:**
- **A3** — realtime = существующие `apps/relay`+`apps/streams`+Electric. Новый стек НЕ вводим. Каналы realtime (presence/typing/live-output) — relay; реплика метаданных — Electric.
- **A8** — minio: 1 bucket на org `org-<orgId>`, префиксы по домену. `storageRef` (`{bucket,key,mime,size}`) — в `entities.storageRef` (ядро) и в detail (`storage_objects`).
- **Локально-специфичные (ревизируемые):**
  - **B1.** Vector store = **qdrant** (Docker-сервис), единая коллекция `rox_entities`, payload-фильтрация (00-SC §2A). Альтернатива (pgvector в Postgres) — §9 ОВ-1.
  - **B2.** Embedder дефолт = **local ONNX** (`bge-small-en-v1.5`/`fastembed`, 384-dim) in-process в `embedder`-sidecar; модель — on-demand загрузка (Фаза 6 упаковка). Размерность вектора фиксируется конфигом `EMBEDDING_DIM` и закладывается в коллекцию при первом создании.
  - **B3.** Object storage local = **minio** (Docker), prod/cloud — любой S3-совместимый (конфиг `S3_*`). Один клиентский интерфейс `ObjectStore`.
  - **B4.** Local-DB sync = **Turso embedded-replica** (`@libsql/client` с `syncUrl`) для синхронизируемых таблиц; чисто-локальные таблицы (`packages/local-db`, рабочее состояние десктопа) остаются локальным libSQL-файлом. Down-sync доменных `entities`/`activity_events` к клиенту идёт **через Electric** (cache-first), Turso — primary для приватного/тяжёлого, не дубль Electric-канала.
  - **B5.** Embedding-очередь (`embedding_jobs`) живёт в **cloud Postgres** (видна индексатору и Electric), исполняется `embedder`-sidecar воркером (pull). Альтернатива (Redis/стрим) — ОВ-2.

---

## 1. Доменная модель (полная схема БД)

#02 НЕ заводит доменные узлы. Она добавляет **control-plane detail-таблицы**: одна 1:1 к узлу `file` (`storage_objects`), три служебные (`embedding_jobs`, `runtime_services`, `sync_cursors`). Файл: `packages/db/src/schema/runtime.ts`. Конвенции зеркалят `economy.ts`/`knowledge.ts` (00-SC §3).

### 1.1 Enum-расширения (diff к 00-SC §2.1, файл `packages/db/src/schema/enums.ts`)

Ядро уже содержит `entityKind="file"` и `activityEventKind="file_op"` (00-SC §2.1) — **НЕ добавляем**. Из `edgeRelationValues` `attached_to`/`embeds`/`captured_from` — используем, не добавляем. Добавляем **только** доменные enum'ы рантайма (append-only, не переупорядочивать/удалять):

```ts
// enums.ts — ДОБАВИТЬ (Infra-runtime, фаза 0). pgEnum'ы объявляются в schema/runtime.ts.

/** Логический бакет-префикс в minio (A8). bucket = org-<orgId>, prefix — ниже. */
export const storageBucketPrefixValues = [
  "files",       // вложения, Drive
  "frames",      // кадры screen-capture (#8)
  "recordings",  // аудио/видео-записи
  "artifacts",   // design-артефакты (#15)
  "exports",     // vault-снапшоты / выгрузки
  "sessions",    // крупные транскрипты агент-сессий (#11)
] as const;
export const storageBucketPrefixEnum = z.enum(storageBucketPrefixValues);
export type StorageBucketPrefix = z.infer<typeof storageBucketPrefixEnum>;

/** Жизненный цикл объекта в minio (lifecycle вместо deleted_at). */
export const storageObjectStatusValues = [
  "pending",   // presigned-URL выдан, объект ещё не подтверждён клиентом
  "stored",    // подтверждён (HEAD прошёл), доступен
  "missing",   // отсутствует в minio (реконсиляция нашла рассинхрон)
  "trashed",   // помечен к удалению (GC удалит из minio)
] as const;
export const storageObjectStatusEnum = z.enum(storageObjectStatusValues);
export type StorageObjectStatus = z.infer<typeof storageObjectStatusEnum>;

/** Состояние задания эмбеддинга (очередь индексации entities→qdrant). */
export const embeddingJobStatusValues = [
  "queued",
  "running",
  "done",
  "failed",
  "skipped", // нет embed-текста / не индексируемый kind
] as const;
export const embeddingJobStatusEnum = z.enum(embeddingJobStatusValues);
export type EmbeddingJobStatus = z.infer<typeof embeddingJobStatusEnum>;

/** Capability AI-провайдера, к которому привязан embed (D12). */
export const aiProviderKindValues = [
  "local",        // ONNX/fastembed in-process
  "zed_gateway",  // api.zed.md/v1 (R1 + Groq)
  "openai",
  "gemini",
  "anthropic",
] as const;
export const aiProviderKindEnum = z.enum(aiProviderKindValues);
export type AiProviderKind = z.infer<typeof aiProviderKindEnum>;

/** Тип поднятого рантайм-сервиса (реестр sidecar). */
export const runtimeServiceKindValues = [
  "minio",
  "qdrant",
  "embedder",
  "turso",     // local-replica sync-engine (на устройстве)
  "electric",  // shape-proxy upstream
] as const;
export const runtimeServiceKindEnum = z.enum(runtimeServiceKindValues);
export type RuntimeServiceKind = z.infer<typeof runtimeServiceKindEnum>;

/** Здоровье рантайм-сервиса. */
export const runtimeServiceStateValues = [
  "provisioning",
  "healthy",
  "degraded",
  "stopped",
  "failed",
] as const;
export const runtimeServiceStateEnum = z.enum(runtimeServiceStateValues);
export type RuntimeServiceState = z.infer<typeof runtimeServiceStateEnum>;
```

> Ядровые `entityKind`/`edgeRelation`/`activityEventKind` НЕ трогаем. Все новые значения — detail-домен рантайма, не пересекаются с ядром.

### 1.2 Detail-таблица `storage_objects` (1:1 к `entities.id` kind=`file`)

Узел `file` (kind ядра) создаёт graph-сервис #01; #02 владеет detail-метаданными объекта в minio. PK = FK к `entities.id` (1:1), как `notes`/`agent_sessions` у соседей.

```ts
// packages/db/src/schema/runtime.ts
import { sql } from "drizzle-orm";
import {
  bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
  aiProviderKindValues, embeddingJobStatusValues, runtimeServiceKindValues,
  runtimeServiceStateValues, storageBucketPrefixValues, storageObjectStatusValues,
} from "./enums";
// ВАЖНО (зависимость от #01): по 00-SC §2 файлы ядра — schema/{entity,edges,identity,activity}.ts.
// `entities` поставляет #01 в `entity.ts` (НЕ в `schema.ts`). `v2Projects` уже живёт в `schema.ts`.
// Точный путь импорта `entities` согласуется с владельцем #01 на этапе PR-1 (см. §8): целевой
// barrel-импорт `from "@rox/db/schema"` (как делает electric-proxy) после регистрации `entity.ts`
// в `schema/index.ts`. Прямые file-импорты ниже отражают реальное расположение по 00-SC §2.
import { entities } from "./entity"; // #01, kind ядра (greenfield: файл создаёт PR схемы #01)
import { v2Projects } from "./schema"; // существует в репо (schema.ts:511)

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------
export const storageBucketPrefix = pgEnum("storage_bucket_prefix", storageBucketPrefixValues);
export const storageObjectStatus = pgEnum("storage_object_status", storageObjectStatusValues);
export const embeddingJobStatus = pgEnum("embedding_job_status", embeddingJobStatusValues);
export const aiProviderKind = pgEnum("ai_provider_kind", aiProviderKindValues);
export const runtimeServiceKind = pgEnum("runtime_service_kind", runtimeServiceKindValues);
export const runtimeServiceState = pgEnum("runtime_service_state", runtimeServiceStateValues);

// ---------------------------------------------------------------------------
// storage_objects — 1:1 поверх entity(kind="file")
// ---------------------------------------------------------------------------
export const storageObjects = pgTable(
  "storage_objects",
  {
    // PK == FK на узел графа (1:1). Каскад при удалении узла.
    entityId: uuid("entity_id")
      .primaryKey()
      .references(() => entities.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, { onDelete: "set null" }),

    bucket: text().notNull(),                 // = `org-<orgId>` (A8); кэш для запросов
    prefix: storageBucketPrefix().notNull(),  // files/frames/recordings/artifacts/exports/sessions
    objectKey: text("object_key").notNull(),  // полный ключ в bucket, напр. files/<uuid>/name.png
    mime: text(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksumSha256: text("checksum_sha256"),  // для дедупа/реконсиляции (hex)

    // Идемпотентность POST `storage.createUploadUrl` — самодостаточна для #02 (НЕ зависит от ОВ-3):
    // повтор с тем же ключом в org резолвится по partial-uniq (organizationId, idempotency_key).
    idempotencyKey: uuid("idempotency_key"),

    status: storageObjectStatus().notNull().default("pending"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("storage_objects_org_idx").on(t.organizationId),
    index("storage_objects_prefix_idx").on(t.prefix),
    index("storage_objects_status_idx").on(t.status),
    uniqueIndex("storage_objects_bucket_key_uniq").on(t.bucket, t.objectKey),
    // Дедуп контента в пределах org+prefix (частичный — только когда checksum известен).
    uniqueIndex("storage_objects_org_prefix_checksum_uniq")
      .on(t.organizationId, t.prefix, t.checksumSha256)
      .where(sql`${t.checksumSha256} IS NOT NULL`),
    // Идемпотентность createUploadUrl: один объект на (org, idempotency_key) (частичный uniq).
    uniqueIndex("storage_objects_org_idempotency_uniq")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);
export type InsertStorageObject = typeof storageObjects.$inferInsert;
export type SelectStorageObject = typeof storageObjects.$inferSelect;
```

### 1.3 Служебная таблица `embedding_jobs` (очередь индексации entities→qdrant, B5)

```ts
export const embeddingJobs = pgTable(
  "embedding_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Индексируемый узел графа (любой searchable kind: note/email/agent_session/...).
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    kind: text().notNull(),                        // entityKind узла (денорм для фильтра воркера)
    status: embeddingJobStatus().notNull().default("queued"),
    provider: aiProviderKind().notNull().default("local"),
    // Версия эмбеддинг-модели/конфига — для bulk-реиндекса при смене модели.
    embeddingVersion: integer("embedding_version").notNull().default(1),
    // sha256 от embed-текста на момент постановки — пропуск, если контент не менялся.
    contentHash: text("content_hash"),
    attempts: integer().notNull().default(0),
    lastError: text("last_error"),
    // Контракт payload, который воркер положит в qdrant (см. §1.6). Постановщик ОБЯЗАН его передать
    // (осмысленный непустой `kind` нужен воркеру для фильтра `kind[]`). Дефолта НЕТ умышленно:
    // пустой `{ kind: "" }` молча попал бы в qdrant-payload и сломал фильтрацию — поэтому `.notNull()`
    // без `.default(...)`, и постановщик (см. §1.6, `embedding.enqueue`) всегда заполняет payload.
    payload: jsonb().$type<{
      kind: string;
      userId?: string;
      v2ProjectId?: string;
      tags?: string[];
      updatedAt?: string;
    }>().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("embedding_jobs_org_idx").on(t.organizationId),
    index("embedding_jobs_status_sched_idx").on(t.status, t.scheduledAt),
    index("embedding_jobs_entity_idx").on(t.entityId),
    // Одно АКТИВНОЕ задание на (entity, version): дедуп постановки (частичный uniq).
    uniqueIndex("embedding_jobs_entity_version_active_uniq")
      .on(t.entityId, t.embeddingVersion)
      .where(sql`${t.status} IN ('queued','running')`),
  ],
);
export type InsertEmbeddingJob = typeof embeddingJobs.$inferInsert;
export type SelectEmbeddingJob = typeof embeddingJobs.$inferSelect;
```

### 1.4 Служебная таблица `runtime_services` (реестр sidecar + health)

> **Семантика ключа и охват сервисов.** Реестр охватывает **org-scoped host-service-управляемые** sidecar: `minio`/`qdrant`/`embedder` — у них ровно один логический инстанс на org (локальный бутстрап), поэтому естественный ключ `(organizationId, kind)` корректен. `turso` (per-device local-replica, не на org-уровне) и `electric` (управляется docker-compose, не host-service, ОВ-7) **в этот реестр НЕ пишутся** через `runtime.reportHealth` — это сняло бы расхождение «один turso на org vs на устройство». Их статус для UI берётся иначе: Electric — из факта успешного shape-handshake (`SyncStatusBadge`), Turso — из локального состояния sync-engine на устройстве. Enum `runtimeServiceKind` сохраняет `turso`/`electric` (на случай будущего per-device-реестра, Фаза 6), но `runtime.reportHealth` принимает их только при наличии `deviceId` (см. §2.1 п.12) — иначе `(org, turso)` без устройства запрещён.

```ts
export const runtimeServices = pgTable(
  "runtime_services",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: runtimeServiceKind().notNull(),
    state: runtimeServiceState().notNull().default("provisioning"),
    // Для per-device сервисов (turso) — id устройства; для org-scoped (minio/qdrant/embedder) NULL.
    // Разрешает раздельную семантику ключа без расхождения «один turso на org vs на устройство».
    deviceId: text("device_id"),
    // Куда ходить (локальный порт / контейнерный endpoint). Секреты — НЕ здесь.
    endpoint: text(),                         // напр. http://127.0.0.1:9000 (minio)
    version: text(),                          // image/binary version
    // Имена ключей secret-store, нужных сервису (значения резолвятся на устройстве).
    secretKeys: jsonb("secret_keys").$type<string[]>().notNull().default([]),
    lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
    health: jsonb().$type<{ ok?: boolean; latencyMs?: number; detail?: string }>()
      .notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("runtime_services_org_idx").on(t.organizationId),
    // Org-scoped сервисы (minio/qdrant/embedder): один логический инстанс на (org, kind),
    // только когда deviceId IS NULL — частичный uniq, чтобы per-device строки не конфликтовали.
    uniqueIndex("runtime_services_org_kind_uniq")
      .on(t.organizationId, t.kind)
      .where(sql`${t.deviceId} IS NULL`),
    // Per-device сервисы (turso, Фаза 6): уникальны по (org, kind, deviceId).
    uniqueIndex("runtime_services_org_kind_device_uniq")
      .on(t.organizationId, t.kind, t.deviceId)
      .where(sql`${t.deviceId} IS NOT NULL`),
  ],
);
export type InsertRuntimeService = typeof runtimeServices.$inferInsert;
export type SelectRuntimeService = typeof runtimeServices.$inferSelect;
```

### 1.5 Служебная таблица `sync_cursors` (курсоры Electric down-sync на клиента)

```ts
export const syncCursors = pgTable(
  "sync_cursors",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),    // стабильный id устройства (desktop/web)
    shape: text().notNull(),                  // имя shape/таблицы ("entities","edges",...)
    // Прогресс Electric-шейпа: handle + offset (для возобновляемого down-sync).
    electricHandle: text("electric_handle"),
    electricOffset: text("electric_offset"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("sync_cursors_org_idx").on(t.organizationId),
    uniqueIndex("sync_cursors_device_shape_uniq").on(t.deviceId, t.shape),
  ],
);
export type InsertSyncCursor = typeof syncCursors.$inferInsert;
export type SelectSyncCursor = typeof syncCursors.$inferSelect;
```

### 1.6 Использование ядра графа и маппинг на qdrant

**kind/relation из ядра (используем, новых НЕ вводим):**

| Сущность ядра | Как использует #02 |
|---|---|
| `entities` kind=`file` | сам узел файла; `storageRef` (`{bucket,key,mime,size}`) — в ядре; полные метаданные — в `storage_objects` (1:1). Узел пишет graph-сервис #01. |
| `entities` (любой searchable kind) | источник эмбеддинга: на upsert ставится `embedding_jobs`; индексатор кладёт point в qdrant. #02 не пишет узлы. |
| `edges` relation=`attached_to` | file→<узел> (вложение). #02 ребро НЕ пишет (это домен/Drive), лишь предоставляет объект. |
| `edges` relation=`embeds`/`captured_from` | inline-объекты/кадры — поставляют #3/#8; #02 даёт сток minio. |
| `activity_events` kind=`file_op` | опц. журналирование загрузок/удалений (по контракту #8). #02 может писать одну строку при `confirmUpload`/GC. |

**Новые kind/relation:** нет. #02 укладывается в зафиксированный enum ядра; добавлены только detail-enum'ы рантайма (§1.1).

**qdrant (единая коллекция, 00-SC §2A):**
- **Коллекция:** `rox_entities`, distance `Cosine`, размерность = `EMBEDDING_DIM` (B2, дефолт 384). Создаётся идемпотентно при старте `embedder` (если нет — `PUT /collections/rox_entities`).
- **Point id:** `entities.id` (uuid → qdrant point id). Один point на индексируемый узел (00-SC §2.6: «своей коллекции домен не заводит»).
- **payload:** `{ entityId, kind, orgId, userId?, v2ProjectId?, tags?: string[], updatedAt }`. **Обязательный фильтр любого query — `orgId`** (мультитенант). Опц. фильтры — `kind[]`, `v2ProjectId`, `tags`.
- **Что embed-ится:** домен декларирует `embedText` (см. соседей: PKM `title+"\n\n"+markdown`; sessions `title+summary+первые N сообщений`). #02 хранит лишь результат и payload; текст приходит из постановщика задания (`embedding_jobs` ставит домен/индексатор по upsert узла).
- **Реиндекс:** по изменению `entities.updatedAt`/`contentHash` → новое `embedding_jobs` (дедуп §1.3). Смена модели → bulk-реиндекс через bump `embeddingVersion`.

---

## 2. API-контракты (tRPC)

**Новый роутер** `packages/trpc/src/router/runtime/` (схемы — `runtime/schema.ts`); регистрация в `packages/trpc/src/root.ts` как `runtime: runtimeRouter`. Существующие роутеры НЕ ломаем. Все мутации с побочкой — идемпотентны по ключу. Общие правила: `protectedProcedure`; `organizationId` обязателен и проверяется `requireActiveOrgMembership(ctx)` (как в `knowledge.ts`/`agentSource.ts`); запись — `dbWs`, чтение — `db`; границы валидируются Zod (00-SC §3). Секреты (S3-creds, provider-keys) — только из env/`secret-store`, НИКОГДА в input/output/логах (00-SC §3). Rate-limit публичных мутаций — 429 + `Retry-After`.

**Авторизация привилегированных служебных мутаций (`embedding.claimBatch`/`embedding.complete`/`runtime.reportHealth`).** Эти процедуры двигают очередь и health всех sidecar — их вызывает НЕ конечный пользователь, а воркер (`embedder`) / супервизор (`host-service`), поэтому `protectedProcedure` (пользовательская сессия) недостаточно. Вводим выделенный `serviceProcedure`:

```ts
// packages/trpc/src/router/runtime/service-procedure.ts
import { TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import { protectedProcedure } from "../../trpc"; // базовый ctx (session/db) — переиспользуем
import { getSecret } from "../../lib/integrations/secret-store"; // тот же secret-store, что и интеграции

const SERVICE_TOKEN_HEADER = "x-rox-service-token"; // ctx прокидывает заголовки запроса (см. trpc context)

/**
 * serviceProcedure — мутации для доверенных локальных воркеров/супервизора.
 * Токен: статический сервис-токен из secret-store (ключ `RUNTIME_SERVICE_TOKEN`),
 * передаётся воркером в заголовке `x-rox-service-token`. Сравнение — constant-time.
 * org-членство НЕ проверяется (воркер не пользователь); `organizationId` из input
 * валидируется Zod и используется как scope записи. Токен НИКОГДА не логируется.
 */
export const serviceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const provided = ctx.headers?.get(SERVICE_TOKEN_HEADER) ?? "";
  const expected = await getSecret("RUNTIME_SERVICE_TOKEN"); // из env/secret-store; не из БД-поля
  const ok =
    expected.length > 0 &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "invalid service token" });
  return next({ ctx });
});
```

- **Где валидируется:** middleware tRPC (`serviceProcedure.use`) — до тела процедуры; при отсутствии/несовпадении токена → `UNAUTHORIZED`, очередь/health не трогаются.
- **Как воркер/супервизор получают токен:** `RUNTIME_SERVICE_TOKEN` кладётся в env/`secret-store` при бутстрапе (`.rox/setup.local.sh` генерит при первом запуске; в prod — из секрет-менеджера). `apps/embedder` и `host-service` читают его из своего окружения и шлют в заголовке `x-rox-service-token`. Имя ключа: `RUNTIME_SERVICE_TOKEN`; заголовок: `x-rox-service-token`. Формат — непрозрачная случайная строка ≥32 байт (hex/base64url).
- Процедуры 7/8/12 используют `serviceProcedure` ВМЕСТО `protectedProcedure`; остальные — `protectedProcedure` + `requireActiveOrgMembership`.

Коды ошибок: `UNAUTHORIZED`/`FORBIDDEN` (нет членства/прав), `NOT_FOUND` (объект/сервис не в org), `BAD_REQUEST` (невалидный prefix/курсор/mime), `CONFLICT` (дедуп/идемпотентность), `PAYLOAD_TOO_LARGE` (превышен лимит размера), `PRECONDITION_FAILED` (сервис не healthy), `TOO_MANY_REQUESTS` (rate-limit).

| # | Процедура | Тип | Назначение |
|---|---|---|---|
| 1 | `storage.createUploadUrl` | mutation | Выдать presigned PUT-URL + создать узел `file` (через graph-сервис) и `storage_objects(pending)`. Идемпотентно. |
| 2 | `storage.confirmUpload` | mutation | Подтвердить загрузку (HEAD в minio), `status:=stored`, заполнить `size/checksum/mime`. Идемпотентно. |
| 3 | `storage.getDownloadUrl` | query | Presigned GET-URL для объекта (TTL). |
| 4 | `storage.delete` | mutation | Пометить `trashed` (GC удалит из minio); опц. hard-delete для admin. Идемпотентно. |
| 5 | `storage.list` | query | Список объектов org по prefix/project (keyset). cache-first. |
| 6 | `embedding.enqueue` | mutation | Поставить/обновить задание индексации узла. Идемпотентно по `(entityId, embeddingVersion)`. |
| 7 | `embedding.claimBatch` | mutation | (embedder-воркер) Захватить N `queued` заданий → `running`. Идемпотентно по worker-lease. |
| 8 | `embedding.complete` | mutation | (воркер) Отметить `done/failed/skipped` + записать факт upsert в qdrant. Идемпотентно. |
| 9 | `vector.search` | query | Низкоуровневый qdrant-query (orgId-filter обязателен). Используется graph-router `search` ядра. |
| 10 | `vector.reindex` | mutation | (admin) bulk-постановка заданий для org/kind (bump `embeddingVersion`). |
| 11 | `runtime.health` | query | Снапшот `runtime_services` (health всех sidecar). cache-first. |
| 12 | `runtime.reportHealth` | mutation | (host-service/sidecar) Записать health/endpoint сервиса. Upsert по `(org,kind)`. |
| 13 | `sync.electricToken` | query | Выдать краткоживущий JWT для `electric-proxy` (down-sync shape). |
| 14 | `sync.saveCursor` | mutation | Сохранить курсор down-sync устройства (`electricHandle/offset`). Upsert. |

### 2.1 Zod-контракты (вход/выход) и бизнес-правила

```ts
// runtime/schema.ts (выдержки — компилируемые Zod-схемы)
import { z } from "zod";
import {
  aiProviderKindEnum, embeddingJobStatusEnum, runtimeServiceKindEnum,
  runtimeServiceStateEnum, storageBucketPrefixEnum, storageObjectStatusEnum,
} from "@rox/db/enums";

const orgScoped = z.object({ organizationId: z.string().uuid() });

// Размерность вектора (B2). На границе валидации фиксируем длину входного `vector`,
// чтобы исключить вектор-DoS (огромный payload) и несоответствие коллекции (00-SC §3).
// Значение зеркалит конфиг `EMBEDDING_DIM`; в схеме — константа сборки.
export const EMBEDDING_DIM = 384;

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
const cursorSchema = z.object({ createdAt: z.string().datetime(), entityId: z.string().uuid() });

// Допустимые mime — allowlist по prefix (антизагрузка исполняемого, OWASP).
const uploadInput = orgScoped.extend({
  idempotencyKey: z.string().uuid(),
  prefix: storageBucketPrefixEnum,
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(5_000_000_000), // 5 GB hard cap
  v2ProjectId: z.string().uuid().optional(),
  checksumSha256: sha256Hex.optional(),
});

// --- output createUploadUrl
const createUploadUrlOutput = z.object({
  entityId: z.string().uuid(),
  bucket: z.string(),
  objectKey: z.string(),
  uploadUrl: z.string().url().nullable(), // null при дедупе (грузить не нужно)
  expiresInSec: z.number().int().positive(),
});

// --- 2) confirmUpload
const confirmUploadInput = orgScoped.extend({
  entityId: z.string().uuid(),
  checksumSha256: sha256Hex.optional(),
  sizeBytes: z.number().int().positive().max(5_000_000_000).optional(),
  mime: z.string().min(1).max(255).optional(),
});

// --- 3) getDownloadUrl
const getDownloadUrlInput = orgScoped.extend({
  entityId: z.string().uuid(),
  expiresInSec: z.number().int().min(60).max(3600).default(900),
});
const getDownloadUrlOutput = z.object({ url: z.string().url(), expiresInSec: z.number().int() });

// --- 4) delete
const deleteInput = orgScoped.extend({ entityId: z.string().uuid(), hard: z.boolean().default(false) });
const deleteOutput = z.object({ entityId: z.string().uuid(), status: storageObjectStatusEnum });

// --- 5) list
const listInput = orgScoped.extend({
  prefix: storageBucketPrefixEnum.optional(),
  v2ProjectId: z.string().uuid().optional(),
  status: storageObjectStatusEnum.default("stored"),
  cursor: cursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

// kind узла графа: используем общий entityKind-enum ядра (00-SC §2.1) — не плодим свой список.
// import { entityKindEnum } from "@rox/db/enums";  // (в реальном файле — из barrel)
const entityKind = z.string().min(1).max(64); // placeholder L3: в коде — entityKindEnum ядра #01

// --- 6) embedding.enqueue
const enqueueInput = orgScoped.extend({
  entityId: z.string().uuid(),
  kind: entityKind,
  provider: aiProviderKindEnum.default("local"),
  embeddingVersion: z.number().int().positive().optional(), // default = current EMBEDDING_VERSION
  contentHash: sha256Hex.optional(),
  payload: z.object({
    kind: entityKind,
    userId: z.string().uuid().optional(),
    v2ProjectId: z.string().uuid().optional(),
    tags: z.array(z.string().max(128)).max(64).optional(),
    updatedAt: z.string().datetime().optional(),
  }),
});
const enqueueOutput = z.object({ jobId: z.string().uuid(), status: embeddingJobStatusEnum });

// --- 7) embedding.claimBatch (serviceProcedure)
const claimBatchInput = orgScoped.extend({
  workerId: z.string().min(1).max(128),
  limit: z.number().int().min(1).max(100).default(25),
  leaseSec: z.number().int().min(30).max(600).default(120),
});
const embeddingJobClaim = z.object({
  jobId: z.string().uuid(),
  entityId: z.string().uuid(),
  kind: entityKind,
  provider: aiProviderKindEnum,
  embeddingVersion: z.number().int().positive(),
  embedText: z.string(),
});
const claimBatchOutput = z.object({ jobs: z.array(embeddingJobClaim) });

// --- 8) embedding.complete (serviceProcedure)
const completeInput = orgScoped.extend({
  jobId: z.string().uuid(),
  outcome: z.enum(["done", "failed", "skipped"]),
  error: z.string().max(2000).optional(),
  vectorWritten: z.boolean().optional(),
});
const completeOutput = z.object({ jobId: z.string().uuid(), status: embeddingJobStatusEnum });

// --- 9) vector.search — длина `vector` ограничена EMBEDDING_DIM; ровно одно из vector/queryText.
const vectorSearchInput = orgScoped
  .extend({
    vector: z.array(z.number().finite()).length(EMBEDDING_DIM).optional(),
    queryText: z.string().min(1).max(8192).optional(),
    kinds: z.array(entityKind).max(32).optional(),
    v2ProjectId: z.string().uuid().optional(),
    tags: z.array(z.string().max(128)).max(64).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    scoreThreshold: z.number().min(0).max(1).optional(),
  })
  .refine((v) => (v.vector === undefined) !== (v.queryText === undefined), {
    message: "exactly one of { vector, queryText } is required",
  });
const vectorSearchOutput = z.object({
  hits: z.array(z.object({ entityId: z.string().uuid(), kind: entityKind, score: z.number() })),
  degraded: z.boolean(),
});

// --- 10) vector.reindex (admin)
const reindexInput = orgScoped.extend({
  kinds: z.array(entityKind).max(32).optional(),
  bumpVersion: z.boolean().default(true),
});
const reindexOutput = z.object({ enqueued: z.number().int(), embeddingVersion: z.number().int() });

// --- 11) runtime.health
const healthInput = orgScoped;
const runtimeServiceCard = z.object({
  kind: runtimeServiceKindEnum,
  state: runtimeServiceStateEnum,
  endpoint: z.string().optional(),
  version: z.string().optional(),
  lastHealthAt: z.string().datetime().nullable().optional(),
  health: z.object({ ok: z.boolean().optional(), latencyMs: z.number().optional(), detail: z.string().optional() }),
  // ВНИМАНИЕ: `secretKeys` НЕ входит в output (см. §2.1 п.11).
});
const healthOutput = z.object({ services: z.array(runtimeServiceCard) });

// --- 12) runtime.reportHealth (serviceProcedure)
const loopbackEndpoint = z
  .string()
  .url()
  .refine((u) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|[a-z0-9_.-]+:)/i.test(u), {
    message: "endpoint must be loopback/container host",
  });
const reportHealthInput = orgScoped
  .extend({
    kind: runtimeServiceKindEnum,
    state: runtimeServiceStateEnum,
    // per-device сервисы (turso) ОБЯЗАНЫ передать deviceId; org-scoped (minio/qdrant/embedder) — нет.
    deviceId: z.string().min(1).max(128).optional(),
    endpoint: loopbackEndpoint.optional(),
    version: z.string().max(128).optional(),
    secretKeys: z.array(z.string().max(128)).max(32).optional(),
    health: z
      .object({ ok: z.boolean().optional(), latencyMs: z.number().optional(), detail: z.string().max(1000).optional() })
      .optional(),
  })
  .refine((v) => (["turso"].includes(v.kind) ? !!v.deviceId : true), {
    message: "per-device service kinds require deviceId",
  });
const reportHealthOutput = z.object({ ok: z.literal(true) });

// --- 13) sync.electricToken
const electricTokenInput = orgScoped.extend({
  shapes: z.array(z.enum(["entities", "edges", "identity_links", "activity_events"])).optional(),
});
const electricTokenOutput = z.object({ token: z.string(), expiresInSec: z.number().int().max(300) });

// --- 14) sync.saveCursor
const saveCursorInput = orgScoped.extend({
  deviceId: z.string().min(1).max(128),
  shape: z.string().min(1).max(64),
  electricHandle: z.string().max(256).optional(),
  electricOffset: z.string().max(256).optional(),
  lastSyncedAt: z.string().datetime().optional(),
});
const saveCursorOutput = z.object({ ok: z.literal(true) });
```

**1) `storage.createUploadUrl`** — output `{ entityId, bucket, objectKey, uploadUrl, expiresInSec }`.
Правила/идемпотентность (POST с побочкой):
- `idempotencyKey` (uuid): повтор с тем же ключом в org → возврат ранее созданного `{entityId, uploadUrl?}` (новый presigned-URL, если старый истёк), без второго узла. **Механизм самодостаточен для #02** (не зависит от ОВ-3): резолв по `storage_objects(organizationId, idempotency_key)` (partial-uniq `storage_objects_org_idempotency_uniq`, §1.2). В `dbWs.transaction` сначала `SELECT ... FOR UPDATE` по `(organizationId, idempotencyKey)`: если строка есть → перевыдать presigned-URL для её `objectKey` и вернуть существующий `entityId` (узел не создаётся повторно); иначе создать узел+строку (порядок ниже) с записью `idempotencyKey`. Гонка двух параллельных вставок ловится uniq-индексом → ретрай-ветка читает победившую строку. (ОВ-3 остаётся актуальным лишь как опциональная унификация общего idempotency-механизма ядра для PKM/sessions, но AC №2 #02 от него НЕ зависит.)
- `bucket = org-<orgId>` (A8). `objectKey = <prefix>/<entityId>/<sanitized fileName>`.
- mime-allowlist по `prefix`: `frames`→image/*, `recordings`→audio/*|video/*, `artifacts`→text/*|application/json, прочее — общий allowlist без `application/x-*executable`. Нарушение → `BAD_REQUEST`.
- `sizeBytes > LIMIT(prefix)` → `PAYLOAD_TOO_LARGE`.
- Если `checksumSha256` задан и уже есть `stored`-объект с тем же `(org,prefix,checksum)` → дедуп: вернуть существующий `entityId`, `uploadUrl=null` (грузить не нужно), `CONFLICT`-safe (200).
- Порядок (в `dbWs.transaction`, после idempotency-`SELECT … FOR UPDATE` выше): (a) `graphService.create({ kind:"file", title:fileName, storageRef:{bucket,key,mime,size} })` → entity; (b) presigned PUT через `ObjectStore.presignPut(bucket,key,ttl)`; (c) `INSERT storage_objects(status:"pending", idempotencyKey)`. Запись в minio делает КЛИЕНТ по URL (сервер не проксирует тело).
- `PRECONDITION_FAILED`, если `runtime_services(kind="minio").state != "healthy"`.

**2) `storage.confirmUpload`** — input `orgScoped & { entityId, checksumSha256?, sizeBytes?, mime? }`. output `SelectStorageObject`. Сервер делает `ObjectStore.head(bucket,key)`: если объект есть → `status:=stored`, заполнить `size/checksum/mime` из HEAD; обновить `entities.storageRef`. Идемпотентно (повтор на `stored` → no-op 200). Если HEAD пуст → `BAD_REQUEST` (клиент не загрузил). Опц. одна `activity_events(kind="file_op")`.

**3) `storage.getDownloadUrl`** — input `orgScoped & { entityId, expiresInSec?(60..3600=900) }`. output `{ url, expiresInSec }`. `NOT_FOUND` если объект не в org или `status!="stored"`. Presigned GET; org-scope проверяется ДО выдачи URL (нельзя получить URL чужого объекта).

**4) `storage.delete`** — input `orgScoped & { entityId, hard?:boolean=false }`. output `{ entityId, status }`. `status:=trashed` (GC-воркер позже удалит из minio). `hard=true` (только admin, `requireOrgAdmin`) — немедленный `ObjectStore.delete` + `entities` archive. Идемпотентно. Узел/рёбра графа не трогаем (их владелец — домен).

**5) `storage.list`** — input `orgScoped & { prefix?, v2ProjectId?, status?(default "stored"), cursor?({createdAt,entityId}), limit?(1..100=50) }`. output `{ items: StorageObjectCard[], nextCursor? }`. keyset по `(createdAt desc, entityId)`. **cache-first** (AGENTS.md §9): клиент рендерит из Electric-кэша, этот endpoint — гидратация.

**6) `embedding.enqueue`** — input `orgScoped & { entityId, kind, provider?(default "local"), embeddingVersion?(default current), contentHash?, payload }`. output `{ jobId, status }`. Идемпотентно по `(entityId, embeddingVersion)` с активным статусом (uniq §1.3): если активное задание есть и `contentHash` совпал → no-op (возврат существующего). Если контент изменился → отменить старое (`skipped`) и поставить новое. Не индексируемый kind (`tag`/`activity_event`) → `status:"skipped"` сразу. Обычно вызывается **индексатором по upsert узла**, не доменом напрямую.

**7) `embedding.claimBatch`** — input `orgScoped & { workerId:string, limit?(1..100=25), leaseSec?(30..600=120) }`. output `{ jobs: EmbeddingJobClaim[] }`. Атомарный `UPDATE … SET status='running', startedAt=now WHERE status='queued' AND scheduledAt<=now ORDER BY scheduledAt LIMIT n RETURNING …` (`SELECT … FOR UPDATE SKIP LOCKED` семантика). Истёкший lease (running дольше `leaseSec`) — возвращается в пул отдельным reaper-проходом. **`serviceProcedure`** (сервис-токен `RUNTIME_SERVICE_TOKEN` в заголовке `x-rox-service-token`, см. §2 «Авторизация привилегированных…»): только для `embedder`-воркера; без валидного токена → `UNAUTHORIZED`, очередь не трогается. `EmbeddingJobClaim = { jobId, entityId, kind, provider, embeddingVersion, embedText }` — `embedText` сервер собирает по `kind` через доменный резолвер (см. §3.3).

**8) `embedding.complete`** — input `orgScoped & { jobId, outcome: z.enum(["done","failed","skipped"]), error?, vectorWritten?:boolean }`. output `{ jobId, status }`. **`serviceProcedure`** (сервис-токен, см. §2): только воркер; без токена → `UNAUTHORIZED`. `done` → `finishedAt`, при `vectorWritten` факт upsert уже сделан воркером (см. §3.3). `failed` → `attempts+1`, `lastError`; если `attempts >= MAX(=5)` остаётся `failed`, иначе reaper перепланирует. Идемпотентно (повтор на терминальном статусе → no-op).

**9) `vector.search`** — input `orgScoped & { vector?:number[], queryText?:string, kinds?:string[], v2ProjectId?, tags?:string[], limit?(1..100=20), scoreThreshold?:number }`. output `{ hits: { entityId, kind, score }[], degraded:boolean }`. Ровно одно из `vector`/`queryText` (если `queryText` — сервер эмбеддит синхронно через `embedder`). **Всегда добавляет filter `orgId=organizationId`** (мультитенант, нельзя отключить). Если qdrant/embedder недоступен → `degraded:true` + пустой/частичный результат (НЕ throw) — вызывающий `search` ядра падает в keyword-режим. Это низкоуровневый примитив; ранжирование/смешивание — на стороне graph-router `search`.

**10) `vector.reindex`** — input `orgScoped & { kinds?:string[], bumpVersion?:boolean=true }`. output `{ enqueued:number, embeddingVersion:number }`. Только admin. Bulk-постановка `embedding_jobs` для всех `entities` org указанных kind; при `bumpVersion` — увеличивает глобальную `EMBEDDING_VERSION` (новые точки перезапишут старые по тому же point id). Rate-limit (тяжёлая операция).

**11) `runtime.health`** — input `orgScoped`. output `{ services: RuntimeServiceCard[] }` где `RuntimeServiceCard = { kind, state, endpoint?, version?, lastHealthAt?, health }` (без `secretKeys`!). cache-first. Только чтение.

**12) `runtime.reportHealth`** — input `orgScoped & { kind, state, deviceId?, endpoint?, version?, secretKeys?:string[], health?:{ok,latencyMs,detail} }`. output `{ ok:true }`. Upsert по `(org,kind)` для org-scoped сервисов (`deviceId IS NULL`, uniq `runtime_services_org_kind_uniq`) либо по `(org,kind,deviceId)` для per-device (`turso`, uniq `runtime_services_org_kind_device_uniq`), см. §1.4. `electric` через эту процедуру НЕ репортится (управляется docker-compose, ОВ-7); `turso` требует `deviceId` (Zod `.refine`). **`serviceProcedure`** (сервис-токен `RUNTIME_SERVICE_TOKEN` в заголовке `x-rox-service-token`, см. §2): вызывается `host-service`/sidecar; без валидного токена → `UNAUTHORIZED`, health не пишется. `endpoint` — только loopback/контейнерный хост; внешние URL отклоняются (`BAD_REQUEST`). Секретов в `health.detail` быть не должно (валидатор маскирует).

**13) `sync.electricToken`** — input `orgScoped & { shapes?:string[] }`. output `{ token, expiresInSec }`. Краткоживущий JWT (как ждёт `electric-proxy/auth.ts`: `sub`, `email`, `organizationIds[]`), подписанный тем же issuer/audience (`AUTH_URL`), `exp` ≤ 5 мин. Клиент шлёт его в `Authorization: Bearer` на electric-proxy. Содержит только org'и, где есть членство. PII не логируется.

**14) `sync.saveCursor`** — input `orgScoped & { deviceId, shape, electricHandle?, electricOffset?, lastSyncedAt? }`. output `{ ok:true }`. Upsert по `(deviceId, shape)` (uniq §1.5). Позволяет возобновляемый down-sync после реконнекта.

### 2.2 Интеграция с graph-сервисом ядра

Узел `file` **никогда** не пишется напрямую в `entities` из `runtime`-роутера — только через `graphService.create` (00-SC §2.6). `embedding_jobs`/`vector.*` оперируют существующими `entities.id`, не создавая узлов. Это сохраняет инвариант «один писатель узла» (00-SC §2). #02 владеет лишь `storage_objects`/`embedding_jobs`/`runtime_services`/`sync_cursors` + опц. строкой `activity_events(kind="file_op")`.

**Где расширяется существующее, где новое:**
- **Новый:** роутер `runtime` (§2), схема `packages/db/src/schema/runtime.ts`, enum-diff (§1.1).
- **Расширяется (не ломается):** `apps/electric-proxy/src/where.ts` — добавить case'ы `entities`/`edges`/`identity_links`/`activity_events` (org-scoped where, как существующие `tasks`/`v2_projects`); `packages/local-db` — sync-engine конфиг (Turso); `host-service` — supervision новых sidecar (§3.1).

---

## 3. Сервисы/процессы/протоколы

### 3.1 Sidecar-сервисы и supervision (host-service / host-provisioner)

Рантайм-сервисы — отдельные ОС-процессы/контейнеры (00-SC §2C). Локально (Фаза 0) — Docker-сервисы рядом с уже существующими `postgres`/`neon-proxy`/`electric` в `docker-compose.yml`; оркестрация — через паттерн `host-service` DaemonSupervisor (`ensure/restart/stop/listSessions`, манифест под `$ROX_HOME_DIR/host/{orgId}/`). На управляемом хосте — через `host-provisioner` (`RoxSelfProvisioner`, Docker Engine HTTP API).

Порты — фиксированные смещения от `ROX_PORT_BASE` (по образцу AGENTS.md: Postgres +14, neon-proxy +15, Electric +9). Занятые сейчас слоты окна (из `.rox/setup.local.sh`): +0 Web, +1 API, +9 Electric, +14 Postgres, +15 neon-proxy + Caddy/Wrangler-слоты. Новые сервисы #02 берут свободные **+16…+20** (проверено: не пересекаются с занятыми):

| Сервис | Образ/бинарь | Порт (local) | Env-переменная | Назначение |
|---|---|---|---|---|
| `minio` (API) | `minio/minio` | `ROX_PORT_BASE +16` | `LOCAL_MINIO_PORT` | object storage S3-API (A8) |
| `minio` (console) | `minio/minio` | `ROX_PORT_BASE +17` | `LOCAL_MINIO_CONSOLE_PORT` | админ-консоль minio |
| `qdrant` (HTTP) | `qdrant/qdrant` | `ROX_PORT_BASE +18` | `LOCAL_QDRANT_PORT` | vector store REST (B1) |
| `qdrant` (gRPC) | `qdrant/qdrant` | `ROX_PORT_BASE +19` | `LOCAL_QDRANT_GRPC_PORT` | vector store gRPC (опц.) |
| `embedder` | Bun-воркер `apps/embedder` | `ROX_PORT_BASE +20` | `LOCAL_EMBEDDER_PORT` | ONNX-эмбеддинг + индексатор-воркер (B2) |
| `turso` | `@libsql/client` embedded в desktop main | — (in-process) | — | local-replica sync-engine (B4) |
| `electric` | `electricsql/electric` (уже есть) | `ROX_PORT_BASE +9` (`ELECTRIC_PORT`) | `ELECTRIC_PORT` | shape upstream (existing) |

**Lifecycle/supervision:**
- Бутстрап: `runtime.ensureStack(orgId)` (внутренняя функция, дёргается при старте приложения/входе) → `host-service` поднимает недостающие сервисы, ждёт health-probe, пишет `runtime_services` через `runtime.reportHealth`.
- Health-probe (период 15 с): minio `GET /minio/health/live`; qdrant `GET /readyz`; embedder `GET /health`. Результат → `runtime_services.health/state`. `degraded`→ретрай с backoff; `failed` после N → баннер в UI.
- Рестарт при краше: DaemonSupervisor backoff (как для pty-daemon). minio/qdrant — durable volume (данные переживают рестарт). Снятие сервиса → graceful stop + `state:"stopped"`.
- **Локальный бутстрап** прописывается в `.rox/setup.local.sh` (добавить compose-сервисы minio/qdrant + порт-аллокацию в окно `ROX_PORT_BASE` по образцу `LOCAL_PG_PORT`/`LOCAL_ELECTRIC_PORT`: экспортировать `LOCAL_MINIO_PORT=$((ROX_PORT_BASE+16))`, `LOCAL_MINIO_CONSOLE_PORT=$((ROX_PORT_BASE+17))`, `LOCAL_QDRANT_PORT=$((ROX_PORT_BASE+18))`, `LOCAL_QDRANT_GRPC_PORT=$((ROX_PORT_BASE+19))`, `LOCAL_EMBEDDER_PORT=$((ROX_PORT_BASE+20))`; смещения +16…+20 свободны — не пересекаются с занятыми +0/+1/+9/+14/+15) и `docker-compose.yml` (новые `services:` minio/qdrant с healthcheck + durable volumes, порты пробрасываются из этих переменных). `RUNTIME_SERVICE_TOKEN` (см. §2) генерится здесь при первом запуске, если не задан.

### 3.2 Контракты клиентов сервисов (типизированные интерфейсы)

```ts
// packages/runtime-clients/src/object-store.ts (новый пакет @rox/runtime-clients)
export interface ObjectStore {
  presignPut(bucket: string, key: string, ttlSec: number, mime?: string): Promise<string>;
  presignGet(bucket: string, key: string, ttlSec: number): Promise<string>;
  head(bucket: string, key: string): Promise<{ size: number; mime?: string; etag?: string } | null>;
  delete(bucket: string, key: string): Promise<void>;
  ensureBucket(bucket: string): Promise<void>; // идемпотентно (создать org-<orgId>)
}

// packages/runtime-clients/src/vector-store.ts
export interface VectorStore {
  ensureCollection(name: string, dim: number): Promise<void>; // идемпотентно
  upsert(name: string, points: { id: string; vector: number[]; payload: Record<string, unknown> }[]): Promise<void>;
  search(name: string, vector: number[], filter: Record<string, unknown>, limit: number,
    scoreThreshold?: number): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]>;
  delete(name: string, ids: string[]): Promise<void>;
}

// packages/runtime-clients/src/ai-provider.ts (D12 — per-capability)
export interface AIProvider {
  readonly kind: AiProviderKind;
  embed(texts: string[]): Promise<number[][]>;            // батч; dim фиксирован
  // summarize/vision/stt — реализуют другие подсистемы (#8/#11); здесь только embed-контракт #02.
}
```

S3-креды и provider-ключи берутся из env/`secret-store` (`SECRETS_ENCRYPTION_KEY`-кодек AES-256-GCM, `packages/trpc/src/lib/integrations/secret-store.ts` + `crypto.ts`), НЕ из БД-полей в открытом виде, НЕ логируются.

### 3.3 Индексатор entities→qdrant (pipeline, B5)

```
[entity upsert (#1 graph-сервис)] --hook--> runtime.embedding.enqueue(entityId,kind,contentHash)
       |                                              |
       v                                              v
[embedding_jobs(queued)] <--Electric down-sync (видны воркеру)--  [embedder-воркер]
       |  claimBatch (FOR UPDATE SKIP LOCKED)                          |
       +--> embedText(kind) [доменный резолвер] --> AIProvider.embed --+--> VectorStore.upsert(rox_entities)
                                                                        +--> embedding.complete(done, vectorWritten)
```
- **Постановщик:** хук в graph-сервисе #01 на `create/update` → `runtime.embedding.enqueue`. (Согласовать точку хука с владельцем #01; альтернатива — LISTEN/NOTIFY-триггер на `entities`, ОВ-4.)
- **embedText-резолвер:** маппинг `kind → текст для эмбеддинга` (PKM `title+markdown`, sessions `title+summary+первые N`, и т.д.). Реестр резолверов в `packages/runtime-clients/src/embed-text.ts`; домен регистрирует свой (или дефолт `title + (markdown ?? "")`).
- **Воркер:** `apps/embedder` (Bun) — pull-цикл `claimBatch`→`embed`→`upsert`→`complete`; параллелизм/батч конфигурируемы; backoff на ошибках; idempotent upsert (point id = entityId, перезапись).
- **Удаление/архив:** на `entities.status='trashed'` домен/реконсиляция ставит `VectorStore.delete([entityId])` (через служебную задачу) — point убирается из индекса.

### 3.4 Sync/realtime топология (00-SC §2E, A3)

- **Cloud Postgres/Neon** — канон `entities`/`edges`/`identity_links`/`activity_events`/`storage_objects`/`embedding_jobs`/`runtime_services`/`sync_cursors`.
- **Electric (down-sync, cache-first):** `entities`/`edges`/`identity_links`/`activity_events` реплицируются ВНИЗ на клиента через `apps/electric-proxy` (Cloudflare worker, JWT-auth `jose`, per-table org-scoped where в `where.ts`). #02 расширяет allowlist (`where.ts`) и выдаёт токен (`sync.electricToken`). Клиент рендерит существующие строки даже при `isReady=false` (AGENTS.md §9); строгую готовность ждём только для записи/seeding.
- **Turso/libSQL (local-primary, B4):** `packages/local-db` — embedded-реплика синхронизируемого (`@libsql/client` с `syncUrl`/`syncInterval`) + primary для приватного/тяжёлого (рабочее состояние десктопа, тела/история, кадры-метаданные). Down-sync доменных entity к UI идёт через Electric; Turso — не дубль канала, а локальный сток приватного.
- **minio (local S3, B3):** все бинарные объекты; метаданные — в `storage_objects` (синхронизируются Electric вниз).
- **relay/streams (A3):** realtime-каналы (presence/typing — #10; live-output PTY — #11). #02 их НЕ меняет, лишь декларирует как часть рантайма (реестр `runtime_services` их не охватывает — это app-сервисы, поднимаются отдельно). Аналогично `electric`/`turso` не репортятся в `runtime_services` через `reportHealth` (§1.4, ОВ-7): `electric` управляется docker-compose, `turso` — per-device local-replica.
- **Конфликт-резолюция:** `storage_objects`/`runtime_services`/`sync_cursors` — last-writer-wins (idempotent upsert по естественным ключам). `embedding_jobs` — конфликтов контента нет (claim атомарный, статусы монотонны). Бинарные объекты в minio — immutable по `objectKey` (новая версия = новый `entityId`/key), конфликтов нет. Приватные данные (Turso-local) не выходят за устройство.

---

## 4. UI-спецификация

#02 — инфра-слой, **«видимый» UI минимален**: дашборд здоровья рантайма + индикаторы деградации + диалоги загрузки файлов (примитивы, переиспользуемые доменами). Полноценные доменные экраны (Drive, поиск) — в соответствующих подсистемах.

### 4.1 Экраны/панели

| Экран | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **RuntimeStatusPanel** (Settings → Runtime/Health) | список сервисов + health | skeleton-строки только при `!isReady && data.length===0` | «Рантайм не запущен — Запустить» | баннер + Retry | карточки `RuntimeServiceCard` из кэша; цвет = state; при `!isReady && data.length>0` — данные + тонкий progress |
| **SyncStatusBadge** (глобальный, в шапке) | статус Electric/embedder | «Синхронизация…» | — | «Офлайн / sync paused» | бейдж: online/degraded/offline; tooltip с деталями |
| **UploadDialog** (примитив, вызывается доменами) | загрузка файла в minio | прогресс-бар | — | toast + Retry | drag-n-drop зона; presigned PUT прямо в minio; по `confirmUpload` — успех |
| **SearchDegradedBanner** (inline в поиске) | индикатор keyword-fallback | — | — | — | баннер «семантический поиск недоступен (keyword-режим)» при `degraded:true` |

### 4.2 UI-примитивы (`packages/ui`, выбранные библиотеки — 00-SC §2D)

- **RuntimeServiceCard** — `packages/ui/src/components/runtime-service-card/` поверх `card.tsx` + `badge.tsx`. Пропсы:
  ```ts
  export interface RuntimeServiceCardProps {
    kind: RuntimeServiceKind;
    state: RuntimeServiceState;                 // цвет/иконка: healthy=зел, degraded=жёлт, failed=кр
    endpoint?: string;
    lastHealthAt?: string | null;
    onRestart?(kind: RuntimeServiceKind): void; // admin-only
  }
  ```
- **UploadDropzone** — `packages/ui/src/components/upload-dropzone/` (собственная реализация на fetch presigned PUT, без сторонней upload-зависимости). Пропсы:
  ```ts
  export interface UploadDropzoneProps {
    accept?: string;                            // mime-allowlist
    maxSizeBytes?: number;
    onUpload(file: File): Promise<{ entityId: string }>; // оборачивает createUploadUrl→PUT→confirmUpload
    isReady: boolean;                           // cache-first: не блокировать существующие превью
    "aria-label"?: string;
  }
  ```
- **StatusDot** — `packages/ui/src/components/status-dot/` (цвет + текстовая подпись, не только цвет — WCAG). Пропсы `{ state, label }`.

### 4.3 User-flows (на уровне кликов)

**Flow A — загрузка файла (домен использует примитив #02):**
1. В доменном экране (Drive/заметка) — drag файла в `UploadDropzone`.
2. `onUpload` → `runtime.storage.createUploadUrl({idempotencyKey, prefix:"files", fileName, mime, sizeBytes})` → получен `{entityId, uploadUrl}`.
3. Клиент `PUT` тело прямо в minio по `uploadUrl` (прогресс-бар).
4. По завершении → `runtime.storage.confirmUpload({entityId, checksumSha256})` → `status:stored`; домен пишет ребро `attached_to` (через graph-сервис) → превью появляется live (Electric).

**Flow B — деградация поиска:**
1. Пользователь ищет (любой домен) → graph-router `search` зовёт `runtime.vector.search`.
2. qdrant/embedder down → `degraded:true` → `SearchDegradedBanner` + keyword-результаты.
3. `RuntimeStatusPanel` показывает `embedder: failed`; admin жмёт «Restart» → `runtime` дёргает host-service → через ~сек `healthy` → баннер исчезает.

**Flow C — реконнект down-sync:**
1. Клиент офлайн → `SyncStatusBadge: offline`.
2. Возврат сети → клиент берёт `sync.electricToken` → возобновляет shape с `electricHandle/offset` из `sync.saveCursor`.
3. Дельты прилетают, кэш догоняется (cache-first: старые строки всё это время видны), бейдж → `online`.

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- **RuntimeStatusPanel:** карточки — `role="list"`/`listitem`; «Restart» — `<button>` с `aria-label`; состояние НЕ только цветом (StatusDot с текстом); live-region `aria-live="polite"` для смены state.
- **UploadDropzone:** доступна с клавиатуры (Enter/Space открывает файловый диалог); `role="button"`+`aria-label`; прогресс — `role="progressbar"` с `aria-valuenow`; ошибки — `aria-live`.
- **SyncStatusBadge / SearchDegradedBanner:** текстовый эквивалент статуса (не только иконка); контраст ≥4.5:1; баннер — `role="status"`.
- Все интерактивы — `<button>`/`<a>` (не div); таргеты ≥24×24 CSS-px (WCAG 2.2 «Target Size»); `axe-core` в CI на RuntimeStatusPanel.

---

## 5. Миграция и обратная совместимость

**Характер:** преимущественно аддитивно (новые таблицы/enum'ы) + точечное расширение существующих сервисов (electric-proxy allowlist, local-db sync-engine). Ядро графа (#01) и доменные таблицы — НЕ изменяются.

**Команда генерации:** изменить `packages/db/src/schema/runtime.ts` + `enums.ts`, добавить экспорт в `packages/db/src/schema/index.ts`, затем:
```bash
bunx drizzle-kit generate --name="infra_runtime_control_plane"
```
(offline diff; миграции руками не править — AGENTS.md). Генерит SQL для `storage_objects`/`embedding_jobs`/`runtime_services`/`sync_cursors` + 6 новых pgEnum. Таблицы ядра (`entities`) создаёт миграция #01 (зависимость по порядку).

**local-db (Turso) — отдельная миграция-апгрейд:**
- `packages/local-db/drizzle.config.ts` остаётся `dialect:"sqlite"` (libSQL совместим). Меняется только **клиент подключения** (текущий SQLite → `@libsql/client` с `url:"file:..."` + опц. `syncUrl`/`authToken`). Схема таблиц (`packages/local-db/src/schema/schema.ts`) не меняется → миграций local-db не требуется; апгрейд — на уровне рантайм-клиента (B4).
- Backfill local-DB не нужен: существующий SQLite-файл открывается libSQL как есть.

**electric-proxy (расширение allowlist):** правка `apps/electric-proxy/src/where.ts` (+ импорт `entities`/`edges`/`identityLinks`/`activityEvents` из `@rox/db/schema`, case'ы с org-scoped where) и `electric.ts` при необходимости `COLUMN_RESTRICTIONS`. Это код-деплой worker'а, не БД-миграция. Обратно совместимо: новые таблицы добавляются, существующие shape'ы (`tasks`/`v2_projects`/…) не трогаются.

**Что депрекейтится:** ничего. #02 — фундамент, не заменяет существующего. (Будущая Фаза 6 заменит Tailscale-serve на Netbird — вне этой спеки.)

**Обратная совместимость:** новых обязательных полей в существующих таблицах нет → старые клиенты работают; runtime-роутер lazy, отсутствие сервисов = деградация (keyword-поиск, нет загрузок), не падение. Старый локальный SQLite читается libSQL без конверсии.

**Откат (down, концептуально):** `infra_runtime_control_plane` обратима — `DROP TABLE sync_cursors, runtime_services, embedding_jobs, storage_objects; DROP TYPE …(6 enum)`. Узлы `entities(kind="file")` и их рёбра остаются (владелец — #01/домен); minio-объекты остаются в bucket (отдельный GC по необходимости). Откат electric-proxy = revert worker. Откат Turso = вернуть прежний SQLite-клиент (файл совместим). Drizzle генерит прямую миграцию; «down» = ручной reverse-скрипт, проверяется на neon-branch перед прод-деплоем.

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Узел файла через ядро.** Given активная org и healthy minio; When `storage.createUploadUrl`; Then создаётся ровно один `entities(kind="file")` (через graph-сервис) + `storage_objects(status="pending")` + валидный presigned PUT-URL; прямых INSERT в `entities` из роутера нет.
2. **Идемпотентность загрузки.** Given выдан upload-URL; When повтор `createUploadUrl` с тем же `idempotencyKey`; Then тот же `entityId`, второго узла/строки нет; URL перевыдаётся, если истёк.
3. **Подтверждение + дедуп.** Given объект залит в minio; When `confirmUpload`; Then `status:=stored`, `size/checksum/mime` заполнены из HEAD, `entities.storageRef` обновлён; повторная загрузка того же `checksumSha256` в `(org,prefix)` → дедуп (тот же `entityId`, `uploadUrl=null`).
4. **Org-изоляция download.** Given объект в org A; When `getDownloadUrl` пользователем org B; Then `NOT_FOUND`, URL не выдан.
5. **mime/size-гейты.** Given `prefix="frames"` и `mime="application/x-elf"`; When `createUploadUrl`; Then `BAD_REQUEST`. Given `sizeBytes>LIMIT`; Then `PAYLOAD_TOO_LARGE`.
6. **Постановка эмбеддинга идемпотентна.** Given узел upsert; When `embedding.enqueue` дважды с тем же `(entityId, version, contentHash)`; Then одно активное `embedding_jobs`, не два.
7. **claim атомарен.** Given 100 queued заданий и 3 воркера; When параллельные `claimBatch(limit=25)`; Then каждое задание захвачено ровно одним воркером (нет двойной обработки), благодаря `FOR UPDATE SKIP LOCKED`.
8. **Индексация → qdrant.** Given задание `done` с `vectorWritten`; When `vector.search` по эмбеддингу того же текста; Then point с `entityId` среди hits; payload содержит `orgId=org` узла.
9. **Поиск всегда org-filtered.** Given точки двух org в `rox_entities`; When `vector.search` org A; Then ни одной точки org B (filter `orgId` неотключаем).
10. **Деградация без throw.** Given qdrant/embedder остановлен; When `vector.search`; Then `degraded:true`, без исключения; `search` ядра падает в keyword-режим.
11. **Health-репорт.** Given host-service поднял minio; When `runtime.reportHealth(kind="minio",state="healthy")`; Then `runtime_services` upsert по `(org,"minio")`; `runtime.health` отражает `healthy`; `secretKeys` НЕ возвращаются в `runtime.health`.
12. **Electric down-sync entities.** Given расширенный `where.ts`; When клиент с валидным `sync.electricToken` подписывается на shape `entities` org A; Then приходят только строки org A (org-scoped where), cache-first рендер существующих строк при `isReady=false`.
13. **Electric-токен скоупнут.** Given пользователь — член org A (не B); When `sync.electricToken`; Then `organizationIds` в JWT = [A]; запрос shape org B на proxy → 403 (как в `electric-proxy/index.ts`).
14. **Курсор возобновляем.** Given сохранён `sync.saveCursor(handle,offset)`; When реконнект; Then down-sync продолжается с offset, без полного re-fetch.
15. **Turso-апгрейд прозрачен.** Given существующий локальный SQLite-файл; When local-db открыт через `@libsql/client`; Then чтение/запись прежних таблиц работает без миграции данных.
16. **Секреты/деньги/время.** Then S3-creds/provider-keys нигде в input/output/логах (только env/secret-store); все timestamp — `timestamptz` (UTC); размеры — `bigint`. Нет утечки PII.
17. **Lint/типы/миграция.** Then `bun run lint`=0, `bun run typecheck`=0; `$inferInsert`/`$inferSelect` экспортированы; миграция сгенерирована `drizzle-kit generate` (не правлена руками).
18. **Авторизация служебных мутаций.** Given нет/невалидный заголовок `x-rox-service-token`; When `embedding.claimBatch` / `embedding.complete` / `runtime.reportHealth`; Then `UNAUTHORIZED`, очередь/health НЕ изменяются. Given валидный токен (`RUNTIME_SERVICE_TOKEN`); Then проходит. Токен нигде не логируется.
19. **vector.search валидация входа.** Given `vector.length != EMBEDDING_DIM` (или переданы оба `vector`+`queryText`, или ни одного); When `vector.search`; Then `BAD_REQUEST` (Zod), запрос к qdrant не уходит (защита от вектор-DoS/несоответствия коллекции).
20. **per-device реестр.** Given `runtime.reportHealth(kind="turso")` без `deviceId`; Then `BAD_REQUEST`. Given с `deviceId`; Then строка по `(org,kind,deviceId)`; org-scoped uniq `(org,kind)` для minio/qdrant/embedder не конфликтует с turso-строками.

---

## 7. Тест-план

**Unit (Bun, ко-локация, без БД):**
- `runtime/schema.test.ts` — Zod-границы: mime-allowlist по prefix, size-cap, uuid, checksum-regex, reject невалидных.
- `runtime-clients/object-store.test.ts` — `ObjectStore` против мок-minio (presign-форма URL, `head` парсинг, `ensureBucket` идемпотентность). S3-протокол — мок `fetch`.
- `runtime-clients/vector-store.test.ts` — `VectorStore` против мок-qdrant (upsert-батч, filter `orgId` всегда добавлен, `ensureCollection` идемпотентна).
- `runtime-clients/embed-text.test.ts` — резолвер `kind→text` (дефолт + регистрация доменного).
- `electric-proxy/where.test.ts` — новые case'ы (`entities`/`edges`/`identity_links`/`activity_events`) дают корректный org-scoped fragment/params; неизвестная таблица → null (как сейчас).

**Integration (neon-branch, 00-SC §3 / AGENTS.md «DB migrations»):** поднять временную neon-ветку, root `.env`→branch (НИКОГДА не прод), прогнать миграцию `infra_runtime_control_plane`, затем:
- `storage.*` happy-path + идемпотентность + дедуп (AC 1–5) — проверять `storage_objects`/`entities` напрямую; minio — реальный контейнер из docker-compose или мок `ObjectStore`.
- `embedding.enqueue/claimBatch/complete` (AC 6–8) — конкурентный claim (несколько параллельных транзакций → нет двойного захвата, AC 7).
- `vector.search` org-filter (AC 9) + degraded (AC 10) — qdrant контейнер или мок `VectorStore`.
- `runtime.reportHealth`/`runtime.health` (AC 11), `sync.electricToken`/`saveCursor` (AC 13–14).
- `sync.electricToken` — проверить, что выданный JWT проходит `verifyJWT` из `electric-proxy/auth.ts` (общий issuer/audience).

**e2e (Playwright, `apps/web` + миништек):** Flow A (загрузка файла через UploadDropzone → presigned PUT в minio → confirm → превью live), Flow B (остановить embedder → degraded-баннер в поиске → restart → исчез). Turso-апгрейд (AC 15) — отдельный desktop smoke (`apps/desktop`, открыть существующий SQLite через libSQL).

**Маппинг AC → тест-файл/команда (явная трассируемость):**

| AC | Тест-файл / артефакт | Фикстура / способ воспроизведения |
|---|---|---|
| 1–3,5 | `packages/trpc/src/router/runtime/storage.test.ts` | neon-branch; мок `ObjectStore` (HEAD/presign); проверка строк `storage_objects`/`entities` |
| 2 (идемпотентность) | там же, `storage.idempotency.test.ts` | два `createUploadUrl` с одним `idempotencyKey` → один `entityId` (uniq `storage_objects_org_idempotency_uniq`) |
| 4 | `storage.authz.test.ts` | два org-контекста; запрос объекта org A из ctx org B → `NOT_FOUND` |
| 6 | `embedding.enqueue.test.ts` | двойной enqueue с тем же `(entityId,version,contentHash)` → одна активная строка |
| **7 (конкурентный claim)** | `embedding.claim.concurrency.test.ts` | neon-branch, 100 `queued` seed; **3 параллельные транзакции** через `Promise.all([...])` с независимыми пулами `dbWs` (отдельные клиенты), каждая `claimBatch(limit=25)`; ассерт: множества `jobId` не пересекаются, итог ≤100 уникальных (через `FOR UPDATE SKIP LOCKED`) |
| 8–9 | `vector.search.test.ts` | мок/контейнер `VectorStore`; seed точек двух org; ассерт `orgId`-filter всегда добавлен |
| 10 | `vector.degraded.test.ts` | `VectorStore` бросает/недоступен → `degraded:true`, без throw |
| 11,20 | `runtime.health.test.ts` | `reportHealth` (с/без `deviceId` для turso) → ассерт uniq-ключей; `health` без `secretKeys` |
| **12 (Electric down-sync)** | `apps/electric-proxy/where.test.ts` + integration `sync.electric.test.ts` | unit: `where("entities", claims)` даёт org-scoped fragment; integration: поднять `electric` из docker-compose, подписать shape `entities` токеном org A, ассерт строки только org A |
| 13 | `sync.electricToken.test.ts` | выданный JWT проходит `verifyJWT` из `electric-proxy/auth.ts`; `organizationIds=[A]` |
| 14 | `sync.cursor.test.ts` | `saveCursor`→реконнект→возобновление с offset |
| **15 (Turso desktop smoke)** | `apps/desktop/test/turso-libsql.smoke.test.ts` (Bun) | положить существующий `*.sqlite` фикстурой, открыть через `@libsql/client` (`url:"file:..."`), прочитать/записать прежнюю таблицу `packages/local-db` без миграции; запуск `bun test apps/desktop/test/turso-libsql.smoke.test.ts` |
| 18 | `runtime.service-token.test.ts` | вызвать `claimBatch`/`complete`/`reportHealth` без/с неверным `x-rox-service-token` → `UNAUTHORIZED`; с верным → OK |
| 19 | `runtime/schema.test.ts` | `vectorSearchInput`: длина `vector≠EMBEDDING_DIM`, оба/ни одного из `vector|queryText` → parse-fail |
| 16–17 | CI-гейт | `bun run lint && bun run typecheck`; ревью миграции (не правлена руками) |

**Команды:**
```bash
bun test packages/trpc/src/router/runtime        # роутер + схемы (neon-branch via .env)
bun test packages/runtime-clients                # ObjectStore/VectorStore/AIProvider/embed-text
bun test apps/electric-proxy                      # where.ts allowlist
bun test apps/embedder                            # воркер-цикл
bun run lint && bun run typecheck                 # CI-гейт (00-SC §3, 0 warnings)
```
**Целевое покрытие изменённого кода ≥80% веток** (роутер `runtime`, `runtime-clients`, `embed-text`, claim-логика, `where.ts`-case'ы). Smoke перед push: `bun test packages/runtime-clients packages/trpc/src/router/runtime apps/electric-proxy`.

---

## 8. Задачи реализации (ordered work-list, PR-able срезы)

1. **PR-1 — Enum + control-plane схема.** `packages/db/src/schema/enums.ts` (+6 enum-наборов §1.1), `packages/db/src/schema/runtime.ts` (`storage_objects`/`embedding_jobs`/`runtime_services`/`sync_cursors` + типы), экспорт в `packages/db/src/schema/index.ts`, relations в `relations.ts`. `bunx drizzle-kit generate --name="infra_runtime_control_plane"`. Зависит от: схема ядра #01 (`entity.ts`).
2. **PR-2 — runtime-clients (интерфейсы + реализации).** Новый пакет `packages/runtime-clients`: `ObjectStore` (minio/S3 через presigned, AWS SDK v3 или `minio` npm), `VectorStore` (qdrant REST), `AIProvider.embed` (`local` ONNX/fastembed + `zed-gateway` stub), `embed-text`-резолвер. Unit-тесты (мок fetch). Без БД.
3. **PR-3 — docker-compose + setup + supervision.** Добавить `minio`/`qdrant` в `docker-compose.yml` (volumes+healthcheck); порт-аллокацию в `.rox/setup.local.sh` (окно `ROX_PORT_BASE`); ensure/health через `host-service` (паттерн DaemonSupervisor) + `runtime.reportHealth`. Зависит от PR-1, PR-2.
4. **PR-4 — runtime-роутер (storage).** `packages/trpc/src/router/runtime/{schema,storage,index}.ts`: процедуры 1–5 (§2); интеграция с graph-сервисом #01 (`file`-узел); регистрация `runtime` в `packages/trpc/src/root.ts`. Integration-тесты (neon-branch). Зависит от PR-1, PR-2.
5. **PR-5 — embedder-воркер + индексация.** `apps/embedder` (Bun pull-цикл claim→embed→upsert→complete); процедуры `embedding.*`/`vector.*`/`reindex` (§2 п.6–10); хук постановки на upsert `entities` (согласовать с #01). Зависит от PR-2, PR-4.
6. **PR-6 — Electric allowlist + sync.** Расширить `apps/electric-proxy/src/where.ts` (`entities`/`edges`/`identity_links`/`activity_events`); процедуры `sync.electricToken`/`saveCursor` (§2 п.13–14); `runtime.health`/`reportHealth` (п.11–12). Тесты `where.ts`. Зависит от PR-1, PR-4.
7. **PR-7 — local-db → Turso.** Заменить клиент подключения у потребителей `packages/local-db` на `@libsql/client` (`file:` + опц. `syncUrl`); смок открытия существующего файла. Без миграции схемы (B4). Зависит от PR-1.
8. **PR-8 — UI-примитивы + дашборд.** `packages/ui`: `RuntimeServiceCard`/`UploadDropzone`/`StatusDot`; экраны `RuntimeStatusPanel`/`SyncStatusBadge`/`UploadDialog`/`SearchDegradedBanner` (§4); axe-core; e2e Flow A/B. Зависит от PR-4, PR-6.
9. **PR-9 — GC + реконсиляция.** Фоновая задача: удаление `trashed` объектов из minio; реконсиляция `storage_objects`↔minio (`missing`); reaper зависших `embedding_jobs` (lease-таймаут). Зависит от PR-4, PR-5.

**Ключевые точки изменения файлов:** `packages/db/src/schema/{enums.ts,runtime.ts,index.ts,relations.ts}`; `packages/db/drizzle/*` (только авто-генерация); `packages/runtime-clients/*` (новый пакет); `apps/embedder/*` (новый); `packages/trpc/src/router/runtime/*`; `packages/trpc/src/root.ts` (регистрация `runtime`); `apps/electric-proxy/src/{where.ts,electric.ts}`; `packages/local-db/*` (клиент libSQL); `docker-compose.yml`; `.rox/setup.local.sh`; `packages/host-service/src/*` (supervision новых sidecar); `packages/ui/src/components/{runtime-service-card,upload-dropzone,status-dot}/*`.

---

## 9. Риски и открытые вопросы

**Риски + митигейшн:**
- **R1. Sync-конфликты hybrid-стора (Turso↔Electric↔клиент).** Двойной down-канал (Electric + Turso sync) может расходиться. *Митигейшн:* чёткое разделение (Electric — синхронизируемые доменные entity вниз cache-first; Turso — primary приватного/тяжёлого, не дубль канала, B4); один источник истины на таблицу; курсоры `sync_cursors` для возобновления; приватные данные не выходят за устройство.
- **R2. Стоимость/латентность embeddings** при backfill большого корпуса (00-SC Фаза 0 риск). *Митигейшн:* дефолт `local` ONNX (B2, без сетевой стоимости); очередь `embedding_jobs` асинхронна и батчится; поиск имеет keyword-fallback (`degraded:true`), не блокируется; `embeddingVersion` для контролируемого реиндекса.
- **R3. minio/qdrant в дистрибутиве (размер/cross-platform).** *Митигейшн:* Фаза 0 — Docker-сервисы рядом с существующими postgres/electric; on-demand загрузка моделей/бинарей; полноценная упаковка/Netbird-mesh — Фаза 6 (вне спеки). Деградация при отсутствии сервиса (не падение).
- **R4. Утечка S3/provider-секретов** в БД/логи/клиент. *Митигейшн:* секреты только из env/`secret-store` (AES-256-GCM, `SECRETS_ENCRYPTION_KEY`); в `runtime_services` — лишь имена ключей (`secretKeys`), не значения; `runtime.health` не возвращает `secretKeys`; presigned-URL — TTL-ограничены, org-scoped до выдачи.
- **R5. Двойная обработка / зависшие задания эмбеддинга.** *Митигейшн:* `FOR UPDATE SKIP LOCKED` claim + lease-таймаут + reaper (PR-9); idempotent upsert (point id=entityId); дедуп активного задания (uniq §1.3).
- **R6. Рассинхрон `storage_objects`↔minio** (объект удалён вручную / загрузка не подтверждена). *Митигейшн:* статусы `pending/stored/missing/trashed`; реконсиляция-задача (PR-9) сверяет HEAD; `confirmUpload` обязателен для `stored`.
- **R7. Electric where-clause-инъекция/ошибка allowlist** (новые таблицы). *Митигейшн:* строго по образцу существующих case'ов (`drizzle` QueryBuilder, параметризовано); тесты `where.ts` (AC 12); неизвестная таблица → null (deny-by-default, как сейчас).
- **R8. EMBEDDING_DIM-несовместимость** при смене модели (старые точки иной размерности). *Митигейшн:* размерность зашита в коллекцию при создании; смена модели → новая коллекция/полный реиндекс через `vector.reindex(bumpVersion)`; версия в `embedding_jobs.embeddingVersion`.

**Не-блокирующие открытые вопросы:**
- **ОВ-1.** qdrant vs pgvector (вектор в самом Postgres) — qdrant выбран (B1) за payload-фильтрацию/масштаб; pgvector упростил бы стек (одна БД, нет sidecar) — пересмотреть, если qdrant-контейнер дорог в дистрибутиве (Фаза 6).
- **ОВ-2.** Очередь эмбеддинга в Postgres-таблице (B5) vs Redis/стрим — таблица проще и видна Electric; при высокой нагрузке — вынести в стрим.
- **ОВ-3.** Механизм идемпотентности POST в ядре (общий с PKM/sessions): отдельная idempotency-таблица #01 vs ключ в `metadata` — согласовать с владельцем #01. **НЕ блокирует #02:** `storage.createUploadUrl` идемпотентен локально через `storage_objects(organizationId, idempotency_key)` (§1.2, §2.1 п.1), AC №2 от ядра не зависит. ОВ-3 — лишь опциональная будущая унификация (если ядро введёт общий контракт, #02 сможет на него перейти без слома AC).
- **ОВ-4.** Точка хука постановки эмбеддинга: вызов из graph-сервиса #01 (`create/update`) vs Postgres LISTEN/NOTIFY-триггер на `entities` — выбрать при PR-5 (зависит от того, есть ли у #01 удобная точка расширения).
- **ОВ-5.** Размерность/модель эмбеддера по умолчанию (384 `bge-small` vs 768/1024) и провайдер дефолта (`local` vs `zed-gateway`) — параметр конфигурации, тюнится по качеству поиска на реальном корпусе (D12).
- **ОВ-6.** Retention кадров/записей в minio (удалять после саммари vs хранить) — политика приватности #8 (00-SC §2B), согласовать GC-правила (PR-9).
- **ОВ-7.** `electric` как запись в `runtime_services` — **решено для Фазы 0:** НЕ пишем (управляется docker-compose, не host-service); статус для UI — из shape-handshake (`SyncStatusBadge`), см. §1.4/§3.4. Enum сохраняет значение `electric` на случай будущего отдельного мониторинга (Фаза 6). `turso` — пишется только per-device (`deviceId`), org-scoped uniq его не покрывает.
