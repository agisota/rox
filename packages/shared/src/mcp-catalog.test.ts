import { describe, expect, it } from "bun:test";
import {
	BUILTIN_MCP_TOOLS,
	builtinMcpCategories,
	type McpCatalogTool,
} from "./mcp-catalog";

/**
 * Parity + hygiene tests for the built-in MCP tool catalog (F47, #644).
 *
 * We assert the catalog is internally consistent (unique names, non-empty
 * descriptions, categories derivable). The catalog is the secret-free inventory
 * source the tRPC router reads from, so it must never carry credential-shaped
 * fields.
 */
describe("BUILTIN_MCP_TOOLS catalog", () => {
	it("has unique tool names", () => {
		const names = BUILTIN_MCP_TOOLS.map((t) => t.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("has a non-empty description and category for every tool", () => {
		for (const tool of BUILTIN_MCP_TOOLS) {
			expect(tool.name.length).toBeGreaterThan(0);
			expect(tool.description.length).toBeGreaterThan(0);
			expect(tool.category.length).toBeGreaterThan(0);
		}
	});

	it("exposes no secret-shaped fields on any entry", () => {
		const forbidden = ["token", "secret", "apiKey", "password", "credential"];
		for (const tool of BUILTIN_MCP_TOOLS) {
			for (const key of Object.keys(
				tool as unknown as Record<string, unknown>,
			)) {
				expect(forbidden).not.toContain(key);
			}
		}
	});

	it("derives categories in first-seen order with no duplicates", () => {
		const cats = builtinMcpCategories();
		expect(new Set(cats).size).toBe(cats.length);
		expect(cats).toContain("tasks");
		expect(cats).toContain("screen");
	});

	it("matches the shape of McpCatalogTool", () => {
		const sample: McpCatalogTool | undefined = BUILTIN_MCP_TOOLS[0];
		expect(sample).toBeDefined();
		expect(sample).toHaveProperty("name");
		expect(sample).toHaveProperty("description");
		expect(sample).toHaveProperty("category");
	});
});
