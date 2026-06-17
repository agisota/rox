# 10 — Чат (нативный): L3 implementation-ready ТЗ

> Зависит от `00-shared-context.md` (контракт ядра графа §2, конвенции §3, допущения §4, шаблон §5) и
> `rox-superapp-roadmap-and-design.md` (Часть 1 Фаза 4; Часть 2A/2C/2E). НЕ переопределяет ядро §2 —
> enum'ы только расширяются (diff), узлы пишутся через graph-сервис ядра.

## 0. Резюме и границы

**Что это.** Нативный человеческий мессенджер в стиле Mattermost: рабочие пространства → **каналы**
(публичные/приватные) + **DM/групповые DM**, **треды** (reply-цепочки), реакции, упоминания `@user`/`#channel`,
вложения, read-state (непрочитанные/последнее прочитанное), typing/presence, edit/delete сообщений. Realtime —
поверх **существующих** `apps/relay` + `apps/streams` + Electric (A3), без нового realtime-стека.

**Маппинг на ядро (Фаза 4).** Канал = `entities.kind="channel"`, сообщение = `entities.kind="message"`.
Detail-таблицы (1:1 к `entityId`): `channels`, `channel_members`, `messages`, `message_reactions`,
`message_reads`. Участники/авторство/треды/упоминания/вложения выражаются `edges` ядра. Узлы создаются
**только** через graph-сервис ядра (`graph.create`/`graph.link`), detail-роутер `chat` не дублирует запись в `entities`.

**Что входит:**
1. Drizzle-схема detail-таблиц + 4 новых локальных enum (diff к §2.1) + qdrant-маппинг сообщений.
2. Новый tRPC-роутер `chatNative` (НЕ трогает существующий `chatRouter` — тот про AI-агент-сессии).
3. Realtime: Electric shape-стримы (каналы/сообщения/read-state) вниз; relay-WS-канал для эфемерных
   typing/presence; bridge-сервис `apps/streams` (presence-агрегатор).
4. UI feature-модуль `chat` (lazy, Electron renderer): список каналов, тред-вью, композер, ростер участников.
5. Миграция (новые таблицы — аддитивно), приёмочные критерии, тест-план, work-list, риски.

**Что НЕ входит (out of scope):**
- AI-агент-чат (`packages/chat`, `chatSessions`, `chatRouter`, `economy`) — это подсистема #11, отдельный
  домен; здесь **не модифицируется**.
- Overlay-ассистент / push-to-talk STT / handy — подсистема 12 (вне пакета, A4).
- Голос/видео-звонки, E2EE сообщений (revisable; см. §9), федерация между org.
- Мост в внешние мессенджеры (Slack/Discord-импорт) — будущая итерация.

**Зависимости:** #1 (ядро графа: `entities`/`edges`/`identity_links`, graph-router), #2 (рантайм:
Electric down-sync, qdrant для семантики, minio для вложений; secret-store не требуется — чат внутренний).

**Принятые допущения (из 00 §4, ревизируемо):**
- **A3** — realtime = relay + streams + Electric; presence/typing через relay-каналы. *Ревизируемо:* при росте
  нагрузки выделить presence в отдельный pub/sub.
- **A8** — minio bucket `org-<orgId>`, префикс вложений чата `files/chat/<channelEntityId>/<messageEntityId>/`.
- Доп. допущение **A-chat-1:** мембершип канала — отдельная таблица `channel_members` (а не только `edges`),
  т.к. нужны per-membership поля (роль, `last_read_at`, mute, notif-prefs) и быстрый ростер; параллельно
  пишется зеркальный `edge(participant_of)` для графа/поиска. *Ревизируемо.*
- Доп. допущение **A-chat-2:** read-state хранится как Postgres-таблица `message_reads` (per-user последнее
  прочитанное сообщение на канал) — синхронизируется Electric, cache-first.

---

## 1. Доменная модель (полная схема БД)

### 1.1 Enum-расширения (diff к `enums.ts` §2.1)

`entityKindValues` и `edgeRelationValues` из §2.1 **уже содержат** всё нужное (`channel`, `message`;
`participant_of`, `replies_to`, `authored_by`, `mentions`, `attached_to`, `references`). **Новых kind/relation
ядра не добавляем.** Добавляются только локальные enum'ы detail-таблиц чата (diff — append-only):

```ts
// enums.ts — ДОБАВИТЬ (не менять существующее)
export const channelKindValues = ["public", "private", "dm", "group_dm"] as const;
export const channelMemberRoleValues = ["owner", "admin", "member"] as const;
export const messageTypeValues = ["text", "system", "join", "leave"] as const;
export const messageStatusValues = ["sent", "edited", "deleted"] as const;
```

> Это **локальные доменные** enum'ы (как `journalEntryStatusValues`), а не расширение ядровых
> `entityKind`/`edgeRelation`. `newEnumValues` спеки = `channel_kind(4)`, `channel_member_role(3)`,
> `message_type(4)`, `message_status(3)`.

### 1.2 Detail-таблицы (`packages/db/src/schema/chat-native.ts`)

Файл новый — отдельно от `schema.ts` (где `chatSessions` AI-домена), чтобы не смешивать домены.
Конвенции зеркалят `journal.ts`/`knowledge.ts`.

```ts
import { sql } from "drizzle-orm";
import {
  boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { entities } from "./entity"; // ядро (Фаза 0)
import {
  channelKindValues, channelMemberRoleValues, messageStatusValues, messageTypeValues,
} from "./enums";

export const channelKind = pgEnum("channel_kind", channelKindValues);
export const channelMemberRole = pgEnum("channel_member_role", channelMemberRoleValues);
export const messageType = pgEnum("message_type", messageTypeValues);
export const messageStatus = pgEnum("message_status", messageStatusValues);

/** Канал — 1:1 к entities(kind="channel"). entities.title = имя; entities.slug = #handle. */
export const channels = pgTable("channels", {
  entityId: uuid("entity_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: channelKind().notNull().default("public"),
  topic: text(),
  purpose: text(),
  archived: boolean().notNull().default(false),
  // Для dm/group_dm — детерминированный ключ из отсортированных userId (дедуп DM-каналов).
  dmKey: text("dm_key"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("channels_org_idx").on(t.organizationId),
  index("channels_kind_idx").on(t.kind),
  index("channels_last_msg_idx").on(t.organizationId, t.lastMessageAt),
  uniqueIndex("channels_org_dmkey_uniq").on(t.organizationId, t.dmKey).where(sql`${t.dmKey} IS NOT NULL`),
]);

/** Членство пользователя в канале + per-user read/mute/notif. Зеркалит edge(participant_of). */
export const channelMembers = pgTable("channel_members", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  channelEntityId: uuid("channel_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: channelMemberRole().notNull().default("member"),
  muted: boolean().notNull().default(false),
  notifPref: jsonb("notif_pref").$type<{ level?: "all" | "mentions" | "none" }>().notNull().default({}),
  lastReadMessageId: uuid("last_read_message_id").references(() => entities.id, { onDelete: "set null" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("channel_members_channel_idx").on(t.channelEntityId),
  index("channel_members_user_idx").on(t.userId),
  uniqueIndex("channel_members_channel_user_uniq").on(t.channelEntityId, t.userId),
]);

/**
 * Сообщение — 1:1 к entities(kind="message"). entities.markdown = тело (markdown).
 * Авторство, канал, тред и упоминания выражены edges ядра (см. §2.4):
 *  - edge(message → channel,  participant_of)
 *  - edge(message → contact|user-entity, authored_by)
 *  - edge(reply  → parent message, replies_to)          [тред]
 *  - edge(message → entity, mentions)                   [@user / #channel / [[note]]]
 *  - edge(message → file-entity, attached_to)           [вложение]
 * channelEntityId/threadRootId денормализованы сюда для дешёвых фильтров/сортировок и Electric-shape.
 */
export const messages = pgTable("messages", {
  entityId: uuid("entity_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  channelEntityId: uuid("channel_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  type: messageType().notNull().default("text"),
  status: messageStatus().notNull().default("sent"),
  // Корень треда: NULL = верхний уровень; иначе entityId родительского top-level сообщения.
  threadRootId: uuid("thread_root_id").references(() => entities.id, { onDelete: "set null" }),
  // Клиентский идемпотентный ключ (см. §2): дедуп ретраев отправки. uuid-колонка — соответствует
  // Zod-input `clientMsgId: z.string().uuid()` и даёт компактный b-tree partial-uniqueIndex (ниже).
  clientMsgId: uuid("client_msg_id"),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("messages_channel_created_idx").on(t.channelEntityId, t.createdAt),
  index("messages_thread_idx").on(t.threadRootId),
  index("messages_author_idx").on(t.authorUserId),
  uniqueIndex("messages_channel_clientmsg_uniq").on(t.channelEntityId, t.clientMsgId).where(sql`${t.clientMsgId} IS NOT NULL`),
]);

/** Реакции эмодзи на сообщение (одна на (message,user,emoji)). */
export const messageReactions = pgTable("message_reactions", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  messageEntityId: uuid("message_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("message_reactions_message_idx").on(t.messageEntityId),
  uniqueIndex("message_reactions_msg_user_emoji_uniq").on(t.messageEntityId, t.userId, t.emoji),
]);

/**
 * Read-state канала на пользователя (зеркалит channelMembers.lastRead*, отдельная таблица для
 * узкой Electric-shape «мои read-cursor'ы» без протечки чужого мембершипа). cache-first.
 */
export const messageReads = pgTable("message_reads", {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  channelEntityId: uuid("channel_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadMessageId: uuid("last_read_message_id").references(() => entities.id, { onDelete: "set null" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  mentionCount: integer("mention_count").notNull().default(0),
}, (t) => [
  index("message_reads_user_idx").on(t.userId),
  uniqueIndex("message_reads_channel_user_uniq").on(t.channelEntityId, t.userId),
]);

export type InsertChannel = typeof channels.$inferInsert;
export type SelectChannel = typeof channels.$inferSelect;
export type InsertChannelMember = typeof channelMembers.$inferInsert;
export type SelectChannelMember = typeof channelMembers.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type SelectMessage = typeof messages.$inferSelect;
export type InsertMessageReaction = typeof messageReactions.$inferInsert;
export type SelectMessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageRead = typeof messageReads.$inferInsert;
export type SelectMessageRead = typeof messageReads.$inferSelect;
```

> `sql` импортируется из `drizzle-orm` (как в §2.2 ядра для partial-uniqueIndex). Вложения чата
> переиспользуют `kind="file"`-entity ядра (detail `files` подсистемы #2) + `edge(attached_to)`; **своя**
> таблица вложений не заводится — `storageRef` живёт в file-entity (A8-префикс).

### 1.3 Используемое из ядра / добавляемое

| Аспект | Из ядра (§2, не дублируется) | Добавляет эта спека |
|---|---|---|
| Узлы | `entities` kind `channel`, `message`; (вложение — `file`) | detail `channels`/`messages` 1:1 |
| Связи | `edges`: `participant_of`, `authored_by`, `replies_to`, `mentions`, `attached_to`, `references` | — |
| Контакты | `identity_links` (kind `chat`) для резолва `@handle`→contact | — |
| Запись узла | `graph.create`/`graph.link`/`graph.promote` | detail-роутер `chatNative` |
| Поиск | `graph.search` (qdrant) | payload-маппинг сообщений (ниже) |

### 1.4 Маппинг на qdrant

Индексируются **сообщения** (`kind="message"`, `type="text"`, `status!="deleted"`) в **единой** коллекции ядра.
- **Embed-текст:** `entities.markdown` (тело сообщения). Системные/join/leave и удалённые — НЕ индексируются.
- **Payload:** `{ entityId, kind:"message", orgId, channelEntityId, threadRootId, authorUserId, createdAt }`
  (фильтрация по `orgId` + `channelEntityId` обязательна; приватные каналы фильтруются по доступу до выдачи).
  Реиндекс — по `entities.updated_at` (edit пере-эмбедит, delete снимает point) — механизм indexer'а #2.

---

## 2. API-контракты (tRPC)

**Новый роутер** `packages/trpc/src/router/chat-native/` (ключ в `appRouter`: `chatNative`). Существующий
`chatRouter` (AI-сессии) НЕ трогаем. Все процедуры — `protectedProcedure`, org-scoped через
`requireActiveOrgId(ctx)`; запись узлов делегируется graph-сервису ядра (вызов `graphService.create/link`
внутри той же `dbWs.transaction`, `tx` — ПЕРВЫЙ позиционный аргумент, см. §2.4), затем пишется detail-строка.
Мутации с побочкой возвращают Electric `txid` (через `getCurrentTxid(tx)`, как `chatRouter.createSession`) для
синхронной инвалидации на клиенте.

**Импорты ядра (зафиксированы для исполнителя, чтобы не искать):**
```ts
import { db, dbWs } from "@rox/db/client";
import { getCurrentTxid } from "@rox/db/utils";
import { graphService } from "@rox/trpc/router/graph/service"; // create/link/promote ядра (#1 §3)
import { v5 as uuidv5 } from "uuid";                            // derive idempotencyKey (см. §2.4)
```

Коды ошибок (TRPCError): `UNAUTHORIZED` (нет сессии), `FORBIDDEN` (нет org / не участник приватного канала /
org mismatch), `NOT_FOUND` (канал/сообщение), `CONFLICT` (нарушение идемпотентного uniqueIndex при гонке),
`BAD_REQUEST` (валидация Zod / пустое тело), `TOO_MANY_REQUESTS` (rate-limit, 429 + Retry-After — механизм §2.5).

### 2.1 Каналы

| Процедура | Тип | Zod input | Zod output | Правила |
|---|---|---|---|---|
| `listChannels` | query | `{ includeArchived?: boolean }` | `{ channels: ChannelView[] }` | только каналы, где `ctx.user` — участник, ИЛИ публичные каналы org; сорт по `lastMessageAt desc`. |
| `getChannel` | query | `{ channelId: z.uuid() }` | `ChannelView \| null` | приватный → 404 если не участник. |
| `createChannel` | mutation | `{ channelId: z.uuid(), name: z.string().min(1).max(80), kind: channelKindEnum, slug?: z.string().regex(/^[a-z0-9-]+$/).max(80), topic?, purpose? }` | `{ channelId, txid, deduped: boolean }` | **идемпотентно** по `channelId` (graph `idempotencyKey` из §2.4 + `onConflictDoNothing` на detail). В одной `dbWs.transaction`: `entity(kind=channel)` через `graph.create(tx, {idempotencyKey, …})` + detail `channels` + `channelMembers(owner=creator)` + зеркальный `edge(creator→channel, participant_of)`. `kind in (dm,group_dm)` запрещён здесь → `BAD_REQUEST` (DM создаётся `openDm`). |
| `openDm` | mutation | `{ userIds: z.array(z.uuid()).min(1).max(8) }` | `{ channelId, txid, created: boolean }` | **идемпотентно** по `dmKey`=sha256 отсортированных (creator+userIds). Есть → вернуть; иначе создать `kind=dm`(1)/`group_dm` + members. |
| `updateChannel` | mutation | `{ channelId, name?, topic?, purpose? }` | `{ updated: boolean, txid }` | роль `owner`/`admin`. Обновляет `entities.title` (graph) + detail. |
| `archiveChannel` | mutation | `{ channelId }` | `{ archived: boolean, txid }` | роль `owner`/`admin`; `channels.archived=true` + `entities.status="archived"` (graph). DM нельзя → `BAD_REQUEST`. |

### 2.2 Членство

| Процедура | Тип | input | output | Правила |
|---|---|---|---|---|
| `joinChannel` | mutation | `{ channelId }` | `{ joined, txid }` | только `public`. Идемпотентно (uniqueIndex `channel_members_channel_user_uniq`). Пишет member + `edge(participant_of)` + system-message `type="join"`. |
| `leaveChannel` | mutation | `{ channelId }` | `{ left, txid }` | удаляет member + edge; system-message `type="leave"`. `owner` не может уйти, не передав владение → `BAD_REQUEST`. |
| `addMembers` | mutation | `{ channelId, userIds: z.array(z.uuid()).min(1).max(50) }` | `{ added: number, txid }` | `private` — роль `owner`/`admin`. Batch-upsert members + edges. |
| `removeMember` | mutation | `{ channelId, userId }` | `{ removed, txid }` | роль `owner`/`admin`; нельзя удалить последнего `owner`. |
| `listMembers` | query | `{ channelId }` | `{ members: MemberView[] }` | участник канала; presence добавляется на клиенте (см. §3), не в БД. |
| `updateMemberPrefs` | mutation | `{ channelId, muted?: boolean, notifLevel?: z.enum(["all","mentions","none"]) }` | `{ updated, txid }` | только свой membership. |

### 2.3 Сообщения

| Процедура | Тип | input | output | Правила |
|---|---|---|---|---|
| `listMessages` | query | `{ channelId, threadRootId?: z.uuid().nullable(), cursor?: z.string(), limit?: z.number().min(1).max(100).default(50) }` | `{ messages: MessageView[], nextCursor: string \| null }` | участник канала (приватный→403). Keyset-пагинация по `(createdAt,entityId)`. `threadRootId=null` → top-level; задан → ветка треда. Electric стримит «горячее окно», `listMessages` — для скролла в историю. |
| `sendMessage` | mutation | `{ channelId, clientMsgId: z.string().uuid(), markdown: z.string().min(1).max(40_000), threadRootId?: z.uuid().nullable(), mentions?: z.array(z.uuid()), attachmentEntityIds?: z.array(z.uuid()).max(20) }` | `{ messageId, txid, deduped: boolean }` | **ИДЕМПОТЕНТНО** по `(channelEntityId, clientMsgId)`. Транзакция: `graph.create(entity kind=message, markdown)` → detail `messages` (денорм) → edges `participant_of`(→channel), `authored_by`(→author), `replies_to`(тред), `mentions`(каждый), `attached_to`(вложения) → `UPDATE channels SET last_message_at` → bump `message_reads.mention_count` упомянутым. rate-limit ≤10 msg/10s/user/channel → `TOO_MANY_REQUESTS` (механизм §2.5). Запись `message`-entity — через `graph.create(tx, {idempotencyKey, …})`, ключ деривится из `(channelId, clientMsgId)` (§2.4). Триггерит indexer-upsert (qdrant) асинхронно. |
| `editMessage` | mutation | `{ messageId, markdown: z.string().min(1).max(40_000) }` | `{ updated, txid }` | только автор; `status="edited"`, `editedAt=now`, обновляет `entities.markdown` (→ переэмбед). |
| `deleteMessage` | mutation | `{ messageId }` | `{ deleted, txid }` | автор ИЛИ `admin`/`owner` канала. Soft-delete: `status="deleted"`, `deletedAt=now`, `entities.markdown=null` (tombstone), снять qdrant-point. Тред-потомки сохраняются. |
| `toggleReaction` | mutation | `{ messageId, emoji: z.string().min(1).max(64) }` | `{ active: boolean, txid }` | участник канала. Идемпотентный toggle на uniqueIndex `(message,user,emoji)`. |
| `markRead` | mutation | `{ channelId, lastReadMessageId: z.uuid() }` | `{ txid }` | upsert `message_reads(channel,user)` + `channel_members.lastRead*`; обнуляет `mention_count`. Монотонно: курсор не откатывается назад. |
| `getUnreadSummary` | query | `{}` | `{ items: { channelId: string; unread: number; mentions: number }[] }` | агрегат непрочитанного по всем каналам пользователя (бейджи сайдбара). |

**Zod-выходы (формы, в `chat-native/zod.ts`):**
```ts
ChannelView = { entityId, organizationId, kind, title, slug, topic, purpose, archived,
  lastMessageAt, memberCount, myRole, myMembership: { muted, notifLevel } | null }
MemberView  = { userId, role, joinedAt, muted } // presence добавляется на клиенте из relay
MessageView = { entityId, channelEntityId, authorUserId, type, status, markdown,
  threadRootId, replyCount, editedAt, deletedAt, createdAt,
  reactions: { emoji, count, mine: boolean }[], attachments: { entityId, mime, name, size }[] }
```

### 2.4 Идемпотентность / интеграция с graph-сервисом

- **POST с побочкой** (`createChannel`, `openDm`, `sendMessage`, `joinChannel`, `toggleReaction`, `markRead`) —
  идемпотентны через клиентский UUID (`channelId`/`clientMsgId`) либо естественный uniqueIndex. Повтор → тот же
  результат (`deduped/created/active` флаги), без дубликатов. Соответствует требованию «Idempotency-Key на POST».
- **Запись узла — только graph-сервис ядра, по каноничному контракту #1 §3.** `chatNative` НЕ делает
  `insert(entities)` напрямую. Сигнатуры ядра (`01-core-graph.md` §3) — `tx` ПЕРВЫМ позиционным аргументом,
  обязательный `idempotencyKey`, поле org называется `orgId` (НЕ `organizationId`), kind-цель промоута — `toKind`:
  ```ts
  // GraphCreateInput (#1 §3): { idempotencyKey, orgId, kind, title, markdown?, createdByUserId, v2ProjectId? }
  const { entityId } = await graphService.create(tx, {
    idempotencyKey,            // claim-before-effect, дедуп самого узла (см. ниже)
    orgId,                     // НЕ organizationId
    kind: "message",           // | "channel"
    title,                     // обязателен (для channel = name; для message — см. ниже)
    markdown,                  // тело сообщения / null для канала
    createdByUserId: ctx.user.id,
    v2ProjectId,               // опц.
  });
  // GraphLinkInput (#1 §3): { idempotencyKey, orgId, sourceEntityId, targetEntityId, relation }
  await graphService.link(tx, {
    idempotencyKey: linkKey, orgId, sourceEntityId, targetEntityId, relation: "participant_of",
  });
  ```
  Все вызовы `create`/`link`/`promote` идут в той же `dbWs.transaction`, что и detail-insert, затем пишется
  detail-строка.
- **`idempotencyKey` — обязателен и детерминирован (правила 1/6/7 ядра, claim-before-effect).** Без него claim
  ядра не сработает и на ретрае `sendMessage`/`createChannel` появится orphan-`entities` ДО того, как
  detail-уникальный индекс сдедупит — нарушение инварианта «один писатель / один узел». Поэтому detail-уникальности
  + `onConflictDoNothing` **недостаточно**; ключ деривится детерминированно (uuid-v5, namespace —
  `ROX_CHAT_NS = "6f4c2a10-1f1e-5d3a-9b7c-chat0graph000"` фиксированный):
  - **createChannel:** `create.idempotencyKey = uuidv5("channel:" + channelId, ROX_CHAT_NS)`.
  - **openDm:** `create.idempotencyKey = uuidv5("dm:" + dmKey, ROX_CHAT_NS)`.
  - **sendMessage:** `create.idempotencyKey = uuidv5("msg:" + channelId + ":" + clientMsgId, ROX_CHAT_NS)`.
  - **edges (link):** `link.idempotencyKey = uuidv5("edge:" + relation + ":" + sourceEntityId + ":" + (targetEntityId ?? targetSlug), ROX_CHAT_NS)`
    (для каждого edge свой; ядро + detail-уникальность `edges_source_target_relation_uniq` дают двойную защиту).
  - **system-message (join/leave):** `uuidv5("sys:" + channelId + ":" + userId + ":" + type + ":" + epochBucket, ROX_CHAT_NS)`.
- **Промоут — `graph.promote(tx, GraphPromoteInput)` по каноничному контракту #1 §3:** поле называется `toKind`
  (НЕ `targetKind`), `title` обязателен, `idempotencyKey` обязателен:
  ```ts
  // GraphPromoteInput (#1 §3): { idempotencyKey, sourceEntityId, toKind, title, markdown?, relation? }
  await graphService.promote(tx, {
    idempotencyKey: uuidv5("promote:" + sourceEntityId + ":note", ROX_CHAT_NS),
    sourceEntityId,            // entityId исходного message
    toKind: "note",            // НЕ targetKind
    title,                     // обязателен: первая строка markdown сообщения, обрезанная до 80 симв.
                               //   (fallback "Note from #<channelSlug>" если тело пустое/только-вложение)
    markdown,                  // тело исходного сообщения (копируется в note)
    relation: "derived_from",  // edge(note → message, derived_from)
  });
  ```
  `graph.promote` создаёт `note`/`task`-entity + `edge(derived_from, message→note)`; UI-крючок «Promote to note»
  вызывает `graph.promote`, не свой код. `title` промоутнутой заметки берётся из первой строки `markdown` сообщения.
- **`title` сообщения для `graph.create`.** У `message`-entity `title` тоже обязателен (контракт ядра): пишется
  усечённая первая строка `markdown` (≤120 симв.); для `type in (system,join,leave)` — служебный лейбл
  (`"<user> joined"` / `"<user> left"`). Тело целиком — в `markdown`.
- **Where new vs extend:** роутер `chatNative` — **новый**; `chatRouter` (AI) — **не расширяется**;
  graph-router ядра — **переиспользуется** (без изменений); `enums.ts` — расширяется (diff §1.1);
  `appRouter` (`packages/trpc/src/root.ts`) — добавляется ключ `chatNative`.

### 2.5 Rate-limit `sendMessage` (механизм L3, не «додумать»)

Лимит **≤10 msg / 10s / (user, channel)** → `TOO_MANY_REQUESTS` (429 c заголовком `Retry-After`, секунды).
Механизм — **Upstash-Redis sliding-window** (тот же Redis, что cross-instance fan-out presence в §3.2; корректен
при нескольких api-инстансах, в отличие от in-memory per-instance счётчика):

```ts
// packages/trpc/src/router/chat-native/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL / _TOKEN из env (см. 00-SC §3 «секреты из env»)
export const sendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  prefix: "rl:chat:send",       // полный ключ окна: rl:chat:send:<userId>:<channelId>
  analytics: false,
});

// в sendMessage (ДО открытия dbWs.transaction):
const { success, reset } = await sendLimiter.limit(`${ctx.user.id}:${channelId}`);
if (!success) {
  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000)); // reset — epoch ms окна
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: "rate_limited",
    cause: { retryAfter: retryAfterSec }, // прокидывается в HTTP-заголовок Retry-After на api-слое
  });
}
```

- **Хранилище счётчика:** Upstash-Redis (REST), окно — sliding-window 10s, ключ `rl:chat:send:<userId>:<channelId>`.
- **Несколько api-инстансов:** счётчик в общем Redis → лимит глобальный, не per-instance.
- **`Retry-After`:** `ceil((reset − now)/1000)` секунд; api-слой (`apps/api`) копирует `cause.retryAfter` в
  HTTP-заголовок ответа. Зависимость PR-4 — пакеты `@upstash/ratelimit` + `@upstash/redis` (точные версии, §8).
- **Локальная разработка/тесты:** при отсутствии `UPSTASH_*` env — `Ratelimit` инициализируется с in-memory
  `Map`-эфемеридой (ephemeral cache) только для dev; в проде env обязателен.

---

## 3. Сервисы/процессы/протоколы

### 3.1 Realtime-топология (A3)

```
                 ┌──────────────── Cloud Postgres (Neon) ────────────────┐
   sendMessage ─►│ entities + edges + messages/channels/channel_members  │
   (tRPC api)    │           + message_reactions + message_reads          │
                 └───────────────┬───────────────────────────────────────┘
                                 │ logical replication (durable)
                        ┌────────▼─────────┐  Electric shapes (cache-first, txid-acked)
                        │ electric-proxy   │  • channels(org, member)   • messages(channel, hot window)
                        │ (caddy/wrangler) │  • channel_members(channel)• message_reads(user)
                        └────────┬─────────┘  • message_reactions(channel)
   Electron renderer ◄──────────┘ SSE shape-stream → TanStack DB collections (live queries)
   (chat feature)
        │  эфемерное (НЕ в Postgres): typing-start/stop, presence(online/away), focus-channel
        ▼
   apps/relay  ── WS-канал `chat:<orgId>:<channelId>` (openWsChannel/sendWsFrame) ──► fan-out подписчикам
        ▲
   apps/streams ── presence-агрегатор: online-set per org, TTL-heartbeat, рассылка presence-снапшотов
```

- **Durable путь (сообщения/мембершип/read/реакции):** Postgres → Electric → клиент. Cache-first
  (AGENTS.md §9): рендерим существующие строки даже при `isReady=false`; строгую готовность ждём только для
  записи/seeding. Отправитель оптимистично вставляет в локальную коллекцию по `clientMsgId`; приход той же
  строки из Electric (с серверным `entityId`) дедупает оптимистичную (matching по `clientMsgId`).
- **Эфемерный путь (typing/presence):** relay WS-канал на `(orgId,channelId)`. Формат кадра (JSON):
  ```ts
  // client → relay
  { t: "typing", channelId, state: "start" | "stop" }            // typing
  { t: "presence", state: "online" | "away" | "offline" }        // heartbeat (каждые 20s)
  { t: "subscribe", channelIds: string[] }                       // на открытие воркспейса
  // relay/streams → client (fan-out)
  { t: "typing", channelId, userId, state, ts }
  { t: "presence", userId, state, ts }
  ```
  Typing-эфемерен, TTL 6s на клиенте (нет stop → авто-сброс). Presence — `apps/streams` агрегирует heartbeat'ы
  (TTL 45s) и шлёт снапшоты при изменении. Ничего из этого НЕ пишется в Postgres (нет PII-следа typing).
- **Конфликт-резолюция:** сообщения append-only (нет конфликтов тела). `edit` — last-writer-wins на
  `entities.updated_at` (серверный апдейт авторитетен). `markRead` — монотонный max по `createdAt` курсора
  (не откатывается). `channel_members` prefs — LWW. Приватные данные (read-cursor) шейпятся только владельцу.

### 3.2 Фоновые процессы / sidecar

- **Sidecar для нативного чата НЕ требуется** (N/A: захвата экрана/PTY нет). Realtime обслуживают
  существующие `apps/relay` (Fly, WS-туннель/каналы) и `apps/streams`. `apps/streams` сейчас пустой пакет
  (только `package.json`, нет `src/`) — в этой спеке он наполняется presence-агрегатором (Bun-сервис:
  in-memory online-set + Upstash/Redis для cross-instance fan-out, по образцу `apps/relay/src/directory.ts`).
  Надзор — как у relay (Fly machine, SIGINT/SIGTERM drain), НЕ через host-service.

  **Минимальный контракт presence-сервиса (PR-6, реализуем без додумывания):**
  - **Точка входа:** `apps/streams/src/index.ts` (Bun-сервер; читает `PORT`, `UPSTASH_REDIS_REST_URL`/`_TOKEN`
    из env; экспорт `start()` + `default` для Fly). Подмодули: `presence-store.ts` (Redis), `fanout.ts` (WS).
  - **Хранилище heartbeat (Redis):** на каждый онлайн-юзер — ключ `presence:<orgId>:<userId>` со значением
    `{ state: "online"|"away", ts: <epochMs> }` и **TTL 45s** (`SET … EX 45`); heartbeat (каждые 20s из клиента,
    §3.1) продлевает TTL. Истёкший ключ ⇒ юзер `offline` (TTL-based, без явного delete).
  - **Снапшот org-presence:** запрос `getPresence(orgId)` → `SCAN presence:<orgId>:*` → массив
    `{ userId, state, ts }[]` (отсутствие ключа = `offline`, в снапшот не входит). Кэш снапшота в памяти
    инстанса, инвалидация — по событию ниже.
  - **Событие инвалидации (cross-instance fan-out):** при изменении (новый online / переход away / TTL-expiry,
    детектируемый по Upstash keyspace-notification ИЛИ периодическим reconcile-тиком 10s) сервис публикует в
    Redis pub/sub канал `presence:events:<orgId>` кадр `{ t:"presence", userId, state, ts }`; все инстансы
    `apps/streams`, подписанные на канал, делают fan-out этого кадра WS-подписчикам org (формат кадра — как в
    §3.1 «relay/streams → client»). Дебаунс изменений ≤1 кадр/2s на юзера (риск §9 «масштаб presence»).
  - **Подписка клиента:** через relay WS-канал `chat:<orgId>:<channelId>` (presence идёт тем же транспортом);
    `apps/streams` не держит собственный публичный WS — он публикует снапшоты/события в relay-fan-out
    (как `directory.ts`), relay доставляет клиентам. Никакой PII/typing в Postgres (см. §3.1).
- **Indexer (#2)** — переиспользуется: на upsert message-entity эмбедит `markdown` в qdrant (§1.4); чат лишь
  поставляет корректный `updated_at`/tombstone.

### 3.3 Внешние интеграции

N/A для v1 (внутренний мессенджер). Secret-store/OAuth/IMAP/CalDAV **не используются** (причина: нет внешних
провайдеров; чат живёт целиком в org-графе). Импорт из Slack/Discord — будущая итерация (см. §9); контракт
`identity_links(kind=chat)` уже готов под внешние хендлы.

---

## 4. UI-спецификация

Feature-модуль `apps/web/src/.../chat` (он же lazy-модуль Electron renderer, Часть 2C). Все данные —
через TanStack DB live-queries поверх Electric shape-коллекций (cache-first). Библиотеки `packages/ui`
(shadcn): `resizable.tsx` (3-pane), `scroll-area.tsx` (виртуализированная лента), `avatar.tsx`,
`dropdown-menu.tsx`, `popover.tsx` (emoji/mentions), `command.tsx` (быстрый переход по каналам), `badge.tsx`
(непрочитанное). Эмодзи-пикер — `frimousse` поверх `popover.tsx` (новый примитив, ниже).

### 4.1 Экраны/панели

| Экран/панель | Назначение | loading | empty | error | ready (cache-first) |
|---|---|---|---|---|---|
| **ChannelSidebar** | список каналов + DM + бейджи непрочитанного | skeleton ТОЛЬКО при пустом кэше и `isReady=false` | «Нет каналов — создать» CTA (когда `ready && data=[]`) | inline-баннер + retry | рендерим кэш-строки сразу; бейджи из `getUnreadSummary` |
| **MessageList** | лента сообщений/треда | skeleton только при пустом кэше | «Начните беседу» | баннер «не удалось загрузить историю» + retry | показываем кэш; подгрузка истории по скроллу вверх (keyset) |
| **MessageComposer** | ввод markdown, @-mentions, вложения, emoji | — | плейсхолдер | toast при ошибке отправки + «повторить» (тот же `clientMsgId`) | оптимистичное сообщение (статус «отправляется») до Electric-эха |
| **ThreadPanel** | боковая ветка треда (правый pane) | skeleton при пустом | «Ответьте первым» | баннер | как MessageList с `threadRootId` |
| **MemberRoster** | участники + presence | skeleton при пустом | «Только вы» | баннер | members из Electric + presence из relay (online-точка) |
| **ChannelHeader** | имя/topic, кнопки (тред, поиск, настройки) | — | — | — | title/topic из коллекции; меню действий по роли |
| **NewChannelDialog / NewDmDialog** | создание канала/DM | — | — | inline-ошибка валидации | submit → optimistic + navigate |

> **Cache-first инвариант (AGENTS.md §9):** `MessageList`/`ChannelSidebar` НИКОГДА не прячут существующие
> `data` при `isReady=false`/`isLoading`. Skeleton/empty — только когда `data` пуст. Запись дефолтов
> (авто-`markRead` при открытии) — ждёт строгой готовности коллекции либо идемпотентна.

### 4.2 Новые UI-примитивы (`packages/ui`)

| Примитив | Библиотека | Контракт пропсов (основное) |
|---|---|---|
| `MessageBubble` | собственный над `avatar`/`dropdown-menu` | `{ message: MessageView; isOwn: boolean; onReply(): void; onReact(emoji): void; onEdit(md): void; onDelete(): void; onPromote(): void }` |
| `EmojiPicker` | `frimousse` + `popover.tsx` | `{ open: boolean; onOpenChange(o): void; onSelect(emoji: string): void; trigger: ReactNode }` |
| `MentionInput` | `@tiptap/extension-mention` (однострочный rich-input; BlockNote не нужен) | `{ value: string; onChange(md): void; onSubmit(): void; mentionables: { id; label; kind:"user"\|"channel" }[]; onQueryMention(q): Promise<...> }` |
| `TypingIndicator` | собственный | `{ userIds: string[]; resolveName(id): string }` |
| `UnreadBadge` | `badge.tsx` | `{ count: number; mentions: number }` |
| `PresenceDot` | собственный | `{ state: "online"\|"away"\|"offline" }` |

Размещение по AGENTS.md «Project Structure»: одна папка/компонент + `index.ts` barrel, ко-локация тестов
(`MessageBubble/MessageBubble.test.tsx`). shadcn-примитивы добавляются `bunx shadcn@latest add` в `packages/ui`.

### 4.3 User-flows (на уровне кликов)

**Flow 1 — отправить сообщение в канал:**
1. Клик канала в `ChannelSidebar` → роутинг `/chat/<channelId>`; `MessageList` рендерит кэш мгновенно.
2. Фокус в `MessageComposer`, ввод текста; `@` открывает `MentionInput`-popover → выбор пользователя.
3. Enter (Shift+Enter = перенос) → клиент генерит `clientMsgId=uuid`, оптимистично вставляет bubble (статус
   «отправляется»), вызывает `chatNative.sendMessage`.
4. Возврат `{messageId,txid}` → Electric-эхо приходит, оптимистичная строка дедупается по `clientMsgId` →
   статус «отправлено». При ошибке — bubble «не отправлено» + кнопка «повторить» (тот же `clientMsgId`, идемпотентно).

**Flow 2 — ответить в тред + промоутнуть в заметку:**
1. Наведение на сообщение → `MessageBubble` показывает action-row → клик «Reply in thread».
2. Открывается `ThreadPanel` (правый pane, `threadRootId`=это сообщение); ввод ответа → `sendMessage` с
   `threadRootId`. `replyCount` корня инкрементится (через count `edge(replies_to)`).
3. В action-row корня → «Promote to note» → `graph.promote(tx, { idempotencyKey, sourceEntityId, toKind:"note", title, markdown, relation:"derived_from" })`
   (контракт #1 §3, см. §2.4; `title` = первая строка тела ≤80 симв.) → создаётся `note`-entity + `edge(derived_from)`;
   toast со ссылкой на заметку.

**Flow 3 — создать приватный канал и пригласить:**
1. `+` в сайдбаре → `NewChannelDialog`; ввод имени, выбор `private`.
2. Submit → `createChannel({channelId:uuid, kind:"private", name})` → optimistic канал в сайдбаре, navigate.
3. `ChannelHeader` → «Add people» → `MemberRoster` модал → выбор юзеров → `addMembers`; появляются member-строки
   (Electric) + system-message `type="join"`.

### 4.4 Доступность (WCAG 2.2 AA) и клавиатура

- **Лента сообщений:** `role="log"` + `aria-live="polite"` (новые сообщения зачитываются), `aria-relevant="additions"`.
  Каждое сообщение — `role="article"` с `aria-label="<author>, <time>"`.
- **Клавиатура:** `Up/Down` — навигация по сообщениям; `Enter` на сообщении — открыть тред; `r` — reply; `e` —
  emoji-picker (popover `role="dialog"`, ловушка фокуса, `Esc` закрывает, возврат фокуса на trigger);
  `Cmd/Ctrl+K` — `command.tsx` быстрый переход по каналам; `Shift+Enter` в композере — перенос, `Enter` — отправка.
- **Композер:** contenteditable c `aria-label`, mention-popover — `aria-activedescendant` по списку, стрелки
  выбирают, `Enter`/`Tab` подтверждают.
- **Сайдбар:** список — `role="navigation"`, активный канал `aria-current="page"`, бейдж непрочитанного с
  `aria-label="<n> непрочитанных, <m> упоминаний"`.
- **Контраст/таргеты:** ≥4.5:1 текст, hit-target ≥24×24 CSS-px (WCAG 2.2 «Target Size (Minimum)»). Presence
  не кодируется ТОЛЬКО цветом — `PresenceDot` имеет `aria-label` (online/away/offline). Ошибки — текстовые, не
  только цветом. Error-boundary на роуте `/chat/*` (правило «Error boundaries on all React routes»).

---

## 5. Миграция и обратная совместимость

- **Характер:** чисто **аддитивный** — новые таблицы `channels`, `channel_members`, `messages`,
  `message_reactions`, `message_reads` + 4 новых pgEnum (`channel_kind`, `channel_member_role`, `message_type`,
  `message_status`). Существующие таблицы (`chat_sessions`, `chat_attachments`, ядровые `entities`/`edges`)
  **НЕ изменяются**. Коллизий имён нет: префиксы `channel*`/`message*` свободны.
- **Зависимость:** требует, чтобы ядро Фазы 0 (`entities`/`edges`/`identity_links` + enum-расширения §2.1)
  было уже смигрировано (FK на `entities.id`). Порядок: сначала миграция #1, затем эта.
- **Backfill:** не требуется (нет легаси-данных нативного чата). Опциональный сидер демо-канала (`#general`)
  для dev — отдельный seed-скрипт, не миграция.
- **Команда генерации:** изменить только `packages/db/src/schema/{enums,chat-native}.ts` + экспорт в
  `schema/index.ts`, затем:
  ```bash
  bunx drizzle-kit generate --name="native_chat_channels_messages"
  ```
  (offline diff; НИКОГДА не редактировать `packages/db/drizzle/` вручную; `migrate`/`push` на проде — деплой-шаг
  с подтверждением; локально — на новой neon-ветке).
- **Down/откат (концептуально):** обратная миграция = `DROP TABLE message_reads, message_reactions, messages,
  channel_members, channels;` затем `DROP TYPE message_status, message_type, channel_member_role, channel_kind;`
  (Drizzle сам не пишет down — концепт фиксируем в PR-описании; перед `reset --hard`/повторной генерацией —
  `git stash`/dump). Удаление таблиц не затрагивает ядро (каскад только в сторону detail).
- **Депрекейтится:** ничего. `chatRouter`/`packages/chat` остаются как есть (другой домен).

---

## 6. Приёмочные критерии (Given/When/Then)

1. **Создание канала идемпотентно.** Given авторизованный юзер с активной org; When дважды вызывает
   `createChannel` с одним `channelId`; Then создаётся ровно один `entity(kind=channel)` + одна `channels`-строка
   + `channelMembers(owner)`, второй вызов возвращает тот же `channelId` без дубликата (`deduped=true`).
2. **Узел пишется через ядро.** Given `createChannel`/`sendMessage`; Then в `entities` появляется строка
   соответствующего `kind`, и detail-строка ссылается на её `entityId`; прямого `insert(entities)` в коде
   `chatNative` нет (только graph-сервис).
3. **Отправка сообщения + edges.** Given участник канала; When `sendMessage` с `mentions` и `threadRootId`;
   Then создаётся `message`-entity, `messages`-строка с денорм. полями, и edges `participant_of`+`authored_by`
   (+`replies_to` для треда, +`mentions[]`, +`attached_to[]`); `channels.last_message_at` обновлён.
4. **Идемпотентность отправки (без orphan-entity).** Given сетевой ретрай; When `sendMessage` дважды с тем же
   `clientMsgId`; Then ровно одно сообщение (uniqueIndex) **И ровно один `message`-entity** — повторный вызов не
   создаёт orphan-строку в `entities` (claim ядра по детерминированному `idempotencyKey` для `graph.create` из §2.4
   срабатывает ДО detail-insert), второй ответ `deduped=true`, тот же `messageId`.
5. **Приватность каналов.** Given приватный канал, юзер-не-участник; When `getChannel`/`listMessages`/`sendMessage`;
   Then `FORBIDDEN`/`NOT_FOUND` (не протекают тело/метаданные); публичный канал виден всем в org.
6. **Read-state и непрочитанное.** Given новое сообщение в канале с упомянутым юзером; When `getUnreadSummary`
   до `markRead`; Then `unread≥1`, `mentions≥1`; после `markRead(lastReadMessageId)` — `unread=0`,
   `mention_count=0`; повторный `markRead` старым курсором не увеличивает непрочитанное (монотонность).
7. **Realtime доставка.** Given два клиента в одном канале; When клиент A `sendMessage`; Then клиент B видит
   сообщение через Electric shape без ручного refetch; оптимистичная строка A дедупается по `clientMsgId`.
8. **Typing/presence эфемерны.** Given клиент шлёт `typing:start` в relay-канал; Then другие участники видят
   индикатор; через 6s без `stop` он гаснет; в Postgres нет записи о typing.
9. **Edit/Delete.** Given автор; When `editMessage`; Then `status="edited"`, `editedAt` задан, `entities.markdown`
   обновлён (→ переэмбед qdrant). When `deleteMessage`; Then `status="deleted"`, тело очищено (tombstone),
   qdrant-point снят, тред-ответы сохранены.
10. **Реакции toggle.** Given участник; When `toggleReaction(emoji)` дважды; Then первая добавляет
    (`active=true`), вторая снимает (`active=false`); уникальность `(message,user,emoji)` соблюдена.
11. **DM-дедуп.** Given `openDm([userB])` дважды; Then один `kind=dm`-канал по `dmKey`, второй вызов
    `created=false` возвращает существующий.
12. **Промоут.** Given сообщение; When UI «Promote to note»; Then через `graph.promote(tx, {idempotencyKey,
    sourceEntityId, toKind:"note", title, …})` (поле `toKind`, НЕ `targetKind`; `title` — первая строка тела;
    контракт #1 §3) создаётся `note`-entity + `edge(derived_from, message→note)`; исходное сообщение не меняется;
    повторный промоут того же сообщения идемпотентен (тот же `idempotencyKey`) — дубль `note` не создаётся.
13. **Cache-first рендер.** Given есть кэш сообщений, коллекция `isReady=false`; Then `MessageList` показывает
    кэш-строки сразу (не skeleton); skeleton только при пустом кэше.
14. **Доступность.** Given лента сообщений; Then `role="log"`+`aria-live="polite"`; emoji-picker — focus-trap +
    `Esc`-возврат фокуса; навигация стрелками работает; axe-core без нарушений на `/chat`.
15. **Rate-limit.** Given >10 `sendMessage`/10s одним юзером в один канал (sliding-window Upstash-Redis по ключу
    `rl:chat:send:<userId>:<channelId>`, §2.5); Then 11-й вызов → `TOO_MANY_REQUESTS` (429) с заголовком
    `Retry-After` (= `ceil((reset−now)/1000)` сек), лишние сообщения не записаны (ни `entities`, ни `messages`);
    лимит общий между api-инстансами (счётчик в Redis, не per-instance).

---

## 7. Тест-план

**Unit (Bun test, изолированно, без БД):**
- `chat-native/zod.ts` — границы Zod (длина `markdown` 1..40000, slug-regex, batch-лимиты `userIds/attachments`).
- `dmKey` — детерминизм/коммутативность сортировки userId; sha256-стабильность.
- Дедуп оптимистичной строки по `clientMsgId` (reducer клиентской коллекции).
- Парсинг mentions тела (свой парсер `@user`/`#channel`/`[[note]]`).
- Команды: `bun test packages/db packages/trpc/src/router/chat-native packages/ui/src/.../chat`.

**Integration (neon-branch, реальная схема):**
- Фикстура: создать временную neon-ветку (`NEON_PROJECT_ID` из .env), применить миграции #1 + native_chat,
  засеять org/users. Прогон процедур роутера `chatNative` против реальной Postgres+graph-сервиса.
- Покрыть AC 1–6, 9–12, 15: идемпотентность (двойной вызов), edges-побочка (проверять строки `edges`),
  приватность (403/404), монотонность read-state, soft-delete tombstone, rate-limit.
- Команда: `bun test packages/trpc/src/router/chat-native/*.integration.test.ts` (env указывает на ветку).
  Никогда не на прод-БД (AGENTS.md «Database Rules»).

**Realtime/e2e (сценарий):**
- Поднять `bun run dev` (web+api+electric+caddy) + relay/streams локально; два браузер-контекста (Playwright) в
  одном канале. Проверить AC 7 (Electric-доставка + дедуп), AC 8 (typing TTL, presence online/offline), AC 13
  (cache-first при перезагрузке вкладки — лента видна из persisted-кэша до `isReady`).
- axe-core прогон страницы `/chat` (AC 14).

**Покрытие:** ≥80% веток изменённого кода (роутер `chatNative`, reducers коллекций, новые `packages/ui`
компоненты). Перед push: `bun run lint` exit 0 (Biome warnings = fail), `bun run typecheck`, целевые `bun test`.

---

## 8. Задачи реализации (ordered work-list)

1. **Схема + enum (PR-1).** `packages/db/src/schema/enums.ts` (+4 локальных enum-значения, diff §1.1);
   новый `packages/db/src/schema/chat-native.ts` (§1.2); экспорт в `packages/db/src/schema/index.ts`;
   `bunx drizzle-kit generate --name="native_chat_channels_messages"`. Зависимость: ядро #1 уже в схеме.
2. **Zod-контракты (PR-2).** `packages/trpc/src/router/chat-native/zod.ts` — input/output (§2). Unit-тесты границ.
3. **Роутер каналов/членства (PR-3).** `packages/trpc/src/router/chat-native/channels.ts` + `members.ts`:
   `listChannels/getChannel/createChannel/openDm/updateChannel/archiveChannel` + членство. Интеграция с
   graph-сервисом (create/link в одной tx), `getCurrentTxid`. Регистрация ключа `chatNative` в
   `packages/trpc/src/root.ts`. Integration-тесты (AC 1–5, 11).
4. **Роутер сообщений (PR-4).** `chat-native/messages.ts`: `listMessages` (keyset), `sendMessage` (идемпот.+edges+
   indexer-hook), `editMessage`/`deleteMessage`, `toggleReaction`, `markRead`/`getUnreadSummary`. rate-limit
   (`chat-native/rate-limit.ts`, §2.5) — добавить `bun add @upstash/ratelimit @upstash/redis` в `packages/trpc`
   (точные версии, lockfile-pinning) + env-переменные `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
   (00-SC §3 «секреты из env»); api-слой копирует `cause.retryAfter` в HTTP-заголовок `Retry-After`.
   Integration-тесты (AC 3–6, 9, 10, 15).
5. **Electric shapes + клиентские коллекции (PR-5).** Конфиг shape-стримов (channels/messages-hot/members/
   reads/reactions) в electric-proxy/web; TanStack DB коллекции + cache-first live-queries + оптимистичный
   reducer по `clientMsgId`. (AC 7, 13.)
6. **Presence/typing через relay+streams (PR-6).** `apps/streams` presence-агрегатор (Bun-сервис, Upstash
   fan-out по образцу `apps/relay/src/directory.ts`); клиентский WS-клиент на relay-канал `chat:<org>:<channel>`;
   формат кадров §3.1. (AC 8.)
7. **UI-примитивы (PR-7).** `packages/ui`: `MessageBubble`, `EmojiPicker`(frimousse), `MentionInput`(tiptap-mention),
   `TypingIndicator`, `UnreadBadge`, `PresenceDot`. **Новые npm-зависимости** (нет в `packages/ui/package.json`
   и `apps/web/package.json` — проверено): добавить точными версиями (без `^` для критичных, lockfile-pinning
   00-SC §3):
   ```bash
   cd packages/ui
   bun add frimousse@0.3.0 @tiptap/extension-mention@2.11.5 @tiptap/core@2.11.5 @tiptap/pm@2.11.5
   ```
   `frimousse` (MIT, headless emoji-picker, ~12KB gz — укладывается в бюджет ≤200KB JS из code_quality);
   `@tiptap/extension-mention` + `@tiptap/core`/`@tiptap/pm` (MIT, ProseMirror-обёртка, ~40KB gz; tree-shake —
   тянем только mention-расширение). Версии сверить с lock на момент PR. Плюс `bunx shadcn@latest add` для
   недостающих shadcn-примитивов (`resizable`, `scroll-area`, `command`, `popover` если ещё нет). Ко-локация тестов.
8. **Feature-модуль chat (PR-8).** `apps/web/src/.../chat`: `ChannelSidebar`, `MessageList`, `MessageComposer`,
   `ThreadPanel`, `MemberRoster`, `ChannelHeader`, диалоги; роутинг `/chat/[channelId]`; error-boundary; lazy-импорт
   (Electron renderer). User-flows §4.3. (AC 12–14.)
9. **e2e + a11y (PR-9).** Playwright два-клиента realtime-сценарий + axe-core; smoke в CI.

---

## 9. Риски и открытые вопросы

**Риски + митигейшн:**
- **Масштаб presence/typing на relay (A3).** Риск: широковещание typing в больших каналах. Митигейшн:
  агрегирование в `apps/streams` (снапшоты, дебаунс), TTL, throttle typing ≤1 кадр/2s; при превышении —
  ревизия A3 в сторону выделенного pub/sub.
- **Дубли при оптимистичной отправке.** Митигейшн: жёсткий uniqueIndex `(channel, clientMsgId)` + дедуп по
  `clientMsgId` на клиенте; сервер — единственный источник `entityId`.
- **Privacy-leak в qdrant-поиске.** Риск: семантический поиск вернёт сообщение приватного канала
  не-участнику. Митигейшн: обязательный пост-фильтр по членству до выдачи (payload `channelEntityId` →
  проверка `channel_members`); приватные — только участникам.
- **Стоимость эмбеддингов сообщений.** Митигейшн: индексировать только `type="text"`, дебаунс реиндекса edit,
  опц. флаг «не индексировать DM».
- **Рост `messages` (горячая таблица).** Митигейшн: keyset-пагинация, индекс `(channel, createdAt)`, Electric
  стримит только «горячее окно»; ретеншн/архив — будущая инфра-задача (Turso для холодной истории, Часть 2E).
- **DM-дедуп гонка.** Митигейшн: `onConflictDoNothing` на `channels_org_dmkey_uniq` + повторное чтение в той же tx.

**Не-блокирующие открытые вопросы:**
- **E2EE сообщений** (Skiff-уровень) — нужен ли в v1? Сейчас НЕ входит; если да — повлияет на qdrant-индексацию
  (нельзя эмбедить шифротекст) и поиск.
- **Threading-модель:** плоские треды (Slack) vs вложенные. Зафиксировано как один уровень `threadRootId`;
  глубокая вложенность — ревизия.
- **Импорт из Slack/Discord** (через их API + secret-store) — отдельная итерация; `identity_links(kind=chat)`
  уже готов под внешние хендлы.
- **`apps/streams` vs presence в `apps/relay`** — стартуем отдельным сервисом; при оверхеде — слить.
- **Notif/push** (web-push/desktop-notification по `notifPref`) — за рамками v1, схема `notif_pref` заложена.
