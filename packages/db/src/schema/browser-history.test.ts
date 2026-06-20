import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import {
	browserDataConsents,
	workspaceBrowserHistory,
} from "./browser-history";

function indexNames(table: PgTable): string[] {
	const cfg = getTableConfig(table);
	const fromIndexes = cfg.indexes.map(
		(i) => (i as unknown as { config: { name?: string } }).config?.name,
	);
	const fromUniques = cfg.uniqueConstraints.map((u) => u.name);
	return [...fromIndexes, ...fromUniques].filter(
		(n): n is string => typeof n === "string",
	);
}

describe("workspace_browser_history (WS-O T9 / D4)", () => {
	const cfg = getTableConfig(workspaceBrowserHistory);

	it("is named workspace_browser_history", () => {
		expect(cfg.name).toBe("workspace_browser_history");
	});

	it("is per-workspace, per-user with the cleaned long-term history shape", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("v2_workspace_id");
		expect(cols).toContain("user_id");
		expect(cols).toContain("url");
		expect(cols).toContain("title");
		expect(cols).toContain("favicon_url");
		expect(cols).toContain("visited_at");
		expect(cols).toContain("visit_count");
		expect(cols).toContain("first_seen_at");
		expect(cols).toContain("last_seen_at");
	});

	it("uniques (v2_workspace_id, user_id, url)", () => {
		expect(indexNames(workspaceBrowserHistory)).toContain(
			"workspace_browser_history_workspace_user_url_unique",
		);
	});

	it("indexes denormalized organization_id + v2_workspace_id (Electric)", () => {
		const names = indexNames(workspaceBrowserHistory);
		expect(names).toContain("workspace_browser_history_org_idx");
		expect(names).toContain("workspace_browser_history_workspace_idx");
	});
});

describe("browser_data_consents (WS-O T9 / D4)", () => {
	const cfg = getTableConfig(browserDataConsents);

	it("is named browser_data_consents", () => {
		expect(cfg.name).toBe("browser_data_consents");
	});

	it("records the server-side consent + revocation lifecycle", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("user_id");
		expect(cols).toContain("accepted");
		expect(cols).toContain("accepted_at");
		expect(cols).toContain("revoked_at");
	});

	it("indexes organization_id + user_id", () => {
		const names = indexNames(browserDataConsents);
		expect(names).toContain("browser_data_consents_org_idx");
		expect(names).toContain("browser_data_consents_user_idx");
	});
});
