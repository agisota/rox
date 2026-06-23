import { describe, expect, it } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { comments, commentThreads } from "./collaboration";

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

function fkNames(table: PgTable): string[] {
	const cfg = getTableConfig(table);
	return cfg.foreignKeys
		.map((fk) => fk.getName())
		.filter((n): n is string => typeof n === "string");
}

// #11 — durable comment threads on objects (collaboration.threadsAsObjects).
// Threads anchor to a universal graph node (entities.id) and own an append-only
// list of authored comments, both org-scoped for tenancy + Electric sync.
describe("comment_threads (#11 — anchored discussion on a graph object)", () => {
	const cfg = getTableConfig(commentThreads);

	it("is named comment_threads with the org + entity anchor spine", () => {
		expect(cfg.name).toBe("comment_threads");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("entity_id");
		expect(cols).toContain("v2_project_id");
		expect(cols).toContain("created_by_user_id");
	});

	it("enforces one thread per object per org (get-or-create natural key)", () => {
		expect(indexNames(commentThreads)).toContain(
			"comment_threads_org_entity_uniq",
		);
	});

	it("anchors to entities in the SAME org via a composite FK (no cross-org)", () => {
		// The composite (entity_id, organization_id) FK to entities pins the thread
		// to an object in its own org — a thread can never reference a cross-org
		// entity (same guard edges_source_entity_org_fk uses).
		expect(fkNames(commentThreads)).toContain("comment_threads_entity_org_fk");
	});

	it("indexes the org and project read paths", () => {
		const idx = indexNames(commentThreads);
		expect(idx).toContain("comment_threads_org_idx");
		expect(idx).toContain("comment_threads_project_idx");
	});
});

describe("comments (#11 — append-only authored messages in a thread)", () => {
	const cfg = getTableConfig(comments);

	it("is named comments with org + thread + author + body", () => {
		expect(cfg.name).toBe("comments");
		const cols = cfg.columns.map((c) => c.name);
		expect(cols).toContain("organization_id");
		expect(cols).toContain("thread_id");
		expect(cols).toContain("author_user_id");
		expect(cols).toContain("body");
	});

	it("body is NOT NULL (a comment must carry text)", () => {
		const body = cfg.columns.find((c) => c.name === "body");
		expect(body?.notNull).toBe(true);
	});

	it("indexes the thread read path (oldest-first per thread)", () => {
		const idx = indexNames(comments);
		expect(idx).toContain("comments_org_idx");
		expect(idx).toContain("comments_thread_created_idx");
	});
});
