# 01 — Ядро графа (entities/edges/identity/activity + поиск): L3 implementation-ready ТЗ

> Опирается на `plans/superapp-l3-specs/00-shared-context.md` (далее «00-SC»): §2 — фиксированный контракт ядра графа (этот файл его **реализует**, не переопределяет; enum — append-only diff'ом), §3 — конвенции репо, §4 — допущения A1–A8, §5 — этот шаблон.
> Родительский дизайн: `plans/rox-superapp-roadmap-and-design.md` (Часть 2A — схема ядра, 2B — capture/AI-пайплайн, 2C — процессы/sidecar, 2D — UI-примитивы, 2E — sync-топология).
> Заземление по коду: `packages/db/src/schema/{enums,knowledge,journal,agent,relations,zod,index}.ts`, `packages/trpc/src/router/knowledge/{knowledge,backlinks,schema}.ts`, `packages/shared/src/knowledge/{wikilinks,types,mdx-security}.ts`.

---

## 0. Резюме и границы

**Что входит (Фаза 0, foundation):**
- Канонические таблицы ядра графа: `entities` (универсальный узел), `edges` (типизированные связи + носитель «промоута»), `identity_links` (резолв контактов, D6), `activity_events` (append-only спина timeline, D7) — точь-в-точь по 00-SC §2.2–2.5. Этот файл — **единственный владелец** этих таблиц; все 7 доменных подсистем (#3,4,8,10,11,15) их потребляют, не дублируют.
- Detail-таблица `contacts` (1:1 `entityId`, kind=`contact`) — единственный detail-домен, который ядро обязано поставить сразу (контакт — мишень `identity_links` и `mentions`/`authored_by`; без него identity-резолв нефункционален). Прочие detail (`notes`/`tasks`/`agent_sessions`/…) — у своих спек.
- **graph-сервис** (`packages/trpc/src/lib/graph/`) — единственный писатель `entities`/`edges`: методы `create / get / update / archive / listByKind / link / promote / resolveBacklinks / search`. Доменные роутеры зовут его, а не пишут узлы напрямую.
- **graph-router** (tRPC, `packages/trpc/src/router/graph/`) — тонкая обёртка над сервисом для прямых вызовов из UI (command-bar, граф-вью, универсальный «создать узел»).
- **Idempotency-реестр** (`idempotency_keys`) — закрывает ОВ-1 из 03-pkm: ключ POST-мутаций с побочкой хранится в ядре (нет своей колонки в `entities`), чтобы `create`/`promote` были идемпотентны.
- **Контракт qdrant-индексатора**: единая коллекция `rox_entities`, point-per-searchable-entity, payload-схема, что embed-ится, реиндекс по `updated_at`. Сам индексатор/embedder — рантайм #02; здесь — контракт записи в qdrant и read-path `search`.
- **identity-резолвер** `resolveIdentity()` — по `(kind,value)` находит/создаёт `contact`-узел и `identity_links`-строку (используется почтой/чатом/календарём/capture при привязке участников).

**Что НЕ входит (out of scope):**
- Embedder/vision/STT-провайдеры, сам процесс индексации в qdrant, minio/Turso/Electric-рантайм — поставляет **#02** (`02-infra-runtime.md`); ядро объявляет контракт payload и зовёт `embedderClient.upsert/search`, реализация — там.
- Detail-таблицы доменов (`notes`, `tasks`, `emails`, `calendar_events`, `files`, `messages`, `channels`, `feeds`, `design_artifacts`, `osint_entities`, `agent_sessions`) и их роутеры — у подсистем #3/4/8/10/11/15. Ядро их kind/relation **уже декларирует** в enum (00-SC §2.1), но таблицы не создаёт.
- Capture-sidecar (screen/app-usage/vision) — **#08**; ядро лишь принимает запись `activity_events` через `recordActivity()` и описывает её контракт (на него опирается #08 и подсистема 12, 00-SC §4 A4).
- Полноценный canvas/граф-движок (tldraw/React Flow) — **Фаза 5/#15**; здесь только серверный `graph`-эндпоинт эго-сети + лёгкий read-API, без freeform-редактора.

**Фаза:** 0. **Зависимости:** только **#02** (рантайм: qdrant-коллекция/embedder-клиент, Turso local-primary, Electric down-sync, minio для `storageRef`). Существующие в репо: `organizations`/`users` (`auth.ts`), `v2Projects`/`usageRequests` (`schema.ts`/`economy.ts`), wikilink/mdx-утилиты (`@rox/shared/knowledge` — это shared-слой, не домен). Тип провенанса узла ядро **вводит само** в нейтральном `schema/_shared.ts` (`EntitySourceRef`, §1.2.0), а НЕ импортирует `KnowledgeSourceRef` из доменного `knowledge.ts` (#03). Ядро **не** зависит ни от одной доменной подсистемы (они зависят от него).

**Принятые допущения (00-SC §4), все ревизируемы:**
- **A8** — minio bucket `org-<orgId>`; `entities.storageRef`/detail хранят `{bucket,key,mime,size}`. Префиксы по домену задают сами домены.
- **Локально-специфичное (ревизируемо):** канон `entities`/`edges`/`identity_links` — **cloud Postgres/Neon** (синхронизируемые, командные), вниз Electric (cache-first); `activity_events` — **local-primary Turso** (приватная/тяжёлая спина), наверх в Postgres-зеркало уходит только агрегат/опт-ин (00-SC §2E). Это решает владелец #02; ядро объявляет таблицу в общей схеме, физическое размещение — конфиг рантайма.
- **Idempotency-механизм (закрывает ОВ-1 из 03-pkm):** отдельная таблица `idempotency_keys` в ядре (не `edges.metadata`, не Redis) — переживает рестарт, видна в той же транзакции, не раздувает граф. Ревизируемо на Redis при росте нагрузки.
- **qdrant-коллекция единая** `rox_entities` (а не per-kind) с фильтром по payload-полю `kind` — по 00-SC §2A/§2.6. Ревизируемо на per-kind при росте корпуса.

---

## 1. Доменная модель (полная схема БД)

Ядро — **канон**: ниже полный компилируемый Drizzle-код таблиц `entities/edges/identity_links/activity_events` (1:1 с 00-SC §2.2–2.5, без отступлений), detail-таблицы `contacts` (1:1 `entityId`) и служебной `idempotency_keys`. Файлы: `packages/db/src/schema/{entity,edges,identity,activity,contact}.ts` + `idempotency.ts`. Конвенции зеркалят `agent.ts`/`knowledge.ts`/`journal.ts` (00-SC §3).

### 1.1 Enum (файл `enums.ts`) — ядро **вводит** базовый набор §2.1

Ядро #01 — тот, кто **первым добавляет** в `enums.ts` блок графа (append-only, как помечено в файле: «never reorder/remove»). Это не diff к чужому — это первичное определение из 00-SC §2.1, дословно:

```ts
// enums.ts — ДОБАВИТЬ (Core graph, фаза 0). pgEnum'ы объявляются в schema/{entity,edges,identity,activity}.ts.
// Append-only string unions backing Postgres pgEnums; NEVER reorder/remove values.

export const entityKindValues = [
	"note", "email", "email_thread", "message", "channel", "task", "project", "area",
	"calendar_event", "agent_session", "activity_event", "feed", "feed_item", "file",
	"design_artifact", "contact", "osint_entity", "tag", "journal",
] as const;
export const entityKindEnum = z.enum(entityKindValues);
export type EntityKind = z.infer<typeof entityKindEnum>;

export const edgeRelationValues = [
	"links_to", "derived_from", "attached_to", "scheduled_as", "blocks", "mentions",
	"authored_by", "participant_of", "replies_to", "child_of", "tagged_with", "about",
	"references", "embeds", "captured_from",
] as const;
export const edgeRelationEnum = z.enum(edgeRelationValues);
export type EdgeRelation = z.infer<typeof edgeRelationEnum>;

export const entityStatusValues = ["active", "archived", "trashed"] as const;
export const entityStatusEnum = z.enum(entityStatusValues);
export type EntityStatus = z.infer<typeof entityStatusEnum>;

export const identityKindValues = ["email", "chat", "attendee", "git", "selector", "phone", "domain"] as const;
export const identityKindEnum = z.enum(identityKindValues);
export type IdentityKind = z.infer<typeof identityKindEnum>;

export const activityEventKindValues = ["screen_block", "app_usage", "session", "calendar", "comms", "feed_read", "journal", "file_op"] as const;
export const activityEventKindEnum = z.enum(activityEventKindValues);
export type ActivityEventKind = z.infer<typeof activityEventKindEnum>;
```

> **newEnumValues итог:** ядро вводит 5 наборов: `entityKindValues`, `edgeRelationValues`, `entityStatusValues`, `identityKindValues`, `activityEventKindValues`. Доменные спеки далее их только **расширяют** (никогда не переупорядочивают). `idempotency_keys` своего enum не требует.

### 1.2 `entities` — универсальный узел (файл `schema/entity.ts`)

Дословно по 00-SC §2.2. Тип провенанса берётся из **нейтрального** `schema/_shared.ts` (НЕ из доменного `knowledge.ts`) — см. ниже «Источник `SourceRef`-типа».

#### 1.2.0 Источник `SourceRef`-типа (`schema/_shared.ts`) — нейтральный слой ядра

**Зачем (исправление реверс-зависимости).** 00-SC §0/§5 фиксирует инвариант: *ядро НЕ зависит ни от одной доменной подсистемы — они зависят от него*. Файл `knowledge.ts` — это detail-домен PKM (#03, таблица `knowledge_documents`), а не общий слой. Если канон ядра (`entity.ts`) импортирует `KnowledgeSourceRef` из `knowledge.ts`, возникает запрещённая реверс-зависимость ядро→домен, и `knowledge.ts` нельзя промоутить/депрекейтить (#03 migrate) без поломки компиляции ядра. Хотя 00-SC §2.2 в иллюстративном фрагменте показывает `$type<KnowledgeSourceRef>`, **источник** этого типа спека обязана зафиксировать в нейтральном месте.

**Решение.** Завести `packages/db/src/schema/_shared.ts` — структурный тип провенанса узла, не принадлежащий ни одному домену. Ядро владеет им; `knowledge.ts` (#03) при миграции **реэкспортирует** его как алиас (`export type KnowledgeSourceRef = EntitySourceRef`) для обратной совместимости — направление зависимости становится домен→ядро.

```ts
// packages/db/src/schema/_shared.ts
// Нейтральные структурные типы ядра графа. НЕ импортирует ни одного доменного файла.
// Провенанс узла: откуда узел появился (capture-run, импорт, conversation, файл и т.п.).
// Открытый record-хвост — домены кладут свои поля, не расширяя тип ядра.
export type EntitySourceRef = {
	conversationId?: string;
	runId?: string;
	importBatchId?: string;
	filePath?: string;
	url?: string;
	provider?: string;
} & Record<string, unknown>;
```

> **Совместимость с #03.** До миграции knowledge→entities `knowledge.ts` сохраняет собственный `KnowledgeSourceRef`; форма структурно совместима с `EntitySourceRef` (поля опциональны + record-хвост). После миграции #03 заменяет своё определение на `export type KnowledgeSourceRef = EntitySourceRef` из `_shared.ts`. Ядро на `knowledge.ts` не ссылается ни на одном этапе.

```ts
// packages/db/src/schema/entity.ts
import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import type { EntitySourceRef } from "./_shared"; // нейтральный тип провенанса (НЕ из knowledge.ts)
import { entityKindValues, entityStatusValues } from "./enums";
import { v2Projects } from "./schema";

export const entityKind = pgEnum("entity_kind", entityKindValues);
export const entityStatus = pgEnum("entity_status", entityStatusValues);

export const entities = pgTable(
	"entities",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		v2ProjectId: uuid("v2_project_id").references(() => v2Projects.id, { onDelete: "set null" }),
		kind: entityKind().notNull(),
		slug: text(), // для линкуемых kind (note/contact/tag/...)
		title: text().notNull(),
		markdown: text(), // для note-подобных
		body: jsonb().$type<Record<string, unknown>>(),
		storageRef: jsonb("storage_ref").$type<{ bucket?: string; key?: string; mime?: string; size?: number }>(),
		sourceRef: jsonb("source_ref").$type<EntitySourceRef>(),
		status: entityStatus().notNull().default("active"),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
	},
	(t) => [
		index("entities_org_idx").on(t.organizationId),
		index("entities_kind_idx").on(t.kind),
		index("entities_project_idx").on(t.v2ProjectId),
		// Естественный ключ линкуемого узла: (org, kind, slug) при заданном slug.
		uniqueIndex("entities_org_kind_slug_uniq").on(t.organizationId, t.kind, t.slug).where(sql`${t.slug} IS NOT NULL`),
	],
);

export type InsertEntity = typeof entities.$inferInsert;
export type SelectEntity = typeof entities.$inferSelect;
```

### 1.3 `edges` — типизированные связи (файл `schema/edges.ts`)

Дословно по 00-SC §2.3. Носитель «промоута» (`derived_from`) и неразрешённых wikilink (`targetSlug`+`resolved=false`).

```ts
// packages/db/src/schema/edges.ts
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { entities } from "./entity";
import { edgeRelationValues } from "./enums";

export const edgeRelation = pgEnum("edge_relation", edgeRelationValues);

export const edges = pgTable(
	"edges",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		sourceEntityId: uuid("source_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
		targetEntityId: uuid("target_entity_id").references(() => entities.id, { onDelete: "set null" }), // null = unresolved
		targetSlug: text("target_slug"), // сырой [[wikilink]] пока не резолвлен
		resolved: boolean().notNull().default(false),
		relation: edgeRelation().notNull(),
		metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("edges_org_idx").on(t.organizationId),
		index("edges_source_idx").on(t.sourceEntityId),
		index("edges_target_idx").on(t.targetEntityId),
		index("edges_relation_idx").on(t.relation),
		// Дедуп ребра: (source, target, relation). NB: NULL target не конфликтует в Postgres —
		// несколько unresolved рёбер одного relation допускаются (различаются targetSlug, см. §3.1/R3).
		uniqueIndex("edges_source_target_relation_uniq").on(t.sourceEntityId, t.targetEntityId, t.relation),
	],
);

export type InsertEdge = typeof edges.$inferInsert;
export type SelectEdge = typeof edges.$inferSelect;
```

### 1.4 `identity_links` — резолв контактов (файл `schema/identity.ts`, D6)

Дословно по 00-SC §2.4. `contactEntityId` целит в узел kind=`contact`.

```ts
// packages/db/src/schema/identity.ts
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { entities } from "./entity";
import { identityKindValues } from "./enums";

export const identityKind = pgEnum("identity_kind", identityKindValues);

export const identityLinks = pgTable(
	"identity_links",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		contactEntityId: uuid("contact_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }), // kind=contact
		kind: identityKind().notNull(),
		value: text().notNull(), // адрес/хендл/селектор
		verified: boolean().notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("identity_links_contact_idx").on(t.contactEntityId),
		// Один (kind,value) на org резолвится ровно в один контакт.
		uniqueIndex("identity_links_org_kind_value_uniq").on(t.organizationId, t.kind, t.value),
	],
);

export type InsertIdentityLink = typeof identityLinks.$inferInsert;
export type SelectIdentityLink = typeof identityLinks.$inferSelect;
```

### 1.5 `activity_events` — append-only спина timeline (файл `schema/activity.ts`, D7)

Дословно по 00-SC §2.5. Пишется через `recordActivity()`; контракт payload — на него опирается #08 (capture) и подсистема 12 (STT/overlay, 00-SC §4 A4).

```ts
// packages/db/src/schema/activity.ts
import { index, integer, jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity";
import { activityEventKindValues } from "./enums";

export const activityEventKind = pgEnum("activity_event_kind", activityEventKindValues);

export const activityEvents = pgTable(
	"activity_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
		ts: timestamp({ withTimezone: true }).notNull(),
		durationMs: integer("duration_ms"),
		kind: activityEventKind().notNull(),
		sourceEntityId: uuid("source_entity_id").references(() => entities.id, { onDelete: "set null" }),
		payload: jsonb().$type<{ app?: string; window?: string; url?: string; summary?: string; frameRefs?: string[] }>().notNull().default({}),
	},
	(t) => [
		index("activity_events_user_ts_idx").on(t.userId, t.ts),
		index("activity_events_kind_idx").on(t.kind),
		index("activity_events_source_idx").on(t.sourceEntityId),
	],
);

export type InsertActivityEvent = typeof activityEvents.$inferInsert;
export type SelectActivityEvent = typeof activityEvents.$inferSelect;
```

### 1.6 Detail-таблица `contacts` (1:1 `entityId`, файл `schema/contact.ts`)

Единственный detail, который ядро поставляет сразу: контакт — мишень `identity_links` и рёбер `authored_by`/`mentions`/`participant_of`. Узел (kind=`contact`) пишет graph-сервис; здесь — detail 1:1.

```ts
// packages/db/src/schema/contact.ts
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity";

/** Сведённый контакт-узел: отображаемое имя из identity-резолва + произвольные поля. */
export const contacts = pgTable(
	"contacts",
	{
		// PK == FK на узел графа (1:1). Узел пишет graph-сервис; здесь только detail.
		entityId: uuid("entity_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		displayName: text("display_name").notNull(),
		primaryEmail: text("primary_email"),
		avatarUrl: text("avatar_url"),
		// Привязка к платформенному пользователю Rox, если контакт — это участник org.
		linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }),
		isSelf: boolean("is_self").notNull().default(false), // контакт текущего юзера (для authored_by)
		fields: jsonb().$type<Record<string, unknown>>().notNull().default({}), // org/title/phone/social
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
	},
	(t) => [
		index("contacts_org_idx").on(t.organizationId),
		index("contacts_linked_user_idx").on(t.linkedUserId),
		index("contacts_primary_email_idx").on(t.primaryEmail),
	],
);

export type InsertContact = typeof contacts.$inferInsert;
export type SelectContact = typeof contacts.$inferSelect;
```

### 1.7 Служебная `idempotency_keys` (файл `schema/idempotency.ts`) — закрывает ОВ-1

```ts
// packages/db/src/schema/idempotency.ts
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

/**
 * Реестр идемпотентности POST-мутаций с побочкой (graph.create/promote и доменные
 * create/import). Ключ уникален в пределах (org, scope, key); результат закэширован для
 * возврата того же ответа при повторе. Записывается В ТОЙ ЖЕ транзакции, что и эффект.
 */
export const idempotencyKeys = pgTable(
	"idempotency_keys",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Логическая область (например "graph.create", "note.create", "agentSession.import").
		scope: text().notNull(),
		key: text().notNull(), // idempotencyKey от клиента (uuid)
		// Идентификатор созданного результата (как правило entityId) + опц. снимок ответа.
		resultEntityId: uuid("result_entity_id"),
		result: jsonb().$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("idempotency_keys_org_idx").on(t.organizationId),
		uniqueIndex("idempotency_keys_org_scope_key_uniq").on(t.organizationId, t.scope, t.key),
	],
);

export type InsertIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type SelectIdempotencyKey = typeof idempotencyKeys.$inferSelect;
```

### 1.8 Relations (файл `relations.ts` — расширить)

Добавить drizzle-relations (паттерн как `knowledgeDocumentsRelations`): `entitiesRelations` (org, v2Project, createdByUser, `outgoingEdges`/`incomingEdges` через `edges`, `contact` one, `identityLinks` many, `activityEvents` many), `edgesRelations` (org, source/target entity), `identityLinksRelations` (org, contact), `activityEventsRelations` (org, user, sourceEntity), `contactsRelations` (org, entity, linkedUser). И зарегистрировать `entities`/`edges`/`identityLinks`/`activityEvents` в `organizationsRelations.many(...)`.

### 1.9 Использование ядра (kind/relation) — что ядро **вводит**, что отдаёт доменам

| Сущность | Кто пишет узел | Кто пишет detail |
|---|---|---|
| kind=`contact` | graph-сервис #01 (`resolveIdentity`) | **#01** (`contacts`) |
| kind=`tag` | graph-сервис (lazy при `#tag`) | detail не нужен (slug+title) |
| kind=`note`/`task`/`agent_session`/`email`/… | graph-сервис #01 (вызван доменом) | домены #3/4/8/10/11/15 |
| `edges` (все relation) | **только** graph-сервис #01 (`link`/`promote`/`resolveBacklinks`) | — |
| `identity_links` | **#01** (`resolveIdentity`) | — |
| `activity_events` | **#01** (`recordActivity`), наполняют #08/#11/#12 | — |

**Новые kind/relation:** ядро **вводит** полный enum §2.1 (см. §1.1). Доменные спеки 03/04/11 ничего нового в `entityKind`/`edgeRelation` не добавили (укладываются в этот набор) — подтверждено в их §1.

### 1.10 Маппинг на qdrant (контракт; индексатор — #02)

Ядро владеет **контрактом** единой коллекции; саму индексацию выполняет рантайм #02 по upsert `entities`.
- **Коллекция:** `rox_entities` (единая, не per-kind). **id точки = `entities.id`** (uuid). Distance: cosine; dim — из embedder-конфига #02.
- **Что embed-ится (по kind):** `note` → `title + "\n\n" + markdown` (plain); `contact` → `displayName + emails`; `agent_session` → `title + summary`; `task`/`email`/прочее → `title + (markdown|summary)`. Текст собирает `buildEmbedText(entity)` в ядре (чистая функция, расширяется доменами через реестр `embedTextByKind`).
- **payload (обязателен):** `{ entityId, kind, orgId, userId?: createdByUserId, v2ProjectId?, status, updatedAt }`. **Фильтр поиска:** `orgId` обязателен всегда; опц. `kind in [...]`, `v2ProjectId`, `status="active"`.
- **Реиндекс:** по изменению `entities.updatedAt` (upsert точки) и удаление точки при хард-delete узла (после `status="trashed"` + retention, политика #02). Реализация — индексатор #02; ядро экспонирует `graphSearchService.search()` (read-path) и `entityToQdrantPayload(entity)` (контракт записи).

---

## 2. API-контракты (tRPC)

**Где новый:** ядро вводит **новый** graph-сервис `packages/trpc/src/lib/graph/` (бизнес-логика, переиспользуется доменными роутерами) + **новый** тонкий `graphRouter` `packages/trpc/src/router/graph/` для прямых UI-вызовов. Регистрация в `packages/trpc/src/root.ts` как `graph: graphRouter`. Существующие роутеры не ломаются; `knowledge`-роутер позже (миграция #03) проксирует write-path сюда.

**graph-сервис (не tRPC, а библиотека)** — единственный писатель `entities`/`edges`. Сигнатуры (`packages/trpc/src/lib/graph/graph-service.ts`), все мутирующие принимают `tx` для вызова внутри доменной транзакции:

```ts
export interface GraphService {
	create(tx: Tx, input: GraphCreateInput): Promise<SelectEntity>;
	get(db: DB, p: { orgId: string; entityId?: string; kind?: EntityKind; slug?: string }): Promise<SelectEntity | null>;
	update(tx: Tx, input: GraphUpdateInput): Promise<SelectEntity>;
	archive(tx: Tx, p: { orgId: string; entityId: string; status: EntityStatus }): Promise<SelectEntity>;
	listByKind(db: DB, p: { orgId: string; kind: EntityKind; status?: EntityStatus; cursor?: string; limit: number }): Promise<{ items: SelectEntity[]; nextCursor?: string }>;
	link(tx: Tx, input: GraphLinkInput): Promise<SelectEdge>;
	promote(tx: Tx, input: GraphPromoteInput): Promise<{ entity: SelectEntity; edge: SelectEdge }>;
	resolveBacklinks(tx: Tx, p: { orgId: string; entityId: string; slug: string }): Promise<number>;
	resolveIdentity(tx: Tx, p: { orgId: string; kind: IdentityKind; value: string; displayName?: string }): Promise<{ contact: SelectEntity; created: boolean }>;
	recordActivity(tx: Tx, input: InsertActivityEvent): Promise<SelectActivityEvent>;
}
```

`GraphCreateInput = { orgId; kind; title; slug?; markdown?; body?; storageRef?; sourceRef?; v2ProjectId?; status?; createdByUserId? }`. `GraphLinkInput = { orgId; sourceEntityId; targetEntityId?; targetSlug?; relation; metadata? }`. `GraphPromoteInput = { orgId; sourceEntityId; toKind; title; markdown?; relation? (default "derived_from"); createdByUserId? }`.

### 2.1 graphRouter — процедуры (tRPC)

Все — `protectedProcedure`, org-scope через `requireActiveOrgMembership(ctx)` (как `knowledge.ts`). Запись — `dbWs.transaction`, чтение — `db`. Zod — `packages/trpc/src/router/graph/schema.ts` (переиспользует `entityKindEnum`/`edgeRelationEnum`/`entityStatusEnum`/`identityKindEnum`/`activityEventKindEnum` из `@rox/db/enums`, `knowledgeSlugSchema`/`knowledgeSourceRefSchema` из `@rox/shared/knowledge`).

| # | Процедура | Тип | Input (Zod) | Output (Zod) |
|---|---|---|---|---|
| 1 | `create` | mutation | `{ idempotencyKey: uuid, kind: entityKindEnum, title: str(1..300), slug?: knowledgeSlugSchema, markdown?: str, body?: record, storageRef?: storageRefSchema, sourceRef?: knowledgeSourceRefSchema, v2ProjectId?: uuid }` | `Entity` |
| 2 | `get` | query | `z.union([ z.object({ entityId: uuid }).strict(), z.object({ kind: entityKindEnum, slug: knowledgeSlugSchema }).strict() ])` (strict отвергает лишние/смешанные ключи → «ровно одно из») | `Entity` |
| 3 | `update` | mutation | `{ entityId: uuid, title?: str, slug?: slug, markdown?: str, body?: record, status?: entityStatusEnum, v2ProjectId?: uuid\|null }` | `Entity` |
| 4 | `archive` | mutation | `{ entityId: uuid, status: z.enum(["archived","trashed","active"]) }` | `{ entityId, status }` |
| 5 | `listByKind` | query | `{ kind: entityKindEnum, status?: entityStatusEnum=active, cursor?: uuid, limit?: int(1..100)=50 }` | `{ items: EntitySummary[], nextCursor?: uuid }` |
| 6 | `link` | mutation | `{ idempotencyKey: uuid, sourceEntityId: uuid, targetEntityId?: uuid, targetSlug?: slug, relation: edgeRelationEnum, metadata?: record }` | `Edge` |
| 7 | `promote` | mutation | `{ idempotencyKey: uuid, sourceEntityId: uuid, toKind: entityKindEnum, title: str(1..300), markdown?: str, relation?: edgeRelationEnum=derived_from }` | `{ entity: Entity, edge: Edge }` |
| 8 | `neighbors` | query | `{ entityId: uuid, depth?: int(1..2)=1, relations?: edgeRelationEnum[], limit?: int(1..500)=200 }` | `{ nodes: GraphNode[], edges: GraphEdge[], truncated: bool }` |
| 9 | `backlinks` | query | `{ slug: knowledgeSlugSchema, relation?: edgeRelationEnum=links_to }` | `Backlink[]` |
| 10 | `resolveIdentity` | mutation | `{ idempotencyKey: uuid, kind: identityKindEnum, value: str(1..320), displayName?: str(1..200) }` | `{ contactEntityId: uuid, created: bool }` |
| 11 | `search` | query | `{ query: str(1..200), kinds?: entityKindEnum[], mode?: z.enum(["semantic","keyword"])=semantic, v2ProjectId?: uuid, status?: entityStatusEnum=active, limit?: int(1..50)=25 }` | `{ hits: SearchHit[], degraded: bool }` |
| 12 | `recordActivity` | mutation | `{ idempotencyKey?: uuid, ts: timestamptz, durationMs?: int, kind: activityEventKindEnum, sourceEntityId?: uuid, payload?: activityPayloadSchema }` | `{ id: uuid }` |

Output-Zod (в `schema.ts`): `Entity = { id, kind, slug, title, markdown, body, storageRef, sourceRef, status, v2ProjectId, createdByUserId, createdAt, updatedAt }`; `EntitySummary = { id, kind, slug, title, status, updatedAt }`; `Edge = { id, sourceEntityId, targetEntityId, targetSlug, resolved, relation, metadata, createdAt }`; `GraphNode = { entityId, kind, title, slug }`; `GraphEdge = { id, sourceEntityId, targetEntityId, relation, resolved }`; `Backlink = { sourceEntityId, sourceSlug, sourceTitle, resolved }` (форма как `KnowledgeBacklink` в `@rox/shared/knowledge`); `SearchHit = EntitySummary & { score?: number, snippet?: string }`. `storageRefSchema = z.object({ bucket, key, mime, size: z.number().int() }).partial()`; `activityPayloadSchema = z.object({ app, window, url, summary }).partial().extend({ frameRefs: z.array(z.string()).optional() })`.

**Идемпотентность — атомарный протокол (общий для `create`/`promote`/`link`/`resolveIdentity`/`recordActivity`).** Наивный порядок «SELECT idempotency_keys → промах → INSERT эффект → INSERT ключа» НЕ потокобезопасен: два конкурентных запроса с одним `idempotencyKey` оба проходят SELECT, оба создают эффект (дубль entity/edge), и лишь второй INSERT ключа падает на `idempotency_keys_org_scope_key_uniq` — но дубль уже создан, а ответом будет 5xx вместо закэшированного результата. Правильный рецепт (в той же транзакции, что и эффект):

```
1. INSERT INTO idempotency_keys (org, scope, key) VALUES (...)
   ON CONFLICT (organization_id, scope, key) DO NOTHING
   RETURNING id;                                  -- "claim" ключа
2a. Если строка ВЕРНУЛАСЬ (ключ наш, первый раз):
      выполнить основной эффект (INSERT entities/edges/...) В ТОЙ ЖЕ транзакции;
      UPDATE idempotency_keys SET result_entity_id=..., result=... WHERE id=<claimed>;
      COMMIT → вернуть свежесозданный результат.
2b. Если строка НЕ вернулась (конфликт — повтор/гонка):
      SELECT result_entity_id, result FROM idempotency_keys WHERE (org,scope,key)=...;
      - если result уже проставлен → вернуть закэшированный результат (200), эффект не повторять;
      - если result ещё NULL (конкурент в полёте, эффект не закоммичен) →
        короткий retry-poll (до N×backoff) ИЛИ вернуть 409/ASYNC-маркер «in progress»;
        unique-violation НИКОГДА не транслируется в 5xx.
```

Так дубль entity/edge физически невозможен (ключ застолбён до эффекта), а конкурентный повтор получает один и тот же `resultEntityId`. `link` дополнительно защищён `ON CONFLICT DO NOTHING` на `(source,target,relation)` для resolved-ветки (см. правило 6).

**Бизнес-правила / валидации / коды ошибок (по процедуре):**

1. **`create`** — **идемпотентность обязательна** (POST с побочкой, 00-SC §3) по атомарному протоколу выше (scope `graph.create`). Порядок внутри транзакции: (a) если `markdown` задан — `assertMdxSafe(markdown)`; (b) **claim** ключа `INSERT idempotency_keys ... ON CONFLICT (org,scope,key) DO NOTHING RETURNING` — если НЕ застолбён (конфликт) → ветка 2b (вернуть закэшированный `resultEntityId`-сущность, без второй вставки, 200); (c) при заданном линкуемом `slug` — проверка уникальности `(org,kind,slug)` → `CONFLICT` при занятости; (d) `INSERT entities`; (e) `UPDATE idempotency_keys SET result_entity_id=<новый>`. **Лимит размера:** перед (d) — `Buffer.byteLength(JSON.stringify({ markdown: markdown ?? "", body: body ?? {} }), "utf8") > MAX_INLINE_BYTES` (константа `MAX_INLINE_BYTES = 4 * 1024 * 1024`, **байты UTF-8, не символы**) → `PAYLOAD_TOO_LARGE` (крупное — в minio через `storageRef`). Ошибки: `UNAUTHORIZED` (нет org), `BAD_REQUEST` (невалидный slug/MDX), `CONFLICT` (slug занят), `PAYLOAD_TOO_LARGE`.
2. **`get`** — input — **strict discriminated union** `z.union([z.object({entityId}).strict(), z.object({kind, slug}).strict()])`: `.strict()` отвергает объект, где заданы оба набора ключей или лишние поля, поэтому правило «ровно одно из» обеспечивается **самим Zod на границе** (не ручной пост-проверкой); пустой объект / смешанные ключи → Zod-`BAD_REQUEST`. `NOT_FOUND` если чужая org или нет узла. `trashed` возвращается (помечен `status`).
3. **`update`** — частичный апдейт; `assertMdxSafe` при наличии `markdown`; смена `slug` → проверка уникальности + после апдейта `resolveBacklinks` для нового slug + переписать `edges.targetSlug` входящих unresolved. `NOT_FOUND`/`CONFLICT`/`BAD_REQUEST`. (Optimistic concurrency на уровне `revision` — у доменов с телом, например notes; ядро `entities` версионирование не навязывает.)
4. **`archive`** — мост к смене `entities.status`; идемпотентно (тот же status → 200 без изменений). Узел и рёбра сохраняются. `NOT_FOUND`.
5. **`listByKind`** — keyset по `(updatedAt desc, id)`; фильтр org обязателен; `status` по умолчанию `active`. **cache-first** (00-SC §3): серверный list — первичная гидратация, клиент рендерит из Electric-кэша. `UNAUTHORIZED` без org.
6. **`link`** — идемпотентность зависит от ветки:
   - **resolved** (`targetEntityId` задан): дедуп по уникальному `(source,target,relation)` через `ON CONFLICT DO NOTHING → возврат существующего` **плюс** `idempotencyKey` (scope `graph.link`).
   - **unresolved** (`targetSlug`, `targetEntityId=NULL`): в Postgres NULL в `targetEntityId` НЕ конфликтует в `edges_source_target_relation_uniq`, поэтому уникальный индекс дедуп НЕ даёт. Защита от дублей unresolved-ребра при **прямом** `graph.link` обеспечивается **ТОЛЬКО `idempotencyKey`** (scope `graph.link`, атомарный claim-протокол выше) — это единственная защита, явно зафиксирована. (Через `syncOutgoingLinks` дубль исключён иначе — delete+insert всех исходящих, см. §3.1/R3.) Альтернатива на будущее (ОВ-6): частичный `uniqueIndex (source, targetSlug, relation) WHERE target IS NULL` — не вводится в v0, т.к. `targetSlug` нормализация и lazy-tag усложняют, а idempotencyKey достаточен.

   Валидация: `targetEntityId` **xor** `targetSlug` (ровно одно); если `targetEntityId` — оба узла одной org (иначе `BAD_REQUEST`); `resolved = targetEntityId != null`. `NOT_FOUND` если source/target чужой org.
7. **`promote`** — единая операция «создать узел из источника + связать»: `graphService.create({ kind: toKind, ... })` + `graphService.link({ source: новый, target: sourceEntityId, relation })` (по умолчанию `derived_from`, направление «производное → источник»). Идемпотентно по `idempotencyKey` (scope `graph.promote`). `BAD_REQUEST` (пустой title), `NOT_FOUND` (нет источника).
8. **`neighbors`** — эго-граф на глубину 1–2: `entities`(узлы)+`edges`(рёбра) вокруг `entityId`, фильтр org, опц. по `relations`. `depth=2` ограничен `limit` узлов (по умолч. ≤200) → `truncated:true` при усечении. Только resolved-рёбра в граф-вью (unresolved — через `backlinks`). `NOT_FOUND`.
9. **`backlinks`** — `edges` where `targetSlug=slug` (+ опц. `relation`), join `entities`(source). Возврат формы `KnowledgeBacklink[]`, включая неразрешённые (`resolved:false`, «битые» ссылки). Без ошибок (пустой массив).
10. **`resolveIdentity`** — идемпотентно по `(org,kind,value)` (`identity_links_org_kind_value_uniq`) и `idempotencyKey`: если `identity_links`-строка есть → возврат `contactEntityId`, `created:false`. Иначе: `graphService.create({ kind:"contact", title: displayName ?? value })` → узел; `INSERT contacts` detail; `INSERT identity_links`; `created:true`. `value` нормализуется (email → lowercase). `BAD_REQUEST` (пустой value).
11. **`search`** — `mode=semantic` → `graphSearchService.search({ orgId, query, kinds, filters:{ v2ProjectId, status }, limit })` (qdrant read-path #02, фильтр payload по orgId всегда). `mode=keyword` → `ilike` по `entities.title`/`entities.markdown` (как текущий `knowledge.search`). При недоступном embedder semantic авто-падает в keyword с `degraded:true` (не throw). `BAD_REQUEST` (пустой query).
12. **`recordActivity`** — append в `activity_events` (спина timeline). Опциональная идемпотентность по `idempotencyKey` (scope `graph.activity`) для retry sidecar. `kind`/`ts` обязательны; `ts` — UTC. Пишется в local-primary (Turso, #02). Источники наполнения: #08 (capture), #11 (sessions), #12 (STT). Ребро не создаётся. `UNAUTHORIZED` без org.

**Интеграция с graph-сервисом ядра.** graph-сервис — **сам** объект интеграции: это единственный писатель `entities`/`edges`, гарантирующий инвариант «один писатель узла» (00-SC §2). Доменные роутеры (#3/4/8/10/11/15) импортируют `graphService` и зовут `create/update/link/promote/resolveBacklinks` внутри своей `dbWs.transaction`, дописывая лишь detail-таблицы.

### 2.2 Rate-limit (новый артефакт ядра: `packages/trpc/src/lib/rate-limit.ts`)

Grep по `packages/trpc/src` подтвердил: готового rate-limit middleware в репо НЕТ (единственное упоминание — несвязанный `support.ts`). Поэтому ядро **вводит его как явный новый артефакт** (а не подвешивает). Альтернатива «вынести в #02» отклонена: лимит применяется на tRPC-границе ядра (graph-процедуры), а не на инфра-уровне; backing store при этом поставляет #02 (см. ниже).

**Файл/форма.** `packages/trpc/src/lib/rate-limit.ts` экспортирует `rateLimit(opts)` — фабрику tRPC-middleware (`t.middleware`), оборачивающую `protectedProcedure`:

```ts
// packages/trpc/src/lib/rate-limit.ts
export interface RateLimitOptions {
	/** Логический бакет процедуры (входит в ключ счётчика). */
	bucket: string;
	/** Лимит запросов в окне. */
	limit: number;
	/** Длина скользящего окна в мс. */
	windowMs: number;
}
// Ключ счётчика = `${orgId}:${userId}:${bucket}` (per-user + per-org, НЕ per-IP — за authn-границей).
// Алгоритм: sliding-window-counter (две смежных ячейки fixed-window с интерполяцией) — детерминирован, без гонок инкремента.
// Backing store: общий Redis (#02, env REDIS_URL) через атомарный INCR+PEXPIRE в Lua-скрипте;
//   при отсутствии REDIS_URL (dev/local) — in-memory Map-фолбэк (per-process, не распределённый), помечается в логе.
// Превышение → throw TRPCError({ code: "TOO_MANY_REQUESTS" }) c data.retryAfterMs;
//   tRPC↔HTTP-слой (apps/api) мапит TOO_MANY_REQUESTS → HTTP 429 + заголовок `Retry-After: ceil(retryAfterMs/1000)`.
export function rateLimit(opts: RateLimitOptions): TRPCMiddleware;
```

**Применение по процедурам (per-user, скользящее окно):**

| Процедура(ы) | bucket | limit | windowMs | Примечание |
|---|---|---|---|---|
| `create`, `update`, `promote` | `graph.write` | 120 | 60_000 | обычная пользовательская запись |
| `link`, `resolveIdentity` | `graph.link` | 240 | 60_000 | пакетный синк wikilink/участников |
| `recordActivity` | `graph.activity` | 6_000 | 60_000 | **повышенный** лимит — высокочастотный sidecar-поток (#08/#11/#12) |
| `search` | `graph.search` | 60 | 60_000 | защита от перебора по корпусу |
| query-only (`get`/`listByKind`/`neighbors`/`backlinks`) | — | — | — | rate-limit N/A (read, cache-first) |

**Зависимость от #02:** backing store (Redis) поставляет рантайм #02 (`REDIS_URL` в env, 00-SC §2/A-инфра); сам middleware-артефакт и алгоритм — **в ядре** (этот файл). DI: `rateLimit` читает клиент из ctx (`ctx.redis?`), фолбэк in-memory — внутри артефакта. Это снимает подвешенность находки: путь, алгоритм, store, ключ и лимиты per-procedure зафиксированы здесь.

---

## 3. Сервисы/процессы/протоколы

### 3.1 graph-сервис: backlink-резолвер на ядре (порт `knowledge/backlinks.ts`)

Чистая логика рёбер живёт в `packages/trpc/src/lib/graph/links.ts` (порт `knowledge/backlinks.ts`, но на `edges` вместо `knowledge_links`):
- `syncOutgoingLinks(tx, { orgId, sourceEntityId, markdown })` — `extractWikiLinkTargets(markdown)` + `extractTags(markdown)`; **delete+insert** исходящих `edges` relation∈{`links_to`,`tagged_with`} для source. `links_to`-резолв slug'а: **не захардкожен на kind=note** — `uniqueIndex` ключ это `(org,kind,slug)`, поэтому один slug может жить в нескольких линкуемых kind (`note`/`contact`/`tag`/…). Стратегия выбора (детерминированная):
  1. `SELECT id, kind FROM entities WHERE org=? AND slug=? AND status='active'` среди **всех линкуемых kind**;
  2. 0 совпадений → unresolved (`targetSlug`+`resolved=false`);
  3. ровно 1 → `targetEntityId`+`resolved=true`;
  4. >1 (slug в разных kind) → выбрать по фиксированному приоритету kind `["note","contact","tag","project","area"]` (заметки приоритетны для wikilink), при равенстве — наименьший `createdAt`; ребро `resolved=true` на выбранный узел, метаданные ребра несут `{ ambiguous: true, candidateKinds:[...] }` для UI-дизамбигуации.

  Это поддерживает `[[some-contact]]`/`[[area-slug]]`, а не только заметки. `tagged_with`: lazy-создание `tag`-узла (kind=`tag`, slug=нормализованный тег) + ребро. Реализует «один [[wikilink]] → одно ребро».
- `resolveIncomingLinks(tx, { orgId, entityId, slug })` — back-fill: `UPDATE edges SET targetEntityId=entityId, resolved=true WHERE targetSlug=slug AND resolved=false` (org-scope). Зовётся после `create`/`update`(смена slug), как в текущем `resolveIncomingLinks`.

`Tx`-тип — `Parameters<Parameters<typeof dbWs.transaction>[0]>[0]` (как `KnowledgeTx` в `backlinks.ts`). Чистые функции `extractWikiLinkTargets`/`extractTags`/`normalizeWikiLinkTarget` — переиспользуются из `@rox/shared/knowledge` как есть.

### 3.2 identity-резолвер (`resolveIdentity`) — поток

```
[mail/chat/calendar/capture при привязке участника] → graphService.resolveIdentity(tx, { orgId, kind, value, displayName })
   → SELECT identity_links WHERE (org,kind,value)
       ├─ найдено → вернуть contactEntityId (created:false)
       └─ нет → graphService.create(kind="contact") → INSERT contacts(detail) → INSERT identity_links → (created:true)
```
Используется почтой (`kind=email`), чатом (`kind=chat`), календарём (`kind=attendee`), git/capture (`kind=git`/`selector`). `authored_by`/`participant_of`-рёбра домены создают через `graphService.link`, целясь в полученный `contactEntityId`.

### 3.3 qdrant-индексатор — контракт (реализация в #02)

Ядро НЕ держит embedder-процесс; объявляет контракт, который дёргает индексатор #02:
- **upsert точки:** на каждый `entities`-upsert (kind ∈ searchable) индексатор вызывает `buildEmbedText(entity)` (ядро) → embedder #02 → `qdrant.upsert("rox_entities", { id: entity.id, vector, payload: entityToQdrantPayload(entity) })`.
- **delete точки:** при хард-delete узла (после `status="trashed"` + retention) — `qdrant.delete`.
- **read-path:** `graphSearchService.search()` (ядро) формирует qdrant-фильтр `{ must: [{ key:"orgId", match:{ value: orgId } }, ...] }`, вызывает `qdrant.search`, мапит payload→`SearchHit`. embedder/qdrant-клиент — из `@rox/*` рантайма #02 (DI через фабрику `createGraphSearchService(deps)`).
- **Диаграмма (по 00-SC 2B `[indexer]`):** `entities upsert → indexer(#02) → buildEmbedText(#01) → embedder(provider,#02) → qdrant.upsert`. Поиск: `graph.search → graphSearchService(#01) → qdrant.search(#02) → SearchHit`.

### 3.4 Sync/realtime топология (00-SC §2E)

- **Cloud Postgres/Neon** — канон `entities`/`edges`/`identity_links`/`contacts`/`idempotency_keys` (org/командные). Вниз к клиенту — **Electric** (cache-first, 00-SC §3, AGENTS.md §9): рендерим существующие строки даже при `isReady=false`; строгую готовность ждём только для записи/seeding.
- **Turso/libSQL (local-primary)** — `activity_events` (приватная/тяжёлая спина timeline) + embedded-реплика синхронизируемого графа. Поставляется #02.
- **minio** — бинарные объекты по `storageRef` (`{bucket,key,mime,size}`), bucket `org-<orgId>` (A8); префиксы задают домены.
- **Конфликты:** `edges` append-с-дедупом (уникальный `(source,target,relation)`) → реролл идемпотентен. `entities` синхронизируется Electric (last-writer-wins на уровне узла; версионирование тела — у доменов). `activity_events` append-only → конфликтов нет. `idempotency_keys` — строго cloud-Postgres (источник истины идемпотентности), не реплицируется в Turso.

> **Sidecar/host-service:** у ядра графа **нет** собственного ОС-sidecar (N/A — ядро это БД-слой + сервис). Capture/embedder/STT-sidecar'ы — у #08/#02/#12; ядро лишь принимает их запись через `recordActivity`/qdrant-контракт. Supervision этих процессов — `host-service` (00-SC §2C), вне этой спеки.

---

## 4. UI-спецификация

Ядро — backend-слой; «своего экрана» у него нет (N/A — UI у доменов). Но ядро поставляет **переиспользуемые UI-примитивы** и серверные эндпоинты для общего граф-UI (command-bar, мини-граф), которыми пользуются все feature-модули (00-SC §2C/2D).

### 4.1 Экраны/панели (общие примитивы, не отдельный экран)

| Поверхность | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **CommandBar (поиск по графу)** | Cmd/Ctrl+K — глобальный поиск узлов | спиннер inline при пустом кэше | «Ничего не найдено» | баннер «keyword-режим» при `degraded` | результаты из `graph.search`; при `degraded:true` — баннер |
| **GraphMini (эго-сеть)** | лёгкий SVG-граф соседей узла | спиннер | «Нет связей» | inline-ретрай | узлы/рёбра из `graph.neighbors`; клик → переход |
| **BacklinksPanel** | входящие ссылки (+ битые) | спиннер inline | «Нет бэклинков» | inline | список из `graph.backlinks`; unresolved — пунктиром |
| **EntityChip / EntityPicker** | инлайн-чип узла + автокомплит `[[`/`@` | скелет-чип | «Создать ‘X’» | — | `graph.search keyword` для автокомплита |

### 4.2 UI-примитивы (packages/ui)

- **GraphMini** — `packages/ui/src/components/graph-mini/graph-mini.tsx` (SVG force-layout, без freeform-редактирования; полноценный canvas — Фаза 5/#15). Пропсы:
  ```ts
  type GraphMiniProps = {
    nodes: { entityId: string; kind: string; title: string; slug?: string }[];
    edges: { sourceEntityId: string; targetEntityId: string; relation: string }[];
    focusId: string;
    onNodeClick?: (entityId: string) => void;
    "aria-label"?: string;
  };
  ```
- **EntityPicker** — `packages/ui/src/components/entity-picker/entity-picker.tsx` (combobox поверх `command.tsx`/`popover.tsx`). Пропсы `{ value?, kinds?, onSelect: (e:{entityId;slug;title}) => void, onCreate?: (q:string) => Promise<...>, "aria-label" }`.
- **EntityChip** — `packages/ui/src/components/entity-chip/entity-chip.tsx` (бейдж узла с иконкой по kind). Пропсы `{ entityId, kind, title, onClick? }`.
- CommandBar — собственная вёрстка на существующих `command.tsx` + `dialog.tsx` (00-SC §2D).

### 4.3 User-flows (на уровне кликов)

**Flow A — глобальный поиск узла:**
1. Cmd/Ctrl+K → CommandBar, режим «Поиск по графу».
2. Ввод запроса → `graph.search semantic` (debounce 250 мс), `kinds` опц. фильтром.
3. Результаты со `score`/`snippet`; Enter → открыть узел в его feature-модуле; при `degraded:true` (embedder down) — баннер «keyword-режим».

**Flow B — связать узлы через `[[` (общий примитив для всех редакторов):**
1. В любом редакторе печать `[[` → EntityPicker открывается.
2. `onCreate?` → `graph.search keyword`; выбор цели или «Создать ‘X’».
3. Сохранение домена → `graphService.link`/`syncOutgoingLinks` пишет `edges`; BacklinksPanel цели обновляется live (Electric).

**Flow C — навигация по эго-графу:**
1. На узле открыта GraphMini (`graph.neighbors depth=1`).
2. Клик по соседнему узлу → переход; при `truncated:true` — кнопка «Показать больше» (depth=2/выше limit).

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- **CommandBar:** focus-trap в диалоге, Esc закрывает, `role="combobox"`+`aria-expanded`, стрелки ↑/↓ по результатам, Enter — выбор; видимый focus-ring (контраст ≥3:1).
- **GraphMini:** не только цвет для типа ребра (паттерн/подпись); клавиатурный обход узлов (Tab) с `aria-label` узла; текстовый эквивалент — BacklinksPanel-список (альтернатива визуальному графу).
- **EntityPicker:** `role="combobox"`/`aria-controls`, клавиатурная навигация опций, Esc, объявление выбранного через `aria-live`.
- Контраст текста ≥4.5:1; цели нажатия ≥24×24 CSS-px (WCAG 2.2 «Target Size»); все интерактивы — `<button>`/`<a>`; `axe-core` в CI на CommandBar/GraphMini.

---

## 5. Миграция и обратная совместимость

Ядро — **аддитивная** миграция: новые таблицы (`entities`, `edges`, `identity_links`, `activity_events`, `contacts`, `idempotency_keys`) + новые pgEnum (`entity_kind`, `edge_relation`, `entity_status`, `identity_kind`, `activity_event_kind`). Существующие `knowledge_documents`/`knowledge_links`/`agent_sources`/`economy.*`/`journal_entries` — **не изменяются** (ядро их не трогает; promote knowledge→entities выполняет миграция #03, не эта).

**Имя миграции (drizzle-kit generate):** изменить `packages/db/src/schema/{_shared,enums,entity,edges,identity,activity,contact,idempotency,relations,index}.ts`, затем `bunx drizzle-kit generate --name="core_graph_foundation"` (offline diff, 00-SC §3 — миграции руками не править). Добавить экспорт новых файлов в `packages/db/src/schema/index.ts` (`_shared.ts` экспортирует только типы — на SQL-миграцию не влияет).

**Backfill:** ядру backfill **не нужен** (новые таблицы пусты на старте). Доменные миграции (promote `knowledge_documents` → `entities` kind=`note`) — у #03 (`migrate-knowledge-to-notes.ts`), идемпотентны по `(orgId,kind,slug)` через `entities_org_kind_slug_uniq`.

**Обратная совместимость:** новых обязательных полей в существующих таблицах нет → старые клиенты работают. Тип провенанса узла ядро вводит как нейтральный `EntitySourceRef` (`schema/_shared.ts`, §1.2.0) — структурно совместим с существующим `KnowledgeSourceRef`; миграция #03 заменяет `KnowledgeSourceRef` на реэкспорт-алиас `EntitySourceRef` (домен→ядро), ядро `knowledge.ts` не импортирует. Форма `KnowledgeBacklink` переиспользуется (один тип), slug-схема `knowledgeSlugSchema` сохранена — контент доменов не ломается при последующем промоуте.

**Что депрекейтится:** ничего в фазе 0 (ядро — новый слой). Депрекейт `knowledge`-write-path → у #03 после переключения чтения.

**Откат (down, концептуально):** `core_graph_foundation` обратима — `DROP TABLE idempotency_keys, contacts, activity_events, identity_links, edges, entities; DROP TYPE activity_event_kind, identity_kind, entity_status, edge_relation, entity_kind;` (в порядке, обратном FK). Поскольку таблицы новые и пустые до доменного backfill, потери данных нет; drizzle генерирует прямую миграцию, концептуальный «down» = ручной reverse-скрипт, тестируется на neon-branch перед прод-деплоем. Если домены уже наполнили граф — откат блокируется (нужен экспорт), что и ожидается для foundation-таблицы.

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Given** активная org, **When** `graph.create` kind=`note` с уникальным slug, **Then** появляется ровно одна `entities`-строка (kind=`note`, status=`active`); повтор с тем же `idempotencyKey` возвращает ту же сущность без второй вставки (`idempotency_keys` зафиксировал).
2. **Given** узел A и узел B одной org, **When** `graph.link(A→B, relation="links_to")`, **Then** создаётся `edges`-строка (`resolved=true`, `targetEntityId=B`); повтор того же `(source,target,relation)` — no-op (ON CONFLICT), без дубля.
3. **Given** ребро на несуществующий slug `other`, **When** позже `graph.create` kind=`note` slug=`other`, **Then** `resolveIncomingLinks` авто-резолвит входящее ребро (`resolved=true`, `targetEntityId` проставлен).
4. **Given** заметка с телом `[[other]]` и `#идея`, **When** `syncOutgoingLinks`, **Then** есть `edges links_to`(target `other`) и `edges tagged_with` на lazy-узел kind=`tag` slug=`идея`.
5. **Given** контакт ещё не создан, **When** `graph.resolveIdentity(kind="email", value="A@X.com")`, **Then** создаётся `entities` kind=`contact` + `contacts` detail + `identity_links`(value lowercased `a@x.com`), `created:true`; повтор → тот же `contactEntityId`, `created:false`.
6. **Given** узел `note`, **When** `graph.promote(toKind="task", relation="derived_from")`, **Then** создан `entities` kind=`task` + ребро `derived_from` (task→note); ответ содержит `{entity, edge}`; идемпотентно по ключу.
7. **Given** узел с 3 соседями, **When** `graph.neighbors depth=1`, **Then** возвращены узел + 3 соседа + рёбра; при превышении `limit` — `truncated:true`.
8. **Given** проиндексированный граф, **When** `graph.search semantic kinds=["note"]`, **Then** hits отфильтрованы по `orgId` (payload-фильтр); при недоступном embedder ответ `degraded:true` в keyword-режиме (без throw).
9. **Given** узел, **When** `graph.archive status="trashed"`, **Then** `entities.status='trashed'`, узел исчезает из `listByKind` (по умолч. active), но доступен в `get`; рёбра сохранены.
10. **Given** sidecar capture, **When** `graph.recordActivity(kind="screen_block", ts, frameRefs)`, **Then** добавлена `activity_events`-строка (append-only) в local-primary; ребро не создаётся; повтор с тем же `idempotencyKey` — no-op.
11. **Given** узел org A, **When** любой `graph.*` с узлом A пользователем org B, **Then** `NOT_FOUND`/`UNAUTHORIZED`, данные A не возвращаются (org-изоляция).
12. **Given** клиент с пустым Electric-кэшем и `isReady=false`, **When** в кэше уже есть строки `entities`, **Then** CommandBar/список рендерит их немедленно (cache-first), не показывая скелет (AGENTS.md §9).
13. **Given** два **параллельных** `graph.create` с одним `idempotencyKey` (и одинаковым телом), **When** обе транзакции коммитят, **Then** в `entities` ровно ОДНА строка, обе процедуры возвращают один и тот же `entityId`, ни одна не падает 5xx на unique-violation ключа (атомарный claim-протокол §2.1).
14. **Given** узел `note` со slug `old` и входящее unresolved-ребро с `targetSlug='old'`, плюс входящее resolved-ребро, **When** `graph.update` меняет slug на `new`, **Then** входящие unresolved-рёбра, целившие `old`, переписаны (`targetSlug` → `new` либо back-fill `targetEntityId`+`resolved=true` через `resolveIncomingLinks` для нового slug), а `(org,kind,new)` уникален (иначе `CONFLICT`).
15. **Given** slug `acme` существует и как kind=`note`, и как kind=`contact`, **When** `syncOutgoingLinks` резолвит `[[acme]]`, **Then** ребро `resolved=true` указывает на `note`-узел (приоритет kind), а `metadata.ambiguous=true` с перечнем `candidateKinds` (§3.1).
16. **Then** все времена — `timestamptz` (UTC); денежных полей в ядре нет (N/A); миграция сгенерирована `drizzle-kit generate` (не правлена руками); `$inferInsert`/`$inferSelect` экспортированы для всех таблиц.
17. **Then** `bun run lint` = 0 (CI = 0 warnings), `bun run typecheck` = 0; новые pgEnum зарегистрированы, `relations.ts` расширен без ошибок.

---

## 7. Тест-план

**Unit** (`bun test`, без БД):
- `packages/trpc/src/lib/graph/links.test.ts` — `syncOutgoingLinks`/`resolveIncomingLinks` на моках `tx`: `[[wikilink]]`→`links_to`, `#tag`→`tag`-узел+`tagged_with`, resolved/unresolved (AC2–AC4). Порт `knowledge.test.ts` на ядро.
- `packages/trpc/src/router/graph/schema.test.ts` — Zod-границы: union `get`, xor `link` (`targetEntityId`/`targetSlug`), enum'ы, лимиты, reject невалидных.
- `buildEmbedText`/`entityToQdrantPayload`/`normalizeIdentityValue` — чистые функции (payload-форма, email-lowercase, embed-текст по kind).
- Idempotency-логика `create`/`promote` (мок `idempotency_keys`) — повторный ключ → один insert (AC1, AC6); claim-протокол `ON CONFLICT DO NOTHING RETURNING` → ветка 2b возвращает закэшированный результат, не 5xx.
- `rate-limit.ts` — sliding-window-counter на in-memory store: превышение `limit` в окне → `TOO_MANY_REQUESTS` c `retryAfterMs`; ключ `org:user:bucket`; разные bucket независимы.
- `PAYLOAD_TOO_LARGE` — `Buffer.byteLength(JSON.stringify(...), "utf8")` граница на `MAX_INLINE_BYTES` (4 МБ, байты UTF-8, multi-byte символы у́читываются), AC1.
- `get`-Zod strict union: `{entityId}` ок, `{kind,slug}` ок, `{entityId,kind,slug}`/`{}`/лишний ключ → reject (AC2 строгость).

**Integration** (tRPC + Drizzle на **neon-branch**, фикстуры org/user; паттерн как `knowledge.test.ts`):
- Фикстура: новый neon-branch (root `.env` → branch, **не прод**; AGENTS.md «DB migrations»), прогон миграции `core_graph_foundation`, seed org+user.
- `graph.create/get/update/archive/listByKind` happy-path + ошибки (`CONFLICT`/`NOT_FOUND`/`BAD_REQUEST`) против реальных `entities`.
- `graph.link`/`promote` — рёбра `links_to`/`derived_from`, дедуп `(source,target,relation)` (AC2, AC6); unresolved-ветка: повтор `link` с тем же `idempotencyKey` → один edge (защита только ключом, §2.1 правило 6).
- **Конкурентная идемпотентность:** два параллельных `graph.create` с одним `idempotencyKey` (`Promise.all`) → ровно одна `entities`-строка, один `entityId`, без 5xx (AC13).
- **Rename slug:** `update` со сменой slug → входящие unresolved-рёбра переписаны/back-fill, уникальность `(org,kind,slug)` (AC14).
- **Ambiguous wikilink:** slug в двух kind → `syncOutgoingLinks` выбирает по приоритету + `metadata.ambiguous` (AC15).
- **429:** превышение rate-limit на `graph.create` → `TOO_MANY_REQUESTS`/HTTP 429 + `Retry-After` (мок store).
- `resolveIdentity` — создание `contact`+`identity_links`+`contacts`, идемпотентность по `(org,kind,value)` (AC5).
- `neighbors`/`backlinks` — эго-граф + битые ссылки (AC7, AC3).
- `recordActivity` — append в `activity_events`, идемпотентность (AC10).
- org-изоляция: вызовы с чужим org → `NOT_FOUND`/`UNAUTHORIZED` (AC11).
- `search` keyword-fallback при отсутствии embedder (`degraded:true`, AC8) — мок embedder-клиента.

**e2e** (Playwright, `apps/web`): Flow A (Cmd+K поиск + degraded-баннер), Flow B (связать узлы `[[` + live-бэклинк), Flow C (GraphMini-навигация).

**Команды:**
```bash
bun test packages/trpc/src/lib/graph            # unit (links/embed/idempotency)
bun test packages/trpc/src/router/graph         # integration (neon-branch via .env)
bun test packages/db                            # smoke миграции/типы
bun run lint && bun run typecheck               # обязательный pre-merge gate (CI=0 warnings)
```
**Целевое покрытие изменённого кода ≥80% веток** (graph-сервис, `links.ts`, idempotency, search-fallback, resolveIdentity). Smoke перед push: `bun test packages/db packages/trpc/src/lib/graph packages/trpc/src/router/graph`.

---

## 8. Задачи реализации (ordered work-list, PR-able срезы)

1. **PR-1 — Enum + таблицы ядра.** `packages/db/src/schema/_shared.ts` (`EntitySourceRef`, §1.2.0), `enums.ts` (+5 наборов §1.1), `schema/{entity,edges,identity,activity}.ts` (§1.2–1.5), экспорт в `schema/index.ts`, `relations.ts` (§1.8). `bunx drizzle-kit generate --name="core_graph_foundation"`. Без зависимостей (foundation).
2. **PR-2 — contacts + idempotency.** `schema/{contact,idempotency}.ts` (§1.6–1.7), экспорт + relations; включить в ту же или следующую generate-миграцию. Зависит от PR-1.
3. **PR-3 — graph-сервис (ядро).** `packages/trpc/src/lib/graph/{graph-service,links,idempotency,index}.ts`: `create/get/update/archive/listByKind/link/promote/resolveBacklinks/resolveIdentity/recordActivity` + `syncOutgoingLinks`/`resolveIncomingLinks` (§3.1) + `buildEmbedText`/`entityToQdrantPayload`. Unit-тесты. Зависит от PR-1, PR-2.
4. **PR-4 — graphRouter (tRPC) + rate-limit.** `packages/trpc/src/router/graph/{schema,graph,index}.ts`; процедуры 1–12 (§2.1) поверх graph-сервиса; rate-limit middleware `packages/trpc/src/lib/rate-limit.ts` (§2.2) на write/search-процедуры с лимитами из таблицы; регистрация в `packages/trpc/src/root.ts` как `graph`. Integration-тесты на neon-branch (в т.ч. 429-кейс с моком store). Зависит от PR-3.
5. **PR-5 — search read-path + qdrant-контракт.** `packages/trpc/src/lib/graph/search.ts` (`createGraphSearchService(deps)`, DI embedder/qdrant-клиента #02), keyword-fallback (`degraded`). Контракт `entityToQdrantPayload`/`buildEmbedText` для индексатора #02. Зависит от PR-3, координация с #02.
6. **PR-6 — UI-примитивы.** `packages/ui/src/components/{graph-mini,entity-picker,entity-chip}/`; CommandBar-вёрстка (`command.tsx`/`dialog.tsx`); axe-core в CI; WCAG-доводка (§4.4). e2e Flow A/B/C. Зависит от PR-4.

**Ключевые точки изменения файлов:** `packages/db/src/schema/{_shared,enums,entity,edges,identity,activity,contact,idempotency,relations,index}.ts`; `packages/db/drizzle/*` (только авто-генерация); `packages/trpc/src/lib/graph/*`; `packages/trpc/src/lib/rate-limit.ts` (§2.2); `packages/trpc/src/router/graph/*`; `packages/trpc/src/root.ts` (регистрация `graph`); `packages/ui/src/components/{graph-mini,entity-picker,entity-chip}/*`.

---

## 9. Риски и открытые вопросы

**Риски + митигейшн:**
- **R1. Ядро — фундамент 7 подсистем: ломающее изменение схемы каскадит.** *Митигейшн:* enum append-only (никогда не переупорядочивать); таблицы канон по 00-SC §2, изменения только через generate-миграции; контракт graph-сервиса стабилизируется до старта домена #03.
- **R2. Инвариант «один писатель узла» обходят прямым INSERT в `entities` из домена.** *Митигейшн:* graph-сервис — единственный публичный путь; ревью-правило + AC1/AC11; домены импортируют `graphService`, не `entities`-таблицу напрямую в роутерах.
- **R3. unresolved-рёбра и уникальный индекс `(source,target,relation)`.** В Postgres NULL `targetEntityId` не конфликтует → несколько unresolved одного relation возможны; дедуп таких — по `(source,targetSlug,relation)` на уровне `syncOutgoingLinks` (delete+insert), не индексом. *Митигейшн:* `syncOutgoingLinks` всегда полностью переписывает исходящие `links_to`/`tagged_with` (как текущий `backlinks.ts`).
- **R4. Стоимость/латентность embeddings при первом наполнении графа.** *Митигейшн:* индексация асинхронна (индексатор #02, батчинг); `search` имеет keyword-режим (`degraded:true`), не блокируется отсутствием embedder.
- **R5. Идемпотентность: рост `idempotency_keys`.** *Митигейшн:* TTL-очистка (фоновая задача #02, retention напр. 30 дней по `created_at`); уникальный индекс `(org,scope,key)`; ревизируемо на Redis.
- **R6. `activity_events` раздувание (высокочастотный capture).** *Митигейшн:* local-primary Turso (не cloud-Postgres), агрегация/семплинг на стороне #08; индекс `(userId, ts)` для keyset; payload минимален (frameRefs → minio).
- **R7. Размер `entities.markdown`/`body` для огромных узлов.** *Митигейшн:* лимит `PAYLOAD_TOO_LARGE` (>4 МБ); крупное — в minio через `storageRef`, не инлайн.

**Не-блокирующие открытые вопросы:**
- **ОВ-1 (закрыт этой спекой).** Механизм идемпотентности POST в ядре = таблица `idempotency_keys` (§1.7). Снимает ОВ-1 из 03-pkm; ревизируемо на Redis при росте нагрузки.
- **ОВ-2.** Физическое размещение `entities`/`edges` (cloud-Postgres канон) vs частичная local-реплика для приватных kind — финально решает владелец #02 (Electric-shape конфиг). Ядро даёт единую схему.
- **ОВ-3.** dim/distance qdrant-коллекции `rox_entities` — параметр embedder #02 (зависит от выбранной модели); ядро фиксирует только id-точки=`entityId` и payload-форму.
- **ОВ-4.** Нужна ли отдельная коллекция для `activity_events`/frame-семантики (vision-поиск) — отложено до #08/#12; v0 индексирует только `entities`.
- **ОВ-5.** Версионирование тела `entities` (optimistic concurrency на уровне ядра) vs делегирование доменам (notes.revision) — v0 делегирует доменам; ядро `entities` LWW. Ревизируемо, если появится кросс-доменный конкурентный апдейт узла.
- **ОВ-6.** Дедуп прямых unresolved-рёбер (`target=NULL`) сейчас держится только на `idempotencyKey` (§2.1 правило 6), т.к. `uniqueIndex (source,target,relation)` не покрывает NULL. Ревизируемо на частичный `uniqueIndex (source, targetSlug, relation) WHERE target IS NULL`, если появится поток прямых `link` без ключа.
