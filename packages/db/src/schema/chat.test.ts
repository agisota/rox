import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import { chatLabels } from "./chat";

/**
 * Drizzle exposes index/unique names on `index.config.name`, and `uniqueIndex`
 * objects are returned under `getTableConfig().indexes`. Collect every named
 * index/unique on a table so shape assertions are accessor-agnostic.
 */
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

describe("chat_labels (Hermes-borrow F11)", () => {
	const cfg = getTableConfig(chatLabels);

	it("is named chat_labels", () => {
		expect(cfg.name).toBe("chat_labels");
	});

	it("has the org spine + name/color/icon presentation shape", () => {
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("id");
		expect(cols).toContain("organization_id");
		expect(cols).toContain("name");
		expect(cols).toContain("color");
		expect(cols).toContain("icon");
		expect(cols).toContain("created_by");
		expect(cols).toContain("created_at");
		expect(cols).toContain("updated_at");
	});

	it("requires name + color, leaves icon nullable", () => {
		const byName = new Map(cfg.columns.map((c) => [c.name, c]));
		expect(byName.get("name")?.notNull).toBe(true);
		expect(byName.get("color")?.notNull).toBe(true);
		expect(byName.get("icon")?.notNull).toBe(false);
	});

	it("uniques (organization_id, name)", () => {
		expect(indexNames(chatLabels)).toContain("chat_labels_org_name_unique");
	});

	it("indexes organization_id (Electric shape filter)", () => {
		expect(indexNames(chatLabels)).toContain("chat_labels_org_idx");
	});

	it("exposes Insert/Select types via inferred shape", () => {
		const sel: (typeof chatLabels)["$inferSelect"] = {
			id: "x",
			organizationId: "o",
			name: "urgent",
			color: "hsl(214, 58%, 46%)",
			icon: null,
			createdBy: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		expect(sel.name).toBe("urgent");
		expect(sel.icon).toBeNull();
	});
});
