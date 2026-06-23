# Custom Provider — chat fix + full model list (design)

Date: 2026-06-19 · Branch: `feat/custom-provider-models`

## Problem

Connecting a custom OpenAI-compatible provider in Rox desktop and selecting one of its
models yields a red error and no response. Separately, the UX forces the user to pick a
single model in Settings; the user wants the provider's whole model list surfaced in the
chat model picker (bottom-left), like built-in providers, and the model field removed from
Settings.

## Root cause (verified)

Custom models are routed as wire id `openai/<modelId>`. mastracode maps every `openai/*`
model to `openai.responses(modelId)` → `POST {baseUrl}/responses` (OpenAI **Responses**
API). The Rox house gateway (`api.zed.md/v1`) implements `/responses`, so the house model
works; third-party OpenAI-compatible servers (Groq, OpenRouter, Together, vLLM, Ollama, LM
Studio, …) implement `/chat/completions`, not `/responses` → 4xx → captured into
`runtime.lastErrorMessage` → rendered as the red banner in `ChatInputFooter`.

Headers are NOT the cause: only `Authorization: Bearer <key>` is sent (no
`anthropic-version`/`x-api-key`/beta). Model discovery works because it hits `/models`; chat
fails because it hits `/responses`.

Secondary: `service.ts` clears `OPENAI_*` env in `finally` before `sendMessage`; mitigated
in the desktop/host path (env re-resolved per turn) but a fragile seam.

## Decisions (user)

- Bug fix: **any working path** — prefer mastracode public API → patch/pin → thin local adapter.
- Model list freshness: **live-refetch `/v1/models` on picker open**.
- Settings: **remove model selection entirely**; Settings only connects (baseUrl + apiKey)
  and parses the model list.
- Scope: keep **one** custom provider, **many** models (matches user language; YAGNI).

## Workstreams

### A — Routing fix (linchpin, spike first)
Route custom providers off the `openai/*`/responses path onto `/chat/completions`.
`resolveModel`: `openai/*`→responses, `moonshotai/*`→custom endpoint, **other → Mastra model
router**. mastracode has `createOpenAICompatible().chatModel()` (used for GitHub Copilot).
Spike determines the cleanest supported mechanism to make a custom provider use
chat-completions; fallback to patch/pin or a thin adapter if no public hook.

### B — Full model list
- `custom-provider-config.ts`: schema `version 1→2`; replace required `modelId` with
  `models: string[]` (+ optional `defaultModelId`); drop the `throw "Выберите модель"`.
- `buildCustomProviderModel`: emit one `ModelOption` per model under "Свой провайдер".
  `filterModelsByActivation` already force-shows custom-provider models.
- tRPC `auth`: expose the model list to the picker; add live-refetch query bound to picker open.
- Runtime env (`custom-provider-runtime-env.ts` ×2): activate `OPENAI_BASE_URL`/`OPENAI_API_KEY`
  when the selected chat model belongs to the custom provider's list (not exact single-id match).
- `CustomProviderSection.tsx`: remove Model `Select` + required validation; "Подключить" →
  parse `/v1/models` → persist list; add "Обновить список".

### C — Comprehensive E2E
After fix: run every discovered custom-provider model on (1) plain prompt, (2) skill init,
(3) MCP init; confirm no red error and real responses. Capture evidence.

## Data model change

```
chat-custom-provider.json (~/rox, 0600)
v1: { version:1, baseUrl, apiKey, modelId }                       // was
v2: { version:2, baseUrl, apiKey, models:string[], defaultModelId?:string|null }  // becomes
```
Reader migrates v1→v2 (modelId → models:[modelId], defaultModelId:modelId).

## Risks
- mastracode has no public hook for arbitrary openai-compatible providers → fallback to
  patch/pin or adapter (user authorized). Spike resolves before feature work.
- Wire-id scheme from the fix flows into config/runtime/picker — must be consistent.
- AGENTS.md rule 5 (no mastracode fork) relaxed by explicit user authorization for this task.

## Out of scope
Multiple custom providers; api-key encryption/keychain (stays 0600 file); mobile composer.
