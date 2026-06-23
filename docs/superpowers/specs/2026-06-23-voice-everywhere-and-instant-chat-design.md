# Voice everywhere + instant chat (design)

Date: 2026-06-23 · Phase 1 scope: **desktop + web** · Implementation branch: create `feat/voice-everywhere-instant-chat` from `main`

## Резюме (что и зачем)

Две продуктовые боли, обе подтверждены кодом:

1. **Голос (транскрибация).** Сейчас работает только в desktop, кнопка показывается даже когда сервис не настроен (выглядит как поломка), а серверный ключ нигде не задокументирован. Цель: голос доступен **любому вошедшему пользователю сразу**, на компьютере и в браузере, через один общий серверный ключ.
2. **Переход в чат.** Сейчас после создания проекта пользователя никуда не перебрасывает — он остаётся в списке. Цель: после создания проекта — **сразу чат**, готовый к вводу.

Фаза 1 — desktop + web. Телефон — Фаза 3 (отдельно). Полный агент-кодер в браузере — Фаза 2 (отдельно).

## Решения (зафиксированы с пользователем)

- **Платформы голоса:** конечная цель — везде (desktop + web + mobile). Фаза 1 = **desktop + web**. Mobile — Фаза 3.
- **Ключ распознавания:** один **общий серверный** `GROQ_API_KEY` (компания платит по факту использования). Хранить на сервере/в секретах, **не в коде** (иначе утечёт в публичный GitHub). Результат для пользователя — «голос всегда работает».
- **Природа web-чата в Фазе 1:** **быстрый ИИ-чат (текст→текст) + голос**, на готовом backend `chat.complete`. НЕ агент-кодер (правит файлы/репозиторий) — это Фаза 2.
- **После создания проекта:** сразу попадать в чат (пустой, или с уже запущенной задачей, если промпт введён при создании).

## Ключевые открытия (меняют дизайн)

- **В браузере нет рабочего чата вообще.** Раздел `apps/web/src/app/(agents)/**` — read-only витрина; поля ввода (`AgentPromptInput`, `FollowUpInput`) — заглушки (`disabled`, «скоро появится»). В web нет понятия «проект».
- **Есть два разных чата:** (1) быстрый LLM-чат `chat.complete` — backend готов, web уже подписан на роутер → оживить дёшево; (2) агент в сессии воркспейса — требует нового write-канала web→relay→host + стриминг → дорого (Фаза 2).
- **`project.create` уже создаёт main-workspace** и возвращает `mainWorkspaceId` (`apps/desktop/.../host-service handlers.ts:54,144,153`, `ensure-main-workspace.ts:58-108`). Второй workspace создавать НЕ нужно — нужно открыть существующий и показать чат.
- **Голосовое ядро desktop ~95% платформенно-нейтрально** (Web API `getUserMedia`/`MediaRecorder`) — переносится в браузер почти как есть; desktop-специфичен только хоткей `DICTATE`.

## Объём Фазы 1

Делаем: A (общий voice-модуль) · B (голос «всегда включён», desktop) · C (desktop: проект→чат) · D (web: оживить быстрый чат) · E (web: голос в чат).
Не делаем в Фазе 1: агент-кодер в web (Фаза 2), любой mobile (Фаза 3), стриминг ответа в web (chat.complete отдаёт ответ целиком — by design).

## Workstreams

### A — Общий voice-модуль (multiplatform core)
Вынести голосовое ядро из desktop в общий пакет, чтобы desktop и web делили один код, а адаптеры (транспорт tRPC, хоткей) остались «на краю». Это закладывает и Фазу 3 (mobile получит свой адаптер записи, но общий контракт/UI).

- Источник (desktop, переносится): `apps/desktop/src/renderer/lib/voice/useDictation/useDictation.ts` (запись), `.../lib/voice/audioToBase64.ts` (`blobToBase64`), `.../ChatInputFooter/components/MicButton/MicButton.tsx` (кнопка/жесты PTT+lock), `.../MicButton/WaveformOverlay.tsx` (оверлей волны).
- Назначение: `packages/ui/src/voice/` (web и desktop уже зависят от `@rox/ui`; `cn`/`lucide` уже там). Альтернатива — новый `packages/voice-client` (дороже инфраструктурно; не выбираем).
- Параметризация: убрать прямой `import { useHotkey } from "renderer/hotkeys"` из `MicButton`; хоткей передавать опционально (desktop — `DICTATE`/Ctrl+Shift+D из `apps/desktop/src/renderer/hotkeys/registry.ts:661-669`; web — без хоткея или браузерный `keydown`).
- Контракт: ядро НЕ импортирует tRPC-клиент. `MicButton` отдаёт `Recording` в `onComplete`; приложение само вызывает `voice.transcribe` (desktop уже так: `ChatInputFooter.tsx:163-195`).
- Удалить мёртвый код: `PromptInputSpeechButton` (Web Speech API) — `packages/ui/src/components/ai-elements/prompt-input.tsx:1274-1371` (0 потребителей).

### B — Голос «всегда включён» (desktop)
- **Ключ на сервере:** задокументировать `GROQ_API_KEY` в `.env.example` / `.env.local.example` (имя переменной, без значения). Источник истины секрета — Infisical/прод-env. Backend уже читает его в `packages/trpc/src/lib/voice/whisper.ts:19-25` (`resolveGroqKey`/`isVoiceConfigured`).
- **Гейт кнопки по реальному состоянию:** подключить во фронте уже существующий query `voice.isConfigured` (`packages/trpc/src/router/voice/voice.ts:13-15`) и использовать его в `MicButton`/`ChatComposerControls` (`apps/desktop/.../ChatComposerControls/ChatComposerControls.tsx:76-79`), чтобы кнопка была активна только когда сервис реально настроен. При общем серверном ключе это всегда `true`; гейт защищает от «битой» кнопки при сбое.
- Поведение «общий ключ для всех» обеспечивается тем, что ключ серверный (никогда не уходит клиенту) — пользователю не нужен свой ключ.

### C — Desktop: после создания проекта → сразу чат
Комбинируем два уровня (подтверждено агентом-навигатором):

- **C1 (навигация):** в `apps/desktop/.../AddRepositoryModals/AddRepositoryModals.tsx:26-30` (`onSuccess`) после `resolveNewProject(...)` добавить `navigate({ to: "/v2-workspace/$workspaceId", params: { workspaceId: result.mainWorkspaceId } })` (тот же вызов, что `useSubmitWorkspace.ts:124-129`). `result.mainWorkspaceId` уже есть в `ProjectSetupResult` (`useFinalizeProjectSetup.ts:6-10`). Добавить `const navigate = useNavigate()`.
- **C2 (чат как дефолт пустого workspace):** в `apps/desktop/.../v2-workspace/$workspaceId/page.tsx` (рядом с `:185-196`, где уже есть `addChatTab` из `useWorkspacePaneOpeners.ts:134-143`) — эффект «seed empty workspace with chat»: когда `persistedPaneLayout` пуст (`EMPTY_STATE`), один раз вызвать `addChatTab()` (создаёт панель `kind:"chat"`, `sessionId:null` — пустой чат, готовый к вводу; `store.addTab` ставит `activeTabId` → выходим из empty-state, `store.ts:199-209`).
- **Ловушка intent (обязательно):** тот же глобальный `NewProjectModal` используется в `ProjectPickerPill.tsx:52-56`, который НЕ хочет навигации (ему нужен только `projectId` для продолжения формы workspace). Навигацию вешать ТОЛЬКО в ветке «создать-и-открыть»; ввести флаг намерения в `add-repository-modal.ts` (`ActiveModal`), различающий «создать-и-открыть» vs «создать-и-вернуть-id». Места, где результат игнорируется (`DashboardSidebarHeader.tsx:303/475`), навигации не пострадают.
- **Согласование с persisted layout:** seed чата (C2) должен срабатывать только после загрузки `persistedPaneLayout` и когда он реально пуст, иначе гонка с `useV2WorkspacePaneLayout.ts:70-78` (`replaceState`). Идемпотентность через ref «seed once per mount» + проверку `tabs.length === 0`. Это и есть требование AGENTS.md (правило 9): write/seeding side-effects ждут strict readiness, если не доказуемо идемпотентны.

### D — Web: оживить быстрый ИИ-чат (`chat.complete`)
Backend готов (`packages/trpc/src/router/chat/chat.ts:217-299` `complete`, `:162-203` `createSession`, `:40-99` `listSessions`). Web уже подписан на роутер (`apps/web/src/trpc/react.tsx:29-30` `useTRPC`; `apps/web/src/trpc/client.ts:7` `trpcClient`). Образец для копирования — desktop `apps/desktop/.../quick-chat/components/QuickChatView/QuickChatView.tsx:81-136` (`send()` → `chat.complete.mutate`, локальный `useState` сообщений, `sessionId` через `crypto.randomUUID()` в ref; ~280 строк UI).

- Снять заглушку с композера: `apps/web/.../PreviewPromptComposer/PreviewPromptComposer.tsx` — пустой `handleSubmit` (`:42`), `textarea disabled` (`:58`), submit `disabled` (`:68`). Либо параметризовать существующий `PreviewPromptComposer` рабочим `onSubmit`, либо новый `WebChatView` по образцу `QuickChatView`.
- Подключить `useMutation(trpc.chat.complete.mutationOptions())`; вести сообщения в локальном состоянии; рендер из реального состояния (есть готовый `SessionChat` или простой список как `QuickChatView:166-196`).
- Обработать `status: ok | not-configured | needs-user-key` (тексты уже есть в desktop). Backend-env: `ROX_AI_API_KEY` на сервере; при отсутствии — мягкая деградация (`not-configured`).
- Точка входа для пользователя: «Новый чат» в `(agents)` (в web нет «проектов», поэтому аналог «сразу-в-чат» = «Новый чат → рабочий чат»). Маршрут сессии — `/agents/workspace/[workspaceId]`.

### E — Web: голос в чат
- Смонтировать общий `MicButton` (из A) в web-композер `PreviewPromptComposer.tsx:66-74` (между `PlusMenu` и `PromptInputSubmit` — структурный аналог desktop `ChatComposerControls.tsx:76-79`).
- По `onComplete`: `trpcClient.voice.transcribe.mutate({ audioBase64, mimeType, durationMs })`; результат вставить в композер через общий `usePromptInputController().textInput` (`packages/ui/.../prompt-input.tsx`).
- Запись в браузере работает из коробки (`MediaRecorder`); требуется secure context (HTTPS/localhost) — проверить на деплое web.

## Архитектура (общий core + адаптеры на краю)

```
                 packages/ui/src/voice/  (общий core)
                 ├─ useDictation        (getUserMedia + MediaRecorder)
                 ├─ blobToBase64
                 ├─ MicButton           (жесты PTT/lock, хоткей — проп)
                 └─ WaveformOverlay
                          │
        ┌─────────────────┼─────────────────┐
   desktop adapter     web adapter      mobile adapter (Фаза 3)
   apiClient(IPC)      trpcClient(HTTP)  apiClient(HTTP)+expo-audio
   hotkey=DICTATE      hotkey=none       native record
                          │
                  voice.transcribe (общий backend, Groq Whisper, серверный GROQ_API_KEY)
```

## Risks / ловушки

- **C — ProjectPickerPill регрессия:** безусловная навигация в `onSuccess` уведёт пользователя со страницы создания workspace. Обязателен флаг намерения (C).
- **C — гонка seed-чата с гидрацией layout:** `useV2WorkspacePaneLayout.ts:70-78` затирает store persisted-снапшотом; seed должен зависеть от снапшота и быть идемпотентным (AGENTS.md правило 9).
- **D — ожидания:** web-чат Фазы 1 — быстрый LLM-чат без стриминга и без правки файлов. Не путать с агентом-кодером.
- **B/D — env на сервере:** `GROQ_API_KEY` (голос) и `ROX_AI_API_KEY` (web-чат) должны быть в окружении; иначе обе фичи мягко деградируют (кнопка неактивна / `not-configured`). Значения не коммитим.
- **A — регрессия desktop-диктовки:** вынос ядра трогает рабочий desktop-код; нужен прогон диктовки на desktop после рефактора.
- **host-service минифицирован** в рабочем дереве — `kind:"chat"|"terminal"` различаем по клиентскому контракту `appendLaunchesToPaneLayout.ts:14-17`; для пустого чата используем `addChatTab` напрямую (не зависит от host-метки).

## Out of scope (последующие фазы)

- **Фаза 2 — агент-кодер в web:** новый write-канал web→relay→host (`HostChatNamespace` сейчас только `listMessages`, `packages/shared/src/host-client/types.ts:146-148`), стриминг, порт дисплей-слоя (~750 строк desktop-логики). Недели.
- **Фаза 3 — mobile голос:** нет агентного чат-экрана (только `CreateTaskSheet`); нужен `expo-audio` + разрешения микрофона (iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`) в `apps/mobile/app.config.ts` + rebuild dev-client; `expo-file-system@56` уже есть для base64.

## Открытые проверки перед реализацией (не блокеры дизайна)

- Подтвердить наличие `GROQ_API_KEY` и `ROX_AI_API_KEY` в целевом окружении (Infisical/прод). Значения не выводить.
- Решить точку входа «Новый чат» в web `(agents)` (кабинет `AgentsCabinet` сейчас без поля ввода) — где разместить кнопку/композер.
- Выбрать механику C: параметризовать существующий `PreviewPromptComposer` vs отдельный `WebChatView` (рекомендация — отдельный компонент по образцу `QuickChatView`, чтобы не ломать preview-обёртки).
