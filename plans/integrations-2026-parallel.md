# ROX Parallel Integrations Masterplan 2026

## Цели
Внедрить 9 фич в параллельных ветках как **нативные Surfaces**.

## Стратегия
1. Base: develop (создать если нет)
2. Ветки: `feat/surface-opendesign`, `feat/orchestrator-paperclip` и т.д.
3. Структура: `packages/surfaces/{slug}/` + `skills/{slug}/` + registration in core.
4. Минимизация конфликтов: Каждый surface имеет свой entry + shared UI kit.

## Feature List & Proposed Names
1. **opendesign** -> surface-design-agentic (AI Design Studio)
2. **paperclip** -> surface-agent-company (Agent Orchestra)
3. **hermes** -> surface-persistent-agent (Self-evolving Agent Host)
4. **dayflow** -> surface-time-insight (Auto Journal + Planner)
5. **pluely** -> surface-stealth-copilot (Invisible Meeting AI)
6. **fsnotes** -> surface-ultra-notes (Lightning Markdown FS)
7. **surrealist** -> surface-db-visualizer (SurrealDB IDE embedded)
8. polish-ui-ux
9. onboarding-pro

## Next Actions
- [ ] Создать develop
- [ ] Сгенерировать individual goal cards
- [ ] Spawn 9 agents via MCP

Use Codex for planning, Grok Composer for build.