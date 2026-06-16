# Agent-native research — mcp-runtime

_Восстановлено из ODW Run 1 (сессия 114224be), 15.06.2026._

I now have a complete picture across both MCP packages and agent-bridge. Producing the report.

---

# MCP Tools & Agent Runtime — Rox Monorepo

Two parallel MCP stacks exist: **`packages/mcp` (server name `"rox"`, v1, device/DB-queue model)** and **`packages/mcp-v2` (server name `"rox-v2"`, v2, tRPC-caller + relay/host model)**. `packages/agent-bridge` is the wire protocol the v2 screen/UI tools speak to host renderers.

---

## 1. How an MCP tool is DEFINED

### v2 — `defineTool` wrapper (`packages/mcp-v2/src/define-tool.ts`)

Tool shape — `ToolDef` (`define-tool.ts:7-19`):

```ts
export interface ToolDef<Input extends ZodRawShape, Output extends ZodRawShape> {
	name: string;
	description: string;
	inputSchema?: Input;
	outputSchema?: Output;
	handler: (input: z.infer<z.ZodObject<Input>>, ctx: McpContext) => Promise<unknown>;
}
```

- **Input-schema mechanism: Zod `ZodRawShape`** (a raw `{ key: ZodType }` map), not raw JSON Schema. The SDK converts it. `inputSchema`/`outputSchema` are optional.
- `defineTool(server, def)` (`define-tool.ts:96-148`) calls `server.registerTool(def.name, { description, inputSchema, outputSchema? }, callback)`. The callback (`:108`):
  1. resolves `ctx` via `getMcpContextFromExtra(extra)` (`:111`); on `isMcpUnauthorized` returns `errorResult("Unauthorized: …")`.
  2. times the call, runs `def.handler(args, ctx)` (`:121`), wraps return in `successResult` (`:69-82`, sets both `structuredContent` and a `text` JSON dump), or `errorResult` (`:57-67`, `isError:true`).
  3. emits an `McpToolCallEvent` (success or failure, `errorMessage.slice(0,500)`).
- A tool module's public surface is a single `export function register(server)` that calls `defineTool` once. Example (`tools/tasks/create.ts:6-42`): `name:"tasks_create"`, Zod `inputSchema`, `handler` → `createMcpCaller(ctx).task.create(input)`.

### v1 — raw SDK call, no wrapper (`packages/mcp/src/tools/**`)

v1 tools call `server.registerTool` **directly** and return raw `CallToolResult` objects themselves. Example `create_task` (`tools/tasks/create-task/create-task.ts:46-160`): passes `inputSchema` + `outputSchema` as Zod shapes, reads `getMcpContext(extra)` (`:68`), does DB work, returns `{ structuredContent, content:[{type:"text",…}] }` by hand. `get_app_context` (`tools/devices/get-app-context/get-app-context.ts:6-33`) returns the result of `executeOnDevice(...)`.

---

## 2. How the MCP server is created & tools REGISTERED

### v2 (`packages/mcp-v2/src/server.ts:10-17`)

```ts
export function createMcpServer(options?: McpServerOptions): McpServer {
	const server = new McpServer(
		{ name: "rox-v2", version: packageJson.version },
		{ capabilities: { tools: {} } },
	);
	registerTools(server, { onToolCall: options?.onToolCall });
	return server;
}
```

`registerTools` (`tools/register.ts:73-81`): sets the tool-call emitter via `setServerToolCallEmitter(server, options?.onToolCall)`, then iterates the `REGISTRARS` array (`:37-67`, ~28 modules: tasks, automations, workspaces, agents, terminals, projects, hosts, organization/members, screen) calling `mod.register(server)`.

### v1 (`packages/mcp/src/server.ts:10-49`)

```ts
const server = new McpServer({ name: "rox", version: "1.0.0" }, { capabilities: { tools: {} } });
registerTools(server);
```

`onToolCall` telemetry in v1 is bolted on by **monkey-patching the private `_registeredTools` map** (`server.ts:20-45`): for each `tool.handler.callback`, it wraps the original, extracting `ctx` via `getMcpContext(args[1])` and calling `onToolCall(name, ctx)` in a `try/catch`. `registerTools` (`tools/index.ts:40-44`) iterates `allTools` (`:20-38`) calling each `register(server)`.

> **`★ Insight ─────────────────────────────────────`**
> v2's `defineTool` is the structural upgrade over v1: telemetry, auth-context resolution, and result-shaping are centralized in one wrapper (via a `WeakMap<McpServer, emitter>`, `define-tool.ts:34`), instead of v1's per-tool boilerplate + private-field monkey-patch (`server.ts:20-28`). Any new cross-cutting concern (e.g. a proxy layer) hooks in cleanly at `defineTool`/`registerTools` in v2.
> **`─────────────────────────────────────────────────`**

---

## 3. How a chat/agent session obtains the tool set & CALLS a tool (end-to-end)

**Two entry paths feed the same server.** Both inject auth via the SDK's documented `authInfo.extra.mcpContext` (no transport monkey-patching of messages in v2).

### A. In-memory client (server-side agents: Slack agent, automations dispatcher)

`createInMemoryMcpClient` (`packages/mcp-v2/src/in-memory.ts:28-109`):
1. Loads user email + org memberships from DB (`:38-52`); asserts org membership (`:53-57`).
2. Mints a 300s user JWT via `mintUserJwt` (`:59-64`) → builds `McpContext` (`:66-76`, `source:"api-key"`).
3. `createMcpServer({ onToolCall })` (`:78`) + `InMemoryTransport.createLinkedPair()` (`:79-80`).
4. **Patches `clientTransport.send`** to attach `authInfo` on every message (`:82-92`):
   ```ts
   authInfo: { token: "internal", clientId: "mcp-v2-internal", scopes: ["mcp:full"], extra: { mcpContext } }
   ```
5. `server.connect(serverTransport)` + `new Client(...).connect(clientTransport)` (`:94-100`). Returns `{ client, cleanup }`. The agent then calls `client.listTools()` / `client.callTool(...)`; the tool set is whatever `registerTools` registered.

v1 equivalent is identical in shape (`packages/mcp/src/in-memory.ts:6-48`, `clientId:"slack-agent"`, `mcpContext:{ userId, organizationId, source }`).

### B. HTTP transport (external clients / OAuth)

`resolveMcpContext(req, { apiUrl, relayUrl })` (`packages/mcp-v2/src/auth.ts:164-217`) extracts the bearer (`extractBearer`, `:39-45`, `Authorization: Bearer` or `x-api-key`), branches:
- **API key** (`sk_` prefix, `:47-49`) → `resolveApiKey` → `auth.api.verifyApiKey`, reads `organizationId`/`clientLabel` from key metadata (`:94-120`).
- **JWT** (3 dot-parts, `:51-54`) → `resolveOAuth` → `verifyAccessToken` against `${apiUrl}/api/auth/jwks`, audience incl. `${apiUrl}/api/v2/agent/mcp` (`:122-157`).
- Loads email + orgs, asserts membership, mints a fresh 300s JWT into `ctx.bearerToken` (`:192-204`). (The HTTP handler wiring lives in `apps/api`, outside these packages — the per-request `authInfo.extra.mcpContext` is populated from this `ctx`.)

### Tool handler → backend hop

Inside the handler `ctx` arrives via `getMcpContextFromExtra` (`context-utils.ts:16-22`, reads `extra.authInfo?.extra?.mcpContext`). Two backend styles:

1. **tRPC caller** (org-scoped data): `createMcpCaller(ctx)` (`caller.ts:21-55`) synthesizes a `Session` (`user.id`, `session.activeOrganizationId`) + `Headers` (`Authorization: Bearer ctx.bearerToken`, `ORGANIZATION_HEADER: ctx.organizationId`) and returns `makeAppCaller(...)` (the `@rox/trpc` AppRouter caller). E.g. `hosts_list` → `caller.host.list({ organizationId })` (`tools/hosts/list.ts:10-14`).
2. **Relay → host tRPC** (machine-scoped actions): `hostServiceCall(opts, procedure, method, input)` (`host-service-client.ts:11-71`) `fetch`es `${relayUrl}/hosts/${buildHostRoutingKey(org,host)}/trpc/${procedure}` with `Bearer ctx.bearerToken`, SuperJSON-encoded input, and SuperJSON-decodes `result.data`. The host id is first resolved via `caller.v2Workspace.getFromHost(...)`. Examples:
   - `rox_get_screen_context` → `hostServiceCall(..., "agentBridge.getContext", "query", { workspaceId })` (`tools/screen/get_context.ts:33-44`).
   - `rox_ui_command` → `hostServiceCall(..., "agentBridge.sendUiCommand", "mutation", { workspaceId, command:{ kind, route } })` (`tools/screen/ui_command.ts:39-53`).
   - `agents_create` → `hostServiceCall(..., "agents.run", "mutation", {...})` (`tools/agents/create.ts:41-59`).

### v1 device path (DB command queue, no relay)

v1 tools call `executeOnDevice(...)` (`tools/utils/utils.ts:33-145`): verifies the device in `devicePresence`, **inserts a row into `agentCommands`** (`status:"pending"`, `timeoutAt`), then **polls** every `POLL_INTERVAL_MS=500` up to `DEFAULT_TIMEOUT_MS=30_000` (`:94-126`) for `completed`/`failed`; on no result, sets `status:"timeout"`. The desktop device drains the queue out-of-band. `start_agent_session` (`tools/devices/start-agent-session/start-agent-session.ts`) follows the same `executeLaunchOnDevice` pattern.

---

## 4. Existing multi-server pool / aggregation / namespacing / proxying?

**None today.** Concretely:
- **No MCP client pool / no AgentSource registry.** Each `createInMemoryMcpClient` builds exactly **one** `Client` ↔ **one** in-process server pair (`mcp-v2/src/in-memory.ts`, `mcp/src/in-memory.ts`). No code holds a collection of clients or fans a `callTool` out to multiple servers.
- **No tool-name namespacing / no `mcp__{slug}__{tool}` prefixing.** Tool names are flat, hard-coded strings registered locally: `tasks_create`, `agents_create`, `hosts_list`, `rox_get_screen_context`, `rox_ui_command` (v2); `create_task`, `get_app_context`, `start_agent_session` (v1). No registrar derives or prefixes names from a source slug.
- **No MCP→MCP proxying.** The only "proxy"-like hops are to **non-MCP** backends: `hostServiceCall` (relay → host tRPC, `host-service-client.ts`) and v1 `executeOnDevice` (DB `agentCommands` queue → device). Neither speaks MCP to a downstream server.
- **Aggregation that does exist:** purely static — `tools/register.ts` `REGISTRARS` array (v2) and `tools/index.ts` `allTools` array (v1) list local tool modules at build time.

---

## 5. Exact exported symbols + signatures

### `packages/mcp-v2/src/index.ts` (verbatim, lines 1-11)

| Export | Kind | Signature / source |
|---|---|---|
| `McpContext` | type | from `./auth` — `{ userId, email, organizationId, organizationIds:string[], source:"api-key"\|"oauth", clientLabel:string\|null, requestId, bearerToken, relayUrl }` (`auth.ts:7-17`) |
| `isMcpUnauthorized` | fn | `(error: unknown) => error is McpUnauthorizedError` (`auth.ts:30`) |
| `McpUnauthorizedError` | class | `extends Error`, `constructor(message="Unauthorized")` (`auth.ts:22`) |
| `resolveMcpContext` | fn | `(req: Request, options:{apiUrl,relayUrl}) => Promise<McpContext>` (`auth.ts:164`) |
| `createMcpCaller` | fn | `(ctx: McpContext) => McpCaller` (`caller.ts:21`) |
| `McpToolCallEmitter` | type | `(event: McpToolCallEvent) => void` (`define-tool.ts:32`) |
| `McpToolCallEvent` | type | `{ toolName,userId,organizationId,source,clientLabel,durationMs,success,errorMessage? }` (`define-tool.ts:21-30`) |
| `McpServerOptions` | type | `{ onToolCall?: McpToolCallEmitter }` (`server.ts:6-8`) |
| `createMcpServer` | fn | `(options?: McpServerOptions) => McpServer` (`server.ts:10`) |

> Not re-exported from `index.ts` (internal but importable by path): `defineTool` (`define-tool.ts:96`), `setServerToolCallEmitter` (`:36`), `registerTools` (`tools/register.ts:73`), `createInMemoryMcpClient` (`in-memory.ts:28`), `hostServiceCall` (`host-service-client.ts:11`), `getMcpContextFromExtra` (`context-utils.ts:16`).

### `packages/mcp/src/index.ts` (verbatim, lines 1-3)

| Export | Kind | Signature / source |
|---|---|---|
| `McpContext` | type | from `./auth` — `{ userId:string, organizationId:string, source?:"slack"\|"desktop"\|"api"\|"external" }` (`auth.ts:1-5`) |
| `createMcpServer` | fn | `(options?: McpServerOptions) => McpServer`; `McpServerOptions = { onToolCall?: (toolName:string, ctx:McpContext)=>void }` (`server.ts:6-10`) |
| `registerTools` | fn | `(server: McpServer) => void` (`tools/index.ts:40`) |

> Not re-exported (path-importable): `createInMemoryMcpClient` (`in-memory.ts:6`), `getMcpContext` + `executeOnDevice` (`tools/utils/utils.ts:18,33`).

---

## 6. agent-bridge wire protocol (the v2 host transport)

All three submodules build on one envelope. `packages/agent-bridge/src/protocol/protocol.ts`:
- `AGENT_NATIVE_EMBED_PROTOCOL = "agent-native.embed"` (`:17`), `AGENT_NATIVE_EMBED_VERSION = 1` (`:18`).
- `AGENT_NATIVE_EMBED_MESSAGE_TYPES = { READY, MESSAGE, REQUEST, RESPONSE, ERROR }` (`:20-26`).
- `agentNativeEmbedEnvelopeSchema` (`:40-54`): `{ protocol, version, type, name?, payload?, requestId?, error? }`. Helpers: `isAgentNativeEmbedEnvelope` (`:66`), `createAgentNativeEmbedEnvelope` (`:72`), `createEmbedRequestId` (`:89`, `embed-<uuid>`). (This is an independent wire-compatible reimpl of BuilderIO `@agent-native/embedding` v1, per the file header `:3-16`.)

**context** (`context/context.ts`) — renderer→host screen state, `type:"message"`, `name:"rox.screen-context"` (`CONTEXT_MESSAGE_NAME`, `:13`). `contextPacketSchema` (`:43-50`, **`.strict()` whitelist**): `{ workspaceId, route:{pathname,params?}, selection?:{text(max 2000),truncated?}, capturedAt }`. `MAX_SELECTION_TEXT_LENGTH = 2_000` (`:19`). `buildContextPacket` (`:67`), `createContextEnvelope` (`:87`), `parseContextEnvelope` (`:103`). Consumed by `tasks/screen/get_context.ts` typed as `ContextPacket`.

**commands** (`commands/commands.ts`) — host→renderer UI commands, `type:"request"`, `name:"rox.ui-command"` (`UI_COMMAND_REQUEST_NAME`, `:14`). `UI_COMMAND_KINDS = ["navigate"]` allow-list (`:23`); `uiCommandSchema` is a discriminated union of just `navigate` (`{ kind:"navigate", route:string startsWith "/" }`, `:26-39`). `uiCommandResultSchema = { ok:boolean, error?:string }` (`:44-49`). Envelope helpers: `createUiCommandEnvelope` (`:53`), `createUiCommandAckEnvelope` (`:67`, `type:"response"`), `parseUiCommandEnvelope`/`parseUiCommandAckEnvelope` (`:88,118`). Consumed by `tools/screen/ui_command.ts` typed as `UiCommandResult`.

---

## 7. Seams for a new "AgentSource registry → MCP client pool → `mcp__{slug}__{tool}` proxy"

Where each layer would hook in, with the existing code it mirrors:

1. **Client pool** — clone/generalize `createInMemoryMcpClient` (`mcp-v2/src/in-memory.ts:28-109`). It already produces a single `{ client, cleanup }` with org-scoped `authInfo.extra.mcpContext`; a pool keyed by AgentSource slug would hold `Map<slug, Client>` and call `client.connect(transport)` per source (in-memory for local `rox-v2`, a real transport for remote sources).

2. **AgentSource registry** — no analog exists; `McpContext` (`auth.ts:7-17`) already carries `organizationId`/`organizationIds`/`relayUrl`, so a registry could resolve sources per-org from those fields. There is no enumerate-sources call today (see §4).

3. **Proxy-tool registration** — mirror `registerTools` (`tools/register.ts:73-81`). Instead of static `REGISTRARS`, the proxy registrar would, per pooled client, `client.listTools()` and for each tool call `defineTool(server, { name: \`mcp__${slug}__${tool.name}\`, description, inputSchema, handler: (input, ctx) => pooledClient.callTool({ name: tool.name, arguments: input }) })`. `defineTool` (`define-tool.ts:96-148`) already accepts arbitrary names and unwraps results — **this is the single cleanest insertion point** for name-prefixing + proxy dispatch.

4. **Name namespacing** — there is **currently no name-mangling layer** anywhere; flat names are passed verbatim to `server.registerTool`. The `mcp__{slug}__{tool}` transform would be introduced *only* at the proxy registrar (item 3); inbound `callTool` would strip the `mcp__{slug}__` prefix to recover the downstream tool name.

5. **Telemetry, free** — `McpToolCallEvent`/`McpToolCallEmitter` (`define-tool.ts:21-32`) and `setServerToolCallEmitter` (`:36`) already fire per tool call inside `defineTool`; proxied tools registered through `defineTool` emit the namespaced `toolName` automatically — no extra wiring.

6. **HTTP boundary** — `resolveMcpContext` (`auth.ts:164`) + the `apps/api` handler (outside these packages) is where a pooled/proxied server would be selected per request; `createMcpServer` (`server.ts:10`) is the factory a proxy variant would extend (e.g. `createMcpServer({ onToolCall, agentSources })`).

**Net:** the v2 package is pre-shaped for this — `defineTool` + `registerTools` + `createInMemoryMcpClient` are the three seams; the only entirely missing pieces are the **source registry** and the **multi-client pool** (§4 confirms neither exists yet).