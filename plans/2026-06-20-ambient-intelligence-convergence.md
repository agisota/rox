# Rox Ambient Intelligence — Convergence Plan

Status: proposed · Date: 2026-06-20 · Owner: founder + agent

Audit-backed plan to finish & **wire together** five half-built surfaces (voice,
LiveKit, journal, memories, saved-prompts/empty-screens) into one coherent
"always-on, on our dime" intelligence loop. Every claim below is grounded in the
2026-06-20 code audit (file:line citations kept in the per-area sections).

---

## 0. The core insight — these are not 5 features, they are 1 loop

Today they are **disconnected islands**, and the most expensive island is a dead
end:

| Surface | State | The disconnect |
|---|---|---|
| Voice dictation | ✅ done, on-theme, on our Groq | Produces transcripts; feeds nothing downstream |
| LiveKit RTC + presence | 🟡 infra merged | `useVoiceRoom`/`rtc.token` have **zero consumers** |
| Journal | 🟡 daily R1 digest | **No FK / no link to automations**; not the 24/7 feed you asked for |
| Memories | 🟡 written, curated | **Never injected into any agent** — the loop has no consumer (the killer gap) |
| Saved prompts / empty screens | ❌ no seed | Bare empty screens; only Automations (51 templates) does it right |

The fix is one spine — **Capture → Learn → Remember → Inject → Act** — all bound
to our API, with a global opt-out and a customization context field:

```
        ┌──────────────────────── CAPTURE (always-on, our API) ───────────────────────┐
        │   Voice (Groq Whisper) · Chat sessions · (later) screen/LiveKit voice room   │
        └───────────────────────────────────┬─────────────────────────────────────────┘
                                             │  per-session-end (event) + */5 safety net
                                             ▼
                                ┌──────────────────────────┐
                                │  LEARN: skill-learning    │  Anthropic official prompt
                                │  extract key points       │  cheap model (Groq Compound)
                                └────────────┬──────────────┘
                                             │  aligned to ontology (5 cat + dedup)
                                             ▼
                                ┌──────────────────────────┐      approved
                                │  REMEMBER: memory_items   │───────────────┐
                                └────────────┬──────────────┘               │
                  minute trigger             │                              ▼  ***THE MISSING WIRE***
        ┌──────────────────────┐  (automation │                  ┌──────────────────────────┐
        │  Automations (cron)  │──FK─────────►│  JOURNAL          │  INJECT: agent context   │
        │  * * * * *           │   journal_   │  • event lane     │  builder reads approved  │
        └──────────────────────┘   events     │  • daily reflect  │  memories on every run   │
                                             ▼                    └────────────┬─────────────┘
                                   [ user sees a live journal ]                ▼
                                                                        ACT: every chat/
                                                                        automation/voice run
                                                                        is now memory-aware
```

**If we build per-session learning but skip the inject wire, the whole memory
feature stays useless.** That wire is Phase 1, on purpose.

---

## 1. Gaps you did not call out (the value-add)

1. **Memories are write-only.** `memory_items` is read only by the desktop
   curation UI; **no agent context builder consumes it** (`packages/chat` uses
   Mastra's separate per-thread store, not our ontology). Fixing extraction
   without the inject is motion without progress. → Phase 1.
2. **LiveKit is paid-for but dormant.** `@rox/rtc` (`useVoiceRoom`, `rtc.token`)
   merged with no UI consumer. Decide: wire it into the always-on voice agent, or
   park it behind a ticket so a paid dep isn't dangling. → Phase 4.
3. **Voice is desktop-only.** Violates multiplatform-first; web + mobile have no
   mic button. `voice.transcribe` tRPC is already platform-agnostic — only the
   recorder hook is desktop-DOM-specific. → Phase 4.
4. **"Always-on agent" is unspecified.** It exists only as feature-flag catalog
   text. Recommended concrete definition: an **ambient assistant in the chat
   surface** (proactive, memory-aware, on our API) + an **optional LiveKit voice
   room**; both opt-out, both showing a visible active indicator.
5. **Journal has two conflicting models.** Daily R1 digest vs the minute-feed you
   want. Don't overload one table — run **two lanes** on one screen (continuous
   event lane from automations + daily reflection lane). → Phase 3.
6. **Memory dedup is exact-string only** (pgvector deferred). Always-on capture
   will spawn duplicates fast. → Phase 2 adds embedding dedup.
7. **Empty-screen inconsistency.** Automations = 51-template gallery (gold
   standard); saved-prompts/memory/journal = bare. Standardize a seed/demo
   pattern. → Phase 0.
8. **Cost discipline is on us.** "We pay, don't bug the user" + per-minute journal
   + per-session learning + always-on agent = continuous LLM spend on our keys.
   Hot path must use cheap models (Groq Compound / Cerebras), batch, and honor a
   global kill-switch. Reserve R1/Claude for synthesis only.
9. **Privacy/consent for always-on.** Continuous capture (voice now, screen
   later) needs explicit consent, a per-surface opt-out, and a visible recording
   indicator — or it is a trust/legal problem, not a feature.
10. **Pluely & SuperKMD never existed** — only planning text. If wanted, build as
    native Rox surfaces (own `@rox/ui` tokens), NOT by vendoring an upstream
    interface. Out of scope for this convergence; tracked separately.

---

## 2. Hard-to-reverse decisions (decide before code touches data)

| Decision | Recommendation | Why hard to undo |
|---|---|---|
| Journal data model | NEW `journal_events(automation_id FK→automations, automation_run_id FK, kind, payload jsonb, created_at)`; keep `journal_entries` as daily digest | Once Electric replicates + clients read, the shape is public |
| Memory inject contract | Approved `memory_items` rendered into the chat/agent system prompt via a context builder in `packages/chat` (near `service.ts:156`); cap + ordering by category | Agents start depending on the shape/limits |
| Learning cadence | Event-driven on session idle/end + `*/5` reconcile safety net | Cron identity & idempotency keys are sticky |
| Hot-path model | Groq Compound for extraction/dedup; R1/Claude only for daily synthesis | Cost + latency profile baked into UX |
| Consent/opt-out | One settings store flag gating all ambient capture, default per onboarding choice | Trust expectations once shipped |

---

## 3. Sequenced execution

### Phase 0 — Pre-fill (ship first, additive, zero schema risk)
- **Saved prompts**: 10 seeded examples. Approach: render read-only example
  cards when `prompts.length===0` with a "Сохранить себе" action that
  materializes the row (no DB migration, deletions stick). Copy reused from
  `automations/templates/data.ts`.
  Files: `apps/desktop/.../SavedPromptsView/SavedPromptsView.tsx`, new
  `default-prompts.ts`.
- **Memory**: 1–2 dismissible example suggestions per category via the existing
  `MemorySuggestions` Approve/Decline banner (no permanent rows).
- **Journal**: richer empty card + "Сгенерировать за сегодня" trigger
  (`journalRouter.regenerateDay`) so value is visible pre-cron.
- **Skills**: make the empty branch actionable ("Установить стартовые скиллы"),
  confirm host-service seeding runs.

### Phase 1 — Memory injection (close the dead loop; highest leverage)
- Context builder in `packages/chat` that loads `memory_items WHERE
  status=approved` (org+user scoped, category-ordered, capped) into the agent
  system prompt / Mastra working memory.
- This alone makes the whole memory feature *do something*.

### Phase 2 — Per-session skill-learning
- Event trigger on session idle/end + `*/5` reconcile → per-session extraction →
  `memory_items(source=agent, suggested, sourceRef.sessionId)`.
- Swap home-grown export prompt (`ImportPanel.tsx:13`) + extraction prompts for
  **Anthropic's official memory prompt** (fetch current text before coding).
- Embedding dedup (activate deferred pgvector) instead of exact-string.

### Phase 3 — Journal 24/7 + automations link
- `journal_events` table + Drizzle relations + Electric replication + collection
  + scope in `electric-proxy/where.ts`.
- `dispatchAutomation` writes a `journal_events` row per run (reuses the existing
  `* * * * *` automations dispatcher — no new cron needed).
- New "Лента" lane in `JournalView` beside the daily reflection.

### Phase 4 — Voice opt-out + customization + always-on + parity
- `settings/voice`: enable/disable switch + "context for the agent" textarea
  (feeds `postprocess.ts` + ambient agent).
- Define + build the always-on ambient assistant (memory-aware, our API,
  opt-out, visible indicator).
- Port the mic button to web + mobile (reuse `voice.transcribe`).
- Wire or formally park `@rox/rtc`.

---

## 4. Open questions (decide or I proceed on the recommendation)

- Always-on agent surface: ambient chat assistant (recommended) vs LiveKit voice
  participant vs both?
- Memory inject limit/ordering: how many memories per prompt, and do
  `instructions`/`identity` always win? (recommended: yes, then most-recent).
- Journal: keep the daily R1 digest at all, or fully replace with the automations
  event feed? (recommended: keep both as two lanes).
- Consent default: ambient capture ON or OFF on first run? (recommended: OFF,
  opt-in during onboarding, given privacy.)
