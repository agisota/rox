# Agent Engine

The pluggable agent-runtime seam between Rox's chat plumbing (tRPC service,
host-service runtime manager, shared runtime helpers, UI) and the underlying
agent runtime. Call sites depend only on the `Engine` interface (`engine.ts`)
and obtain an instance through `createEngine` (`index.ts`).

## Engines

| Engine        | Factory              | Backed by                                  |
| ------------- | -------------------- | ------------------------------------------ |
| `MastraEngine`| `createMastraEngine` | mastracode `createMastraCode` harness (1:1)|
| `OmpEngine`   | `createOmpEngine`    | `oh-my-pi` (`omp --mode rpc`) subprocess   |

`MastraEngine` is the default and fallback. `OmpEngine` is a drop-in: same method
surface, same argument/return shapes, same `EngineBundle`.

## Selecting the engine — `ROX_AGENT_ENGINE`

`createEngine` branches on the `ROX_AGENT_ENGINE` env flag at call time:

- unset or `mastra` (default) → `MastraEngine`
- `omp` → `OmpEngine`

```sh
ROX_AGENT_ENGINE=omp        # use the oh-my-pi engine
ROX_AGENT_ENGINE=mastra     # explicit default
```

No other code path changes; the tRPC service, runtime manager, and UI are
engine-agnostic.

## OmpEngine

`OmpEngine` drives `omp` as a headless subprocess and maps its RPC frames onto
the mastra-shaped `Engine` surface. It **composes**:

- a mastracode `Harness` (built via `createMastraCode`) for the
  non-conversational surface — thread/resource identity, the persisted memory
  store (edit/resend), state schema (`thinkingLevel`, …), the title agent for
  `getCurrentMode`, and the MCP/hook/auth managers the `EngineBundle` exposes;
- an `OmpProcess` (the `omp --mode rpc` child) for the conversation —
  `sendMessage`, `listMessages`, `getDisplayState`, `subscribe`, `abort`,
  `respondToToolApproval`, and model switching (respawn).

The verified `omp/15.11.0` RPC contract is documented at the top of
`omp/omp-engine.ts`.

### `ROX_OMP_EXTRA_ARGS`

Extra args appended to every `omp` spawn (space-separated). Use this to constrain
the headless child for provider/model combos whose token budget cannot fit omp's
full default tool schema:

```sh
# Groq llama-3.3-70b-versatile rejects the full omp tool schema (HTTP 400
# "reduce the length of the messages or completion"); constrain it:
ROX_OMP_EXTRA_ARGS="--tools none"
```

Bigger-budget providers (OpenAI/Anthropic, or Groq `openai/gpt-oss-120b`) run the
full toolset without this.

### Optional debug logging — `OMP_ENGINE_DEBUG`

Set `OMP_ENGINE_DEBUG=1` to forward the omp child's stderr and listener errors to
the parent stderr.

## OmpEngine method status

| Method                       | Status                                                        |
| ---------------------------- | ------------------------------------------------------------- |
| `init`                       | ✅ harness init (omp spawned lazily on first turn)            |
| `selectOrCreateThread`       | ✅ harness                                                    |
| `destroy`                    | ✅ kills child + harness teardown                             |
| `setResourceId`              | ✅ harness                                                    |
| `getCurrentThreadId`         | ✅ harness                                                    |
| `switchModel`                | ✅ harness switch + respawn child with new `--model`          |
| `getFullModelId`             | ✅ harness                                                    |
| `getState` / `setState`      | ✅ harness state schema (`setState` thinkingLevel best-effort)|
| `getCurrentMode`             | ✅ harness (real title agent)                                 |
| `sendMessage`                | ✅ omp `prompt` (files not yet forwarded — see TODO)          |
| `listMessages`               | ✅ omp `get_messages`                                         |
| `getDisplayState`            | ✅ from omp push lifecycle (`isStreaming`→`isRunning`)        |
| `abort`                      | ✅ omp `abort`                                                |
| `respondToToolApproval`      | ✅ omp `extension_ui_response` (`select` gate)                |
| `subscribe`                  | ✅ maps push events → Harness `agent_start/end`, `error`, `tool_approval_required`, `ask_question` |
| `getMemoryStore`             | ✅ harness storage reach-in                                   |
| `switchThread`               | ⚠️ harness identity only; omp session continuity not wired (TODO) |
| `saveSystemReminderMessage`  | ⚠️ harness fallback; not injected into omp session (TODO)     |
| `respondToQuestion`          | ⚠️ omp `input`/`confirm` mapping (unverified against live omp) |
| `respondToPlanApproval`      | ⚠️ harness fallback; no verified omp plan-approval frame (TODO)|

### Flagged TODO edges (not yet wired)

- **Thread edit/restart continuity** — `switchThread` updates harness identity
  (so the memory-store clone/edit path works) but omp keeps its own ephemeral
  session; cross-thread omp history is not bridged (omp `switch_session`/`branch`).
- **extraTools host bridge** — omp `host_tool_call`/`host_tool_result` ↔ Rox
  `extraTools` (`set_host_tools`) is not wired; the omp child runs with
  `--no-extensions`.
- **File attachments** — `sendMessage({files})` are noted inline in the prompt
  text but not forwarded as typed attachments (no verified omp rpc field).
- **`saveSystemReminderMessage` / `respondToQuestion` / `respondToPlanApproval`**
  — best-effort harness fallbacks; the omp-native flows are not fully verified.
