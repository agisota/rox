/**
 * Built-in MCP tool catalog (Hermes-borrow F47, #644).
 *
 * A declarative, *secret-free* inventory of the tools the built-in Rox MCP
 * server exposes (the `registerTools` set in
 * `packages/mcp-v2/src/tools/register.ts`), grouped by category. It lives in
 * `@rox/shared` so both `@rox/mcp-v2` and `@rox/trpc` can read it without a
 * package cycle. This is the read-only **inventory source** the tRPC
 * MCP-inventory router reads from: it lists servers/tools with `enabled/total`
 * coverage and a searchable tool list, WITHOUT ever invoking a handler or
 * touching a token.
 *
 * Keep this in lock-step with `packages/mcp-v2/src/tools/register.ts`: every
 * registered tool has exactly one catalog entry. The `mcp-catalog.test.ts`
 * hygiene test enforces internal consistency.
 *
 * Nothing here carries credentials — a category/name/description triple is all
 * the client ever needs, so the router can return it verbatim (security rule:
 * no secret values reach the client).
 */

/** A logical grouping of built-in MCP tools, shown as an inventory category. */
export type McpToolCategory =
	| "tasks"
	| "automations"
	| "workspaces"
	| "agents"
	| "terminals"
	| "projects"
	| "hosts"
	| "organization"
	| "screen";

/** One entry in the built-in MCP tool inventory. No secrets, ever. */
export interface McpCatalogTool {
	/** Wire tool name (matches the `defineTool({ name })` registration). */
	name: string;
	/** Human-facing one-liner (mirrors the tool's `description`). */
	description: string;
	/** Inventory category this tool is grouped under. */
	category: McpToolCategory;
}

/** Stable identifier of the built-in (in-process) Rox MCP server. */
export const BUILTIN_MCP_SERVER_SLUG = "rox-builtin";
/** Display label of the built-in Rox MCP server. */
export const BUILTIN_MCP_SERVER_LABEL = "Rox (built-in)";

/**
 * The built-in MCP server's tools, one entry per registered tool. Ordered to
 * mirror `REGISTRARS` in `./tools/register.ts` for an easy visual diff.
 */
export const BUILTIN_MCP_TOOLS: readonly McpCatalogTool[] = [
	{
		name: "tasks_list",
		category: "tasks",
		description:
			"List tasks in the active organization, optionally filtered by status, priority, assignee, or free-text search.",
	},
	{
		name: "tasks_get",
		category: "tasks",
		description: "Fetch a single task by ID with its full detail.",
	},
	{
		name: "tasks_create",
		category: "tasks",
		description: "Create a new task in the active organization.",
	},
	{
		name: "tasks_update",
		category: "tasks",
		description: "Update an existing task's fields.",
	},
	{
		name: "tasks_delete",
		category: "tasks",
		description: "Delete a task by ID.",
	},
	{
		name: "tasks_statuses_list",
		category: "tasks",
		description: "List the task statuses configured for the organization.",
	},
	{
		name: "organization_members_list",
		category: "organization",
		description: "List members of the active organization.",
	},
	{
		name: "automations_list",
		category: "automations",
		description: "List automations in the active organization.",
	},
	{
		name: "automations_get",
		category: "automations",
		description: "Fetch a single automation by ID.",
	},
	{
		name: "automations_get_prompt",
		category: "automations",
		description: "Read an automation's prompt.",
	},
	{
		name: "automations_create",
		category: "automations",
		description: "Create a new automation.",
	},
	{
		name: "automations_update",
		category: "automations",
		description: "Update an existing automation.",
	},
	{
		name: "automations_set_prompt",
		category: "automations",
		description: "Replace an automation's prompt.",
	},
	{
		name: "automations_delete",
		category: "automations",
		description: "Delete an automation by ID.",
	},
	{
		name: "automations_pause",
		category: "automations",
		description: "Pause a running automation.",
	},
	{
		name: "automations_resume",
		category: "automations",
		description: "Resume a paused automation.",
	},
	{
		name: "automations_run",
		category: "automations",
		description: "Trigger an immediate run of an automation.",
	},
	{
		name: "automations_logs",
		category: "automations",
		description: "Read recent run logs for an automation.",
	},
	{
		name: "workspaces_list",
		category: "workspaces",
		description: "List workspaces in the active organization.",
	},
	{
		name: "workspaces_create",
		category: "workspaces",
		description: "Create a new workspace.",
	},
	{
		name: "workspaces_update",
		category: "workspaces",
		description: "Update an existing workspace.",
	},
	{
		name: "workspaces_delete",
		category: "workspaces",
		description: "Delete a workspace by ID.",
	},
	{
		name: "agents_create",
		category: "agents",
		description: "Create a new agent.",
	},
	{
		name: "agents_list",
		category: "agents",
		description: "List agents in the active organization.",
	},
	{
		name: "terminals_create",
		category: "terminals",
		description: "Create a new terminal session.",
	},
	{
		name: "projects_list",
		category: "projects",
		description: "List projects in the active organization.",
	},
	{
		name: "hosts_list",
		category: "hosts",
		description: "List connected hosts.",
	},
	{
		name: "screen_get_context",
		category: "screen",
		description: "Read the current on-screen UI context.",
	},
	{
		name: "screen_ui_command",
		category: "screen",
		description: "Issue a UI command to the active screen.",
	},
] as const;

/** Distinct categories present in the built-in catalog, in first-seen order. */
export function builtinMcpCategories(): McpToolCategory[] {
	const seen = new Set<McpToolCategory>();
	const out: McpToolCategory[] = [];
	for (const tool of BUILTIN_MCP_TOOLS) {
		if (!seen.has(tool.category)) {
			seen.add(tool.category);
			out.push(tool.category);
		}
	}
	return out;
}
