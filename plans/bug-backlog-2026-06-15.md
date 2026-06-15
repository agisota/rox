# Rox — Перечень багов и задач (2026-06-15)

Полный реестр всего, что озвучено за сессию: симптом → корень/локализация (файл) → статус → что делать.

Легенда статусов: ✅ сделано · 🔧 в работе/найден корень · 🔴 открыто · 🧩 фича

---

## A. Сделано и запушено в `agisota/rox` ✅

| # | Что | Где / коммит |
|---|-----|--------------|
| A1 | Репозиторий `set` → `rox` (GitHub + критичные ссылки `agisota/set`→`agisota/rox`) | gh repo rename + `constants.ts`, `auto-updater.ts`, `bump-homebrew.yml`, … |
| A2 | Sync с upstream (superset): 332 файла, конфликты разрешены, `typecheck` 34/34 + `lint` 0 | merge → `main` (`6e518c5`), backup-ветка `backup/main-pre-sync-2026-06-15` |
| A3 | README пустой, LICENSE → MIT, `package.json` license → MIT | `f9ec0df` |
| A4 | SUPERSET-wordmark → ROX | `apps/web/public/title.svg`, `apps/marketing/public/title.svg`, `@superset`→`@rox` (`6a4ddc0`) |
| A5 | Desktop → production rox.one (вместо localhost) | `.env` (NEXT_PUBLIC_* = api/app/marketing/docs/relay.rox.one) |
| A6 | Удалены `.superset/` и `superset-dev-data/` | `c068e9d` |
| A7 | macOS `.app` собран/установлен/запущен; CI `desktop-v2.0.2` (mac+win+linux) | `~/Applications/Rox.app`; run 27534123901 |

---

## B. КРИТИЧНЫЕ баги desktop (один корень валит 4+ экрана)

### B1. host-service не стартует → Хосты / Проекты / Команды / Импорт агента
- **Симптомы:**
  - Хосты → «Добавить хост» → toast `no such table: settings`.
  - Проекты → «Import failed: локальный хост-сервис недоступен для организации … Статус: запускается».
  - Команды → после создания нет редиректа, висит вайрфрейм загрузки.
  - «Импортировать агента» → краш экран «Что-то пошло не так».
- **Доказано:** ни одного `~/.rox/**/host.db` не существует → host-service не доходит до создания БД (процесс падает на старте). `~/.rox/local.db` при этом ЗДОРОВА (есть `settings`, 43 миграции).
- **Корень #1 — НАЙДЕН, ФИКС ПРИМЕНЁН 🔧:** рассинхрон миграций local-db. Rebrand переименовал файл `0037_add_created_by_superset_to_worktrees.sql` → `..._rox_...sql`, но journal остался со старым tag. Runtime: `[local-db] Migration failed: No file 0037_add_created_by_superset_to_worktrees.sql found`.
  - **Где:** `packages/local-db/drizzle/meta/_journal.json:268` → tag исправлен на `0037_add_created_by_rox_to_worktrees`.
  - **Осталось:** пересобрать `.app` (миграции пакуются в `resources/migrations`), проверить, что local-db мигрирует чисто.
- **Корень #2 — ОТКРЫТ 🔴:** host-service spawn не создаёт `host.db`. host-migrations консистентны (7=7), значит причина иная: либо каскад от B1#1 (desktop main init частично падает на local-db migrate и не спавнит host-service корректно), либо краш самого host-service процесса (env/secret/spawn путь).
  - **Где смотреть:** `apps/desktop/src/main/lib/host-service-coordinator.ts` (spawn, `HOST_DB_PATH`, `HOST_MIGRATIONS_FOLDER`, child stderr — сейчас не логируется в файл); `packages/host-service/src/serve.ts` (env: `HOST_SERVICE_SECRET`, `AUTH_TOKEN`, `ROX_API_URL`).
  - **Что делать:** после пересборки с фиксом B1#1 — запустить `.app` из терминала, перехватить stderr дочернего host-service процесса; если local-db фикс не разблокировал — инструментировать coordinator, чтобы писать host-service stderr в `~/.rox/host-service.log`.

---

## C. Дефолты UI/UX (требуют пересборки .app)

| # | Что сделать по дефолту | Где (локализация) | Статус |
|---|---|---|---|
| C1 | Префикс ветки = `rox` (сейчас «Без префикса») | local-db `settings` schema default + Settings «Git и worktrees» UI + генерация имени ветки/worktree | 🔴 |
| C2 | Rox v2 = ON для всех, убрать из «Экспериментов» | флаг v2 default + Settings «Эксперименты» | 🔴 |
| C3 | Монитор ресурсов = ON | Settings «Общие» default (`local-db settings`) | 🔴 |
| C4 | Шрифты: UI = SF UI Display Pro, терминал = Monospace Argon, размеры 12pt | Settings «Внешний вид» + «Терминал» defaults | 🔴 |
| C5 | Glass-поверхности = ON, 80% | Settings «Внешний вид» glass default | 🔴 |

> Примечание: дефолты, что хранятся в `local-db settings`, меняются И в schema default, И (если нужно) новой миграцией drizzle — не править применённые снапшоты руками.

---

## D. Фичи

| # | Что | Где / детали | Статус |
|---|---|---|---|
| D1 | **ROX-1** — бесплатная модель по дефолту для всех + провайдеры Groq/Gemini (сейчас только Anthropic+OpenAI) | provider/model registry (`packages/shared` или desktop models config) + Settings «Модели». ROX-1 = OpenAI-совместимый `https://api.rox.one/v1`, model id `r1`, ключ из env (не хардкодить) | 🧩🔴 |
| D2 | Установить **1951 skills** с `skills.api.zed.md` | API найден: `GET https://skills.api.zed.md/api/skills` → `{data:{items:[{id,slug,title,descriptionRu}]}}`, total 1951. Ставить в `skills/<slug>/SKILL.md` (как `skills/rox`). Нужно найти endpoint контента каждого skill | 🧩🔴 |
| D3 | Вкладки **Skills** и **MCP** в онбординге/launch-wizard (сейчас только агенты+терминал) | desktop launch wizard (поиск «мастер запуска»/«Повторить запуск»/onboarding) | 🧩🔴 |
| D4 | **Тестовый проект** по дефолту при установке (демо с предзаполненными чатами агентов) | основа есть: `packages/host-service/src/runtime/seed/demo-project`. Зависит от рабочего host-service (B1) | 🧩🔴 |
| D5 | MCP — пояснение (как работает) | ✅ ОТВЕЧЕНО: Rox поднимает **hosted** MCP-сервер `https://api.rox.one/api/v2/agent/mcp` (HTTP, OAuth2.1/API-key). Другой агент: `claude mcp add rox --transport http https://api.rox.one/api/v2/agent/mcp`. Отдаёт: Tasks/Workspaces/Automations/Projects/Agents/Hosts&Terminals | ✅ |

---

## E. Интеграции

| # | Что | Детали | Статус |
|---|---|---|---|
| E1 | GitHub | App создавать заново НЕ надо (креды присланы). Redirect: `https://api.rox.one/api/auth/callback/github`. Впиши Client ID/Secret/private key/webhook в env API + redeploy api.rox.one | 🔴 |
| E2 | Linear | App есть (креды присланы). Redirect: `https://api.rox.one/api/auth/callback/linear`. Client ID/Secret в env + redeploy | 🔴 |
| E3 | Slack | **Отключить полностью** — убрать из Settings «Интеграции» UI и точек подключения | 🔴 |

---

## F. Блокеры и заметки

- **🔴 Ротация секретов (СРОЧНО):** в чат вставлены боевые ключи (банковская карта, GitHub App RSA private key, AWS access key, Cloudflare/PostHog/Sentry/Neon/Resend/Linear/Google/Upstash). Они в истории сессии — нужно ротировать. Я их не коммитил и не сохранял.
- **Rate limit:** массовый параллельный запуск агентов (5 шт) упёрся в API rate limit (инфра, не usage) — параллельная атака не прошла; нужна серийная работа или меньше параллелизма.
- **Параллельные баги в одном файле:** дефолты (C) и модели (D1) трогают Settings — вести по разным файлам/последовательно во избежание конфликтов.

---

## Рекомендованный порядок

1. **B1** (пересобрать `.app` с фиксом journal → проверить host-service stderr → дожать корень #2) — разблокирует половину жалоб.
2. **C1–C5** дефолты (один проход по desktop settings) + пересборка.
3. **D1** ROX-1 + провайдеры.
4. **D2/D3/D4** skills + онбординг-вкладки + тестовый проект.
5. **E1–E3** интеграции (env + redeploy + Slack off).
