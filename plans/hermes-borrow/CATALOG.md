# Hermes WebUI → «Наш проект»: каталог заимствований и новых фич

> Источник: `github.com/nesquena/hermes-webui` (v0.30, vanilla-JS SPA + Python backend).
> Метод: ultracode-workflow — 8 агентов-разведчиков по поверхностям + 3 агента-идеатора → синтез.
> Сырьё: **89 реальных фич + 39 идей → 58 курируемых фич** в 9 кластерах.
> Дата: 2026-06-24. Принцип: **multiplatform-first** (web + mobile + desktop из единого core).

---

## 0. Твои 4 фаворита — где они в каталоге (first-class)

| Фаворит | Закрывается фичами |
|---|---|
| ① Цветные теги/метки + фильтр/сортировка чатов | **F10** (pill-bar), F11 (палитра+studio), F12 (точка в строке), F13 (#tag-в-заголовке), F14 (AI-автотеги), F15 (поиск), F17 (boolean+saved views), F18 (тайм-группы), F19 (pin/fav/archive), F20 (rich row) |
| ② Аватар/identity слева-внизу (avatar/logo/id) | **F21** (dual-identity card), F22 (profile chip), F23 (dropdown+detail), F24 (glyph-генератор), F36 (context status line) |
| ③ Индикатор workspace (командный vs личный) | **F25** (team-vs-personal switcher + retint), F26 (searchable dropdown), F27 (manage panel), F28 (org switcher), F29 (per-workspace theming) |
| ④ Правая панель файлов | **F30** (header+tabs+breadcrumb), F31 (IDE-строка дерева), F32 (lazy expand), F33 (preview), F34 (rename/DnD/upload), F35 (git badge), F03 (3-state demand-driven panel) |

---

## 1. Рекомендованный layout (адаптивный three-pane console, единый core)

```
DESKTOP / WIDE WEB (>=901px)
┌──────────────────────────────────────────────────────────────────────────┐
│  ░ titlebar (drag-exempt) → identity context line: @you · #design · Researcher · 3 online ░ │
├──┬───────────────────────┬─────────────────────────────────┬──────────────┤
│  │  🔎 search            │  topbar: title · model · clear  │  WORKSPACE   │
│ R│  ─ source tabs ─      │  ┌───────────────────────────┐  │  Files│Art│Todo│
│ A│  ● All ● Unassigned   │  │                           │  │  breadcrumb  │
│ I│  ● Test ● Foo ● Bar   │  │     conversation canvas    │  │  ▸ archive   │
│ L│  ─────────────        │  │   (Activity-сводки tool-   │  │  ▾ docs      │
│ 48│ ★ Pinned             │  │    calls, collapsible)     │  │    ai….md 4k │
│ px│ TODAY                │  │                           │  │  ▸ screenshots│
│ ▎ │  • chat ● dot #tag   │  └───────────────────────────┘  │              │
│ ⚙ │ YESTERDAY            │  [profile][ws][model][◔ctx][🎤] │  (demand-    │
│  │ ┌─ identity card ───┐ │  Message…           📎 ▶        │   driven,    │
│  │ │ 👤 you  ▸ Persona │ │                                 │   edge-pill) │
│  └─┴───────────────────┴─┴─────────────────────────────────┴──────────────┘
   rail   conversation sidebar (~300px)      center (flex-1)     right (~300px)

TABLET (641–900px): rail + sidebar остаются, правая панель — overlay поверх.
PHONE (<=640px): тот же DOM реформируется —
  sidebar → полноширинный slide-in drawer (те же pills, search, identity card)
  правая панель → slide-over справа · rail → бургер
  composer chips → одна кнопка-конфиг с анимированным context-ring
  жесты primary: swipe-to-tag/archive, edge-swipe, pull-refresh
```

**Общие слайсы состояния (единый core):** tri-state `activeProject` фильтр · `Org→Workspace→Conversation` контекст identity · синхронизируемый `organization-state` документ (пины/теги/views) · design+motion токен-бандлы → CSS vars (web/desktop) и native style/animation (mobile). Theme-color meta-мост связывает accent активного workspace с OS-хромом окна.

---

## 2. Каталог по кластерам (58 фич)

Легенда: `src` = borrowed / hybrid / novel · `Cx` = S/M/L · `Pri` = must/should/could.

### Кластер A — Shell & Layout (каркас)
- **F01 · Three-pane adaptive shell** `borrowed·M·must` — rail 48px / sidebar 300 / canvas flex-1 / right 300, у всех `min-0`. *Несущая конструкция всех фаворитов.* X: один DOM-tree, mobile реформирует в drawers.
- **F02 · Icon rail + active-tab accent bar** `borrowed·S·should` — вертикальный рельс ~11 вкладок, Settings внизу, 3px accent-бар активной. X: desktop вертикаль, mobile бургер.
- **F04 · Resizable panes** `borrowed·S·could` — drag-ручки 5px, clamp min/max, ширины в storage. X: только pointer; mobile drawers.
- **F06 · Flicker-free first paint** `borrowed·S·should` — стейт штампуется на root до CSS, bfcache-resync. X: web/PWA, desktop наследует.

### Кластер B — Identity & Profiles (КТО) — фаворит ②
- **F21 · Dual-identity card (human + agent persona)** `hybrid·M·must` — две строки: ЧЕЛОВЕК (avatar/initials, имя, @handle, id, online-dot) + активная ПЕРСОНА (профиль, модель, gateway-dot, skills). X: desktop titlebar / web composer popover / mobile bottom-sheet.
- **F22 · Profile switcher chip** `borrowed·S·must` — пилюля в composer: glyph + профиль + chevron → dropdown. Якорь для team-vs-personal. X: общий компонент от `activeProfile`.
- **F23 · Profile dropdown + detail card** `borrowed·M·should` — список профилей со статус-точкой (зелёный glow=gateway up), detail: Status/Gateway/Model/Provider/Skills/Default space.
- **F24 · Deterministic identity glyphs** `hybrid·S·should` — один генератор initials-on-color для людей/персон/workspace/org, стабильный hash. X: чистая core-функция `glyphFor(id,kind)`.
- **F36 · Identity context status line** `hybrid·S·should` — одна строка: КТО·ГДЕ·КАК·сколько онлайн, приоритетный truncation. X: desktop полная строка, mobile avatar+glyph+«·3».
- **F37 · Presence + member avatars + private/shared lock** `novel·L·could` — статус-точки участников, стек аватаров на shared-чате, lock-glyph на приватном. X: presence по одному WS/SSE-каналу.

### Кластер C — Workspaces (ГДЕ) — фаворит ③
- **F25 · Team-vs-personal switcher + one-accent retint** `hybrid·M·must` — Spaces → org-aware: группы Personal/Team, у каждого цвет+glyph; выбор перекрашивает РОВНО один accent-токен по всему shell (вкл. OS-хром). *Видно где ты — защита от ошибок контекста.*
- **F26 · Searchable workspace dropdown** `borrowed·M·should` — фильтр по имени ИЛИ пути, two-line опции, active-highlight, footer: New worktree / Choose path / Manage.
- **F27 · Workspaces management panel** `borrowed·M·could` — строки с grip, drag-reorder (persisted), Active-badge.
- **F28 · Account/Org switcher (multi-tenant root)** `novel·L·could` — выбор организации над workspace → иерархия Org→Workspace→Conversation, основа «кто я / кто платит / кто видит».
- **F29 · Per-workspace / per-persona theming** `hybrid·M·could` — скин привязан к workspace И персоне, accent-crossfade при переключении. «Team=blue, Personal=clay».

### Кластер D — Tags & Organization (организация) — фаворит ①
- **F10 · Colored filter-pill bar** `borrowed·M·must` — ряд пилюль над списком: All / dashed Unassigned / по проекту (6px цветная точка). Клик фильтрует, активная заливается accent. Dashed «+» создаёт inline, ПКМ/long-press → rename/color/delete. *Фаворит #1, one-tap триаж.*
- **F11 · 8-цветов палитра + color/icon studio + auto-color** `hybrid·S·should` — round-robin авто-цвет, swatch-ряд, emoji/иконка на тег, hash имени→стабильный hue. X: палитра+hash в core (цвет байт-в-байт одинаков везде).
- **F12 · Per-row color dot** `borrowed·S·should` — 6px точка как flex-sibling между title и time (НЕ внутри ellipsis-title → не обрезается).
- **F13 · #tag-в-заголовке → click-to-filter chips** `borrowed·S·should` — любой `#word` в title → цветной chip, клик кидает тег в поиск. Лёгкая вторая система тегов без создания проекта.
- **F14 · AI auto-tags + auto-title** `hybrid·L·should` — на settling чата модель предлагает 1–3 тега + проект как ghost-chips + адаптивный авто-заголовок (уважает ручной override), calm cross-fade. *Снимает ручную дисциплину — организация по умолчанию.*
- **F15 · Live filter box + full-text search + highlight** `borrowed·M·must` — мгновенный title-match + debounced backend content-search, `<mark>`-подсветка (box-decoration-break:clone).
- **F17 · Boolean multi-tag + Saved Views + Smart Folders** `hybrid·L·should` — мульти-чип фильтр (OR/AND/NOT), live-счётчик, именованные Saved Views, rule-based Smart Folders (Untagged/Has errors/CLI/Touched today/@me). X: фильтр-выражение — serializable JSON в core.
- **F18 · Collapsible time-grouped list** `borrowed·M·should` — Pinned / Today / Yesterday / Week / Older, server-synced «now», состояние сворачивания persisted, золотая ★Pinned первой.
- **F19 · Pin / Favorite / Archive lifecycle** `hybrid·M·should` — capped ★Pinned с optimistic reorder, Favorites-tier, авто-archive по правилам («N дней без касания, не трогать pinned/fav»). X: swipe-tiers на mobile.
- **F20 · Rich session row** `borrowed·M·should` — title+time + color dot, lineage/fork-badges, worktree/branch, source-chips (CLI/Claude Code/Telegram/Discord/Slack), density-toggle compact/detailed.

### Кластер E — Conversation Canvas (сцена чтения/письма)
- **F39 · Semantic «Activity» worklog** `borrowed·M·should` — tool-calls бакетятся по intent (shell/read/search/write/skill/…) в ОДНУ Activity-строку с tense+count лейблом («Ran 5 commands», «Read 3 files»), детали по клику. *Самая заимствуемая идея канваса.*
- **F40 · Collapsible tool/thinking cards + Expand/Collapse-all** `borrowed·M·should` — тихие debug-строки, `<think>`→thinking-card, per-chat/per-turn persisted состояние + глобальный дефолт.
- **F41 · Sticky-bottom auto-scroll + sticky-unpin** `borrowed·M·should` — липнет к низу при стриме, но деликатный скролл вверх анпинит (hysteresis), ↓-пилюля возвращает. Закрыт iOS/portrait edge.
- **F42 · Composer command surface** `borrowed·L·must` — кластер chips: profile / workspace+files-toggle / model / reasoning / toolsets + SVG context-donut + 📎 + 🎤 + voice. `/`-команды и selection-reply над textarea. *Несёт фавориты #2/#3 inline.* X: mobile сворачивает в одну кнопку с анимированным ring.
- **F43 · Per-message action bar + rich markdown** `borrowed·M·should` — copy/edit/fork-branch/regenerate/TTS, per-block copy, Mermaid+KaTeX+click-zoom, frame-budgeted стрим. *Чат editable и branchable.*
- **F38 · Conditional authorship (shared rooms)** `hybrid·M·could` — в shared-чате у human-turn аватар+имя, в solo чисто (позиция = отправитель). Ключ `visibility==='shared'`.

### Кластер F — Workspace Files Panel (правая панель) — фаворит ④
- **F03 · Demand-driven right panel (3-state)** `borrowed·M·must` — closed|browse|preview, closed=width:0 + 240ms glide + floating edge-pill 34×44 для reopen, open-file→preview. Persisted. *Файлы невидимы пока не нужны, но reopen в один клик.*
- **F30 · Header + Files/Artifacts/Todos tabs + breadcrumb** `borrowed·M·must` — «Workspace» title=breadcrumb root, hidden-indicator, git-badge, icon-row (parent/new file/new folder/refresh/upload/kebab/close), tablist Files/Artifacts(N)/Todos.
- **F31 · IDE-grade file-tree row** `borrowed·M·must` — выровненный toggle-slot (placeholder у файлов = иконки в линию с chevrons), 14px Lucide-иконка по расширению (.js→zap/.py→file-code/config→gear/.sh→terminal), ellipsis-имя, tabular-nums размер справа, 1px guide-line вложенности.
- **F32 · Lazy expand/collapse + per-workspace persist + parallel prefetch** `borrowed·M·should` — expanded-dirs Set, lazy-fetch+cache, на root-load все открытые поддеревья тянутся параллельно.
- **F33 · Multi-format inline preview** `borrowed·L·should` — ~8 режимов (image/av/pdf/md+KaTeX/html/csv-table/Prism-code/text) + цветной badge, авто-refresh когда агент меняет этот путь.
- **F34 · In-tree manipulation: rename/delete/drag-move/OS-drop + cruft-filter** `borrowed·L·could` — double-click rename, drag на папку, drop из Finder (рекурсивно), скрытие .DS_Store/.git/node_modules с reversible toggle.
- **F35 · Git badge + identity-aware authorship** `hybrid·M·could` — monospace `main · 3△ ↑2` (accent при dirty), в shared-workspace кто последний трогал файл (avatar+time).

### Кластер G — Power Features (скорость и глубина)
- **F44 · Universal command palette (Cmd/Ctrl+K)** `hybrid·M·should` — fuzzy switcher по чатам/тегам/проектам/файлам/skills/командам, scope-префиксы (`>`команды `#`теги `@`профили `/`файлы). *Главный ускоритель power-user.*
- **F45 · Unified slash-command palette (5 источников)** `borrowed·M·should` — `/` мёржит built-in + sub-arg (/model /theme /personality) + agent + plugin + skill, source-badge, locale-aware, /theme live-preview.
- **F16 · Faceted scoped search** `hybrid·M·could` — сегменты Titles/Messages/Tool calls/Files со счётчиками + scope «в этом проекте/чате».
- **F46 · Cross-device sync (пины/теги/проекты/views/disclosure)** `novel·L·must` — один синкаемый organization-state документ per user, LWW + per-field timestamps, по SSE + offline-очередь. *Связующая ткань: пин на десктопе = пин на телефоне.*
- **F47 · Per-profile Skills / MCP / Plugins inventory** `borrowed·M·could` — категории, `enabled/total` coverage, searchable MCP-tool inventory (server-side redaction), read-only Plugins panel.
- **F48 · First-run onboarding wizard + live probe** `borrowed·M·could` — system→setup→workspace→password→finish, probe `<base_url>/models` (idle/ok/error) до продолжения, keyless+OAuth.
- **F49 · Conversation outline + recent-jump history** `hybrid·S·could` — floating outline по USER-сообщениям (60-char excerpt, smooth-scroll+flash), nav-history stack (Alt+←/→, edge-swipe), Recents-flyout ~10.
- **F58 · 14-locale i18n + scoped RTL + transcript/JSON export-import** `borrowed·M·could` — 14 локалей, key-parity enforcement, RTL только на чат+composer (без LTR-flash, code LTR), export MD/JSON + reimport.

### Кластер H — Theming & Motion (язык дизайна и движения)
- **F07 · Token-driven «calm console» design system** `borrowed·M·must` — палитра, spacing 4/8/12/16, radius 4/8/12/999, surfaces; правила: border-not-shadow, один accent за раз, pill только для chips, без вложенных rounded-rect. X: JSON→CSS vars (web) + native structs (mobile).
- **F08 · Two-axis Theme × Skin** `borrowed·M·should` — Theme (System/Dark/Light, `.dark`) ⟂ Skin (accent, `data-skin`), ~17 скинов, новый скин ~10 строк CSS.
- **F09 · Native window-chrome sync (theme-color meta)** `borrowed·S·should` — `--sidebar` → `theme-color` meta, titlebar/status-bar флипает в лок-степ с темой, IPC-free.
- **F53 · Shared motion token layer + reduced-motion contract** `hybrid·M·should` — один `motion.json` (enter/reorder/swipe-commit/panel-slide/pulse) → CSS vars + Reanimated/Compose/SwiftUI, energy-contract full/reduced/off из OS-флага.
- **F54 · View-transition panel scene model** `hybrid·L·could` — platform-neutral scene-descriptor → View Transitions (web) / slide-over (mobile) / pane-springs (desktop).
- **F55 · Signature motion set** `borrowed·M·should` — FLIP-reorder списка, skeleton с sheen (zero layout shift), swipe-spring + sibling reflow, bottom-sheet docks, streaming token-fade, rail-tooltips.
- **F56 · Focus / Zen mode (density-token)** `hybrid·M·could` — one-tap: сворачивает sidebar+tree, расширяет канвас, гасит chrome-opacity, анимировано общим scene+token.
- **F57 · AI-seeded empty states + staggered entrance** `hybrid·S·could` — theme-tinted иллюстрация + 3–4 AI-стартовых промпта под workspace/profile, stagger-fade.

### Кластер I — Mobile & Desktop Adaptation (один core, три форм-фактора)
- **F05 · Responsive cascade → drawers** `borrowed·M·must` — 3 брейкпоинта реформируют тот же DOM, 44px touch-targets, shadow только у открытого drawer.
- **F50 · PWA: installable standalone + offline** `borrowed·M·should` — manifest (window-controls-overlay/standalone), maskable icons, shortcut, version-pinned SW (network-first shell, network-only /api+/login), offline-page, notification deep-link.
- **F51 · First-class mobile gesture grammar (shared tokens)** `hybrid·L·should` — swipe-archive/delete (или quick-tag), long-press menu, pull-refresh, edge-swipe; two-stage swipe → mini chip-targets чтобы тегать не выходя из списка.
- **F52 · Desktop multi-window + state-handoff** `novel·L·could` — отрывать чат/дерево/терминал в своё окно с custom titlebar и morph-анимацией, каждое окно — вид на один core-state.

---

## 3. Top-picks (12 фич максимального рычага для v1)

`F10` pill-bar · `F21` dual-identity card · `F25` team-vs-personal switcher · `F30` files panel header/tabs · `F03` demand-driven panel · `F42` composer surface · `F46` cross-device sync · `F01` three-pane shell · `F22` profile chip · `F39` Activity worklog · `F31` IDE file-row · `F05` responsive cascade.

---

## 4. Открытые развилки (решаются в интервью)

1. **Что такое «наш проект»** и стек (Set / новое кросс-платф. / форк Hermes).
2. **Платформы и фазность** v1 (web+PWA → mobile, или core-first, или desktop-first).
3. **Solo vs team** — гейтит весь collaboration-кластер (F37/F38/F28).
4. **Теги vs профили** — раздельные оси (реко) или единое понятие.
5. **Модель тегов** — heavyweight Projects / lightweight #tags / оба слоя / +AI.
6. **Identity card** — реальный human-аккаунт (auth/email/id) или glyph+persona.
7. **Team-vs-personal workspace** — реальный multi-tenant backend или визуальный лейбл.
8. **Sync** — real-time cross-device (F46) в v1 или per-device-local.
9. **Right panel** — closed-by-default+edge-pill; files-only или +Artifacts+Todos; read-only или mutation.
10. **Motion/native** — shared motion-токены сразу или hand-tune per-platform.
11. **Theming scale** — полная 17-skin×3-theme + per-workspace binding или минимум.

---

*Финальный tailored-план (goals + ТЗ для агента) пишется после интервью — в отдельный документ.*
