# Журнал + Память — детальный план работ (design doc)

> Статус: DESIGN (готов к реализации). Дата: 2026-06-16. Поверхность: **apps/desktop**.
> Стек подтверждён по коду (file:line ниже). Реализация — **не начата**, это план.

## 0. BLUF

Две новые фичи desktop-приложения Rox, обе как кнопки в левом сайдбаре:

- **Журнал** — лента дней (новые→старые, infinite scroll). Для каждого дня 4 авто-генерируемых потока (рефлексия / выводы / предложения в Память / советы), создаются ежедневно из сессий пользователя моделью **ROX_R1** на сервере.
- **Память** — группы memory-фрагментов (5 категорий). Пользователь добавляет вручную (Enter); агент ежедневно предлагает новые (Approve/Decline при загрузке); импорт из других AI двумя способами (вставка-промпт + загрузка архива → RAG-классификация).

Архитектурный костяк (всё переиспользует существующие паттроны Rox):
`QStash cron → apps/api endpoint → durable-streams (транскрипт) → ROX_R1 → Neon (journal_entries / memory_items) → Electric SQL → TanStack DB collection → desktop UI`.

Главный технический блокер: **на сервере (apps/api) нет ключа Groq** для R1 — решается добавлением `GROQ_API_KEY` (или временным fallback на `ANTHROPIC_API_KEY`, который уже есть).

---

## 1. Реформулировка, границы, допущения

**Что строим.** Per-user слой «второй памяти» поверх агентских сессий: пассивный (Журнал — система сама рефлексирует за тебя) и активный (Память — ты куратор + агент-помощник).

**Границы (in scope):** desktop UI, серверная daily-генерация, Neon-таблицы, tRPC-роутеры, Electric-коллекции, оба импорта.
**Out of scope (явно):** web/mobile поверхности (desktop-first по решению), ручное написание журнала (журнал AI-генерируемый), семантический поиск/дедуп по эмбеддингам (pgvector — отложенная Фаза 6).

**Допущения (проверены):**
- A1. Сессии = `chatSessions` в Neon; их содержимое (транскрипт) — в durable-streams, не в Neon.
- A2. Desktop читает облачные данные только через Electric-коллекции (cache-first), пишет через tRPC `apiClient.*.mutate` (возвращает txid).
- A3. Daily-генерация серверная (desktop может быть закрыт).
- A4. Таблицы org+user-scoped, как `chatSessions`/`knowledgeDocuments`.
- A5. RU-строки инлайн (i18n-библиотеки нет).

---

## 2. Архитектура — проверенная земля (file:line)

| Слой | Факт | Источник |
|---|---|---|
| Сессии | `chatSessions` {id, organizationId, createdBy=userId, workspaceId, v2WorkspaceId, title, lastActiveAt, createdAt, updatedAt} | `packages/db/src/schema/schema.ts:785` |
| Транскрипт | durable-streams (НЕ Neon messages table) | `apps/api/src/app/api/chat/[sessionId]/stream/route.ts`, `apps/api/src/app/api/chat/lib.ts`, env `DURABLE_STREAMS_URL/SECRET` |
| Синк desktop | Electric SQL → TanStack DB, snake↔camel, запись через `apiClient.X.mutate`+`electricTxidMatch` | `apps/desktop/.../CollectionsProvider/collections.ts` |
| CRUD-эталон | `notesRouter` (profileNotes), `knowledgeRouter` (knowledgeDocuments: tags jsonb, sourceKind, search ilike, requireActiveOrgMembership) | `packages/trpc/src/router/notes/notes.ts`, `.../knowledge/knowledge.ts` |
| Модель | `ROX_R1` (groq-compound mirror, free, ctx 131072) | `packages/shared/src/rox-models.ts:73` |
| AI-SDK | `createAnthropic/createOpenAI` → `generateText` | `packages/chat/src/server/shared/small-model/get-small-model.ts` |
| Cron | QStash `Receiver.verify` + rrule + batch | `apps/api/src/app/api/automations/evaluate/route.ts` |
| Blob | Vercel Blob уже есть (`BLOB_READ_WRITE_TOKEN`) | `apps/api/src/env.ts:13` |
| RAG | pgvector/embeddings — нет (Neon поддерживает расширение) | — |
| Nav | `_dashboard/layout.tsx` + `_dashboard/{tasks,workspaces}/page.tsx`; кнопки — в футере `DashboardSidebar.tsx` рядом с «Настройки» | `apps/desktop/.../_dashboard/layout.tsx`, `.../DashboardSidebar/DashboardSidebar.tsx` |
| UI kit | `@rox/ui/*`: accordion, card, button, input, textarea, scroll-area, tabs, badge, collapsible, sonner, skeleton, tooltip, dialog | `packages/ui/src/components/ui/*` |

---

## 3. ERD — новые таблицы (Neon, Drizzle)

```
┌─ journal_entries ───────────────┐   ┌─ memory_items ────────────────────┐
│ id            uuid pk            │   │ id            uuid pk              │
│ organization_id uuid → orgs ⌫   │   │ organization_id uuid → orgs ⌫     │
│ created_by    uuid → users ⌫    │   │ created_by    uuid → users ⌫      │
│ day           date  NOT NULL     │   │ category      memory_category      │  projects|identity|
│ reflection    text               │   │ body          text  NOT NULL       │  instructions|career|general
│ learnings     jsonb '[]'         │   │ source        memory_source        │  manual|agent|archive|prompt
│ memory_suggestions jsonb '[]'    │   │ status        memory_status        │  suggested|approved|dismissed
│ tips          jsonb '[]'         │   │ source_ref    jsonb                │
│ status        journal_status     │   │ import_job_id uuid → import_jobs ∅ │
│ model_id      text               │   │ created_at / updated_at ts         │
│ source_session_ids jsonb '[]'    │   └────────────────────────────────────┘
│ generated_at  ts                 │     idx: (org), (created_by,category,status), (created_by,status)
│ created_at / updated_at ts       │
└──────────────────────────────────┘   ┌─ memory_import_jobs ──────────────┐
  UNIQUE (org, created_by, day)         │ id  uuid pk                        │
  idx: (org), (created_by, day DESC)    │ organization_id / created_by ⌫    │
                                        │ provider  import_provider          │  chatgpt|anthropic
journal_status: pending|generated|failed│ blob_url  text                     │
memory_category: projects|identity|     │ status    import_status            │  pending|processing|done|failed
  instructions|career|general           │ stats     jsonb '{}'               │
                                        │ error     text                     │
                                        │ created_at / updated_at ts         │
                                        └────────────────────────────────────┘
```

**Решения по схеме:**
- `journal_entries` — **одна строка на (user, day)**, 4 потока как колонки. День читается/генерируется/регенерируется атомарно; upsert по `(org, created_by, day)` идемпотентен. Строка-на-поток усложнила бы без выгоды (YAGNI).
- `memory_items` — **выделенная таблица**, НЕ переиспользуем `knowledgeDocuments` (там slug/backlinks/org-wiki-семантика; здесь нужен per-user approve/decline lifecycle + группировка).
- `memory_suggestions` в journal — снимок для отображения в потоке 3; реальные кандидаты для Approve/Decline живут как `memory_items(source=agent, status=suggested)`. Разделяет отображение от lifecycle.
- Дефолт `status`: `manual→approved`, `agent/archive/prompt→suggested` (импорт ревьюится, т.к. классификация AI может ошибаться).

Файлы: `packages/db/src/schema/journal.ts`, `packages/db/src/schema/memory.ts` (+ экспорт в `schema/index.ts`, enum'ы в `enums.ts`).

---

## 4. Потоки данных

**Daily-генерация (Журнал + предложения Памяти, один R1-вызов на юзера):**
```
QStash schedule (раз в день)
  └─► POST /api/journal/generate            (fan-out: выбрать юзеров с сессиями за вчера)
        └─► QStash publish per-user
              └─► POST /api/journal/generate/user   (Receiver.verify)
                    1. chatSessions WHERE created_by, day = вчера  →  session ids
                    2. durable-streams: транскрипт каждой сессии (token budget 131072)
                    3. ROX_R1.generateObject → {reflection, learnings[], memorySuggestions[{body,category}], tips[]}  (RU)
                    4. upsert journal_entries (org,user,day)
                    5. insert memory_items(source=agent, status=suggested) ← memorySuggestions
              └─► Electric shape (created_by) ─sync─► desktop collection ─► useLiveQuery ─► UI
```

**Импорт-промпт (синхронно):**
```
UI: готовый промпт + [Copy] → юзер шлёт своему AI → вставляет ответ в textarea → [Отправить]
  └─► tRPC memory.submitPromptImport(text)
        парс категорий + строк "[YYYY-MM-DD] - Entry" → маппинг 5 export→5 Rox групп
        → insert memory_items(source=prompt, status=suggested)
```

**Импорт-архив (асинхронно):**
```
UI: dropzone (provider) → файл
  └─► tRPC memory.startArchiveImport → Vercel Blob put → memory_import_jobs(pending, blob_url)
        └─► QStash → POST /api/memory/import/process
              fetch blob → parse ChatGPT/Anthropic export → R1 classify+extract по разговорам
              → insert memory_items(source=archive, status=suggested, import_job_id)
              → update job(done, stats)
        └─► Electric (memory_import_jobs + memory_items) ─sync─► UI прогресс + новые предложения
```

---

## 5. Группы Памяти + маппинг импорта

5 групп (подтверждены): **Проекты** `projects` · **Личное** `identity` · **Предпочтения и правила** `instructions` · **Карьера + История сообщений** `career` · **Общие правила и принципы** `general`.

Маппинг export-категорий промпта (Claude-формат) → Rox-группы:
| Export | Rox group |
|---|---|
| Instructions | `instructions` |
| Preferences | `instructions` *(открытый вопрос: или `general`)* |
| Identity | `identity` |
| Career | `career` |
| Projects | `projects` |
| *(нераспознано)* | `general` |

---

## 6. Фазовая декомпозиция (детерминированные результаты)

Формат: **ID · Deliverable · Expected result · Acceptance · Depends**

### Фаза 0 — Фундамент
- **D0.1** Схема `journal.ts`+`memory.ts` (3 таблицы, 6 enum'ов, Insert/Select типы) · *Deliverable:* schema-файлы + `bunx drizzle-kit generate --name=journal_memory` · *Expected:* сгенерён `.sql` в `packages/db/drizzle/`, типы экспортированы · *Accept:* `bun run typecheck` 0 ошибок; миграция **не применяется** к проду; ручная правка drizzle/ запрещена · *Depends:* —
- **P0.1** Серверный R1-доступ · *Deliverable:* `GROQ_API_KEY` в `apps/api/src/env.ts` (`.optional()`) + helper `apps/api/src/lib/r1.ts` (`generateJournalStreams()` через `@ai-sdk/groq` `generateObject`, zod-схема 4 потоков, RU) · *Expected:* helper компилируется, unit-тест с моком возвращает валидную структуру · *Accept:* typecheck; при отсутствии ключа — graceful fallback на Anthropic Haiku · *Depends:* —
- **P0.2 (T0)** Transcript-reader · *Deliverable:* `readSessionTranscript(sessionId)` поверх durable-streams (подтвердить API в `chat/lib.ts`) · *Expected:* возвращает текст транскрипта по sessionId · *Accept:* интеграц-проба на dev-сессии возвращает непустой текст; обрезка по token budget · *Depends:* —

### Фаза 1 — Журнал (тончайшая вертикаль, доказывает архитектуру)
- **P1.1** Fan-out endpoint · *Deliverable:* `apps/api/.../journal/generate/route.ts` (Receiver.verify, выбор юзеров с сессиями за вчера, publish per-user) · *Expected:* при ручном триггере публикует N per-user задач · *Accept:* лог N=кол-во активных юзеров; подпись проверяется · *Depends:* D0.1
- **P1.2** Per-user генерация · *Deliverable:* `.../journal/generate/user/route.ts`: транскрипт→R1→upsert `journal_entries`+insert `memory_items(suggested)` · *Expected:* для тест-юзера за день появляется 1 строка journal + ≥0 memory suggestions · *Accept:* повторный запуск идемпотентен (upsert, не дубль); RU-контент непустой · *Depends:* P0.1, P0.2, P1.1
- **D1.1** Electric + journal router · *Deliverable:* `journalEntries` коллекция в `collections.ts` (read-only) + `journalRouter.regenerateDay` · *Expected:* desktop видит journal_entries через `useLiveQuery` · *Accept:* строка, вставленная сервером, появляется в коллекции без перезапуска · *Depends:* D0.1
- **U1.1** Nav + route · *Deliverable:* кнопка «Журнал» в футере `DashboardSidebar` + `_dashboard/journal/page.tsx` · *Expected:* клик открывает экран, активная подсветка · *Accept:* collapsed-tooltip работает; роут в routeTree.gen · *Depends:* —
- **U1.2** Экран Журнала · *Deliverable:* `JournalTimeline`+`JournalDay` (4 потока разной типографикой, infinite scroll, cache-first) · *Expected:* дни новые→старые, 4 визуально различимых потока, skeleton только при нет-данных+не-ready · *Accept:* существующие дни рендерятся мгновенно; пустое состояние RU · *Depends:* D1.1, U1.1
- **S1.1** QStash schedule (daily) на `/journal/generate` · *Accept:* расписание создано, тестовый прогон зелёный · *Depends:* P1.1

### Фаза 2 — Память: ядро (ручной + группы)
- **D2.1** Electric + memory router · *Deliverable:* `memoryItems` коллекция (onInsert→create, onUpdate→approve/decline/updateGroup, onDelete→delete) + `memoryRouter` (create/approve/decline/updateGroup/delete, dbWs+txid) · *Expected:* CRUD из desktop синкается · *Accept:* insert/update/delete round-trip через txid · *Depends:* D0.1
- **U2.1** Nav + route Память · *Deliverable:* кнопка «Память» под «Журнал» + `_dashboard/memory/page.tsx` · *Accept:* как U1.1 · *Depends:* —
- **U2.2** 5 групп + ручной ввод · *Deliverable:* `MemoryGroups` (5 аккордеонов, список approved-items, freehand Input Enter→create(source=manual)) · *Expected:* Enter сохраняет в нужную группу, появляется сразу · *Accept:* cache-first; RU-строки · *Depends:* D2.1, U2.1

### Фаза 3 — Agent suggestions (Approve/Decline)
- **U3.1** Баннер предложений · *Deliverable:* `memory_items WHERE status=suggested` → inline-карточки Approve/Decline (в Памяти) + действие «В память» в потоке 3 Журнала · *Expected:* при загрузке видны предложения дня; Approve→группа, Decline→dismissed · *Accept:* счётчик предложений; оптимистичный апдейт · *Depends:* D2.1, P1.2

### Фаза 4 — Импорт-промпт
- **U4.1** UI промпт-импорта · *Deliverable:* таб «Промпт»: read-only промпт + [Copy] + большая paste-textarea + [Отправить] · *Expected:* Copy кладёт промпт в буфер; submit шлёт текст · *Accept:* RU; пустой ввод заблокирован · *Depends:* U2.1
- **P4.1** Парсер + маппинг · *Deliverable:* `memory.submitPromptImport(text)`: парс категорий + `[дата] - запись`, маппинг 5→5, insert(source=prompt, suggested) · *Expected:* N записей разложены по группам · *Accept:* unit-тест на образце Claude-дампа; неизвестное→general · *Depends:* D2.1

### Фаза 5 — Импорт-архив (RAG-классификация)
- **P5.1** Upload → Blob → job · *Deliverable:* `memory.startArchiveImport` (Vercel Blob put, memory_import_jobs pending) · *Accept:* файл в Blob, job-строка создана · *Depends:* D2.1
- **P5.2** Процессор · *Deliverable:* `/api/memory/import/process` (parse ChatGPT+Anthropic export → R1 classify+extract → memory_items suggested) · *Expected:* из архива появляются предложения по группам · *Accept:* оба формата парсятся; job→done со stats; ошибки→failed+error · *Depends:* P5.1, P0.1
- **D5.1** Electric job-прогресс · *Deliverable:* `memoryImportJobs` коллекция (read-only) · *Accept:* статус job меняется в UI live · *Depends:* P5.1
- **U5.1** UI архив-импорта · *Deliverable:* таб «Архив»: dropzone + provider-radio + прогресс-бар по job · *Accept:* drag-drop, прогресс, RU · *Depends:* D5.1, P5.1

### Фаза 6 — (отложено) pgvector
Семантический дедуп предложений и поиск по Памяти. Включает `CREATE EXTENSION vector` в Neon + embedding-колонку. Строится только когда объём Памяти оправдает (YAGNI до этого).

---

## 7. MVP-срез (тончайшая end-to-end вертикаль)

**Фаза 0 + Фаза 1** = Журнал целиком (schema→cron→R1→Neon→Electric→UI). Доказывает весь костяк один раз. Дальше Фаза 2+3 (Память ядро + предложения), затем импорт 4→5.

Рекомендуемый порядок для solo: `0 → 1 → 2 → 3 → 4 → 5 → (6)`.

---

## 8. Риски и митигации

| Риск | Severity | Митигация |
|---|---|---|
| Нет Groq-ключа на сервере (блокер Ф1) | high | env `.optional()` + fallback на `ANTHROPIC_API_KEY` (есть) для генерации, пока Groq не подключён |
| Транскрипт durable-streams имеет retention → старые дни без контента | medium | генерировать за «вчера» (свежее); graceful при отсутствии |
| R1 free но rate-limited | medium | fan-out per-user + QStash retries/backoff |
| Приватность чужих чатов на Vercel Blob (архив-импорт) | high | приватный blob + удаление после обработки + явное согласие + не логировать содержимое |
| Прод-миграции | high | только `drizzle-kit generate`; применение — отдельный деплой-шаг с подтверждением |
| Electric нагрузка от большой Памяти | low | shape фильтруется по `created_by` |

## 9. Открытые вопросы (немного — почти всё решено)

1. **Хост nav-кнопок:** футер `DashboardSidebar` (предлагаю) vs `TopBar` — подтвердить визуально после первого билда.
2. **Preferences** export → `instructions` (предлагаю) vs `general`.
3. **Статус импорта:** `suggested` (ревью, предлагаю) vs `approved` (доверие, быстрее).
4. **Schedule:** время и таймзона daily-джобы (UTC vs per-user TZ).

---

*Источник истины по стеку — раздел 2 (все факты по file:line). Реализация ведётся по фазам; каждая задача мержится отдельным зелёным PR.*
