import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

/**
 * A default MCP server to seed into freshly-created workspaces.
 *
 * `argsFor(worktreePath)` returns the launch args. The command is always
 * `bunx` so no global install is required — `bunx -y <pkg> …` resolves the
 * package on first use. Only servers that are published to npm, actively
 * maintained, and need no API keys or external runtimes are included here; a
 * broken command is worse than fewer servers.
 */
interface DefaultMcpServer {
	name: string;
	/** npm package executed via `bunx -y <pkg>`. */
	pkg: string;
	/** Extra args appended after the package (may reference the worktree). */
	argsFor: (worktreePath: string) => string[];
}

/**
 * The default server set. Intentionally small and reliable:
 *   - `filesystem`: official `@modelcontextprotocol/server-filesystem`, scoped
 *     to the workspace root so the agent can read/write within the worktree.
 *   - `sequential-thinking`: official reasoning aid, zero-config, no secrets.
 *
 * Deliberately omitted (see PR notes): `fetch` (not published to npm — only a
 * Python `uvx` package exists), `git` (Python-only `mcp-server-git`), and
 * `github` (the npm `server-github` package is deprecated/archived). Adding any
 * of those would seed a command that fails on launch.
 */
export const DEFAULT_MCP_SERVERS: readonly DefaultMcpServer[] = [
	{
		name: "filesystem",
		pkg: "@modelcontextprotocol/server-filesystem",
		argsFor: (worktreePath) => [worktreePath],
	},
	{
		name: "sequential-thinking",
		pkg: "@modelcontextprotocol/server-sequential-thinking",
		argsFor: () => [],
	},
];

const BUNX = "bunx";

/** Build the `args` array (`-y <pkg> …extra`) for a default server. */
function bunxArgs(server: DefaultMcpServer, worktreePath: string): string[] {
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

type ClaudeMcpServerEntry = {
	command: string;
	args: string[];
};

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
		const entry: ClaudeMcpServerEntry = {
			command: BUNX,
			args: bunxArgs(server, worktreePath),
		};
		servers[server.name] = entry;
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
 * Uses `Bun.TOML.parse` (read-only; Bun ships no TOML serializer) to read the
 * `[mcp_servers.<name>]` tables. If parsing fails we conservatively return an
 * empty set so seeding proceeds — the marker guard below still prevents a
 * second append on re-runs.
 */
function existingCodexServerNames(toml: string): Set<string> {
	try {
		const parsed = Bun.TOML.parse(toml) as {
			mcp_servers?: Record<string, unknown>;
		};
		if (parsed.mcp_servers && typeof parsed.mcp_servers === "object") {
			return new Set(Object.keys(parsed.mcp_servers));
		}
	} catch {
		// Unparseable → treat as no known servers; marker guard handles re-runs.
	}
	return new Set();
}

/** Marker wrapping the block we append, so re-runs can detect prior seeding. */
const CODEX_MARKER_BEGIN = "# >>> rox default mcp servers >>>";
const CODEX_MARKER_END = "# <<< rox default mcp servers <<<";

/** Serialize one `[mcp_servers.<name>]` table to TOML. */
function codexServerTable(
	server: DefaultMcpServer,
	worktreePath: string,
): string {
	const args = bunxArgs(server, worktreePath);
	const argsToml = args.map((a) => JSON.stringify(a)).join(", ");
	return [
		`[mcp_servers.${server.name}]`,
		`command = ${JSON.stringify(BUNX)}`,
		`args = [${argsToml}]`,
	].join("\n");
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
