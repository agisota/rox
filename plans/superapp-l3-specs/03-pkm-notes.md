# 03 — Знание/Заметки (PKM): L3 implementation-ready ТЗ

> Опирается на `plans/superapp-l3-specs/00-shared-context.md` (далее «00-SC»): §2 — фиксированный контракт ядра графа (НЕ переопределять; enum только расширять diff'ом), §3 — конвенции репо, §4 — допущения A1–A8, §5 — этот шаблон.
> Заземление по коду: `packages/db/src/schema/knowledge.ts`, `packages/db/src/schema/journal.ts`, `packages/trpc/src/router/notes/notes.ts`, `packages/trpc/src/router/knowledge/{knowledge,backlinks,schema}.ts`, `packages/shared/src/knowledge/*`.

---

## 0. Резюме и границы

**Что входит (Фаза 1, PKM):**
- Промоут существующих `knowledge_documents` в ядро графа (`entities` kind=`note`) — заметка как узел графа; `knowledge_links` → `edges` (relation=`links_to`). Старый стол остаётся как legacy-источник на время миграции (раздел 5).
- Block/outliner-редактор заметок (A1=BlockNote) с `blockTree` jsonb (A2) + производным `markdown` для поиска/диска.
- Бэклинки/`[[wikilink]]`-граф поверх `edges` (relation=`links_to`/`mentions`), резолв ранее-неразрешённых ссылок при создании цели (как в `backlinks.ts`, но на ядре).
- Notion-style database-views (TanStack Table поверх `table.tsx`) и граф-вью бэклинков.
- Markdown-on-disk two-way sync (Obsidian/Tolaria-совместимый vault) через watcher + last-writer-wins (Фаза 1 — note-level; block-level — опционально при наличии per-block `_mtimeMs`, ОВ-6, см. §3.2), с историей версий.
- Теги как first-class `entities` kind=`tag` + relation `tagged_with`; inline `#tag` парсинг.
- Доменный роутер `note` (новый, см. §2) + расширение существующего `knowledge`-роутера прокси обратной совместимости.
- Семантический поиск заметок через graph-search ядра (qdrant), без собственной коллекции.

**Что НЕ входит (out of scope):**
- Spatial canvas / node-graph движок (tldraw/React Flow) — это Фаза 5 (#15/OSINT), здесь только лёгкий граф-вью бэклинков на SVG без freeform-редактирования.
- CRDT-merge блоков символ-в-символ — Фаза 1 фиксирует note-level last-writer-wins (A2); block-level merge — опционально при per-block `_mtimeMs` (ОВ-6). Полноценный CRDT — ревизируемо, отдельный таск.
- Задачи/GTD — подсистема #04 (`04-tasks-gtd.md`); здесь только relation `references` от заметки к task-узлу.
- Сам graph-сервис ядра (`create/link/promote/resolveBacklinks/search`) и таблицы `entities/edges` — поставляет #01; здесь они потребляются.
- Рантайм qdrant/minio/embedder/Electric — поставляет #02; здесь потребляется их контракт.

**Фаза:** 1. **Зависимости:** #01 (ядро графа: `entities/edges/identity_links`, graph-router, qdrant-индексатор), #02 (minio для вложений/vault-blob, Turso для локального primary, Electric для cache-first sync).

**Принятые допущения (00-SC §4), все ревизируемы:**
- **A1** — редактор BlockNote (markdown-roundtrip из коробки). Альтернатива TipTap задокументирована.
- **A2** — источник истины блоков = `blockTree` jsonb (BlockNote/ProseMirror JSON); `markdown` — производное для поиска/диска; конфликт → last-writer-wins (Фаза 1 — note-level; block-level при per-block `_mtimeMs`, ОВ-6) + история.
- **A8** — minio bucket `org-<orgId>`, префикс `files/` для вложений заметок, `exports/` для vault-снапшотов.
- Локально-специфичное допущение (ревизируемо): **md-on-disk sync — desktop-only** (Electron sidecar `vault-sync`), web-клиент работает без диска.

---

## 1. Доменная модель (полная схема БД)

Заметка = узел ядра (`entities`, kind=`note`) — **узел НЕ дублируется**, его пишет graph-сервис #01. Подсистема добавляет **только** detail-таблицы 1:1 к `entityId` и таблицу истории. Файл: `packages/db/src/schema/notes.ts`.

### 1.1 Enum-расширения (diff к 00-SC §2.1, файл `enums.ts`)

Ядро уже содержит `entityKindValues ⊇ {note, tag}` и `edgeRelationValues ⊇ {links_to, mentions, tagged_with, references, attached_to, derived_from}` — PKM их **переиспользует, не добавляет**. Новые значения — только для detail-домена заметок:

```ts
// enums.ts — ДОБАВИТЬ (diff). Ядровые entityKind/edgeRelation НЕ трогаем.

/** Происхождение заметки на detail-уровне (шире, чем knowledgeSourceKind). */
export const noteSourceKindValues = [
  "manual", "conversation", "agent_run", "obsidian_import", "file", "web_clip", "capture_digest",
] as const;
export const noteSourceKindEnum = z.enum(noteSourceKindValues);
export type NoteSourceKind = z.infer<typeof noteSourceKindEnum>;

/** Тип документа-заметки (надстройка над knowledgeDocumentTypeValues). */
export const noteDocTypeValues = [
  "note", "prd", "spec", "doc", "meeting_summary", "reference", "daily",
] as const;
export const noteDocTypeEnum = z.enum(noteDocTypeValues);
export type NoteDocType = z.infer<typeof noteDocTypeEnum>;

/** Состояние двустороннего md-on-disk sync для заметки. */
export const noteSyncStateValues = ["in_sync", "dirty_local", "dirty_disk", "conflict"] as const;
export const noteSyncStateEnum = z.enum(noteSyncStateValues);
export type NoteSyncState = z.infer<typeof noteSyncStateEnum>;
```

> Примечание: `entities.status` (active/archived/trashed) из ядра покрывает lifecycle — **отдельного `noteStatus` НЕ вводим** (soft-delete = `entities.status='trashed'`, см. 00-SC §3).

### 1.2 Detail-таблица `notes` (1:1 `entityId`)

```ts
// packages/db/src/schema/notes.ts
import {
  boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./auth";
import { entities } from "./entity"; // из ядра #01
import { noteDocTypeValues, noteSourceKindValues, noteSyncStateValues } from "./enums";
// ВАЖНО: тип провенанса берём из канонического Zod-источника @rox/shared/knowledge
// (packages/shared/src/knowledge/types.ts), а НЕ из ./knowledge — legacy-таблица
// knowledge.ts депрекейтится и удаляется миграцией drop_legacy_knowledge (раздел 5);
// после её удаления импорт из ./knowledge сломал бы компиляцию notes.ts.
import type { KnowledgeSourceRef } from "@rox/shared/knowledge"; // канонический тип провенанса

export const noteDocType = pgEnum("note_doc_type", noteDocTypeValues);
export const noteSourceKind = pgEnum("note_source_kind", noteSourceKindValues);
export const noteSyncState = pgEnum("note_sync_state", noteSyncStateValues);

/**
 * BlockNote/ProseMirror-узел (loose: рекурсивный JSON блока).
 * `_rev`/`_mtimeMs` — per-block версионные метаданные для block-level merge (см. §3.2).
 * Хранятся внутри блока (не отдельной таблицей), пишутся редактором/`disk_watcher` при
 * мутации блока; для note-level last-writer-wins (Фаза 1) опциональны.
 */
export type NoteBlock = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: NoteBlock[];
  /** Монотонная ревизия блока (наследует notes.revision на момент правки блока). */
  _rev?: number;
  /** mtime последней правки блока, UTC ms (источник истины при block-level merge). */
  _mtimeMs?: number;
} & Record<string, unknown>;

/** Метаданные vault-файла для md-on-disk (A2). */
export type NoteVaultRef = {
  relPath: string;          // относительный путь в vault, напр. "notes/welcome.md"
  diskHash?: string;        // sha256 содержимого на диске (для детекта dirty_disk)
  diskMtimeMs?: number;     // mtime последнего наблюдения watcher'ом (UTC ms)
} & Record<string, unknown>;

export const notes = pgTable(
  "notes",
  {
    // PK = FK к entities.id (1:1). Узел пишет graph-сервис ядра; здесь только detail.
    entityId: uuid("entity_id")
      .primaryKey()
      .references(() => entities.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    docType: noteDocType("doc_type").notNull().default("note"),
    sourceKind: noteSourceKind("source_kind").notNull().default("manual"),

    // A2: источник истины — дерево блоков BlockNote; markdown/title живут в entities.
    blockTree: jsonb("block_tree").$type<NoteBlock[]>().notNull().default([]),
    // Монотонный счётчик ревизий блока-дерева (для last-writer-wins и истории).
    revision: integer().notNull().default(0),

    // Frontmatter (Obsidian-совместимый) + произвольный structured body.
    frontmatter: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sourceRef: jsonb("source_ref").$type<KnowledgeSourceRef>(),

    // md-on-disk sync (desktop-only; на web остаётся in_sync, vaultRef = null).
    syncState: noteSyncState("sync_state").notNull().default("in_sync"),
    vaultRef: jsonb("vault_ref").$type<NoteVaultRef>(),

    pinned: boolean().notNull().default(false),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("notes_org_idx").on(t.organizationId),
    index("notes_doc_type_idx").on(t.docType),
    index("notes_sync_state_idx").on(t.syncState),
    // Естественный ключ vault-файла в пределах org (частичный — только когда vaultRef задан).
    uniqueIndex("notes_org_vault_path_uniq")
      .on(t.organizationId, sql`(${t.vaultRef} ->> 'relPath')`)
      .where(sql`${t.vaultRef} IS NOT NULL`),
  ],
);

export type InsertNote = typeof notes.$inferInsert;
export type SelectNote = typeof notes.$inferSelect;
```

> `sql` — импорт из `drizzle-orm` (как в 00-SC §2.2). Частичный уникальный индекс по `vaultRef->>'relPath'` гарантирует «1 файл vault = 1 заметка».
>
> **ОВ-7 / проверка PR-1 (expression-индекс).** `notes_org_vault_path_uniq` — это partial unique index по **выражению** над jsonb (`(vault_ref ->> 'relPath')`). Это валидный Postgres, но `drizzle-kit generate` исторически имеет ограничения по expression-based индексам и может выдать неполный/некорректный SQL. **Обязательная проверка:** после `bunx drizzle-kit generate --name="notes_detail_on_graph"` убедиться, что сгенерированный SQL содержит этот индекс с выражением и `WHERE vault_ref IS NOT NULL` БЕЗ ручной доводки `packages/db/drizzle/` (ручное редактирование запрещено AGENTS.md). **Если drizzle-kit не генерит выражение корректно — fallback:** вынести `relPath` в отдельную generated-колонку `vaultRelPath: text("vault_rel_path").generatedAlwaysAs(sql`(vault_ref ->> 'relPath')`)` и строить partial unique index по обычной колонке `t.vaultRelPath` (drizzle-kit это поддерживает надёжно). Выбор фиксируется в PR-1 по факту прогона `generate`.

### 1.3 Detail-таблица `note_revisions` (история блоков, A2)

```ts
export const noteRevisions = pgTable(
  "note_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    noteEntityId: uuid("note_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    revision: integer().notNull(), // соответствует notes.revision на момент снапшота
    blockTree: jsonb("block_tree").$type<NoteBlock[]>().notNull(),
    markdown: text(),
    // Кто/что породило ревизию: editor | disk_watcher | conflict_merge | promote_backfill.
    origin: text().notNull().default("editor"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("note_revisions_org_idx").on(t.organizationId),
    index("note_revisions_note_idx").on(t.noteEntityId),
    uniqueIndex("note_revisions_note_revision_uniq").on(t.noteEntityId, t.revision),
  ],
);

export type InsertNoteRevision = typeof noteRevisions.$inferInsert;
export type SelectNoteRevision = typeof noteRevisions.$inferSelect;
```

### 1.3a Detail-таблица `note_idempotency` (идемпотентность POST, минимально-достаточная)

Для самодостаточности PR-3 (процедуры `create`/`pushFromDisk`/`resolveConflict` обязаны быть идемпотентны по `idempotencyKey`, 00-SC §3) PKM фиксирует **собственный** механизм хранения ключа на detail-уровне. Помечен как **ревизируемый**: при появлении ядрового idempotency-механизма от #01 (ОВ-1) эта таблица заменяется/проксируется без изменения контракта процедур.

```ts
export const noteIdempotency = pgTable(
  "note_idempotency",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Ключ идемпотентности от клиента (uuid). Уникален в пределах org.
    key: uuid("key").notNull(),
    // Заметка, созданная/затронутая первым выполнением запроса с этим ключом.
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // TTL 24ч: повтор ключа в окне → возврат ранее созданной заметки; вне окна — новая вставка.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("note_idempotency_org_key_uniq").on(t.organizationId, t.key),
    index("note_idempotency_expires_idx").on(t.expiresAt),
  ],
);

export type InsertNoteIdempotency = typeof noteIdempotency.$inferInsert;
export type SelectNoteIdempotency = typeof noteIdempotency.$inferSelect;
```

> **Семантика.** В транзакции `create`: `INSERT note_idempotency (org, key, entityId, expiresAt=now()+24h) ON CONFLICT (org, key) DO NOTHING`; если конфликт (ключ уже есть и не истёк) → читается сохранённый `entityId`, возвращается существующая заметка (200), без второй вставки узла. Истёкшие строки чистятся фоновым job'ом по `note_idempotency_expires_idx` (или partial-cleanup при вставке). Та же таблица обслуживает `pushFromDisk`/`resolveConflict`. Это **минимально-достаточный** механизм для детерминированной реализации PR-3 без ожидания #01.

### 1.4 Использование ядра (kind/relation)

| Сущность ядра | Как использует PKM |
|---|---|
| `entities` kind=`note` | сам узел заметки; `title`/`markdown`/`slug`/`status`/`v2ProjectId` — в ядре; блоки — в `notes.blockTree`. Пишется через graph-сервис `create/update`. |
| `entities` kind=`tag` | узел тега (slug = нормализованный тег). Создаётся лениво при первом `#tag`. |
| `edges` relation=`links_to` | резолвнутый `[[wikilink]]` note→note (с `targetSlug`, `resolved`). |
| `edges` relation=`mentions` | inline-упоминание контакта/сущности без явного wiki-линка (опц., из AI-парсинга). |
| `edges` relation=`tagged_with` | note→tag. |
| `edges` relation=`references` | note→task/agent_session/email (мягкая ссылка из заметки на не-note узел). |
| `edges` relation=`attached_to` | file→note (вложение; `file`-узел поставляет #02/Drive, здесь только ребро). |
| `edges` relation=`derived_from` | note→conversation/agent_session (провенанс при distill). |
| `identity_links` | НЕ пишет напрямую; только читает для резолва `mentions` (D6). |

**Новые kind/relation:** нет — PKM целиком укладывается в зафиксированный enum ядра. Добавлены только **detail-enum'ы** (`note_doc_type`/`note_source_kind`/`note_sync_state`), не пересекающиеся с ядровыми.

> **Правило зависимостей (важно для PR-1).** `notes.ts` НЕ должен зависеть от обречённой на удаление `knowledge.ts`. Тип `KnowledgeSourceRef` импортируется из канонического `@rox/shared/knowledge` (`packages/shared/src/knowledge/types.ts`), где живёт его Zod-источник `knowledgeSourceRefSchema`. После миграции `drop_legacy_knowledge` (раздел 5) удаление `knowledge.ts` обязано НЕ ломать компиляцию `notes.ts`/`note_revisions`/`note`-роутера — поэтому ни одна новая таблица/модуль PKM не должна импортировать из `./knowledge`.

### 1.5 Маппинг на qdrant (через индексатор #02, не свой)

Индексирование выполняет **общий индексатор ядра** (#01/#02) по upsert `entities` kind=`note`. PKM лишь декларирует контракт payload и embed-текста (его читает индексатор):
- **Точка на заметку** в единой коллекции ядра; **id точки = `entities.id`**.
- **payload:** `{ entityId, kind: "note", orgId, userId?: createdByUserId, docType, tags: string[], v2ProjectId?, updatedAt }`. Фильтрация поиска — по `orgId` (обязательно) + опц. `docType`/`tags`/`v2ProjectId`.
- **Embed-текст:** `title + "\n\n" + markdown` (markdown — производное из `blockTree`, plain-render без MDX-разметки; функция `blockTreeToPlain()` в `packages/shared/src/knowledge/`). Реиндекс по изменению `entities.updatedAt`/`notes.revision`.
- Семантический поиск заметок = вызов graph-router `search({ kind:["note"], ... })` ядра; **своей qdrant-коллекции PKM не заводит** (00-SC §2.6).

---

## 2. API-контракты (tRPC)

**Где новый, где расширение:**
- **Новый роутер `note`** — `packages/trpc/src/router/note/` (регистрация в `packages/trpc/src/root.ts` как `note: noteRouter`, рядом с существующими `knowledge`/`notes`). Это основной PKM-API на ядре графа.
- **Существующий `knowledge`-роутер** (`router/knowledge/`) — НЕ удаляем; на время миграции его write-процедуры пробрасываются в ядро (раздел 5), затем депрекейтятся. Существующий `notes`-роутер (`router/notes/notes.ts`) — это **профильные заметки** (`profileNotes`), к PKM отношения не имеет, не трогаем.
- Все процедуры — `protectedProcedure`, org-scope через `requireActiveOrgMembership(ctx)` (как в `knowledge.ts`). Создание/связывание узлов — **только** через `graphService` ядра (импорт из graph-модуля #01), PKM пишет лишь `notes`/`note_revisions` в той же транзакции (`dbWs.transaction`).

Zod-схемы — в `packages/trpc/src/router/note/schema.ts`, переиспользуя `@rox/shared/knowledge` (`knowledgeSlugSchema`, `knowledgeSourceRefSchema`) и новые `noteDocTypeEnum`/`noteSourceKindEnum`.

| # | Процедура | Тип | Input (Zod) | Output (Zod) |
|---|---|---|---|---|
| 1 | `list` | query | `{ docType?: noteDocTypeEnum, tag?: slug, v2ProjectId?: uuid, status?: entityStatusEnum=active, cursor?: uuid, limit?: int(1..100)=50 }` | `{ items: NoteListItem[], nextCursor?: uuid }` |
| 2 | `get` | query | `{ slug: knowledgeSlugSchema } \| { entityId: uuid }` (union, ровно одно) | `NoteFull` |
| 3 | `create` | mutation | `{ idempotencyKey: uuid, title: str(1..300), slug?: slug, docType?: noteDocTypeEnum=note, sourceKind?: noteSourceKindEnum=manual, blockTree?: NoteBlock[], markdown?: str, frontmatter?: record, tags?: slug[], sourceRef?: knowledgeSourceRefSchema, v2ProjectId?: uuid }` | `NoteFull` |
| 4 | `update` | mutation | `{ entityId: uuid, baseRevision: int, title?: str, slug?: slug, docType?: noteDocTypeEnum, blockTree?: NoteBlock[], markdown?: str, frontmatter?: record, v2ProjectId?: uuid\|null }` | `NoteFull` |
| 5 | `archive` | mutation | `{ entityId: uuid, status: z.enum(["archived","trashed","active"]) }` | `{ entityId, status }` |
| 6 | `setTags` | mutation | `{ entityId: uuid, tags: slug[] }` | `{ entityId, tags: slug[] }` |
| 7 | `backlinks` | query | `{ slug: knowledgeSlugSchema }` | `NoteBacklink[]` |
| 8 | `graph` | query | `{ entityId: uuid, depth?: int(1..2)=1 }` | `{ nodes: GraphNode[], edges: GraphEdge[], truncated: bool }` |
| 9 | `search` | query | `{ query: str(1..200), mode?: z.enum(["semantic","keyword"])=semantic, docType?: noteDocTypeEnum, tag?: slug, v2ProjectId?: uuid, limit?: int(1..50)=25 }` | `{ hits: NoteSearchHit[], degraded: bool }` |
| 10 | `pushFromDisk` | mutation | `{ idempotencyKey: uuid, relPath: str, markdown: str, diskHash: str, diskMtimeMs: int }` | `{ entityId, syncState: noteSyncStateEnum, revision: int }` |
| 11 | `pullForDisk` | query | `{ since?: timestamptz }` | `VaultFile[]` |
| 12 | `resolveConflict` | mutation | `{ entityId: uuid, resolution: z.enum(["keep_local","keep_disk","merged"]), blockTree?: NoteBlock[] }` | `NoteFull` |

Output-типы (Zod-схемы в `schema.ts`): `NoteListItem = { entityId, slug, title, docType, tags, status, updatedAt, pinned }`; `NoteFull = NoteListItem & { blockTree, markdown, frontmatter, revision, syncState, vaultRef, sourceRef, v2ProjectId }`; `NoteBacklink = { sourceEntityId, sourceSlug, sourceTitle, resolved }`; `NoteSearchHit = NoteListItem & { score?: number, snippet?: string }`; `VaultFile = { entityId, relPath, markdown, revision, diskHash }`; `GraphNode = { entityId, kind, title, slug }`; `GraphEdge = { sourceEntityId, targetEntityId, relation }`.

> **`NoteBacklink` — это НЕ тот же тип, что `KnowledgeBacklink`** (`packages/shared/src/knowledge/types.ts:93`). Фактический `KnowledgeBacklink` имеет поле `sourceDocumentId` (ссылка на legacy `knowledge_documents.id`) и является resolved-only типом, тогда как PKM работает с ядровыми узлами и неразрешёнными рёбрами. Отличия: (1) `sourceDocumentId` → `sourceEntityId` (FK на `entities.id`, не на legacy-док); (2) `NoteBacklink` ВКЛЮЧАЕТ неразрешённые ссылки через `resolved: boolean` (битые `[[wikilink]]` с `resolved:false`), а `KnowledgeBacklink` их не несёт той же семантикой. Поэтому в `schema.ts` объявляется НОВЫЙ `noteBacklinkSchema`/`NoteBacklink`, а не переиспользуется `KnowledgeBacklink` буквально. Если для legacy-прокси (раздел 5) нужен обратный формат — применяется явный адаптер-маппинг `{ sourceEntityId → sourceDocumentId }` в `knowledge`-роутере, а не общий тип.

**Бизнес-правила / валидации / коды ошибок (по процедуре):**

1. **`list`** — фильтр по `organizationId` обязателен; пагинация keyset по `(updatedAt desc, entityId)`. **cache-first** (AGENTS.md §9): клиент рендерит из Electric-кэша, серверный `list` — первичная гидратация. Ошибка: `UNAUTHORIZED` без активной org.
2. **`get`** — union «ровно одно из slug/entityId»; `BAD_REQUEST` если оба/ни одного. `NOT_FOUND` если узел не kind=`note` или чужая org. trashed возвращается (для корзины), помечен `status`.
3. **`create`** — **идемпотентность обязательна** (POST с побочкой): `idempotencyKey` (uuid). Дубликат ключа в org за 24ч → возврат ранее созданной заметки (200), без второй вставки. Механизм — detail-таблица `note_idempotency` (§1.3a, минимально-достаточная, ревизируема при появлении ядрового механизма #01 — ОВ-1): первым шагом транзакции `INSERT note_idempotency ... ON CONFLICT (org, key) DO NOTHING`; при конфликте читается сохранённый `entityId` и возвращается существующая заметка. Порядок: (a) `assertMdxSafe(markdown)` если задан; (b) если `blockTree` есть, а `markdown` нет — деривация `markdown = blockTreeToMarkdown(blockTree)`; если только `markdown` — `blockTree = markdownToBlockTree(markdown)`; (c) `slug` — если не задан, генерируется из title (kebab) с дедупом в org; конфликт явного slug → `CONFLICT`; (d) `graphService.create({ kind:"note", title, slug, markdown, v2ProjectId, status:"active" })` → `entity`; (e) `INSERT notes` с `entityId`, `blockTree`, `revision:0`; (f) `syncOutgoingLinks` (см. §3) — парс `[[wikilinks]]`/`#tags`, запись `edges`; (g) `resolveIncomingLinks` — резолв ранее-неразрешённых `edges`, целящихся в этот slug; (h) snapshot в `note_revisions` (revision 0, origin `editor`). Всё в одной `dbWs.transaction`. Ошибки: `BAD_REQUEST` (невалидный slug/MDX), `CONFLICT` (slug занят), `PAYLOAD_TOO_LARGE` (blockTree сериализованно > 2 МБ).
4. **`update`** — **optimistic concurrency**: `baseRevision` обязателен; если `notes.revision != baseRevision` → `CONFLICT` (payload `{ currentRevision }`), клиент перезапрашивает/мёржит. При успехе: `revision := revision+1`, snapshot в `note_revisions`, ре-деривация markdown↔blockTree, ре-`syncOutgoingLinks`. **Смена slug (атомарно, в той же `dbWs.transaction`):** (a) проверка занятости нового slug по ядровому уникальному ключу `entities_org_kind_slug_uniq` (00-SC §2.2) + dedup в org — если занят другим `note`-узлом → `CONFLICT` (payload `{ conflictingSlug }`), как в `create`; (b) `graphService.update` меняет `entities.slug`; (c) обновление `edges.targetSlug` всех старых ВХОДЯЩИХ рёбер (целились в прежний slug) на новый — иначе бэклинки «отвяжутся»; (d) ре-`resolveIncomingLinks` для нового slug (подхватывает ранее-неразрешённые рёбра, целящиеся в новый slug, проставляя `resolved=true`/`targetEntityId`); все шаги (a)–(d) — одна транзакция, при коллизии (a) откатывается целиком. `syncState := dirty_local` (если есть vaultRef) для последующего disk-write. `assertMdxSafe` при наличии markdown. Ошибки: `NOT_FOUND`, `CONFLICT` (revision-mismatch ИЛИ занятый новый slug), `BAD_REQUEST`.
5. **`archive`** — мост к `graphService` (смена `entities.status`); `trashed`/`archived`/`active`. Идемпотентно (повторный тот же status → 200 без изменений). Узел остаётся в графе; рёбра сохраняются. Ошибка `NOT_FOUND`.
6. **`setTags`** — diff текущих `tagged_with` рёбер vs новый набор: создаёт недостающие `tag`-узлы (lazy, kind=`tag`, slug=нормализованный), добавляет/удаляет `edges` relation=`tagged_with`. Идемпотентно (тот же набор → no-op). Ошибка `NOT_FOUND`.
7. **`backlinks`** — порт `knowledge.backlinks` на ядро: `edges` relation=`links_to` where `targetSlug=slug`, join `entities` (source). Возврат `NoteBacklink[]` (новый тип, см. выше: `sourceEntityId` вместо `sourceDocumentId`, `resolved` несёт «битые» ссылки). Включает неразрешённые (для «битых» ссылок) с `resolved:false`. Без ошибок (пустой массив, если нет).
8. **`graph`** — эго-граф заметки на глубину 1–2: `entities` (узлы) + `edges` (рёбра) вокруг `entityId`, фильтр по org. `depth=2` ограничен ≤200 узлов (иначе `truncated:true` в ответе). Ошибка `NOT_FOUND`.
9. **`search`** — `mode=semantic` → `graphService.search({ query, kinds:["note"], filters:{ docType, tag, v2ProjectId }, limit })` (qdrant). `mode=keyword` → `ilike` по `entities.title`/`entities.markdown` (как текущий `knowledge.search`). При недоступном embedder semantic авто-переходит в keyword с `degraded:true` (не ошибка). Ошибка: `BAD_REQUEST` (пустой query).
10. **`pushFromDisk`** — приём изменения из vault-watcher (desktop sidecar, §3). **Идемпотентность по `idempotencyKey` + `diskHash`**: если `diskHash` совпадает с `vaultRef.diskHash` — no-op (`in_sync`). Иначе: если `notes.syncState=dirty_local` (локально не записано на диск) → `syncState:=conflict`, заметка НЕ перезаписывается, возвращается conflict. Если `in_sync`/`dirty_disk` → `markdownToBlockTree`, обновление узла через `graphService`, `revision+1`, snapshot (origin `disk_watcher`), `syncState:=in_sync`, `vaultRef.diskHash/diskMtimeMs` обновляются. Создание новой заметки, если `relPath` ещё не связан. Ошибка: `BAD_REQUEST` (relPath вне vault). Конфликт возвращается как успешный ответ с `syncState:conflict` (не throw).
11. **`pullForDisk`** — список заметок, изменённых после `since` (или все), в форме `VaultFile[]` для записи на диск watcher'ом. `markdown` — производное. Без побочек.
12. **`resolveConflict`** — пользовательское/AI-разрешение `conflict`: `keep_local` (диск перезаписывается из узла), `keep_disk` (узел перезаписывается из последнего diskHash-снапшота), `merged` (передан `blockTree`). Ставит `syncState:=in_sync`, `revision+1`, snapshot (origin `conflict_merge`). Ошибки: `NOT_FOUND`, `BAD_REQUEST` (resolution=merged без blockTree).

**Интеграция с graph-сервисом ядра.** Узлы (`entities`) и рёбра (`edges`) PKM создаёт/мутирует **исключительно** через graph-сервис #01 (методы `create/link/promote/resolveBacklinks/search`, 00-SC §2.6). PKM-роутер владеет только detail-таблицами `notes`/`note_revisions`. «Промоут» (например conversation→note при distill): `graphService.promote(sourceEntityId, { toKind:"note", … })` создаёт `note`-узел + `edge` relation=`derived_from` от исходного узла; PKM затем дописывает `notes`-detail. `link`/`resolveBacklinks` используются в `syncOutgoingLinks`/`backlinks` вместо прямых INSERT в `knowledge_links`. **Rate-limit:** write-процедуры (`create`/`update`/`pushFromDisk`) — per-user лимит на уровне tRPC-middleware (429 + Retry-After), как для прочих публичных мутаций (00-SC §3).

---

## 3. Сервисы/процессы/протоколы

### 3.1 Wikilink/tag-парсер (переиспользование `@rox/shared/knowledge`)

Существующие чистые функции уже есть и переиспользуются как есть:
- `parseWikiLinks(source)`, `extractWikiLinkTargets(source)`, `normalizeWikiLinkTarget(target)`, `extractTags(source)` — `packages/shared/src/knowledge/wikilinks.ts`.
- `assertMdxSafe(source)` — `packages/shared/src/knowledge/mdx-security.ts`.

**Добавить** (новые чистые функции в `packages/shared/src/knowledge/blocktree.ts`, юнит-тестируемые без БД):
- `blockTreeToMarkdown(blocks: NoteBlock[]): string` и `markdownToBlockTree(md: string): NoteBlock[]` — BlockNote ↔ markdown roundtrip (A2). Используют BlockNote server-side сериализатор; детерминированы.
- `blockTreeToPlain(blocks: NoteBlock[]): string` — plain-текст для embed (без markdown-разметки).

Серверный аналог `backlinks.ts`, но на ядре графа — `packages/trpc/src/router/note/links.ts`: `syncOutgoingLinks(tx, { orgId, sourceEntityId, markdown })` (delete+insert `edges` relation∈{`links_to`,`tagged_with`} для source) и `resolveIncomingLinks(tx, { orgId, entityId, slug })` (back-fill неразрешённых `edges.targetSlug=slug`). Логика 1:1 с текущей, но `knowledge_links`→`edges`.

### 3.2 Sidecar `vault-sync` (md-on-disk, desktop-only)

**Назначение:** двусторонняя синхронизация заметок org с локальным Obsidian/Tolaria-совместимым vault-каталогом (markdown + frontmatter), А2-конфликт-резолюция.

- **Процесс:** отдельный воркер в Electron main (или дочерний ОС-процесс под `host-service`-надзором, 00-SC §2C). Запуск — при включённой подсистеме notes и заданном vault-пути в настройках. Один инстанс на org-vault.
- **Файловый watcher:** `chokidar` (atomic-safe, debounce 300 мс) на `*.md` в vault-руте. Игнор `.obsidian/`, dot-файлы, `exports/`.
- **Протокол IPC (sidecar ↔ renderer/main):** typed bridge `apps/desktop/src/preload` (00-SC §2C). Сообщения — JSON, дискриминированные по `type`:

```ts
// vault-sync → app
type VaultEvent =
  | { type: "disk_changed"; relPath: string; markdown: string; diskHash: string; diskMtimeMs: number }
  | { type: "disk_deleted"; relPath: string }
  | { type: "scan_complete"; count: number }
  | { type: "error"; relPath?: string; message: string };
// app → vault-sync
type VaultCommand =
  | { type: "write_file"; relPath: string; markdown: string }       // pullForDisk применён
  | { type: "delete_file"; relPath: string }
  | { type: "rescan" }
  | { type: "set_root"; absPath: string };
```

- **Поток данных:**
  - disk→cloud: `disk_changed` → renderer вызывает tRPC `note.pushFromDisk` → ядро применяет (см. §2 п.10) → при `conflict` UI поднимает диалог `resolveConflict`.
  - cloud→disk: renderer слушает Electric live-query по `notes` (cache-first); при `syncState=dirty_local`/новой ревизии — `pullForDisk` → `write_file`-команда сайдкару; после записи sidecar подтверждает (`disk_changed` с новым hash, который совпадёт → no-op).
- **Конфликт-резолюция (A2).** Гранулярность зависит от наличия per-block метаданных:
  - **Фаза 1 (по умолчанию) — note-level last-writer-wins.** Базовая модель данных гарантирует таймстамп/ревизию только на уровне заметки (`notes.revision`/`notes.updatedAt`, см. 1.2/1.3) — поэтому при одновременном dirty с обеих сторон ставится `syncState:conflict`, и разрешение идёт по заметке целиком (`resolveConflict` keep_local/keep_disk/merged, §2 п.12). Block-level авто-merge на этой фазе НЕ выполняется детерминированно, т.к. у блоков может не быть `_mtimeMs`.
  - **Block-level merge (опционально, при наличии `_mtimeMs`) — ОВ/Фаза-2.** Если оба дерева несут per-block `_mtimeMs` (см. `NoteBlock` в 1.2), авто-merge по блокам допустим: блоки с одинаковым `block.id` берут версию с большим `_mtimeMs`; расходящиеся без общего `id` — оба сохраняются как смежные блоки с маркером, пользователь правит. При отсутствии `_mtimeMs` хотя бы у одной стороны — откат на note-level LWW. Полный block-level CRDT и обязательность `_mtimeMs` — отдельный таск (ОВ-6), вне Фазы 1.
- **Lifecycle/supervision:** `host-service` рестартует sidecar при краше (backoff); при недоступности — заметки работают cloud-only, `syncState` замораживается, баннер «vault sync paused». Снятие vault-пути → graceful stop.
- **Безопасность:** vault-путь — пользовательская настройка (не секрет), но абсолютные пути логируются маскированно (PII — имя пользователя в пути). Запись только внутри vault-рута (path-traversal guard на `relPath`).

### 3.3 Sync/realtime топология (00-SC §2E)

- **Cloud Postgres/Neon** — канон `entities`/`edges`/`notes`/`note_revisions` (org/командные). Вниз к клиенту — через **Electric** (cache-first, AGENTS.md §9): рендерим существующие строки даже при `isReady=false`; строгую готовность ждём только для записи/seeding (например перед `create` дефолтной daily-note).
- **Turso/libSQL (local)** — embedded-реплика синхронизируемого + primary для тяжёлого приватного (история `note_revisions` локально, vault-кэш). Поставляется #02.
- **minio** — вложения заметок (`files/`), vault-снапшоты/экспорты (`exports/`), A8.
- **Конфликты:** md-on-disk ↔ блоки — §3.2 (Фаза 1 — note-level last-writer-wins; block-level при per-block `_mtimeMs`, ОВ-6; + история `note_revisions`); синхронизируемые entity — Electric. Приватные данные (полный vault, история) не выходят за local-стор.

---

## 4. UI-спецификация

Feature-модуль `notes` (lazy, 00-SC §2C) в `apps/web` (web) и переиспользуется в `apps/desktop`. Компоненты — по структуре AGENTS.md (папка/компонент + `index.ts`), shadcn-примитивы из `packages/ui`.

### 4.1 Экраны/панели

| Экран | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **NotesLayout** (3-pane: sidebar дерево/теги · список · редактор) | оболочка PKM | скелет панелей | — | error-boundary на route | каркас сразу |
| **NoteList** (вирт. список) | список заметок с фильтрами | скелет-строки, **только если data пуст И !isReady** | «Нет заметок» + CTA «Создать» (когда `isReady && data.length===0`) | inline-ретрай | рендерим кэш-строки немедленно, не прячем при `isReady=false` |
| **NoteEditor** (BlockNote) | редактирование блоков | скелет-заголовок если узла ещё нет в кэше | «Пустая заметка» placeholder-блок | toast + read-only fallback | редактор сразу из кэша; автосейв debounce 800 мс → `update` с `baseRevision` |
| **BacklinksPanel** | входящие ссылки + неразрешённые | спиннер inline | «Нет бэклинков» | inline | список из `backlinks`, неразрешённые помечены пунктиром |
| **NoteGraphView** | лёгкий граф эго-сети (SVG) | спиннер | «Нет связей» | inline | узлы/рёбра из `graph`; клик → переход |
| **DatabaseView** (TanStack Table) | Notion-таблица заметок | скелет-таблица | «Пусто» | inline | строки из кэша; колонки docType/tags/updated/project |
| **ConflictDialog** | разрешение sync-конфликта | — | — | — | модал с diff local/disk, кнопки keep_local/keep_disk/merge |
| **VaultSettings** | путь к vault, статус sync | — | «Vault не подключён» | баннер «sync paused» | статус + выбор папки |

### 4.2 UI-примитивы (packages/ui)

- **BlockNote-редактор** (A1): новый wrapper `packages/ui/src/components/block-editor/block-editor.tsx` поверх `@blocknote/react` + `@blocknote/mantine` (или headless + Tailwind). Зависимость добавляется в `packages/ui` через bun. Контракт пропсов:
  ```ts
  type BlockEditorProps = {
    value: NoteBlock[];                 // controlled blockTree
    onChange: (next: NoteBlock[], markdown: string) => void; // деривация markdown в onChange
    editable?: boolean;                 // false → read-only (error/permission)
    onWikiLinkClick?: (slug: string) => void;
    onCreateLink?: (query: string) => Promise<{ slug: string; title: string }[]>; // автокомплит [[
    placeholder?: string;
    "aria-label"?: string;              // WCAG: editor region label
  };
  ```
- **DataGridView** — обёртка `packages/ui/src/components/data-grid/` (TanStack Table поверх существующего `table.tsx`), пропсы `{ columns, data, onRowClick, sort, onSortChange }`. Переиспользуема для #04/Notion-views.
- **GraphMini** — `packages/ui/src/components/graph-mini/` (SVG force-layout, без freeform-редактирования), пропсы `{ nodes, edges, onNodeClick, focusId }`. Полноценный canvas — Фаза 5.
- 3-pane — собственная вёрстка на существующих `resizable.tsx` + `scroll-area.tsx` (00-SC §2D).

### 4.3 User-flows (на уровне кликов)

**Flow A — создать заметку и связать `[[wikilink]]`:**
1. В NoteList клик «+ Создать» → оптимистично добавляется строка (idempotencyKey генерится клиентом), фокус в NoteEditor.
2. Печать заголовка → blur → автосейв `create`.
3. В теле печать `[[` → выпадает автокомплит (`onCreateLink` → `note.search keyword`), выбор цели или «Создать ‘X’».
4. Сохранение (debounce) → `update` → сервер `syncOutgoingLinks` пишет `edges links_to`; BacklinksPanel целевой заметки обновляется live (Electric).

**Flow B — markdown-on-disk правка извне (desktop):**
1. Пользователь правит `notes/welcome.md` в Obsidian.
2. `vault-sync` ловит `disk_changed` → renderer → `pushFromDisk`.
3. Если заметка не редактировалась в Rox (`in_sync`) → узел обновлён, NoteEditor live-перерисовывается из кэша.
4. Если была локальная несохранённая правка → `syncState:conflict` → всплывает ConflictDialog с diff; клик «Объединить» → `resolveConflict(merged)`.

**Flow C — семантический поиск:**
1. Cmd/Ctrl+K → command-bar, режим «Поиск заметок».
2. Ввод запроса → `note.search semantic` (debounce 250 мс).
3. Результаты со `score`/`snippet`; Enter → открыть; при `degraded:true` (embedder down) — баннер «keyword-режим».

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- **Редактор:** BlockNote ARIA-роли (`role="textbox"`/`aria-multiline`), `aria-label` обязателен; полная клавиатурная навигация блоков (стрелки, Enter новый блок, Tab/Shift+Tab вложенность, `/` slash-меню достижимо с клавиатуры, фокус-ловушка в slash-popover с Esc).
- **3-pane:** Tab-порядок sidebar→list→editor; видимый focus-ring (контраст ≥3:1); list — `role="listbox"`, стрелки вверх/вниз, Enter — открыть.
- **ConflictDialog/slash-popover:** focus-trap, Esc закрывает, `aria-modal`, заголовок связан `aria-labelledby`.
- **GraphMini:** не только цвет для типа ребра (паттерн/подпись); клавиатурный обход узлов (Tab) с `aria-label` узла; есть текстовый эквивалент (BacklinksPanel-список) как альтернатива визуальному графу.
- Контраст текста ≥4.5:1; цели нажатия ≥24×24 CSS-px (WCAG 2.2 «Target Size»); все интерактивные элементы достижимы без мыши; `axe-core` в CI на ключевых экранах.

---

## 5. Миграция и обратная совместимость

Расширяем существующее (`knowledge_documents` + `knowledge_links`) → ядро (`entities` kind=`note` + `edges`) + detail (`notes`).

**Имя миграции (drizzle-kit generate):** `bunx drizzle-kit generate --name="notes_detail_on_graph"` (генерит SQL для `notes`, `note_revisions`, `note_idempotency`, новых pgEnum'ов; таблицы ядра `entities`/`edges` создаёт миграция #01). Никогда не редактировать `packages/db/drizzle/` вручную (AGENTS.md). После прогона — проверить генерацию expression-индекса `notes_org_vault_path_uniq` (ОВ-7).

**Пошаговый план (backfill-скрипт `packages/scripts/src/migrate-knowledge-to-notes.ts`, запускается на neon-branch, не на проде):**
1. Деплой схемы (`entities`/`edges` от #01 + `notes`/`note_revisions`). Существующий `knowledge`-API продолжает писать в `knowledge_documents` (без изменений) — **фаза двойной записи**.
2. Backfill: для каждого `knowledge_documents` → `graphService.create({ kind:"note", title, slug, markdown, v2ProjectId, status:"active", createdByUserId })` (идемпотентно по `(orgId, kind, slug)` через `entities_org_kind_slug_uniq`); затем `INSERT notes` с `blockTree = markdownToBlockTree(markdown)`, `sourceKind` из `knowledge.sourceKind`, `revision:0`, snapshot в `note_revisions` (origin `promote_backfill`). slug стабилен, служит ключом маппинга.
3. Backfill рёбер: каждый `knowledge_links` → `edges` relation=`links_to` (`sourceEntityId`/`targetEntityId` по slug-маппингу, `targetSlug`, `resolved`). Теги `knowledge_documents.tags[]` → lazy `tag`-узлы + `edges tagged_with`.
4. Переключение чтения: UI/клиенты переводятся на `note`-роутер. `knowledge`-роутер процедуры `create/update/delete` начинают писать **в ядро** (проброс на `note`-логику) + опц. зеркалить в `knowledge_documents` до конца дедлайна совместимости.
5. Депрекейт: после стабилизации — `knowledge`-роутер помечается deprecated; `knowledge_documents`/`knowledge_links` остаются read-only legacy ≥1 релиз, затем удаляются отдельной миграцией `drop_legacy_knowledge`.

**Что депрекейтится:** `knowledge`-роутер (write-path), таблицы `knowledge_documents`/`knowledge_links` (после grace-периода). `notes`-роутер (`profileNotes`) — **не затрагивается** (другой домен).

**Обратная совместимость:** `KnowledgeSourceRef` переиспользуется как есть (импорт из `@rox/shared/knowledge`). `NoteBacklink` — **отдельный тип, НЕ равный** `KnowledgeBacklink` (отличие `sourceDocumentId`→`sourceEntityId` + явная семантика `resolved`, см. раздел 2); там, где legacy-прокси `knowledge.backlinks` обязан вернуть старую форму, применяется явный адаптер-маппинг `sourceEntityId → sourceDocumentId`, а не общий тип. Старый `[[wikilink]]`/`#tag` синтаксис и slug-схема (`knowledgeSlugSchema`) сохранены — контент не ломается.

**Откат (down, концептуально):** `notes_detail_on_graph` обратима — drop `notes`/`note_revisions`/новых enum'ов; данные восстановимы из не удалённых `knowledge_documents` (потому legacy держим read-only до полной уверенности). Backfill-скрипт идемпотентен и повторно-безопасен (`ON CONFLICT DO NOTHING` по естественным ключам), отдельной down-миграции данных не требует. Drizzle генерирует прямую миграцию; концептуальный «down» = ручной reverse-скрипт, тестируется на neon-branch перед прод-деплоем.

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Given** активная org, **When** `note.create` с уникальным slug, **Then** появляется `entities` kind=`note` (через graph-сервис) + `notes`-row + `note_revisions` rev0; повторный вызов с тем же `idempotencyKey` возвращает ту же заметку без второй вставки.
2. **Given** заметка с телом `[[other-note]]`, **When** сохранена, **Then** создаётся `edges` relation=`links_to` (`targetSlug='other-note'`); если `other-note` не существует — `resolved=false`, `targetEntityId=null`.
3. **Given** неразрешённая ссылка на `other-note`, **When** позже создаётся заметка со slug `other-note`, **Then** входящее ребро авто-резолвится (`resolved=true`, `targetEntityId` проставлен) — `resolveIncomingLinks`.
4. **Given** заметка с `#идея`, **When** сохранена, **Then** существует `tag`-узел slug=`идея` (lazy) и `edges tagged_with`; `setTags` без `идея` удаляет ребро.
5. **Given** заметка rev=N, **When** два клиента шлют `update` с `baseRevision=N`, **Then** первый успешен (rev=N+1), второй получает `CONFLICT` с `currentRevision=N+1` (optimistic concurrency).
6. **Given** заметка, **When** `note.update` правит `blockTree`, **Then** `markdown` дерайвится детерминированно (`blockTreeToMarkdown`), создаётся снапшот `note_revisions`. **Roundtrip (согласовано с R1, §9):** (a) на **поддерживаемом подмножестве** блоков (параграфы, заголовки, списки, цитаты, код-блоки) `markdownToBlockTree(blockTreeToMarkdown(x))` структурно эквивалентен `x`; (b) для произвольного `x` (включая таблицы/callout/embeds, сериализуемые в HTML-комментарий-маркер) полная эквивалентность НЕ требуется — вместо этого проверяется **идемпотентность второго прохода**: `f(f(md)) == f(md)`, где `f = blockTreeToMarkdown ∘ markdownToBlockTree`. Loss-less restore гарантируется только для маркированных блоков (R1).
7. **Given** заметка проиндексирована, **When** `note.search semantic`, **Then** возвращаются hits, отфильтрованные по `orgId`; при недоступном embedder ответ `degraded:true` в keyword-режиме (без throw).
8. **Given** заметка `in_sync`, **When** `pushFromDisk` с новым `diskHash`, **Then** узел обновлён, `revision+1`, `syncState=in_sync`, snapshot origin=`disk_watcher`; повтор с тем же `diskHash` — no-op.
9. **Given** заметка `dirty_local`, **When** `pushFromDisk` с расходящимся `diskHash`, **Then** `syncState=conflict` (note-level), узел НЕ перезаписан; `resolveConflict(keep_disk)` приводит к `in_sync` и `revision+1`. **И (Фаза-2, ревизируемо):** если оба `blockTree` несут per-block `_mtimeMs`, block-level авто-merge выбирает по большему `_mtimeMs` на одинаковых `block.id`; при отсутствии `_mtimeMs` хотя бы у одной стороны merge откатывается на note-level LWW (см. §3.2, ОВ-6).
10. **Given** заметка, **When** `archive status=trashed`, **Then** `entities.status='trashed'`, заметка исчезает из `list` (по умолчанию active), но доступна в корзине и в `get`; рёбра сохранены.
11. **Given** backfill на neon-branch, **When** запущен повторно, **Then** дубликатов `entities`/`edges` нет (идемпотентность по естественным ключам).
12. **Given** клиент с пустым Electric-кэшем и `isReady=false`, **When** в кэше уже есть строки заметок, **Then** NoteList рендерит их немедленно (cache-first), не показывая скелет (AGENTS.md §9).
13. **Given** редактор открыт, **When** навигация только с клавиатуры, **Then** доступны: новый блок (Enter), вложенность (Tab), slash-меню (`/` + Esc), без ловушек фокуса; `axe-core` без нарушений на NotesLayout.

---

## 7. Тест-план

**Unit** (`bun test`, без БД):
- `packages/shared/src/knowledge/blocktree.test.ts` — roundtrip `markdownToBlockTree`/`blockTreeToMarkdown`/`blockTreeToPlain` (AC6): структурная эквивалентность на поддерживаемом подмножестве (вложенные списки, код-блоки, frontmatter-сохранение) + идемпотентность второго прохода `f(f(md))==f(md)` для блоков с HTML-комментарий-маркером (таблицы/callout/embeds, R1).
- Переиспользуемые `wikilinks`/`mdx-security` тесты уже есть — расширить кейсами `#tag`/unicode-slug.
- Idempotency-логика `create` (мок graph-сервиса) — повторный ключ → один insert (AC1).
- Конфликт-merge по блокам (`block.id` last-writer-wins) — чистая функция (AC9).

**Integration** (tRPC + Drizzle на **neon-branch**, фикстуры org/user; паттерн как `knowledge.test.ts`):
- Фикстура: новый neon-branch (root `.env` → branch, не прод; см. AGENTS.md DB-migrations), seed org+user+entities-таблицы.
- `note.create/update/get/list/archive/setTags` happy-path + ошибки (`CONFLICT`/`NOT_FOUND`/`BAD_REQUEST`).
- `syncOutgoingLinks`/`resolveIncomingLinks` на `edges` (AC2–AC4) — порт `knowledge.test.ts` на ядро.
- `pushFromDisk`/`resolveConflict` state-machine (AC8–AC9) — все переходы `noteSyncState`.
- optimistic concurrency `baseRevision` (AC5).
- Backfill-скрипт повторно-безопасен (AC11) — прогон дважды, ассерт отсутствия дублей.

**e2e** (Playwright, `apps/web`): Flow A (создать+wikilink+бэклинк live-обновление), Flow C (семантический поиск + degraded-баннер). Vault-sync (Flow B) — desktop-only, отдельный e2e в `apps/desktop` (mock vault-каталог в tmp).

**Команды:**
```bash
bun test packages/shared/src/knowledge          # unit (blocktree/wikilinks)
bun test packages/trpc/src/router/note          # integration (neon-branch via .env)
bun run lint && bun run typecheck               # обязательный pre-merge gate (CI=0 warnings)
```
**Целевое покрытие изменённого кода ≥80% веток** (новые `note`-роутер, `links.ts`, `blocktree.ts`, sync-state-machine). Smoke перед push: `bun test packages/shared packages/trpc/src/router/note`.

---

## 8. Задачи реализации (ordered work-list, PR-able срезы)

1. **PR-1 — Enum + detail-схема.** `packages/db/src/schema/enums.ts` (+`note_doc_type`/`note_source_kind`/`note_sync_state`), `packages/db/src/schema/notes.ts` (`notes`/`note_revisions`/`note_idempotency` + типы; `NoteBlock` с `_rev`/`_mtimeMs`), экспорт в `packages/db/src/schema/index.ts`, relations в `relations.ts`. `bunx drizzle-kit generate --name="notes_detail_on_graph"` + **проверка expression-индекса `notes_org_vault_path_uniq`** (ОВ-7, §1.2; при сбое — generated-колонка `vault_rel_path`). Зависит от: схема ядра #01 (`entity.ts`/`edges.ts`).
2. **PR-2 — blocktree-утилиты.** `packages/shared/src/knowledge/blocktree.ts` + тесты (`blockTreeToMarkdown`/`markdownToBlockTree`/`blockTreeToPlain`), экспорт в `packages/shared/src/knowledge/index.ts`. Без БД.
3. **PR-3 — `note`-роутер (CRUD на ядре).** `packages/trpc/src/router/note/{schema,note,links,index}.ts`; процедуры 1–9 (§2); интеграция с graph-сервисом #01; регистрация в `packages/trpc/src/root.ts`. Integration-тесты на neon-branch. Зависит от PR-1, PR-2, graph-router #01.
4. **PR-4 — Backfill + двойная запись.** `packages/scripts/src/migrate-knowledge-to-notes.ts`; проброс `knowledge`-роутера write-path на `note`-логику (фаза совместимости). Тест идемпотентности. Зависит от PR-3.
5. **PR-5 — UI block-editor + 3-pane.** `packages/ui/src/components/block-editor/` (BlockNote-обёртка, bun-зависимости), `apps/web` feature-модуль `notes` (NotesLayout/NoteList/NoteEditor/BacklinksPanel/DatabaseView), Electric live-queries (cache-first), command-bar поиск. e2e Flow A/C. Зависит от PR-3.
6. **PR-6 — vault-sync sidecar (desktop).** `apps/desktop` worker + `apps/desktop/src/preload` typed bridge; процедуры `pushFromDisk`/`pullForDisk`/`resolveConflict` (§2 п.10–12); ConflictDialog/VaultSettings; host-service supervision. e2e Flow B. Зависит от PR-3, PR-5.
7. **PR-7 — GraphMini + DatabaseView полировка + a11y.** `packages/ui/src/components/graph-mini/`, `data-grid/`; axe-core в CI; WCAG-доводка (§4.4). Зависит от PR-5.
8. **PR-8 — Депрекейт legacy.** Пометить `knowledge`-роутер deprecated; план `drop_legacy_knowledge` (после grace-периода, отдельный релиз). Зависит от PR-4 + подтверждения переключения чтения.

---

## 9. Риски и открытые вопросы

**Риски + митигейшн:**
- **R1. BlockNote↔markdown roundtrip-потери** (таблицы/callout/embeds не маппятся в чистый md). *Митигейшн:* `blockTree` — источник истины (A2); markdown — производное для поиска/диска; неподдерживаемые блоки сериализуются в HTML-комментарий-маркер для loss-less restore; roundtrip-тест в CI (AC6).
- **R2. Двусторонний sync БД↔файлы — гонки/конфликты** (watcher debounce, atomic writes, переименования). *Митигейшн:* state-machine `noteSyncState` + `diskHash`-сравнение + idempotencyKey; note-level last-writer-wins (block-level при per-block `_mtimeMs`, ОВ-6) + полная история `note_revisions`; запись на диск только через sidecar-команду (single-writer на путь).
- **R3. Стоимость/латентность embeddings при backfill** большого корпуса. *Митигейшн:* реиндекс асинхронный (индексатор #02), батчинг; поиск имеет keyword-режим (`degraded:true`), не блокируется.
- **R4. Двойная запись (knowledge↔notes) рассинхрон** в переходный период. *Митигейшн:* единый источник при чтении (переключение на `note` сразу после backfill), `knowledge`-write становится тонким прокси на `note`-логику, а не параллельной веткой.
- **R5. Идемпотентность на ядре** — где хранить `idempotencyKey` (нет своей колонки в `entities`). *Митигейшн:* PKM фиксирует **собственную** detail-таблицу `note_idempotency` (§1.3a, 24ч TTL, uniqueIndex `(org, key)`) — этого достаточно для самодостаточного PR-3, без ожидания #01. При появлении ядрового механизма таблица заменяется/проксируется без изменения контракта процедур — согласовать с владельцем #01 (ОВ-1).
- **R6. Размер `blockTree` jsonb** для огромных заметок (>2 МБ). *Митигейшн:* лимит `PAYLOAD_TOO_LARGE`; крупные вложения — в minio (`files/`) как `file`-узлы + `attached_to`, не инлайн.

**Не-блокирующие открытые вопросы:**
- **ОВ-1.** Точный механизм идемпотентности POST в ядре (отдельная таблица vs `edges.metadata` vs Redis-ключ) — решает владелец #01. PKM на старте самодостаточен через собственную `note_idempotency` (§1.3a); при появлении ядрового механизма — миграция на него без изменения контракта `create`/`pushFromDisk`/`resolveConflict`.
- **ОВ-6.** Block-level merge при двустороннем sync (§3.2) — обязательность per-block `_mtimeMs` в `NoteBlock`, кто его проставляет (редактор BlockNote vs `disk_watcher`) и поведение при частичном отсутствии. Фаза 1 — note-level LWW по умолчанию; block-level — ревизируемо/Фаза-2.
- **ОВ-7.** Корректность генерации expression-based partial unique index `notes_org_vault_path_uniq` через `drizzle-kit generate` (§1.2) — проверяется в PR-1; при необходимости — generated-колонка `vault_rel_path`.
- **ОВ-2.** BlockNote vs TipTap финально (A1) — зависит от строгости md-roundtrip на реальном корпусе (00-SC §2F). Решается после R1-замеров.
- **ОВ-3.** Глубина граф-вью (`graph depth=2`) и порог усечения узлов — тюнится по перфу на реальных org.
- **ОВ-4.** Нужен ли E2EE для приватного vault-контента (Skiff-уровень) с Фазы 1 — вероятно нет (desktop-local), но требует подтверждения (00-SC §2F).
- **ОВ-5.** Web-клиент без диска: предлагать ли «download vault snapshot» (`exports/` в minio) как суррогат md-on-disk — отдельный мелкий таск.
