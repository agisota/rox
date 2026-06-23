import { describe, expect, it } from "bun:test";
import { buildMcpJson, DEFAULT_MCP_SERVERS, mergeCodexMcp } from "./setup-mcp";

const WORKTREE = "/tmp/rox/workspaces/feature-x";

const DEFAULT_NAMES = DEFAULT_MCP_SERVERS.map((s) => s.name);

describe("DEFAULT_MCP_SERVERS", () => {
	it("ships the curated default set (filesystem, thinking, exa, context7, rox, telegram)", () => {
		expect([...DEFAULT_NAMES].sort()).toEqual(
			[
				"context7",
				"exa",
				"filesystem",
				"rox",
				"sequential-thinking",
				"telegram",
			].sort(),
		);
		// Guard against re-introducing servers that are not npm-runnable.
		expect(DEFAULT_NAMES).not.toContain("git");
		expect(DEFAULT_NAMES).not.toContain("github");
		expect(DEFAULT_NAMES).not.toContain("fetch");
	});

	it("only uses bunx-runnable npm packages for stdio servers", () => {
		for (const server of DEFAULT_MCP_SERVERS) {
			if (server.transport === "stdio") {
				expect(server.pkg.length).toBeGreaterThan(0);
				// Python/uvx-only packages would not be bunx-runnable.
				expect(server.pkg.startsWith("uvx")).toBe(false);
			}
		}
	});

	it("seeds rox as a remote http MCP endpoint", () => {
		const rox = DEFAULT_MCP_SERVERS.find((s) => s.name === "rox");
		expect(rox?.transport).toBe("http");
		if (rox?.transport === "http") {
			expect(rox.url).toContain("api.zed.md");
		}
	});

	it("points the rox endpoint at the v2 agent MCP route (not the v1 /mcp)", () => {
		// T1 convergence cutover: seeded agents must call the v2 endpoint
		// (native host tools + per-org proxy), NOT the legacy v1 `/mcp`.
		const rox = DEFAULT_MCP_SERVERS.find((s) => s.name === "rox");
		expect(rox?.transport).toBe("http");
		if (rox?.transport === "http") {
			expect(rox.url).toBe("https://api.zed.md/api/v2/agent/mcp");
			// Must not regress to the legacy v1 endpoint (`<host>/mcp`).
			expect(rox.url).not.toBe("https://api.zed.md/mcp");
			expect(rox.url).toContain("/api/v2/agent/mcp");
		}
	});

	it("scopes the filesystem server to the worktree path", () => {
		const fs = DEFAULT_MCP_SERVERS.find((s) => s.name === "filesystem");
		expect(fs?.transport).toBe("stdio");
		if (fs?.transport === "stdio") {
			expect(fs.argsFor(WORKTREE)).toEqual([WORKTREE]);
		}
	});
});

describe("buildMcpJson", () => {
	it("creates a fresh .mcp.json with all default servers", () => {
		const out = buildMcpJson(null, WORKTREE);
		expect(out).not.toBeNull();
		const parsed = JSON.parse(out as string);
		expect(Object.keys(parsed.mcpServers).sort()).toEqual(
			[...DEFAULT_NAMES].sort(),
		);
		expect(parsed.mcpServers.filesystem).toEqual({
			command: "bunx",
			args: ["-y", "@modelcontextprotocol/server-filesystem", WORKTREE],
		});
		expect(parsed.mcpServers["sequential-thinking"]).toEqual({
			command: "bunx",
			args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
		});
		// Trailing newline for POSIX-friendly files.
		expect((out as string).endsWith("}\n")).toBe(true);
	});

	it("writes the rox v2 endpoint into .mcp.json (Claude http entry)", () => {
		const out = buildMcpJson(null, WORKTREE);
		const parsed = JSON.parse(out as string);
		expect(parsed.mcpServers.rox).toEqual({
			type: "http",
			url: "https://api.zed.md/api/v2/agent/mcp",
		});
	});

	it("merge preserves existing user entries and other top-level keys", () => {
		const existing = JSON.stringify({
			$schema: "https://example.com/schema.json",
			mcpServers: {
				"my-custom": { command: "node", args: ["server.js"] },
			},
		});
		const out = buildMcpJson(existing, WORKTREE);
		const parsed = JSON.parse(out as string);
		// User entry preserved untouched.
		expect(parsed.mcpServers["my-custom"]).toEqual({
			command: "node",
			args: ["server.js"],
		});
		// Other top-level keys preserved.
		expect(parsed.$schema).toBe("https://example.com/schema.json");
		// Defaults added alongside.
		for (const name of DEFAULT_NAMES) {
			expect(parsed.mcpServers[name]).toBeDefined();
		}
	});

	it("never overwrites a user entry with the same name as a default", () => {
		const existing = JSON.stringify({
			mcpServers: {
				filesystem: { command: "my-fs", args: ["--custom"] },
			},
		});
		const out = buildMcpJson(existing, WORKTREE);
		// Only sequential-thinking should be added; filesystem stays the user's.
		expect(out).not.toBeNull();
		const parsed = JSON.parse(out as string);
		expect(parsed.mcpServers.filesystem).toEqual({
			command: "my-fs",
			args: ["--custom"],
		});
		expect(parsed.mcpServers["sequential-thinking"]).toBeDefined();
	});

	it("is a no-op when all defaults already exist", () => {
		// First seed.
		const first = buildMcpJson(null, WORKTREE) as string;
		// Re-run with the seeded content → no changes needed.
		expect(buildMcpJson(first, WORKTREE)).toBeNull();
	});

	it("treats malformed JSON as empty rather than throwing or clobbering blindly", () => {
		const out = buildMcpJson("{ not valid json", WORKTREE);
		expect(out).not.toBeNull();
		const parsed = JSON.parse(out as string);
		expect(Object.keys(parsed.mcpServers).sort()).toEqual(
			[...DEFAULT_NAMES].sort(),
		);
	});
});

describe("mergeCodexMcp", () => {
	it("creates a fresh config.toml with all default servers in a marked block", () => {
		const out = mergeCodexMcp(null, WORKTREE);
		expect(out).not.toBeNull();
		const text = out as string;
		expect(text).toContain("[mcp_servers.filesystem]");
		expect(text).toContain("[mcp_servers.sequential-thinking]");
		expect(text).toContain('command = "bunx"');
		expect(text).toContain(
			`args = ["-y", "@modelcontextprotocol/server-filesystem", ${JSON.stringify(WORKTREE)}]`,
		);
		// Parseable as valid TOML with the expected server tables.
		const parsed = Bun.TOML.parse(text) as {
			mcp_servers: Record<string, unknown>;
		};
		expect(Object.keys(parsed.mcp_servers).sort()).toEqual(
			[...DEFAULT_NAMES].sort(),
		);
	});

	it("writes the rox v2 endpoint into config.toml (Codex http table)", () => {
		const out = mergeCodexMcp(null, WORKTREE);
		const parsed = Bun.TOML.parse(out as string) as {
			mcp_servers: Record<string, { url?: string }>;
		};
		expect(parsed.mcp_servers.rox?.url).toBe(
			"https://api.zed.md/api/v2/agent/mcp",
		);
	});

	it("merge preserves existing user server tables and only appends missing", () => {
		const existing = [
			"[mcp_servers.legacy-custom]",
			'type = "sse"',
			'url = "https://api.example.com/api/v2/agent/mcp"',
			"",
		].join("\n");
		const out = mergeCodexMcp(existing, WORKTREE);
		expect(out).not.toBeNull();
		const text = out as string;
		// Existing content kept verbatim (we only append).
		expect(text.startsWith(existing)).toBe(true);
		const parsed = Bun.TOML.parse(text) as {
			mcp_servers: Record<string, { type?: string; command?: string }>;
		};
		// User server preserved.
		expect(parsed.mcp_servers["legacy-custom"]?.type).toBe("sse");
		// Defaults appended.
		expect(parsed.mcp_servers.filesystem?.command).toBe("bunx");
		expect(parsed.mcp_servers["sequential-thinking"]?.command).toBe("bunx");
	});

	it("does not append a server whose name already exists", () => {
		const existing = [
			"[mcp_servers.filesystem]",
			'command = "my-fs"',
			'args = ["--custom"]',
			"",
		].join("\n");
		const out = mergeCodexMcp(existing, WORKTREE) as string;
		const parsed = Bun.TOML.parse(out) as {
			mcp_servers: Record<string, { command?: string }>;
		};
		// User's filesystem untouched.
		expect(parsed.mcp_servers.filesystem?.command).toBe("my-fs");
		// Only sequential-thinking appended.
		expect(parsed.mcp_servers["sequential-thinking"]?.command).toBe("bunx");
		// Exactly one filesystem table — no duplicate.
		const matches = out.match(/\[mcp_servers\.filesystem\]/g) ?? [];
		expect(matches.length).toBe(1);
	});

	it("is a no-op on re-run (marker block already present)", () => {
		const first = mergeCodexMcp(null, WORKTREE) as string;
		expect(mergeCodexMcp(first, WORKTREE)).toBeNull();
	});

	it("is a no-op when all defaults already exist as user tables", () => {
		const existing = `${DEFAULT_NAMES.map(
			(name) => `[mcp_servers.${name}]\ncommand = "x"\nargs = []\n`,
		).join("\n")}`;
		expect(mergeCodexMcp(existing, WORKTREE)).toBeNull();
	});

	it("re-run after a real merge stays a no-op", () => {
		const existing = [
			"[mcp_servers.legacy-custom]",
			'type = "sse"',
			'url = "https://api.example.com/api/v2/agent/mcp"',
		].join("\n");
		const seeded = mergeCodexMcp(existing, WORKTREE) as string;
		expect(mergeCodexMcp(seeded, WORKTREE)).toBeNull();
	});
});
