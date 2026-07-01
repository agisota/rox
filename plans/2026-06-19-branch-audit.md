# Branch Audit — 2026-06-19

Аудит несмерженных веток Rox: функционал, реальный статус, ценность; для «старья» — реконструкция исходной задачи из локальных сессий.

Метод: 16 параллельных агентов (read-only git + сессии `~/.claude/projects`, `~/.codex/sessions`, `~/.config/opencode`). Полные данные — workflow `rox-branch-audit` (wf_db262fb8-9c9).

## Главный вывод

Из 16 проанализированных веток **реальную несмерженную ценность несут только 2**. Остальные либо уже отгружены в main маленькими PR (superseded), либо stub, либо уже закрытый/смерженный leftover-ref.

| Disposition | Кол-во | Ветки |
|---|---|---|
| **finish-and-merge** | 1 | `claude/integr-github-provider` |
| **rebase-then-iterate** | 1 | `refactor/audit-2026-06` |
| **park-with-ticket** | 2 | `epics/wave`, `claude/local-only-auth` (#50) |
| **close-discard (superseded)** | 12 | notion-integration, integr-linear-provider, issue/27,28,29,30,32, wave-automations-22, wave-hosts-sandbox-32, wave-themes-27, eager-meitner-K6A5C, feat/agent-native |

## Археология: где исходные задачи

Чат-транскриптов для «старья» на этом Mac **нет** — ветки писались на Cursor Cloud / remote VM (`epics/wave`, `agent-native` → `/home/dev/1/...`) или в изолированных worktree (`refactor/audit`), чьи логи не персистились локально. НО исходные задачи восстановлены из durable in-repo артефактов:
- `epics/wave` → мастер-роадмап `set/plans/20260608-rox-productization-master-roadmap.md` (verbatim-цель Mark).
- `eager-meitner` (MONAD) → ExecPlan `apps/desktop/plans/20260609-1500-monad-...md` + Codex-сессии 2026-06-09 (упоминают MONAD).
- `refactor/audit` → `plans/refactoring-audit-2026-06.md`.
- `agent-native` → `plans/agent-native/plan.md` + research/.

## Детали — продуктовые ветки

1. **claude/local-only-auth** — stub: только plumbing флага `LOCAL_ONLY_AUTH` (env в 3 местах), потребителя НЕТ (нет bypass OAuth / mock org). → **park** (= твой #50). value low.
2. **feat/notion-integration** — superseded: main уже содержит Notion-sync + block→markdown, который ветка оставила TODO. Мерж = регресс. → **close-discard**.
3. **claude/integr-github-provider** — ✅ только тесты (+420) для уже отгруженного github-роутера, который на main БЕЗ тестов. Полные, замоканы все внешние deps. → **finish-and-merge** (низкий риск).
4. **claude/integr-linear-provider** — тест byte-identical с main (PR #62). → **close-discard**.
5. **issue/27-themes** — glass/vibrancy default-on + тесты, всё уже на main, 124 behind. → **close-discard**.
6. **issue/28-agents** — HarnessAuditReceipt, уже на main (#144/#170), конфликтует. → **close-discard**.
7. **issue/29-bootstrap** — workspace starter presets, byte-identical с main (#147/#213, 30 vs 27 presets). → **close-discard**.
8. **issue/30-integrations** — multi-provider integrations UI + testConnection, всё на main, дифф = удаление кода main. → **close-discard**.
9. **issue/32-hosts** — self-managed host add, byte-identical с main. → **close-discard**.
10. **claude/wave-automations-22** — initialContext в Create Automation, уже на main verbatim. → **close-discard**.
11. **claude/wave-hosts-sandbox-32** — sandbox TTL scheduler, identical с main (вкл. review-fix). → **close-discard**.
12. **claude/wave-themes-27** — Zed-themes import (460 тем), identical с main (#74 «wave salvage»). → **close-discard**.

## Детали — «старьё»

1. **epics/wave** (23 ahead / main +336) — fat-branch slice-1 всей продуктизации (убрать Stripe, crypto-economy, ROX ONE rebrand, RU-default, admin, themes, integrations, sandbox, OpenPanel, Execution Circuit, LOCAL_ONLY_AUTH). Реально реализован slice-1 с 16 тестами, НЕ полуфабрикат. Но программа сознательно ре-лендила каждый срез отдельными PR (#45,#54,#60-67), main ушёл на 336 коммитов. → **park-with-ticket**: зафиксировать как origin-волну, выгрести не-отгруженные «самородки** (circuit-hardening `evaluateTransitionSecurity`/`planExecutionPath`, sandbox-expiry, admin impersonate) в свежие per-slice PR; не реанимировать ветку.
2. **claude/eager-meitner-K6A5C** (MONAD desktop port, 3015 строк/79 файлов) — PR #40 **уже CLOSED** (2026-06-11). Дизайн-система переехала в `packages/ui/src/motion-frame/` по C2-решению «один дизайн-систем». Phase B был ~наполовину, визуала не было (Electron не стартовал в cloud). → **close-discard** (выгрести /monad gallery как референс).
3. **refactor/audit-2026-06** (12 ahead, −141 LOC/114 файлов) — ✅ Tier-1/Tier-3 рефактор: удаление верифицированного dead-code (~649 LOC), консолидация `getErrorMessage`/`githubAvatarUrl`/`sleep`, разбор god-файлов `git.ts`/`projects.ts` + характеризующие тесты. НЕ смержен, 13 дней stale → дрейф против v1→v2 миграции. → **rebase-then-iterate**: rebase на main, перепрогнать typecheck+lint+test, разбить на маленькие per-concern PR. **Единственная старая ветка с живой несмерженной ценностью.**
4. **feat/agent-native** (agent Sources + MCP proxy + composer) — PR #114 **уже MERGED** (2026-06-15), main содержит код, ветка 150 behind. Leftover-ref. → **close-discard**.

## Заход 2 — оставшиеся 26 веток (workflow w9l8i7s5n)

Результат: **25 close-discard** (все already-merged через смерженные PR или superseded), **1 park**.

**Already-merged (PR смержен, контент на main) → close-discard:**
agents-catalog-bundle (#63), billing-remove-paywall (#67, Stripe-teardown завершён #70), bootstrap-presets (#61), c1-tier-switcher, c2-reveal-marquee, c3-typeface-themes, c4-composites (Motion Frame, packages/ui), chat-mindmap-dag-views, ci-hygiene, custom-loading-screens, dvnet-topup-client, gracious-ptolemy, openpanel-renderer-sdk, sharp-fermat (motion kit), sleepy-volta (docs-only), mcp-preinstall-per-workspace, fix/chat-provider-robustness, fix/desktop-agent-icon-and-l10n, fix/public-profile-404, i18n/ru-phase2-routes.

**Superseded (эквивалент на main) → close-discard:**
execution-circuit-core, keen-feynman (Motion Frame seed), stoic-carson (trivial), rox/cloud-dev-env-docs-5046, rox/openpanel-renderer.

**Park → ticket:**
- **fix/web-auth-private-preview** (partial, 349 behind, PR не открывался) — несёт ЖИВУЮ несмерженную ценность: `SITE_GATE` basic-auth preview-гейт для web/marketing/docs, реальные email+password формы (вместо dev-autofill), non-fatal enrollment hook. НО: тащит ~16k строк случайного `.vercel/output`, конфликт по docs `/overview` redirects, и flip `emailAndPassword.enabled=true` требует продуктового решения по безопасности. → cherry-pick 3 пункта в свежую ветку от main, не мержить as-is.

## ИТОГО по всем 42 веткам

| Disposition | Кол-во | Ветки |
|---|---|---|
| **finish-and-merge** | 1 | integr-github-provider |
| **rebase-then-iterate** | 1 | refactor/audit-2026-06 |
| **park-with-ticket** | 3 | epics/wave, local-only-auth (#50), web-auth-private-preview |
| **close-discard** | 37 | все already-merged/superseded |

**Вывод:** 37 из 42 — мёртвые ref'ы уже отгруженного. Причина sprawl: параллельные cloud-agent сессии лендили каждый срез маленькими PR, а исходные feature-ветки оставались висеть. Реально живого несмерженного — **3 нити**: github-тесты (merge), refactor-audit (rebase), web-auth preview (cherry-pick).
