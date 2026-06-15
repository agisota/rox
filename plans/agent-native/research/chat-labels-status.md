# Agent-native research — chat-labels-status

_Восстановлено из ODW Run 1 (сессия ae3f54de), 15.06.2026._

Собрал все нужные факты. Ниже — отчёт.

---

# Отчёт: чат-композер, метки/статусы сессий и задач, конвенции `packages/ui`

## 1. Компонент чат-композера (input + тулбар)

**Важно:** реального («рабочего») композера в `packages/chat/client/` нет. `packages/chat/src/client/` содержит только провайдер (`provider/provider.tsx`, `chat-service-provider.tsx`) и хук `hooks/use-chat-display`. Сам UI-композер живёт в `apps/web` и пока **превью-режим** (всё `disabled`).

### Иерархия композера (apps/web)

```
apps/web/src/app/(agents)/components/
├── AgentPromptInput/AgentPromptInput.tsx   ← верхний композер для создания сессии
│   ├── components/{BranchSelector, ModelPicker, RepoSelector}
│   └── hooks/useAgentPrompt
├── PreviewPromptComposer/PreviewPromptComposer.tsx   ← общий каркас композера
└── PlusMenu/PlusMenu.tsx                    ← кнопка «+» (вложения)
```

**`PreviewPromptComposer.tsx`** — каркас, собранный из примитива `@rox/ui/ai-elements/prompt-input`. Структура (строки 41–75):

```tsx
<PromptInput onSubmit={handleSubmit} multiple maxFiles={MAX_FILES} maxFileSize={MAX_FILE_SIZE}>
  <PromptInputAttachments>{(file) => <PromptInputAttachment .../>}</PromptInputAttachments>
  <PromptInputTextarea disabled placeholder={placeholder} className="min-h-10" />
  <PromptInputFooter>
    <PromptInputTools className={footerToolsClassName}>{footerTools}</PromptInputTools>  ← ЛЕВАЯ группа
    <div className="flex items-center gap-2">                                            ← ПРАВАЯ группа
      <PlusMenu disabled />
      <PromptInputSubmit .../>
    </div>
  </PromptInputFooter>
</PromptInput>
{afterComposer}      ← внешний ряд под композером (border-t)
<p className={messageClassName}>{message}</p>
```

**`AgentPromptInput.tsx`** прокидывает в этот каркас слоты (строки 44–75):
- `footerTools={<ModelPicker .../>}` — левый нижний тулбар.
- `afterComposer={<div ...><RepoSelector/><BranchSelector/></div>}` — отдельный ряд под полем ввода (`border-t border-border/50 px-3 py-2`).
- `placeholder="Создание сессий в веб-версии скоро появится"`.

### Куда монтировать новые кнопки «Source / Skills / Labels / Status» и чипы

| Что | Точка монтирования |
|---|---|
| **Кнопки-действия** (Source/Skills/Labels/Status) | в `footerTools` (левый `PromptInputTools` футера) рядом с `ModelPicker`, ЛИБО новым рядом через слот `afterComposer` (как уже сделано для Repo/Branch). |
| **Чипы над полем ввода** | примитив уже даёт **`PromptInputHeader`** (`prompt-input.tsx:1077`) — это `InputGroupAddon align="block-end"` с `order-first flex-wrap gap-1`, рендерится **первым** (над textarea). Сейчас он не используется в `PreviewPromptComposer` — это и есть «полка» для выбранных чипов. (Сегодня над полем рендерятся только `PromptInputAttachments`.) |
| **Меню «+»** | `PlusMenu.tsx` — сейчас единственный пункт «Добавить вложение» (`attachments.openFileDialog()`), через `ResponsiveDropdown items=[...]`. Новые источники/скиллы можно добавить как пункты `items`. |

`★ Insight ─────────────────────────────────────`
Композер построен по паттерну shadcn «slotted compound component»: `packages/ui/.../prompt-input.tsx` экспортирует ~45 примитивов (`PromptInputHeader/Footer/Tools/Button/Select/Command/Tabs/HoverCard…`), а приложение лишь компонует их. Поэтому новые кнопки/чипы добавляются композицией существующих примитивов, без правок самого `@rox/ui`.
`─────────────────────────────────────────────────`

Примитивы для будущих чипов/селектов уже есть: `PromptInputSelect*`, `PromptInputCommand*`, `PromptInputHoverCard*`, `PromptInputButton` (`prompt-input.tsx:1115`, размер авто `icon-sm`/`sm`).

---

## 2. Модель меток и статусов сегодня (DB-схема)

Файлы: `packages/db/src/schema/schema.ts`, `packages/db/src/schema/enums.ts`.

### Задачи (`tasks`) — статус через relation-таблицу, метки через JSONB

**`tasks`** (`schema.ts:109`):
```ts
statusId: uuid("status_id").notNull().references(() => taskStatuses.id),   // FK, НЕ enum
priority: taskPriority().notNull().default("none"),
labels:   jsonb().$type<string[]>().default([]),                          // строковый массив, БЕЗ relation
```
- **Статус** — внешний ключ на **relation-таблицу `taskStatuses`** (`schema.ts:71`), org-scoped:
  ```ts
  id, organizationId, name, color,
  type: text().notNull(),  // комментарий: "backlog" | "unstarted" | "started" | "completed" | "canceled"
  position: real().notNull(), progressPercent: real("progress_percent"),
  externalProvider, externalId   // для синка Linear/GitHub
  ```
- **Метки (`labels`)** — это **JSONB-массив строк** прямо на `tasks` (НЕ отдельная таблица, НЕ join). Отдельной таблицы `task_labels`/`labels` в схеме нет.
- `priority` — pg-enum (см. ниже).

**Enum-значения** (`enums.ts`):
```ts
taskStatusEnumValues = ["backlog","todo","planning","working",
                        "needs-feedback","ready-to-merge","completed","canceled"]  // строки 3–12
taskPriorityValues   = ["urgent","high","medium","low","none"]                     // строки 16–22
```
`taskStatus`/`taskPriority` объявлены как `pgEnum` (`schema.ts:42–43`). Нюанс: `taskStatusEnum` существует, но колонка `tasks.statusId` использует FK→`taskStatuses`, а не этот enum; enum фигурирует как «канонический» список, а `taskStatuses.type` — это категория (`backlog/unstarted/started/completed/canceled`).

**tRPC** (`packages/trpc/src/router/task/`):
- `schema.ts` — `createTaskSchema`/`updateTaskSchema`/`taskListInputSchema`: `statusId: z.string().uuid().nullish()`, `priority: z.enum(taskPriorityValues)`, `labels: z.array(z.string()).nullish()`.
- `statuses.ts` — суброутер `taskStatusesRouter.list` возвращает `{id, name, color, type, position}` из `taskStatuses`, отсортированные по `position`.

### Чат-сессии (`chatSessions`) — ни статуса, ни меток

**`chatSessions`** (`schema.ts:785`):
```ts
id, organizationId, createdBy, workspaceId, v2WorkspaceId,
title: text(),                                  // nullable
lastActiveAt: timestamp().notNull().defaultNow(),
createdAt, updatedAt
```
**У чат-сессий НЕТ колонок `status`, `labels`, `archived`, `state`.** Единственный «жизненный» сигнал — `lastActiveAt` (+ индекс `chat_sessions_last_active_idx`).

**tRPC чат** (`packages/trpc/src/router/chat/chat.ts`) подтверждает: процедуры `listSessions`, `getSessionDetail`, `createSession`, `updateSession` (вход — только `{ title?: string }`, строка 178), `deleteSession`, `updateTitle`, `uploadAttachment`. Меток/статусов в API сессий нет.

---

## 3. Конвенции `packages/ui`

### Структура
```
packages/ui/src/
├── components/
│   ├── ui/              ← shadcn-примитивы: kebab-case, ОДИН файл на компонент (button.tsx, input-group.tsx…)
│   ├── ai-elements/     ← kebab-case .tsx (prompt-input.tsx, toolbar.tsx, message.tsx…)
│   ├── overflow-fade/   ← folder-per-component с barrel index.ts
│   ├── mesh-gradient.tsx, popover.tsx
├── atoms/               ← folder-per-component (./atoms/*/index.ts)
├── hooks/  lib/  assets/  motion-frame/  types/  globals.css
```

**Две конвенции сосуществуют** (как в корневом `AGENTS.md`):
- **shadcn** в `components/ui/` и `components/ai-elements/` — **kebab-case одиночные файлы** (под `bunx shadcn@latest add`). Никаких папок/barrel.
- **Folder-per-component** для остального (`overflow-fade/OverflowFadeContainer/index.ts`, `atoms/*/index.ts`) — папка + barrel `index.ts`.

### Как добавляется новый общий компонент и его barrel-экспорт
Экспорты задаются **вручную** в `packages/ui/package.json` поле `exports` (subpath-exports, НЕ единый barrel пакета):
```jsonc
"./ai-elements/*": "./src/components/ai-elements/*.tsx",   // glob → каждый .tsx доступен как @rox/ui/ai-elements/<name>
"./atoms/*":       "./src/atoms/*/index.ts",               // folder-per-component через barrel
"./overflow-fade-container": "./src/components/overflow-fade/OverflowFadeContainer/index.ts",
"./*":             "./src/components/ui/*.tsx",             // shadcn-примитивы как @rox/ui/<name>
"./utils":         "./src/lib/utils.ts"                     // cn()
```
То есть новый shared-компонент:
- shadcn-стиль → файл в `components/ui/*.tsx`, импорт сразу `@rox/ui/<name>` (покрыт glob `./*`);
- folder-per-component → новая папка + `index.ts`, и **добавить subpath в `exports`** (как `overflow-fade-container`), либо положить под `atoms/` (покрыто glob `./atoms/*`).

Импорты используют alias `@rox/ui/...`; утилита слияния классов — `cn` из `@rox/ui/utils` (`@rox/ui/utils` → `src/lib/utils.ts`).

### Tailwind v4
- **Tailwind v4.2.2** (`tailwindcss` + `@tailwindcss/postcss` в devDeps, `tw-animate-css` в deps).
- `src/globals.css` использует **CSS-first конфиг v4**: `@import "tailwindcss";`, `@import "tw-animate-css";`, `@custom-variant dark (&:is(.dark *));`, токены через `@theme inline { --color-*: var(--…) }` (строки 1–45+). Нет `tailwind.config.js` — всё в CSS. Экспорт стилей: `@rox/ui/globals.css`.
- Темизация — `next-themes`; цвета привязаны к CSS-переменным (`--background`, `--primary`, кастомные `--color-state-transition/verified/noise`, `--font-frame-*`).

---

## 4. Есть ли понятие «статуса» сессии (open/closed, inbox/archive)?

**Нет — ни в схеме, ни в UI для чат-сессий.**
- `chatSessions` не имеет `status`/`archived`/`state`/`inbox` (см. §2). Грань активности — только `lastActiveAt`.
- Поиск `archiv|inbox|isClosed|closedAt|"closed"` по `packages/db/src/schema`, роутерам chat/task и `apps/web/src/app/(agents)` даёт совпадения **только не по теме**:
  - `schema/github.ts:140` `state // "open"|"closed"|"merged"`, `:166 closedAt` — это **GitHub issues/PR**, не чат-сессии.
  - `enums.ts:148,179` `"archived"` — это **workflowStatus** и **skillStatus** (draft/published/deprecated/archived), не сессии.
- Понятие категории статуса есть **только у задач**: `taskStatuses.type` (`backlog/unstarted/started/completed/canceled`) и enum `completed/canceled` в `taskStatusEnumValues`. Это task-, а не session-уровень.

**Вывод:** если нужен «inbox/archive/open/closed» для чат-сессий — сейчас этого нет; потребуется новая колонка (например `status`/`archivedAt`) на `chatSessions` + расширение `chat` tRPC-роутера (сегодня `updateSession` принимает только `title`).