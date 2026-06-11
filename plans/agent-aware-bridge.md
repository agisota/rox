# Agent-Aware Bridge

Agents in Rox are external CLI processes (claude/codex/…) in host-service
terminals — they have no in-process access to the UI. This bridge gives them
two honest capabilities over the existing MCP channel:

1. **Read** the screen the user is looking at (route, active workspace id,
   selected text).
2. **Drive** the screen with allow-listed UI commands (slice 1: `navigate`).

Inspired by BuilderIO's agent-native embedding SDK
(https://www.agent-native.com/docs/embedding-sdk): agent and UI as peers of
one system, talking over the `agent-native.embed` v1 envelope.

## Flow

```
CLI agent ──MCP (rox_get_screen_context / rox_ui_command)──▶ @rox/mcp-v2
                                                               │ relay HTTP
                                                               ▼
                              host-service trpc `agentBridge` router
                              + AgentBridgeRegistry (in-memory, per workspace)
                                    ▲                        │
                     publishContext │ (trpc mutation)        │ event-bus WS
                     ackUiCommand   │                        ▼ "agent-bridge:ui-command"
                              apps/desktop renderer (useAgentBridge hook)
```

- **Renderer → host (context push):** `useAgentBridge` (mounted on the
  v2-workspace page) publishes a context packet via
  `agentBridge.publishContext` on mount, on every resolved route change, and
  on debounced `selectionchange`.
- **Host:** `AgentBridgeRegistry` keeps the last-known context per
  `workspaceId` and the pending UI-command acks per `requestId`. In-memory
  only — screen context is ephemeral and dies with the session.
- **Host → renderer (ui-commands):** `agentBridge.sendUiCommand` wraps the
  command in a REQUEST envelope, fans it out over the existing `/events`
  WebSocket bus (new `agent-bridge:ui-command` server message), and awaits the
  renderer's ack (10s timeout). The renderer executes the command
  (`router.navigate`) and acks via `agentBridge.ackUiCommand`.
- **MCP:** tools live in `@rox/mcp-v2` — the server that agent sessions
  actually get (`.mastracode/mcp.json` points CLI agents at
  `/api/v2/agent/mcp`; v1's device tools use the legacy Postgres
  `agentCommands` polling path instead of host-service). Both tools resolve
  the workspace through `v2Workspace.getFromHost` and then call the owning
  host over the relay, exactly like `terminals_create`.

## Wire format

All bridge messages use the `agent-native.embed` v1 envelope
(`protocol: "agent-native.embed"`, `version: 1`, types
`ready/message/request/response/error`) so slice 2 (EmbeddedApp iframe
surfaces) and slice 3 (A2A) reuse the same framing.

`@agent-native/embedding` is documented as an npm package but is **not
published** (`bun add @agent-native/embedding` → 404; only
`@agent-native/core|dispatch|pinpoint|scheduling` exist on the registry).
`packages/agent-bridge/src/protocol` is therefore a wire-compatible
implementation of the documented v1 protocol surface; when the package ships,
swap the imports — no bytes change on the wire.

## Types (`@rox/agent-bridge`)

| Export path  | Symbols |
| ------------ | ------- |
| `./protocol` | `AGENT_NATIVE_EMBED_PROTOCOL`, `AGENT_NATIVE_EMBED_VERSION`, `AGENT_NATIVE_EMBED_MESSAGE_TYPES`, `AgentNativeEmbedEnvelope`, `isAgentNativeEmbedEnvelope`, `createAgentNativeEmbedEnvelope`, `createEmbedRequestId` |
| `./context`  | `ContextPacket` (`workspaceId`, `route{pathname,params?}`, `selection?{text,truncated?}`, `capturedAt`), `contextPacketSchema`, `buildContextPacket`, `createContextEnvelope`, `parseContextEnvelope`, `MAX_SELECTION_TEXT_LENGTH` |
| `./commands` | `UiCommand` (slice 1: `{kind:"navigate", route}`), `uiCommandSchema`, `UiCommandResult`, `createUiCommandEnvelope`, `parseUiCommandEnvelope`, `createUiCommandAckEnvelope`, `parseUiCommandAckEnvelope` |

## Security

- **Context whitelist:** `contextPacketSchema` is `.strict()` at every level —
  packets carrying *any* field outside `{workspaceId, route, selection,
  capturedAt}` are rejected wholesale, so renderer bugs can't leak env/secrets.
  Selected text is trimmed and hard-capped at 2 000 chars (renderer-side
  truncation + wire-side rejection).
- **Command allow-list:** `uiCommandSchema` is a strict discriminated union;
  slice 1 admits only `navigate` with an absolute in-app route (`/...`,
  external URLs rejected). Validated three times: MCP tool input, host-service
  router input, and again in the renderer before execution.
- **Workspace scoping:** MCP tools resolve the workspace via
  `v2Workspace.getFromHost({organizationId, id})` — context/commands are only
  reachable for workspaces of the caller's organization, on the host that owns
  them. The registry is keyed per workspace; cross-workspace reads return
  `found: false`.
- **Transport auth:** unchanged — host-service `protectedProcedure` (PSK/JWT)
  for renderer and relay calls. `packages/auth` untouched.

## Next slices

- **Slice 2 — embedded surfaces:** render agent-native `EmbeddedApp` iframes
  as workspace panes; reuse the same envelope over `postMessage`; extend the
  command allow-list with `openFile(path)` and `refreshData(scope)`; add
  open-file/pane and diff state to the context packet.
- **Slice 3 — A2A:** expose the workspace agent over A2A using
  `@agent-native/embedding`'s agent endpoint helpers (by then published);
  context packets become the shared "screen" resource for delegated agents.
- **Hardening backlog:** per-command approval UX for destructive kinds,
  context TTL/cleanup on workspace close, multi-window arbitration (currently
  last-writer-wins per workspace).
