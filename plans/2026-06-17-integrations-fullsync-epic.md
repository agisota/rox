# Интеграции — полный sync 9 провайдеров (WS-J epic)

**Статус:** фундамент готов; остаётся 6 per-provider вертикалей, блокированных внешними кредами.
**Дата:** 2026-06-17
**Origin issue:** «только Linear даёт вкладку, заставь работать остальные (полный двусторонний sync)».

## TL;DR

Премиса «работает только Linear» **неточна**. Фундамент интеграций по сути построен, и
полностью рабочих провайдеров — **три (Linear, GitHub, Slack)**. Остальные **шесть**
(Telegram, Discord, Notion, Obsidian, Fibery, Lark) имеют только **generic-подключение**
(сохранение токена), но **без sync-вертикали** (callback/webhook/jobs) и **без поверхности**.

Каждая из 6 вертикалей требует **внешнего OAuth-приложения / бот-токена**, которые может
завести только владелец (BotFather, Discord Developer Portal, Notion integration, Lark/Feishu
app, Fibery account token). Без них код вертикали невозможно протестировать — а нетестируемые
стабы запрещены (silent-failure slop). **Это и есть блокер эпика, и он на стороне оператора.**

## Что уже построено (карта кода)

| Слой | Файл | Состояние |
|---|---|---|
| Реестр провайдеров | `packages/shared/src/integrations/registry.ts` | ✅ 9 провайдеров: `name/category/authKind/capabilities/enabled` |
| Enum провайдеров (Postgres) | `packages/db/src/schema/enums.ts` | ✅ `integrationProviderValues` (9) |
| Таблица подключений | `packages/db/src/schema/schema.ts` → `integrationConnections` | ✅ org+workspace scope, `accessToken`, `config`, `externalOrg*` |
| Секрет-стор | `packages/trpc/src/lib/integrations/secret-store.ts` | ✅ `storeSecret` |
| Generic connect-роутер | `packages/trpc/src/router/integration/shared/provider-router.ts` | ✅ `createProviderConnectionRouter`: `getConnection/testConnection/connect/disconnect` для всех token-провайдеров |
| Сборка tRPC-роутера | `packages/trpc/src/router/integration/integration.ts` | ✅ все 9 + `list` |
| Desktop статус-UI | `apps/desktop/.../settings/integrations/components/IntegrationsSettings/IntegrationsSettings.tsx` | ✅ листит все 9 + статус; «Подключить/Управлять» → открывает web |
| Web manage-страницы | `apps/web/src/app/(dashboard-legacy)/integrations/**` | ✅ linear/github/slack (выделенные) + `[provider]` generic + `ManualIntegrationControls` |

## Что построено per-provider (истинная матрица)

| Провайдер | authKind | tRPC | apps/api вертикаль | web страница | Поверхность | Полнота |
|---|---|---|---|---|---|---|
| **linear** | oauth | full | `apps/api/.../integrations/linear/` (callback, webhook, jobs: refresh-tokens, initial-sync, sync-task) | dedicated | **Tasks** | ✅ 100% |
| **github** | oauth (App) | full (`getInstallation`, repos, PRs) | GitHub App + `githubInstallations`/`githubPullRequests` | dedicated | **PR/Tasks** | ✅ 100% |
| **slack** | bot_oauth | 73 стр (реальные процедуры) | `apps/api/.../integrations/slack/` | dedicated | сообщения (частично) | 🟡 ~80% |
| **telegram** | bot_token | generic (7 стр re-export) | ❌ | `[provider]` generic | ❌ | 🔴 connect-only |
| **discord** | bot_oauth | generic | ❌ | generic | ❌ | 🔴 connect-only |
| **notion** | oauth | generic | ❌ | generic | ❌ | 🔴 connect-only |
| **obsidian** | local | generic | ❌ | generic | ❌ | 🔴 connect-only |
| **fibery** | oauth | generic | ❌ | generic | ❌ | 🔴 connect-only |
| **lark** | oauth | generic | ❌ | generic | ❌ | 🔴 connect-only |

## Архитектура целевой вертикали (эталон = Linear/Slack)

```
[Внешний провайдер]
   │  OAuth callback / bot install  →  apps/api/src/app/api/integrations/<p>/callback/route.ts
   │  webhook (inbound события)      →  apps/api/.../integrations/<p>/webhook/route.ts
   │  bulk/scheduled sync (QStash)   →  apps/api/.../integrations/<p>/jobs/{initial-sync,sync-*}/route.ts
   ▼
[Адаптер: внешняя модель → модель Rox]  (upsert в БД)
   ▼
[Поверхность Rox]
   • Communication (telegram/discord/lark/slack) → НОВАЯ поверхность «Сообщения» / триггер агента из чата
   • Knowledge (notion/obsidian/fibery)          → НОВАЯ поверхность «Знания/Доки» (packages/db/.../knowledge.ts)
   • Task Management (fibery)                     → существующая Tasks (как linear)
```

Подключение/секреты для всех — уже через `createProviderConnectionRouter` + `secret-store`.
Гейтинг поверхности — обобщить хардкод `TasksView.tsx:161 provider === "linear"` на
реестр-помощник (`providersForSurface(surface)`), **но только после** появления реального
sync соответствующего провайдера (иначе пустая поверхность без CTA).

## Оставшаяся работа (per-provider, стек PR — один провайдер = один PR)

Порядок по возрастанию внешней сложности:

1. **Telegram** (проще всего: `bot_token`, без OAuth-callback)
   - `apps/api/.../integrations/telegram/webhook/route.ts` — приём Telegram updates.
   - Адаптер: входящее сообщение → триггер агента (по образцу slack-вертикали).
   - Поверхность «Сообщения» (новая) ИЛИ интеграция в существующий чат-триггер.
   - **Креды оператора:** токен бота от @BotFather; публичный webhook URL (Tailscale/prod).
2. **Discord** (`bot_oauth`)
   - OAuth install + bot, `apps/api/.../integrations/discord/{callback,webhook}/route.ts`.
   - **Креды:** Discord Application (client id/secret, bot token) в Developer Portal.
3. **Lark/Feishu** (`oauth`)
   - `callback` + event subscription webhook + adapter (сообщения + доки).
   - **Креды:** Lark app (App ID/Secret), настроенные event-subscriptions.
4. **Notion** (`oauth`, Knowledge)
   - `callback` + `jobs/initial-sync` (доки/БД → Knowledge), поверхность «Знания».
   - **Креды:** Notion public integration (OAuth client id/secret).
   - **Схема:** новые таблицы в `packages/db/src/schema/knowledge.ts` (`drizzle-kit generate` only).
5. **Fibery** (`oauth`/token, Task Management)
   - Adapter Fibery entities → `tasks` (как linear), переиспользовать tasks-поверхность.
   - **Креды:** Fibery account token / OAuth.
6. **Obsidian** (`local`, без внешних кред!)
   - Локальный vault: чтение/запись markdown по пути vault (host-service), без OAuth.
   - Поверхность «Знания» (общая с Notion).
   - **Не блокирован внешними кредами** — но требует поверхности Knowledge (зависимость от #4 по UI).

## Поверхности, которых ещё нет (общие зависимости)

- **«Сообщения»** (для telegram/discord/lark/slack) — новая вкладка + модель сообщений/тредов.
- **«Знания/Доки»** (для notion/obsidian/fibery) — `packages/db/.../knowledge.ts` + UI-вкладка.
- Обобщение гейтинга: заменить `TasksView.tsx:161` на реестр-помощник, расширять по мере sync.

## Миграции БД

Любые новые таблицы (knowledge, messages) — **только** `bunx drizzle-kit generate --name=...`
(offline diff). **Не** применять `migrate`/`push` к prod; применение — деплой-шаг через CI.

## Верификация per-PR

`bun run typecheck` · `bun run lint` · `bun test` (адаптер-юниты на mock внешнего API) ·
функциональный пруф с реальными кредами (скрин подключения + входящего sync).

## Блокер / что нужно от оператора

Чтобы строить вертикали с **тестируемым** результатом (а не slop-стабами), нужны внешние
приложения/токены — по одному провайдеру за раз. Самый дешёвый старт: **Telegram** (только
токен @BotFather). Дай токен тест-бота — построю полную Telegram-вертикаль первой как образец
для остальных.

**Obsidian** можно начать без внешних кред (локальный vault), но он зависит от UI-поверхности
«Знания», которую тянет Notion (#4).
