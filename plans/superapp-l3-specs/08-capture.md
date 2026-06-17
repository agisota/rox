# 08 — Захват (Capture / timeline-спина): L3 implementation-ready ТЗ

> Фаза 3. Источник истины по контракту ядра графа и конвенциям — `plans/superapp-l3-specs/00-shared-context.md`
> (далее «shared §N»). Углублённый дизайн — `plans/rox-superapp-roadmap-and-design.md` (далее «design §N»: §2B
> capture/AI-пайплайн, §2C процессы/sidecar Electron, §2E sync-топология).
>
> Эта подсистема владеет контрактом **`activity_events`** (shared §2.5 — НЕ переопределять, append-only спина),
> на который опираются timeline-UI, дайджест-в-journal и будущая подсистема 12 (STT/overlay, design A4 — вне пакета).

---

## 0. Резюме и границы

**Что входит:**
- Cross-platform **screen-capture sidecar** (1 fps, opt-in, exclusion-list) → кадры в minio (`frames/`) → батч-векторизация → `vision-summarizer` (AIProvider) → `activity_events(kind=screen_block, payload.frameRefs[])`.
- **App-usage sidecar**: фокус приложения/окна/URL + длительность → `activity_events(kind=app_usage)`. macOS-реализация расширяет нативный аддон `packages/macos-process-metrics` (сейчас экспортирует только `getPhysFootprints`).
- **Контракт sidecar↔Rox** (IPC поверх Unix-socket framed-протокола, по образцу `packages/pty-daemon`), supervision через `packages/host-service` (`DaemonSupervisor`-паттерн).
- Detail-таблицы 1:1 к `entityId`: `capture_sessions`, `capture_frames`, `capture_app_usage`, `capture_settings` (приватность/exclusion/retention/provider per-capability).
- tRPC-роутер `capture` (новый) + расширение `journal`-генератора дайджестом дня из `activity_events`.
- UI: **unified timeline**, **frame-scrubber**, **analytics-дашборд** (Clicky-self), панель настроек приватности.
- qdrant-индексация кадров для семантического поиска по экранной активности.

**Что НЕ входит (out of scope):**
- STT / push-to-talk / overlay-ассистент / audio-capture (подсистема 12, фаза 4; design A4). #08 фиксирует только `activity_events`-контракт + AIProvider-интерфейс, которыми 12 будет пользоваться.
- Реализация бинарного sidecar per-OS (ScreenCaptureKit / Graphics.Capture·DXGI / PipeWire) — отдельный имплементационный таск (design A5). Здесь полностью описан **интерфейс** sidecar и протокол; конкретная native-сборка — work-list §8 как «interface-first, реализация по ОС».
- Ядро графа (`entities`/`edges`/`activity_events`/graph-router) — подсистема #1; рантайм (minio/qdrant/Turso/Electric/embedder) — подсистема #2. #08 **зависит** от обоих и не дублирует их.
- AIProvider-реестр сам по себе (D12) — каноничен в #2/#11; #08 потребляет capability `vision` + `embed`.

**Зависимости:** #1 (ядро графа: `entities`, `edges`, `activity_events`, graph-сервис), #2 (minio bucket-конвенция design A8, qdrant-коллекция, Turso-local primary для тяжёлого, Electric down-sync, embedder-провайдер, `host-service`/`host-provisioner`). Платформенный аддон `macos-process-metrics`, framed-IPC `pty-daemon`.

**Принятые допущения (shared §4) + ревизируемость:**
- **A4** (STT/overlay вне пакета) — принято. #08 даёт `activity_events`-контракт наружу. Ревизируемо: при слиянии фаз 3+4 audio-capture может переехать под общий sidecar-менеджер #08.
- **A5** (единый интерфейс sidecar, per-OS реализации позже) — принято. Здесь специфицируется IPC/протокол/lifecycle; бинарь — отдельный таск. Ревизируемо: выбор транспорта (Unix-socket vs stdio) для Windows named-pipe.
- **A8** (minio: bucket `org-<orgId>`, префикс `frames/` для кадров, `recordings/` зарезервирован под аудио#12) — принято.
- **Локальные доп-решения этого ТЗ (ревизируемы):**
  - **C1.** Кадры — **primary в Turso/minio-local**, НЕ синхронизируются в cloud (приватность, design §2E: «приватные данные не выходят за пределы local-стора»). В cloud-Postgres идут только `activity_events` с `payload.summary` (можно отключить флагом `syncSummaries=false`) — для cross-device timeline. `capture_frames`/`capture_app_usage` — local-only detail.
  - **C2.** Vision-батч = окно **15 минут** (design §2B). Один `screen_block`-event на батч с массивом `frameRefs`.
  - **C3.** Дефолт провайдера vision/summarize = **R1 через zed-gateway** (design §2B), переопределяемо в `capture_settings.providerByCapability`.
  - **C4.** Кадры **шифруются at-rest** ключом из `SECRETS_ENCRYPTION_KEY` (та же схема AES-256-GCM `iv(12)|tag(16)|ciphertext`, что `packages/trpc/src/lib/crypto.ts`), хранятся зашифрованными в minio; ключ не покидает машину. **ВАЖНО:** `crypto.ts` экспортирует `encryptSecret(plaintext: string): string`/`decryptSecret(encrypted: string): string` — это **string→string, base64**, не Buffer и не стрим, и для бинарных WebP-кадров / стримовой расшифровки в presigned-proxy НЕ подходит. Поэтому #08 вводит **новый бинарный helper** `encryptFrame`/`decryptFrame`/`decryptFrameStream` (на `Buffer`/`Readable`, `packages/host-service/src/capture/frame-crypto.ts`), переиспользующий тот же ключ и схему `iv|tag|ciphertext` (см. §3.2/work-list §4), а НЕ string-функции `crypto.ts`.
  - **C5.** Захват **по умолчанию ВЫКЛЮЧЕН** (opt-in). Глобальный «privacy pause» и per-app/window exclusion-list — обязательны до первого кадра.

---

## 1. Доменная модель (полная схема БД)

### 1.1 Enum-расширения (diff к shared §2.1)

`activity_events.kind` уже содержит `screen_block`, `app_usage` (shared §2.5) — **новые значения НЕ нужны**.
`entityKind` уже содержит `activity_event` — для `capture_session` как узла используем `kind="activity_event"` (сессия захвата = промежуток активности). `edgeRelation` уже содержит `captured_from` — переиспользуем. Добавляются **только** доменные enum'ы захвата (не входят в ядро):

```ts
// packages/db/src/schema/enums.ts — ДОБАВИТЬ (diff; существующие массивы из shared §2.1 не трогаем)

/** Жизненный цикл сессии захвата (промежуток непрерывной записи). */
export const captureSessionStatusValues = [
  "recording", // активна, sidecar пишет кадры
  "paused",    // privacy-pause или ручная пауза
  "ended",     // завершена штатно
  "failed",    // sidecar упал / разрешения отозваны
] as const;
export type CaptureSessionStatus = (typeof captureSessionStatusValues)[number];

/** Стадия обработки кадра в vision-пайплайне. */
export const captureFrameStageValues = [
  "stored",     // загружен в minio (зашифрован)
  "embedded",   // вектор записан в qdrant
  "summarized", // вошёл в screen_block-саммари
  "discarded",  // отбракован (дубликат/privacy/retention)
] as const;
export type CaptureFrameStage = (typeof captureFrameStageValues)[number];

/** Capability AIProvider, потребляемые захватом (подмножество D12). */
export const captureAiCapabilityValues = ["vision", "embed"] as const;
export type CaptureAiCapability = (typeof captureAiCapabilityValues)[number];

/** Платформа sidecar (для диагностики/паритета). */
export const capturePlatformValues = ["macos", "windows", "linux"] as const;
export type CapturePlatform = (typeof capturePlatformValues)[number];
```

**Из ядра использует:** `entityKind="activity_event"` (узел сессии захвата), `edgeRelation="captured_from"` (связь note/journal ← кадр/сессия при промоуте), `activityEventKind="screen_block" | "app_usage"`. **Добавляет:** четыре enum'а выше + четыре detail-таблицы ниже.

### 1.2 Detail-таблицы (`packages/db/src/schema/capture.ts`)

Все таблицы — org-scoped cascade FK, `uuid().primaryKey().defaultRandom()` (кроме 1:1-detail `captureSessions`, где PK = `entityId`), jsonb-тела, lifecycle через status-enum (не `deleted_at`), `created_at`/`updated_at` с `$onUpdate`. Конвенции зеркалят `journal.ts`/`knowledge.ts` (shared §3). `captureSettings` имеет суррогатный `id`-PK + uniqueIndex `(org,user)` как естественный ключ — это **обязательно**: таблица без PK ломает Electric-репликацию и невозможность FK на неё.

```ts
/**
 * Rox Capture — подсистема #08 (timeline-спина, фаза 3).
 *
 * Detail-таблицы 1:1 к entities (kind="activity_event" для capture_sessions).
 * Кадры/app-usage — local-primary (Turso), не синхронизируются в cloud (приватность).
 * activity_events (ядро, shared §2.5) НЕ дублируется здесь — это append-only спина,
 * заполняемая capture-сервисом через graph-сервис ядра.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (AGENTS.md).
 */
import {
  boolean,
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
import {
  captureFrameStageValues,
  capturePlatformValues,
  captureSessionStatusValues,
} from "./enums";
// КОНТРАКТ #1 ( core-graph, `01-core-graph.md` §2.2): файл `packages/db/src/schema/entity.ts`
// и экспорт `entities` фиксируются подсистемой #1 (фаза 0). Здесь — forward-зависимость;
// имя файла `./entity` и таблицы `entities` ДОЛЖНЫ совпасть с тем, что материализует #1.
// Аналогично `./activity` (`activityEvents`, shared §2.5) используется ингест-сервисом (§3.2/§3.3),
// не импортируется в этой схеме, но фиксируется как контракт #1.
import { entities } from "./entity"; // ядро #1 — см. 01-core-graph.md §2.2
import { v2Projects } from "./schema";

export const captureSessionStatus = pgEnum("capture_session_status", captureSessionStatusValues);
export const captureFrameStage = pgEnum("capture_frame_stage", captureFrameStageValues);
export const capturePlatform = pgEnum("capture_platform", capturePlatformValues);

/** Зашифрованная ссылка на бинарь кадра в minio (design A8: bucket=org-<id>, prefix frames/). */
export type CaptureStorageRef = {
  bucket: string;
  key: string; // frames/<userId>/<sessionId>/<frameId>.enc
  mime: string; // image/webp
  size: number; // байт зашифрованного объекта
  enc: "aes-256-gcm"; // схема шифрования (C4)
};

/** Сводка vision-саммари батча, дублируется в activity_events.payload.summary. */
export type CaptureSummaryPayload = {
  summary: string;
  topics?: string[];
  apps?: string[];
  modelId?: string;
} & Record<string, unknown>;

// 1:1 entities (kind="activity_event") — сессия захвата = непрерывный промежуток записи.
export const captureSessions = pgTable(
  "capture_sessions",
  {
    entityId: uuid("entity_id")
      .primaryKey()
      .references(() => entities.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: capturePlatform().notNull(),
    status: captureSessionStatus().notNull().default("recording"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    deviceId: text("device_id"), // стабильный id машины (для cross-device фильтра)
    frameCount: integer("frame_count").notNull().default(0),
    // Денормализованная настройка приватности на момент старта (для аудита).
    captureConfig: jsonb("capture_config")
      .$type<{ fps: number; excludedApps: string[]; retentionDays: number }>()
      .notNull()
      .default({ fps: 1, excludedApps: [], retentionDays: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("capture_sessions_org_idx").on(t.organizationId),
    index("capture_sessions_user_started_idx").on(t.userId, t.startedAt),
    index("capture_sessions_status_idx").on(t.status),
  ],
);
export type InsertCaptureSession = typeof captureSessions.$inferInsert;
export type SelectCaptureSession = typeof captureSessions.$inferSelect;

// Кадр экрана. LOCAL-ONLY (Turso primary, C1). НЕ 1:1 к entity — кадров много на сессию.
export const captureFrames = pgTable(
  "capture_frames",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionEntityId: uuid("session_entity_id")
      .notNull()
      .references(() => captureSessions.entityId, { onDelete: "cascade" }),
    // На какой activity_events(screen_block) свёрнут кадр (null до саммари).
    // НАМЕРЕННО без FK: `capture_frames` — Turso-local (C1), `activity_events` — cloud-Postgres,
    // поэтому кросс-БД FK физически невозможен. Целостность висячих ссылок поддерживается
    // ингест/cleanup-сервисом (set-null при purge ядра), не СУБД-constraint'ом.
    screenBlockEventId: uuid("screen_block_event_id"),
    ts: timestamp({ withTimezone: true }).notNull(),
    stage: captureFrameStage().notNull().default("stored"),
    storageRef: jsonb("storage_ref").$type<CaptureStorageRef>().notNull(),
    // perceptual hash для дедупа near-identical кадров.
    phash: text(),
    appBundleId: text("app_bundle_id"), // активное приложение в момент кадра
    windowTitle: text("window_title"),
    qdrantPointId: uuid("qdrant_point_id"), // = id (1:1), без FK — это id точки в qdrant (внешний стор), хранится явно для реиндекса
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("capture_frames_org_idx").on(t.organizationId),
    index("capture_frames_session_ts_idx").on(t.sessionEntityId, t.ts),
    index("capture_frames_user_ts_idx").on(t.userId, t.ts),
    index("capture_frames_stage_idx").on(t.stage),
    index("capture_frames_block_idx").on(t.screenBlockEventId),
  ],
);
export type InsertCaptureFrame = typeof captureFrames.$inferInsert;
export type SelectCaptureFrame = typeof captureFrames.$inferSelect;

// App-usage сэмпл (фокус приложения/окна/URL + длительность). LOCAL-ONLY (C1).
// Свёртка в activity_events(app_usage) — отдельным событием на каждый focus-span.
export const captureAppUsage = pgTable(
  "capture_app_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionEntityId: uuid("session_entity_id").references(() => captureSessions.entityId, {
      onDelete: "set null",
    }),
    // ссылка на свёрнутый activity_events(app_usage). НАМЕРЕННО без FK: `capture_app_usage` —
    // Turso-local (C1), `activity_events` — cloud-Postgres → кросс-БД FK невозможен (как у кадров выше).
    activityEventId: uuid("activity_event_id"),
    appBundleId: text("app_bundle_id").notNull(),
    appName: text("app_name").notNull(),
    windowTitle: text("window_title"),
    url: text(), // если фокус — браузер (через accessibility / расширение)
    category: text(), // productivity-категория (Clicky), резолвится позже
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    idle: boolean().notNull().default(false), // span помечен как простой (нет ввода)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("capture_app_usage_org_idx").on(t.organizationId),
    index("capture_app_usage_user_started_idx").on(t.userId, t.startedAt),
    index("capture_app_usage_app_idx").on(t.appBundleId),
    index("capture_app_usage_event_idx").on(t.activityEventId),
  ],
);
export type InsertCaptureAppUsage = typeof captureAppUsage.$inferInsert;
export type SelectCaptureAppUsage = typeof captureAppUsage.$inferSelect;

// Настройки захвата per (org,user). Источник истины приватности/exclusion/retention/provider.
export const captureSettings = pgTable(
  "capture_settings",
  {
    // PK по конвенции shared §3 (`uuid().primaryKey().defaultRandom()`); естественный
    // ключ — uniqueIndex по (org,user) ниже (одна строка настроек на пользователя в org).
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean().notNull().default(false), // C5: opt-in
    paused: boolean().notNull().default(false), // глобальный privacy-pause
    captureScreen: boolean("capture_screen").notNull().default(true),
    captureAppUsage: boolean("capture_app_usage").notNull().default(true),
    fps: integer().notNull().default(1),
    retentionDays: integer("retention_days").notNull().default(30),
    syncSummaries: boolean("sync_summaries").notNull().default(true), // C1: summary→cloud
    excludedApps: jsonb("excluded_apps").$type<string[]>().notNull().default([]), // bundleId
    excludedWindowPatterns: jsonb("excluded_window_patterns")
      .$type<string[]>()
      .notNull()
      .default([]), // regex по заголовку окна
    excludedUrlPatterns: jsonb("excluded_url_patterns").$type<string[]>().notNull().default([]),
    providerByCapability: jsonb("provider_by_capability")
      .$type<Partial<Record<"vision" | "embed", string>>>()
      .notNull()
      .default({ vision: "zed-gateway", embed: "zed-gateway" }), // C3
    v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("capture_settings_org_user_uniq").on(t.organizationId, t.userId),
    index("capture_settings_user_idx").on(t.userId),
  ],
);
export type InsertCaptureSettings = typeof captureSettings.$inferInsert;
export type SelectCaptureSettings = typeof captureSettings.$inferSelect;
```

Регистрация в `packages/db/src/schema/index.ts` (re-export `./capture`) и в Zod-слое `zod.ts`
(`createInsertSchema(captureSettings)` и т.п. по конвенции). Relations (`relations.ts`): `captureFrames.sessionEntityId → captureSessions`, `captureSessions.entityId → entities`.

### 1.3 Маппинг на qdrant (shared §2, design §2A)

- **Коллекция:** единая `rox_entities` (имя — **контракт #2**, `02-infra-runtime.md` §qdrant: коллекция и схема payload канонизируются рантаймом; здесь forward-зависимость, имя `rox_entities` ДОЛЖНО совпасть с тем, что заводит #2), фильтрация по payload. Кадры индексируются как отдельный тип точки (`pointType`).
- **Point per кадр:** `id = captureFrames.id` (= `qdrantPointId`). Вектор — image-embedding кадра через AIProvider capability `embed` (multimodal/CLIP-класс) ИЛИ embedding текста OCR-саммари (фоллбэк, если провайдер не даёт image-эмбеддинг).
- **Payload (минимум, без PII-тел):** `{ pointType: "capture_frame", frameId, sessionEntityId, orgId, userId, ts (epoch ms), appBundleId?, screenBlockEventId? }`. Заголовки окон/URL в payload НЕ кладём (приватность) — только bundleId.
- **Что embed-ится:** изображение кадра (downscale ≤768px) → image-вектор; при текстовом фоллбэке — `windowTitle + app + OCR-фрагмент`. `screen_block`-саммари дополнительно индексируется как текстовая точка `{ pointType: "activity_summary", activityEventId, ... }` для семантического поиска по timeline.
- **Реиндекс:** по `captureFrames.stage` (перезагрузка `stored→embedded`); summary-точки — по `activityEvents.id` при пересборке саммари.

---

## 2. API-контракты (tRPC)

**Новый роутер** `capture` в `packages/trpc/src/router/capture/` (barrel `index.ts` → `capture.ts`), регистрация в `packages/trpc/src/root.ts` (`capture: captureRouter`). Все процедуры — `protectedProcedure` (org/user из `ctx.session`). Ошибки — `TRPCError` с русскими `message` (конвенция `notes.ts`). На границе — Zod. Денежных полей нет (vision-стоимость учитывается в `economy` #11, вне #08 — N/A).

**Расширяет существующее:** `journal`-генератор (роутер/крон) получает источник `activity_events` для дайджеста дня (см. §3.4) — это интеграционная точка, не новая процедура `capture`.

Общие Zod-фрагменты:
```ts
const TsRange = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const Cursor = z.object({ cursor: z.string().uuid().nullish(), limit: z.number().int().min(1).max(200).default(50) });
```

**Output-DTO (Zod-схемы — источник истины формы ответа; согласованы с колонками §1 и `activity_events.payload` shared §2.5).** Output каждой процедуры ниже ссылается на эти схемы по имени:

```ts
// Зеркалит colonки captureSettings (§1.2) минус суррогатный id/служебные. cache-first дефолт:
// если строки нет — возвращается этот объект с enabled=false (строка НЕ создаётся, §2.1 getSettings).
export const CaptureSettingsDTO = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  enabled: z.boolean(),
  paused: z.boolean(),
  captureScreen: z.boolean(),
  captureAppUsage: z.boolean(),
  fps: z.number().int().min(1).max(4),
  retentionDays: z.number().int().min(1).max(365),
  syncSummaries: z.boolean(),
  excludedApps: z.array(z.string()),
  excludedWindowPatterns: z.array(z.string()),
  excludedUrlPatterns: z.array(z.string()),
  providerByCapability: z.object({
    vision: z.string().optional(),
    embed: z.string().optional(),
  }),
  v2ProjectId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime(),
  // Не из строки настроек, но возвращается getSettings/updateSettings для UI-гейтинга (§2.1).
  precondition: z.object({ needsPermission: z.boolean() }).optional(),
});
export type CaptureSettingsDTO = z.infer<typeof CaptureSettingsDTO>;

// Проекция одной строки activity_events (ядро, shared §2.5) для timeline/блока.
// payload — точно поля §2.5 (`app/window/url/summary/frameRefs`) + опц. capture-сводка (CaptureSummaryPayload §1.2):
// никаких PII-тел кадров; путь к бинарю — только через getFrameUrl (§2.2).
export const ActivityEventDTO = z.object({
  id: z.string().uuid(),
  ts: z.string().datetime(),
  durationMs: z.number().int().nullable(),
  kind: z.enum(["screen_block", "app_usage"]),
  sourceEntityId: z.string().uuid().nullable(), // = sessionEntityId для capture-событий
  payload: z.object({
    app: z.string().optional(),
    window: z.string().optional(),
    url: z.string().optional(),
    summary: z.string().optional(),
    frameRefs: z.array(z.string().uuid()).optional(), // frameId'ы кадров батча
    topics: z.array(z.string()).optional(),
    apps: z.array(z.string()).optional(),
    modelId: z.string().optional(),
  }),
});
export type ActivityEventDTO = z.infer<typeof ActivityEventDTO>;

// Лёгкая проекция кадра для scrubber/getBlock — без storageRef/phash/PII-заголовков.
// thumbUrl присутствует, только если кадр запрошен через getFrameUrl-путь; иначе null.
export const FrameThumbDTO = z.object({
  frameId: z.string().uuid(),          // = captureFrames.id
  sessionEntityId: z.string().uuid(),
  ts: z.string().datetime(),
  stage: z.enum(["stored", "embedded", "summarized", "discarded"]),
  appBundleId: z.string().nullable(),
  thumbUrl: z.string().url().nullable(), // краткоживущий presigned (TTL ≤ 60s) или null
});
export type FrameThumbDTO = z.infer<typeof FrameThumbDTO>;
```

### 2.1 Настройки и контроль захвата

| Процедура | Тип | Input (Zod) | Output (Zod) | Правила/ошибки/идемпотентность |
|---|---|---|---|---|
| `getSettings` | query | `void` | `CaptureSettingsDTO` (cache-first; если строки нет — дефолт opt-out) | Возвращает дефолт, не создавая строку. |
| `updateSettings` | mutation | `z.object({ enabled, paused, captureScreen, captureAppUsage, fps: z.number().int().min(1).max(4), retentionDays: z.number().int().min(1).max(365), syncSummaries, excludedApps: z.array(z.string()).max(500), excludedWindowPatterns, excludedUrlPatterns, providerByCapability }).partial()` | `CaptureSettingsDTO` | Upsert по `(org,user)` (идемпотентно). Невалидный regex → `BAD_REQUEST`. Включение `enabled=true` без OS-разрешений на запись экрана возвращает `precondition.needsPermission=true` (см. `getPermissionStatus`). |
| `getPermissionStatus` | query | `void` | `z.object({ screenRecording: z.enum(["granted","denied","undetermined"]), accessibility: z.enum([...]), platform })` | Проксирует sidecar-probe (§3). Не мутирует. |
| `pause` / `resume` | mutation | `void` | `CaptureSettingsDTO` | **Идемпотентны по конечному состоянию** `captureSettings.paused` (state-based, не key-based): `pause`=set `paused=true`, `resume`=set `paused=false`; повтор → no-op. Порядок гарантируется одним владельцем-сессией (owner-only по `userId`, одна строка настроек). Шлёт sidecar control-команду `pause`/`resume` после записи состояния. |
| `startSession` | mutation | `z.object({ idempotencyKey: z.string().uuid() })` | `{ sessionEntityId: z.string().uuid(), status }` | **Идемпотентно по `idempotencyKey`** (повтор → та же сессия). Если `enabled=false` → `FORBIDDEN`. Создаёт `entity(kind="activity_event")` через graph-сервис + `captureSessions` row + командует sidecar `start`. |
| `endSession` | mutation | `z.object({ sessionEntityId: z.string().uuid() })` | `{ status: "ended" }` | `NOT_FOUND` если чужая/нет. Идемпотентно (повтор по `ended` — no-op). Триггерит финальный vision-flush. |

### 2.2 Чтение timeline / кадров / аналитики

| Процедура | Тип | Input | Output | Правила/ошибки |
|---|---|---|---|---|
| `timeline` | query | `TsRange.extend(Cursor.shape).extend({ kinds: z.array(z.enum(["screen_block","app_usage"])).default(["screen_block","app_usage"]), deviceId: z.string().nullish() })` | `{ items: ActivityEventDTO[], nextCursor }` | Читает `activity_events` (ядро) фильтром `userId+ts∈range+kind`. Cache-first. `to<from` → `BAD_REQUEST`. |
| `getBlock` | query | `z.object({ activityEventId: z.string().uuid() })` | `ActivityEventDTO & { frames: FrameThumbDTO[] }` | `frames` — из `captureFrames` по `screenBlockEventId`. `NOT_FOUND` если чужой. |
| `getFrameUrl` | query | `z.object({ frameId: z.string().uuid() })` | `{ url: z.string().url(), expiresAt }` | Возвращает **краткоживущий presigned URL** на расшифрованный кадр (расшифровка стримом в proxy, см. §3). Owner-only → иначе `FORBIDDEN`. URL TTL ≤ 60s. |
| `searchFrames` | query | `z.object({ query: z.string().min(2).max(500), limit: z.number().int().min(1).max(50).default(20), from: z.string().datetime().nullish(), to: z.string().datetime().nullish() })` | `{ hits: { frameId, sessionEntityId, ts, score }[] }` | qdrant-поиск (§1.3) с payload-фильтром `userId+orgId`. Embedding запроса — capability `embed`. |
| `appUsageStats` | query | `TsRange.extend({ bucket: z.enum(["app","category","hour","day"]).default("app"), deviceId: z.string().nullish() })` | `{ rows: { key, totalMs, share }[], totalMs }` | Агрегат по `captureAppUsage`. Исключает `idle=true` из активного времени (отдельной строкой). |
| `deleteRange` | mutation | `TsRange.extend({ idempotencyKey: z.string().uuid() })` | `{ deletedFrames, deletedEvents }` | **Идемпотентно**. Удаляет кадры (minio + `captureFrames`), `activity_events` в диапазоне, qdrant-точки. Owner-only. Append-only-исключение: ручное удаление пользователем (privacy) допускается, логируется в `audit_log`. |
| `deleteFrame` | mutation | `z.object({ frameId: z.string().uuid() })` | `{ ok: true }` | Точечное privacy-удаление кадра (minio+row+qdrant). Idempotent. |

### 2.3 Промоут в граф (интеграция с graph-сервисом ядра)

| Процедура | Тип | Input | Output | Правила |
|---|---|---|---|---|
| `promoteBlockToNote` | mutation | `z.object({ activityEventId: z.string().uuid(), title: z.string().min(1).max(200).optional(), idempotencyKey: z.string().uuid() })` | `{ noteEntityId: z.string().uuid() }` | Через graph-сервис: `create(entity kind="note", markdown=block.summary)` + `link(source=note, target=sessionEntityId, relation="captured_from")` (shared §2.6 `create`/`link`/`promote`). **Идемпотентно** по `idempotencyKey`. Не дублирует запись узла — только graph-сервис. |
| `promoteSelectionToJournal` | mutation | `z.object({ day: z.string().date(), activityEventIds: z.array(z.string().uuid()).min(1).max(200) })` | `{ journalDay: z.string().date() }` | Аппендит выбранные блоки в дайджест дня (см. §3.4) — upsert `journal_entries` идемпотентно по `(org,user,day)`. |

**Бизнес-правила (сквозные):**
- Все процедуры скоупятся `organizationId = ctx.session.activeOrganizationId` и `userId = ctx.session.user.id`; cross-user-доступ запрещён (owner-only по `userId`).
- `activity_events` остаётся **append-only** для сервисных писателей; единственная мутация-удаление — явные privacy-операции пользователя (`deleteRange`/`deleteFrame`) с записью в `audit_log` (user CLAUDE.md «audit-log mutations»).
- Rate-limit: `searchFrames` и `getFrameUrl` — per-user лимит (vision/IO-дорогие), 429 + `Retry-After` (паттерн публичных API; здесь internal, но лимит обязателен по конвенции shared §3).
- DTO-маппинг скрывает PII: `ActivityEventDTO.payload` отдаёт `summary/app/window/url/frameRefs`, но `getFrameUrl` — единственный путь к бинарю.

---

## 3. Сервисы/процессы/протоколы

### 3.1 Топология процессов (design §2C)

```
Electron main ──spawn/adopt──> capture-sidecar (отдельный ОС-процесс, per-OS бинарь)
   │  (typed preload bridge)          │  Unix-socket (0600), framed-протокол (как pty-daemon)
   │                                   ├─ screen-capturer (ScreenCaptureKit/Graphics.Capture/PipeWire)
   │                                   └─ app-usage-watcher (frontmost app/window/url + idle)
   │
host-service ──supervise──> CaptureSupervisor (по образцу DaemonSupervisor):
   per-(user,device) процесс, crash-budget, manifest, auto-restart
   │
   ▼
capture-ingest (host-service воркер): принимает кадры/usage из sidecar →
   minio(frames/, зашифровано) + Turso(capture_frames/capture_app_usage) →
   batch(15m) → AIProvider(vision) → activity_events(screen_block) + (embed)→qdrant
```

**Где живёт supervision:** `packages/host-service/src/capture/CaptureSupervisor.ts` — копирует механику `DaemonSupervisor.ts` (spawn `childProcess`, ротация лог-FD `log-fd.ts`, manifest для adoption, `CRASH_BUDGET=3`/`CRASH_WINDOW_MS=60_000`, liveness-poll). host-service уже не привязан к Electron (`no-electron-coupling.test.ts`) — sidecar управляется им, Electron только запрашивает статус через preload→host-service API.

### 3.2 Протокол sidecar↔Rox (IPC)

Транспорт и фрейминг — **переиспользуем дизайн `packages/pty-daemon/src/protocol`**: Unix-socket (Windows — named pipe), length-prefixed фреймы с JSON-заголовком + бинарный хвост (кадры WebP едут в хвосте, НЕ base64 — как PTY-байты в pty-daemon `messages.ts`). Версионирование протокола (`hello`/`hello-ack`, `SUPPORTED_PROTOCOL_VERSIONS`).

Новый пакет протокола: `packages/capture-protocol/src/messages.ts` (структурно зеркалит pty-daemon). Сообщения:

```ts
// Handshake
HelloMessage      { type:"hello"; protocols:number[]; sidecarVersion?:string; platform:"macos"|"windows"|"linux" }
HelloAckMessage   { type:"hello-ack"; protocol:number; sessionToken:string } // token связывает поток с (user,device)

// Rox → sidecar (control plane)
StartCaptureMessage  { type:"start"; sessionId:string; config:{ fps:number; captureScreen:boolean; captureAppUsage:boolean; excludedApps:string[]; excludedWindowPatterns:string[]; excludedUrlPatterns:string[] } }
PauseMessage         { type:"pause" }     // privacy-pause
ResumeMessage        { type:"resume" }
StopMessage          { type:"stop"; sessionId:string }
UpdateConfigMessage  { type:"config"; config: StartCaptureMessage["config"] } // горячее обновление exclusion
ProbePermissionsMsg  { type:"probe" }

// sidecar → Rox (data plane; бинарь кадра — в хвосте фрейма)
FrameMessage     { type:"frame"; sessionId:string; ts:number; appBundleId?:string; windowTitle?:string; phash?:string } // + WebP-tail
AppUsageMessage  { type:"app_usage"; sessionId:string; appBundleId:string; appName:string; windowTitle?:string; url?:string; startedAt:number; durationMs:number; idle:boolean }
PermissionsMessage { type:"permissions"; screenRecording:"granted"|"denied"|"undetermined"; accessibility:"granted"|"denied"|"undetermined" }
SidecarErrorMessage  { type:"error"; code?:string; message:string }
HeartbeatMessage     { type:"heartbeat"; ts:number; framesSinceLast:number }
```

**Inbound-приём (host-service):** на каждый `frame` — exclusion-чек (по `appBundleId`/`windowTitle`/`url` против `captureSettings`), dedup по `phash` (Hamming ≤ threshold → `discarded`), шифрование (C4, бинарный helper ниже) → minio `frames/<userId>/<sessionId>/<frameId>.enc` → insert `captureFrames(stage="stored")`. На `app_usage` — insert `captureAppUsage` + свёртка focus-span в `activity_events(kind="app_usage", durationMs, payload{app,window,url})` через graph-сервис.

**Бинарный crypto-helper (C4).** Новый модуль `packages/host-service/src/capture/frame-crypto.ts` (НЕ string-функции `crypto.ts`), тот же ключ `SECRETS_ENCRYPTION_KEY` и схема `iv(12)|tag(16)|ciphertext`, API на `Buffer`/`Readable`:

```ts
import type { Readable } from "node:stream";
// at-rest шифрование кадра при ingest (Buffer → Buffer, sentinel-схема enc="aes-256-gcm").
export function encryptFrame(plaintext: Buffer): Buffer;          // layout: iv(12)|tag(16)|ciphertext
// стримовая расшифровка для presigned-proxy (getFrameUrl, §2.2) — без полной материализации в памяти.
export function decryptFrameStream(source: Readable): Readable;   // GCM verify-on-finalize
// синхронный путь (тесты/мелкие кадры).
export function decryptFrame(encrypted: Buffer): Buffer;
```

Ключ читается тем же `getKey()`-паттерном, что `crypto.ts` (base64, 32 байта). Расшифровка кадра в `getFrameUrl`-proxy (`apps/api`) идёт **стримом** `decryptFrameStream(minioObjectStream)` → response, ключ не покидает машину. Схема версионируется через `storageRef.enc` (§1.2, sentinel — как `enc:v1:` в `secret-store`) для будущей ротации ключа.

### 3.3 Vision-пайплайн (батч 15 мин, C2 / design §2B)

```
[капля кадров stored] --window(15m | session end)--> [batch builder]
   --dedup/keyframe-select--> [AIProvider.vision(providerByCapability.vision)]
   --> summary --> activity_events(screen_block, payload{summary,frameRefs[],apps}) [graph-сервис]
   --frames stage=summarized--> [AIProvider.embed] --> qdrant point per frame (stage=embedded)
```

- **AIProvider-интерфейс** (потребляется, каноничен в #2/#11): `vision(frames: Buffer[], prompt): Promise<{summary; topics; apps}>`, `embedImage(frame: Buffer): Promise<number[]>` (фоллбэк `embedText`). Реализация по умолчанию — `zed-gateway` (R1, C3); переключение per-capability из `captureSettings.providerByCapability`.
- **Стоимость** учитывается в #11 `economy`; #08 публикует usage-событие (вне схемы #08).
- **Идемпотентность батча (без изменения ядровой таблицы).** `activity_events` (shared §2.5) имеет `id: uuid().defaultRandom()` и НЕ содержит колонок `sessionEntityId`/`batchWindowStart` — добавлять туда unique-индекс/колонки нельзя. Поэтому сервис вычисляет **детерминированный PK** события:

  ```ts
  import { v5 as uuidv5 } from "uuid";
  // Фиксированная namespace-константа подсистемы #08 (генерируется один раз, хардкодится в коде).
  const CAPTURE_SCREEN_BLOCK_NAMESPACE = "6b1d3e2a-8c4f-5a7b-9e0d-1f2a3b4c5d6e";
  // Вход детерминированного id — строка `${sessionEntityId}:${batchWindowStartEpochMs}`.
  const eventId = uuidv5(`${sessionEntityId}:${batchWindowStartEpochMs}`, CAPTURE_SCREEN_BLOCK_NAMESPACE);
  ```

  Вставка `screen_block` идёт как идемпотентный upsert по этому PK: `insert(activityEvents).values({ id: eventId, ... }).onConflictDoNothing({ target: activityEvents.id })`. Повторный прогон того же 15-мин окна (тот же `sessionEntityId` + `batchWindowStart`) даёт тот же `eventId` → конфликт → no-op, без второго `screen_block` и без правки DDL ядра. `payload.frameRefs` для повтора не перезаписывается (insert-only); если требуется обновить саммари — отдельный явный путь пересборки (§1.3 реиндекс).

### 3.4 Дайджест в journal (расширение существующего)

Существующий `journal`-генератор (`journal_entries`, design §2B `--daily-->journal`) дополняется источником `activity_events`: дневной крон агрегирует `screen_block`-саммари + `app_usage`-топ за `day` (UTC) → R1 формирует `reflection`/`tips`, upsert `journal_entries` идемпотентно по `(organization_id, created_by, day)` (как сейчас). `promoteSelectionToJournal` (§2.3) — ручной путь того же upsert. Это интеграция, схема `journal_entries` НЕ меняется.

### 3.5 Sync/realtime топология (design §2E)

- **Cloud Postgres/Neon:** только `activity_events` (с `payload.summary`, если `syncSummaries=true`) + `capture_sessions` (метаданные) + `capture_settings` → Electric down-sync на другие устройства (cache-first, shared §3). Это даёт cross-device timeline без выноса кадров.
- **Turso/libSQL (local primary, C1):** `capture_frames`, `capture_app_usage` — приватные, НЕ покидают машину (design §2E). minio-local держит зашифрованные бинарники.
- **Конфликты:** `activity_events` append-only → конфликтов записи нет (детерминированный UUIDv5-PK по `(sessionEntityId, batchWindowStart)` + `onConflictDoNothing`, §3.3). `capture_settings` — last-writer-wins по `updatedAt` (одна строка на user). Кадры — write-once (никогда не обновляются), только создание/privacy-удаление.
- **Realtime:** не требует relay (A3) — timeline обновляется через Electric-подписку на `activity_events`; «recording»-индикатор — через `capture_sessions.status` live-query.

---

## 4. UI-спецификация

Renderer — lazy feature-модуль `activity` (+`analytics`) (design §2C). Компоненты по AGENTS.md «Project Structure» (папка/`index.ts`/co-located тесты). UI-примитивы — `packages/ui` (shadcn). Live-queries — TanStack DB/Electric **cache-first** (AGENTS.md правило 9: рендерить существующие строки даже при `isReady=false`).

### 4.1 Экраны/панели

| Экран | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **Unified Timeline** (`TimelineView`) | вертикальная лента `activity_events` по дням | если нет кэша и `!isReady` — скелет-рельса | данные есть и `isReady` и пусто — «Нет активности за период» + CTA включить захват | бэйджом сверху, лента из кэша остаётся | виртуализированная лента блоков; есть кэш-строки — показываем сразу, дозагрузка молча |
| **Frame Scrubber** (`FrameScrubber`) | покадровый просмотр блока (скраб по `frameRefs`) | спиннер на текущем кадре, соседние из кэша | блок без кадров → «app-usage блок» | «Кадр недоступен/отозван» placeholder | слайдер-таймлайн + превью; presigned URL по `getFrameUrl` |
| **Analytics Dashboard** (`ActivityAnalytics`) | Clicky-self: топ-приложения/категории/часы | скелет-карточки | «Недостаточно данных» | бэйдж, прошлые агрегаты из кэша | бар/донат-чарты (`appUsageStats`) + heat-map часов |
| **Privacy & Capture Settings** (`CapturePrivacyPanel`) | opt-in, pause, exclusion, retention, provider | форма из кэша мгновенно | N/A (всегда есть дефолт) | inline-ошибка поля | переключатели + список исключений + статус разрешений |
| **Recording Indicator** (`CaptureStatusPill`, в tray + topbar) | статус записи/паузы | — | «Захват выкл» | «Sidecar упал — перезапуск» | пульсирующая точка при `recording`; клик → pause/resume |

### 4.2 Новые UI-примитивы (`packages/ui`) и контракт пропсов

Базовые виджеты — поверх shadcn (`slider`, `card`, `scroll-area`, `resizable`, `chart`, `switch`, `badge`); специфичные:

```ts
// packages/ui/src/components/timeline/Timeline.tsx — виртуализированная лента (TanStack Virtual)
export interface TimelineProps {
  items: TimelineItem[];                 // { id; ts; kind; durationMs; title; app?; thumbUrl? }
  isReady: boolean;                      // cache-first: рендер items даже при false
  onSelect(id: string): void;
  onLoadMore(): void;                    // пагинация cursor
  renderEmpty?: () => React.ReactNode;   // показываем ТОЛЬКО при isReady && items.length===0
  groupBy?: "hour" | "day";
}

// packages/ui/src/components/frame-scrubber/FrameScrubber.tsx
export interface FrameScrubberProps {
  frames: { id: string; ts: number }[];
  index: number;
  onIndexChange(i: number): void;
  resolveUrl(frameId: string): Promise<string>; // → getFrameUrl
  ariaLabel: string;
}

// packages/ui/src/components/capture-status-pill/CaptureStatusPill.tsx
export interface CaptureStatusPillProps {
  status: "off" | "recording" | "paused" | "failed";
  onToggle(): void;                      // pause/resume
}
```

### 4.3 User-flows (на уровне кликов)

**Flow A — включить захват впервые (opt-in):**
1. Settings → «Активность и захват» → тумблер **«Включить захват экрана»**.
2. Если OS-разрешение не выдано → модалка «Открыть Системные настройки → Запись экрана» (deep-link) + кнопка «Проверить снова» (`getPermissionStatus`).
3. После `granted` → `updateSettings({enabled:true})` → `startSession({idempotencyKey})` → tray-pill становится пульсирующим (recording).
4. Появляется тост «Захват включён. Кадры остаются на этом устройстве и шифруются.»

**Flow B — найти «где я видел этот дашборд» и промоутнуть в заметку:**
1. Timeline → поле поиска → ввод «grafana latency» → `searchFrames`.
2. Результаты-превью (по `score`) → клик по кадру → открывается `FrameScrubber` на блоке.
3. Кнопка «В заметку» → `promoteBlockToNote({activityEventId, idempotencyKey})`.
4. Тост «Создана заметка» со ссылкой; в графе появилось ребро `note —captured_from→ session`.

**Flow C — приватность (исключить мессенджер + пауза):**
1. `CapturePrivacyPanel` → «Исключения» → добавить app (выбор из списка активных) → `updateSettings({excludedApps:[...]})` → sidecar получает `config` (горячо).
2. Перед звонком — клик по tray-pill → **Pause** → `pause()` → запись останавливается, точка серая.
3. После — **Resume**.

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- **Timeline:** роль `feed`/`list`; элементы — `listitem` с `aria-label` «{app}, {time}, {duration}». Навигация `↑/↓` между блоками, `Enter` — открыть scrubber, `Home/End` — край дня. Виртуализация сохраняет focus при дозагрузке.
- **FrameScrubber:** `role="slider"`, `aria-valuemin/max/now`, `aria-valuetext`=timestamp; `←/→` ±1 кадр, `Shift+←/→` ±10, `PageUp/Down` — соседний блок. Превью-`img` с осмысленным `alt` (саммари). Контраст ≥ 4.5:1.
- **Recording-pill:** `role="switch"` `aria-checked`; видимый текст-статус не только цветом (точка + подпись «Запись/Пауза/Выкл»). Анимация пульсации уважает `prefers-reduced-motion`.
- **Settings:** все тумблеры — нативные `switch` с `<label>`; ошибки — `aria-describedby`; фокус-ловушка в permission-модалке; Esc — закрыть.
- Все интерактивы достижимы клавиатурой, видимый focus-ring (axe-core в CI, user CLAUDE.md WCAG-правило).

---

## 5. Миграция и обратная совместимость

- **Чистое добавление.** #08 не изменяет существующие таблицы — только добавляет `capture_*` detail + три pgEnum'а (`capture_session_status`, `capture_frame_stage`, `capture_platform`). `activity_events` уже введён ядром #1 (shared §2.5), #08 его **наполняет**, не меняет DDL.
- **Backfill:** не требуется (нет легаси-данных захвата). При первом включении у пользователя `capture_settings` создаётся лениво (opt-out дефолт до явного `enabled`).
- **Имя миграции:** `bunx drizzle-kit generate --name="capture_sessions_frames_app_usage_settings"` (offline diff; НЕ редактировать `packages/db/drizzle/` вручную, AGENTS.md). Включает 3 pgEnum'а + 4 таблицы + индексы (`capture_ai_capability` остаётся TS-типом в jsonb — не materialized как pgEnum).
- **Депрекейшн:** ничего не удаляется/не депрекейтится.
- **Down-миграция (концептуально):** `DROP TABLE capture_frames, capture_app_usage, capture_sessions, capture_settings` (в обратном FK-порядке) → `DROP TYPE capture_frame_stage, capture_session_status, capture_platform`. minio-объекты `frames/` и qdrant-точки `pointType in (capture_frame, activity_summary)` чистятся отдельным cleanup-скриптом (не реверсятся drizzle). `activity_events(kind in screen_block,app_usage)` остаются (собственность ядра) — опционально purge тем же cleanup. Drizzle down не пишется руками; откат = откат снапшота + cleanup-скрипт.
- **Обратная совместимость провайдеров:** шифрование кадров — sentinel-подход как `secret-store` (`enc:v1:`/`aes-256-gcm` в `storageRef.enc`), будущая ротация ключа читает старую схему по полю `enc`.

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Opt-in по умолчанию.** Given свежий пользователь без `capture_settings`; When открыт Settings; Then `getSettings` возвращает `enabled=false`, sidecar не запущен, кадры не пишутся.
2. **Старт сессии идемпотентен.** Given `enabled=true`; When `startSession` вызван дважды с тем же `idempotencyKey`; Then создаётся ровно одна `capture_sessions`-строка и один `entity(kind="activity_event")`.
3. **Кадр доходит и шифруется.** Given активная сессия; When sidecar шлёт `frame`; Then в minio лежит объект `frames/<user>/<session>/<frame>.enc` (зашифрован, `storageRef.enc="aes-256-gcm"`), есть `capture_frames(stage="stored")`, бинарь не читается без ключа.
4. **Exclusion работает горячо.** Given app добавлен в `excludedApps`; When он в фокусе; Then ни кадр, ни `app_usage` по нему не сохраняются (sidecar получил `config`, либо ingest отбраковал → `discarded`).
5. **Privacy-pause.** Given `recording`; When `pause()`; Then новых кадров нет, `capture_sessions.status` (или `captureSettings.paused`) отражает паузу, pill серый; после `resume()` запись возобновляется.
6. **Vision-батч → screen_block.** Given ≥1 кадр за 15-мин окно; When батч отрабатывает; Then создан один `activity_events(kind="screen_block")` с `payload.summary` и `payload.frameRefs[]`, кадры → `stage="summarized"`; повторный прогон окна не создаёт второй event.
7. **Семантический поиск.** Given кадры `embedded`; When `searchFrames({query})`; Then возвращаются `hits` только текущего `userId/orgId`, отсортированные по `score`.
8. **Промоут в граф.** Given блок; When `promoteBlockToNote`; Then создан `entity(kind="note")` через graph-сервис и ребро `captured_from` к сессии; повтор с тем же `idempotencyKey` — без дубля.
9. **Privacy-удаление.** Given диапазон с кадрами; When `deleteRange`; Then удалены `capture_frames`+minio-объекты+qdrant-точки+`activity_events` в диапазоне, событие записано в `audit_log`; повтор — no-op.
10. **Кадры не утекают в cloud.** Given cross-device sync; When смотрим cloud-Postgres; Then там есть `activity_events`(summary) и `capture_sessions`, но НЕТ `capture_frames`/`capture_app_usage` (local-only, C1).
11. **Cache-first timeline.** Given есть кэш `activity_events`; When `useLiveQuery` ещё `isReady=false`; Then лента рендерит кэш-строки сразу (не скелет/не пусто).
12. **Supervision.** Given sidecar упал; When в пределах `CRASH_BUDGET` за окно; Then `CaptureSupervisor` перезапустил его, `CaptureStatusPill` показал «перезапуск»; при превышении бюджета — `status="failed"` + ошибка наверх.
13. **Дайджест дня.** Given активность за `day`; When дневной крон/`promoteSelectionToJournal`; Then `journal_entries(org,user,day)` upsert-нут идемпотентно с `reflection`, источник — `activity_events`.
14. **A11y.** Given Timeline/Scrubber; When только клавиатура; Then блоки навигируются `↑/↓`, scrubber — `←/→`, статус читается скринридером (не только цвет); axe-core без нарушений AA.

---

## 7. Тест-план

**Unit (Bun, `bun test <path>`):**
- `packages/db` — компиляция схемы `capture.ts`, `$inferInsert/$inferSelect`, дефолты (`enabled=false`, `fps=1`), уникальный индекс `capture_settings_org_user_uniq`.
- `packages/capture-protocol` — кодек фреймов (JSON-заголовок + бинарный хвост round-trip), `hello`/`hello-ack` версионирование, отказ при неподдерживаемой версии (зеркало `pty-daemon` framing-тестов).
- `packages/trpc/src/router/capture` — Zod-валидации (невалидный regex → `BAD_REQUEST`, `to<from` → `BAD_REQUEST`), идемпотентность `startSession`/`promoteBlockToNote`/`deleteRange`, owner-only (чужой `frameId` → `FORBIDDEN`).
- Ingest-логика: exclusion-чек, dedup по `phash` (Hamming), батч-builder детерминированность (один `screen_block` на окно), шифрование round-trip (encode/decode кадра).
- `host-service` `CaptureSupervisor` — crash-budget (3 краша/60s → `failed`), adoption из manifest, ротация лог-FD (node-test, как `DaemonSupervisor.node-test.ts`).

**Integration (neon-branch — отдельная ветка Neon, root `.env` на неё; НЕ прод, AGENTS.md):**
- Миграция применяется на свежей neon-ветке; CRUD `capture_*`; сквозной путь `startSession → frame(ingest, mocked minio+qdrant) → batch(mocked AIProvider) → activity_events → timeline → promoteBlockToNote → ребро captured_from`.
- Фикстуры: фейковый sidecar-клиент (как `pty-daemon/test/helpers/client.ts`), in-memory minio/qdrant-стабы, mock-AIProvider с детерминированным `vision`/`embed`.
- `deleteRange` чистит все три стора (Postgres/minio-stub/qdrant-stub) + `audit_log`.

**e2e-сценарий (desktop):** Flow A (включение + permission-gate) и Flow B (поиск→scrubber→промоут) через webapp-testing-харнесс; проверка cache-first рендера timeline.

**Команды:**
```bash
bun test packages/db packages/capture-protocol
bun test packages/trpc/src/router/capture
bun test packages/host-service        # включает CaptureSupervisor.node-test
# smoke: bun test packages/shared packages/auth (минимальный VM-набор, AGENTS.md)
```
Целевое покрытие изменённого кода — **≥80% веток** (user CLAUDE.md); критичны ветки exclusion/идемпотентности/шифрования/owner-проверок.

---

## 8. Задачи реализации (ordered work-list)

1. **Enums + схема.** `packages/db/src/schema/enums.ts` (+4 значения-массива; в pgEnum материализуются 3), `packages/db/src/schema/capture.ts` (4 таблицы), re-export в `index.ts`, Zod в `zod.ts`, relations в `relations.ts`. → `bunx drizzle-kit generate --name="capture_sessions_frames_app_usage_settings"`. (Зависит: ядро #1 `entity.ts`.)
2. **capture-protocol пакет.** `packages/capture-protocol/{package.json,src/messages.ts,src/framing.ts,src/index.ts}` — портировать framing из `pty-daemon` (length-prefix + бинарный хвост), сообщения §3.2, версионирование. + framing-тесты.
3. **CaptureSupervisor (host-service).** `packages/host-service/src/capture/CaptureSupervisor.ts` (+`index.ts`, тесты) по образцу `daemon/DaemonSupervisor.ts`: spawn/adopt sidecar per-(user,device), manifest, crash-budget, log-fd. API-эндпоинт статуса в `host-service/src/api`.
4. **capture-ingest воркер + бинарный crypto-helper.** `packages/host-service/src/capture/frame-crypto.ts` — новый бинарный AES-256-GCM helper (`encryptFrame(Buffer): Buffer` / `decryptFrame(Buffer): Buffer` / `decryptFrameStream(Readable): Readable`, схема `iv|tag|ciphertext`, ключ `SECRETS_ENCRYPTION_KEY`; **НЕ** string-функции `crypto.ts`). `packages/host-service/src/capture/ingest.ts` — приём `frame`/`app_usage`, exclusion-чек против `capture_settings`, dedup(phash), шифрование через `encryptFrame`, запись minio(`frames/`)+Turso, свёртка `app_usage`→`activity_events` через graph-сервис-клиент.
5. **Vision-пайплайн.** `packages/host-service/src/capture/vision.ts` — батч-builder(15m), keyframe-select, вызов AIProvider(`vision`/`embed`), запись `activity_events(screen_block)` + qdrant-точки; идемпотентность батча.
6. **tRPC роутер.** `packages/trpc/src/router/capture/{index.ts,capture.ts}` — все процедуры §2 (output-DTO из §2: `CaptureSettingsDTO`/`ActivityEventDTO`/`FrameThumbDTO`); регистрация в `packages/trpc/src/root.ts`. Owner-проверки, идемпотентность, rate-limit `searchFrames`/`getFrameUrl`, presigned-URL стримовая расшифровка через `decryptFrameStream` (proxy-эндпоинт в `apps/api`).
7. **Journal-дайджест.** Расширить существующий journal-генератор источником `activity_events` (§3.4) + `promoteSelectionToJournal`.
8. **UI-примитивы.** `packages/ui/src/components/{timeline,frame-scrubber,capture-status-pill}` (+ tests/index). Поверх shadcn `slider`/`chart`/`switch` (`bunx shadcn@latest add` при отсутствии).
9. **Feature-модуль `activity`/`analytics`.** `apps/desktop`/`apps/web` lazy-модуль: `TimelineView`, `FrameScrubber`, `ActivityAnalytics`, `CapturePrivacyPanel`, `CaptureStatusPill` (tray). Cache-first live-queries на `activity_events`/`capture_sessions`.
10. **Sidecar-интерфейс + macOS-stub.** Определить `CaptureSidecar`-интерфейс; расширить `packages/macos-process-metrics` app-usage-функциями (frontmost app/window, idle) поверх существующего addon.cc; bind в sidecar-процесс. (per-OS бинари screen-capture — отдельные таски, interface-first A5.)
11. **Privacy/permission-gating.** preload-bridge `getPermissionStatus`/deep-link в Системные настройки; `audit_log`-запись на privacy-удаления; «privacy pause» путь end-to-end.
12. **cleanup-скрипт отката.** `packages/scripts` — purge minio `frames/`+qdrant capture-точек для down-сценария (§5).

---

## 9. Риски и открытые вопросы

**Риски + митигейшн:**
- **Cross-platform захват (A5).** Три разных native-API (ScreenCaptureKit/Graphics.Capture·DXGI/PipeWire) → паритет тяжёлый. *Митигейшн:* единый `capture-protocol` + `CaptureSidecar`-интерфейс; macOS первым (есть аддон), Win/Linux — за тем же контрактом, фиче-флаг по `platform`.
- **Приватность/хранение кадров.** Утечка экранных кадров — высокий ущерб. *Митигейшн:* opt-in (C5), at-rest шифрование (C4), local-only кадры (C1), exclusion-list + privacy-pause обязательны до первого кадра, presigned-URL TTL ≤ 60s, `deleteRange`/`deleteFrame` + audit-log.
- **Vision-стоимость.** 15-мин батчи × дни → дорого. *Митигейшн:* keyframe-select + phash-dedup (саммаризируем не каждый кадр), per-capability дешёвый провайдер, учёт в `economy` #11, retention-purge.
- **Объём local-стора.** Кадры распухают Turso/minio. *Митигейшн:* `retentionDays` (дефолт 30) + фоновая чистка `summarized`-кадров после саммари (опция «удалять кадры после саммари»), WebP + downscale.
- **Supervision-флаппинг.** Sidecar циклически падает (нет разрешений). *Митигейшн:* `CRASH_BUDGET`/`CRASH_WINDOW_MS` → `failed` + явная ошибка, не бесконечный респаун; permission-probe до старта.
- **Дедуп ложно отбраковывает.** Агрессивный phash-порог теряет смену контента. *Митигейшн:* консервативный Hamming-порог + всегда сохранять keyframe на смену `appBundleId`/`windowTitle`.

**Не-блокирующие открытые вопросы:**
- Транспорт на Windows: named pipe vs localhost-TCP под тем же framing — выбрать при реализации Win-sidecar.
- Image-embedding: ждать ли multimodal-capability у `zed-gateway` или сразу OCR-текст-фоллбэк для qdrant — зависит от готовности провайдера (#2/D12).
- Источник URL активной вкладки браузера (accessibility API vs браузерное расширение) — точность vs объём интеграции; влияет на `captureAppUsage.url`.
- Объединять ли audio-capture (#12) под `CaptureSupervisor` при слиянии фаз 3+4 (A4-ревизия).
- Гранулярность retention: единый `retentionDays` vs раздельный для кадров и `app_usage` (кадры тяжелее).
