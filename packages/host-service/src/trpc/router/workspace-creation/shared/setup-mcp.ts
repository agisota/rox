import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

/**
 * A default MCP server to seed into freshly-created workspaces.
 *
 * Two transports are supported:
 *   - `stdio`: launched via `bunx -y <pkg> …` so no global install is required
 *     — the package resolves on first use.
 *   - `http`: a remote MCP endpoint reached over HTTP/SSE (no local process).
 *
 * Servers that need API keys reference them through `${ENV_VAR}` placeholders
 * in `env`; the agent runtime substitutes the value at launch, and the
 * placeholder is harmless (empty) when the user hasn't set the key yet — the
 * server simply stays unauthenticated until they do, rather than failing the
 * whole workspace seed.
 */
interface DefaultStdioMcpServer {
	transport: "stdio";
	name: string;
	/** npm package executed via `bunx -y <pkg>`. */
	pkg: string;
	/** Extra args appended after the package (may reference the worktree). */
	argsFor: (worktreePath: string) => string[];
	/** Optional env passed to the launched process (key → `${ENV_VAR}`). */
	env?: Record<string, string>;
}

interface DefaultHttpMcpServer {
	transport: "http";
	name: string;
	/** Remote MCP endpoint URL. */
	url: string;
	/** Optional headers (e.g. auth) for the remote endpoint. */
	headers?: Record<string, string>;
}

type DefaultMcpServer = DefaultStdioMcpServer | DefaultHttpMcpServer;

/**
 * The default server set seeded into every new workspace so agents have a
 * useful baseline of MCP tools out-of-the-box:
 *   - `filesystem` / `sequential-thinking`: official, zero-config, no secrets.
 *   - `exa`: web/code search (needs `EXA_API_KEY`).
 *   - `context7`: up-to-date library/framework docs (no key required).
 *   - `rox`: the hosted Rox MCP at api.zed.md (remote HTTP).
 *   - `telegram`: Telegram bridge (needs `TELEGRAM_BOT_TOKEN`).
 *
 * Stdio servers run via `bunx` (no global install). Key-gated servers use
 * `${ENV_VAR}` placeholders so seeding never fails when a key is absent.
 */
export const DEFAULT_MCP_SERVERS: readonly DefaultMcpServer[] = [
	{
		transport: "stdio",
		name: "filesystem",
		pkg: "@modelcontextprotocol/server-filesystem",
		argsFor: (worktreePath) => [worktreePath],
	},
	{
		transport: "stdio",
		name: "sequential-thinking",
		pkg: "@modelcontextprotocol/server-sequential-thinking",
		argsFor: () => [],
	},
	{
		transport: "stdio",
		name: "exa",
		pkg: "exa-mcp-server",
		argsFor: () => [],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${ENV} placeholder written verbatim into .mcp.json for client-side env substitution
		env: { EXA_API_KEY: "${EXA_API_KEY}" },
	},
	{
		transport: "stdio",
		name: "context7",
		pkg: "@upstash/context7-mcp",
		argsFor: () => [],
	},
	{
		transport: "http",
		name: "rox",
		url: "https://api.zed.md/mcp",
	},
	{
		transport: "stdio",
		name: "telegram",
		pkg: "@chaindead/telegram-mcp",
		argsFor: () => [],
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${ENV} placeholder written verbatim into .mcp.json for client-side env substitution
		env: { TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN}" },
	},
];

const BUNX = "bunx";

/** Build the `args` array (`-y <pkg> …extra`) for a stdio default server. */
function bunxArgs(
	server: DefaultStdioMcpServer,
	worktreePath: string,
): string[] {
	return ["-y", server.pkg, ...server.argsFor(worktreePath)];
}

interface SeedWorkspaceMcpServersArgs {
	ctx: HostServiceContext;
	workspaceId: string;
}

interface SeedWorkspaceMcpServersResult {
	warning: string | null;
}

/**
 * Seed the default MCP server set into a freshly-created workspace so agents
 * (Claude + Codex) have MCP tools out-of-the-box.
 *
 * Writes two files into the workspace's `worktreePath`:
 *   - `.mcp.json`            — Claude format `{ mcpServers: { <name>: … } }`
 *   - `.codex/config.toml`   — Codex `[mcp_servers.<name>]` tables
 *
 * Idempotent: a default server is only added when no server with that exact
 * name already exists in the file; all user/existing entries are preserved.
 * Re-running on an already-seeded workspace is a no-op.
 *
 * Robustness: this runs in the workspace-creation hot path. It MUST NOT break
 * creation — all filesystem work is wrapped so a failure returns a `warning`
 * instead of throwing.
 */
export async function seedWorkspaceMcpServers(
	args: SeedWorkspaceMcpServersArgs,
): Promise<SeedWorkspaceMcpServersResult> {
	const row = args.ctx.db
		.select({ worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.id, args.workspaceId))
		.get();

	if (!row || !row.worktreePath) {
		return { warning: null };
	}

	const worktreePath = row.worktreePath;
	if (!existsSync(worktreePath)) {
		return { warning: null };
	}

	try {
		writeClaudeMcpConfig(worktreePath);
		writeCodexMcpConfig(worktreePath);
		return { warning: null };
	} catch (error) {
		return {
			warning: `Failed to seed MCP servers: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

// ---------------------------------------------------------------------------
// Claude: <worktree>/.mcp.json
// ---------------------------------------------------------------------------

type ClaudeMcpServerEntry =
	| {
			command: string;
			args: string[];
			env?: Record<string, string>;
	  }
	| {
			type: "http";
			url: string;
			headers?: Record<string, string>;
	  };

/** Build the `.mcp.json` entry (Claude format) for any default server. */
function claudeEntryFor(
	server: DefaultMcpServer,
	worktreePath: string,
): ClaudeMcpServerEntry {
	if (server.transport === "http") {
		return {
			type: "http",
			url: server.url,
			...(server.headers ? { headers: server.headers } : {}),
		};
	}
	return {
		command: BUNX,
		args: bunxArgs(server, worktreePath),
		...(server.env ? { env: server.env } : {}),
	};
}

type ClaudeMcpConfig = {
	mcpServers?: Record<string, unknown>;
	[key: string]: unknown;
};

function writeClaudeMcpConfig(worktreePath: string): void {
	const path = join(worktreePath, ".mcp.json");
	const existing = existsSync(path) ? readFileSync(path, "utf-8") : null;
	const next = buildMcpJson(existing, worktreePath);
	if (next === null) {
		// Already seeded (or nothing to add) — no write, keep it a true no-op.
		return;
	}
	writeFileSync(path, next, "utf-8");
}

/**
 * Pure builder for `.mcp.json`. Returns the file contents to write, or `null`
 * when every default server is already present (so the caller can skip the
 * write and keep re-runs a no-op).
 *
 * `existing` is the current file contents (or `null` if the file is absent or
 * unreadable). Malformed JSON is treated as an empty config rather than
 * clobbered blindly — but only the missing default servers are added; any
 * keys we can parse are preserved.
 *
 * Exported for tests.
 */
export function buildMcpJson(
	existing: string | null,
	worktreePath: string,
): string | null {
	let config: ClaudeMcpConfig = {};
	if (existing && existing.trim().length > 0) {
		try {
			const parsed = JSON.parse(existing);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				config = parsed as ClaudeMcpConfig;
			}
		} catch {
			// Unparseable existing file: fall back to a fresh config. We cannot
			// safely merge into something we cannot read.
			config = {};
		}
	}

	const servers: Record<string, unknown> =
		config.mcpServers && typeof config.mcpServers === "object"
			? (config.mcpServers as Record<string, unknown>)
			: {};

	let added = false;
	for (const server of DEFAULT_MCP_SERVERS) {
		// Idempotency: only add when the exact name is absent. Never overwrite a
		// user/existing entry of the same name.
		if (Object.hasOwn(servers, server.name)) {
			continue;
		}
		servers[server.name] = claudeEntryFor(server, worktreePath);
		added = true;
	}

	const hadFile = existing !== null;
	if (!added && hadFile) {
		// Nothing to add and the file already exists → no-op.
		return null;
	}

	const next: ClaudeMcpConfig = { ...config, mcpServers: servers };
	return `${JSON.stringify(next, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Codex: <worktree>/.codex/config.toml
// ---------------------------------------------------------------------------

function writeCodexMcpConfig(worktreePath: string): void {
	const path = join(worktreePath, ".codex", "config.toml");
	const existing = existsSync(path) ? readFileSync(path, "utf-8") : null;
	const next = mergeCodexMcp(existing, worktreePath);
	if (next === null) {
		return;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, next, "utf-8");
}

/**
 * Names of MCP servers already declared in a Codex `config.toml`.
 *
 * Scans `[mcp_servers.<name>]` table headers with a regex rather than a TOML
 * parser: this source is typechecked from packages without Bun globals (so no
 * `Bun.TOML`), and we only need the set of existing names. The marker guard
 * below still prevents a second append on re-runs.
 */
function existingCodexServerNames(toml: string): Set<string> {
	const names = new Set<string>();
	// `[mcp_servers.<name>]` — name may be bare or quoted.
	const headerPattern = /^[ \t]*\[mcp_servers\.("?)([^"\]]+)\1\]/gm;
	for (const match of toml.matchAll(headerPattern)) {
		const name = match[2]?.trim();
		if (name) {
			names.add(name);
		}
	}
	return names;
}

/** Marker wrapping the block we append, so re-runs can detect prior seeding. */
const CODEX_MARKER_BEGIN = "# >>> rox default mcp servers >>>";
const CODEX_MARKER_END = "# <<< rox default mcp servers <<<";

/** Serialize an inline TOML table from a `{ key: value }` map of strings. */
function inlineTomlTable(map: Record<string, string>): string {
	const pairs = Object.entries(map)
		.map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`)
		.join(", ");
	return `{ ${pairs} }`;
}

/** Serialize one `[mcp_servers.<name>]` table to TOML. */
function codexServerTable(
	server: DefaultMcpServer,
	worktreePath: string,
): string {
	if (server.transport === "http") {
		const lines = [
			`[mcp_servers.${server.name}]`,
			`url = ${JSON.stringify(server.url)}`,
		];
		if (server.headers) {
			lines.push(`headers = ${inlineTomlTable(server.headers)}`);
		}
		return lines.join("\n");
	}
	const args = bunxArgs(server, worktreePath);
	const argsToml = args.map((a) => JSON.stringify(a)).join(", ");
	const lines = [
		`[mcp_servers.${server.name}]`,
		`command = ${JSON.stringify(BUNX)}`,
		`args = [${argsToml}]`,
	];
	if (server.env) {
		lines.push(`env = ${inlineTomlTable(server.env)}`);
	}
	return lines.join("\n");
}

/**
 * Pure merge for Codex `config.toml`. Returns the file contents to write, or
 * `null` when there is nothing to add (every default server is already present
 * and an existing file is left untouched) so re-runs are a no-op.
 *
 * Strategy: Bun has no TOML serializer, so we parse the existing file (when
 * present) only to learn which server names already exist, then append a
 * marker-wrapped block containing the TOML tables for the missing defaults.
 * The marker also short-circuits a second append if the parse ever fails to
 * see our block. Existing content is never rewritten — we only append.
 *
 * Exported for tests.
 */
export function mergeCodexMcp(
	existing: string | null,
	worktreePath: string,
): string | null {
	const base = existing ?? "";

	// If our marker block is already present, treat as fully seeded.
	if (base.includes(CODEX_MARKER_BEGIN)) {
		return null;
	}

	const present = existingCodexServerNames(base);
	const missing = DEFAULT_MCP_SERVERS.filter(
		(server) => !present.has(server.name),
	);

	if (missing.length === 0 && existing !== null) {
		return null;
	}

	const tables = missing
		.map((server) => codexServerTable(server, worktreePath))
		.join("\n\n");

	const block = [CODEX_MARKER_BEGIN, tables, CODEX_MARKER_END].join("\n");

	if (base.trim().length === 0) {
		return `${block}\n`;
	}

	// Append after existing content, separated by a blank line.
	const separator = base.endsWith("\n") ? "\n" : "\n\n";
	return `${base}${separator}${block}\n`;
}
