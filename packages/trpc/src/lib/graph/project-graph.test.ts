import { describe, expect, test } from "bun:test";
import {
	assembleProjectGraph,
	type EdgeRow,
	type EntitySummaryRow,
} from "./project-graph";

const note: EntitySummaryRow = {
	id: "n1",
	kind: "note",
	title: "Design note",
	slug: "design-note",
};
const task: EntitySummaryRow = {
	id: "t1",
	kind: "task",
	title: "Ship Phase-1",
	slug: null,
};
const outsideContact: EntitySummaryRow = {
	id: "c1",
	kind: "contact",
	title: "Shared contact",
	slug: "shared-contact",
};

describe("assembleProjectGraph (project object-graph walk)", () => {
	test("marks project rows inProject and dedupes by id", () => {
		const result = assembleProjectGraph({
			projectRows: [note, task],
			neighborRows: [],
			edgeRows: [],
			truncated: false,
		});

		expect(result.nodes).toHaveLength(2);
		expect(result.nodes.every((n) => n.inProject)).toBe(true);
		const ids = result.nodes.map((n) => n.entityId).sort();
		expect(ids).toEqual(["n1", "t1"]);
	});

	test("keeps an edge between two project nodes", () => {
		const edge: EdgeRow = {
			id: "e1",
			sourceEntityId: "t1",
			targetEntityId: "n1",
			relation: "references",
			resolved: true,
		};
		const result = assembleProjectGraph({
			projectRows: [note, task],
			neighborRows: [],
			edgeRows: [edge],
			truncated: false,
		});

		expect(result.edges).toHaveLength(1);
		expect(result.edges[0]).toMatchObject({
			id: "e1",
			sourceEntityId: "t1",
			targetEntityId: "n1",
			relation: "references",
		});
	});

	test("surfaces an out-of-project neighbor as a non-inProject node", () => {
		const edge: EdgeRow = {
			id: "e2",
			sourceEntityId: "t1",
			targetEntityId: "c1",
			relation: "about",
			resolved: true,
		};
		const result = assembleProjectGraph({
			projectRows: [task],
			neighborRows: [outsideContact],
			edgeRows: [edge],
			truncated: false,
		});

		const contactNode = result.nodes.find((n) => n.entityId === "c1");
		expect(contactNode).toBeDefined();
		expect(contactNode?.inProject).toBe(false);
		// The edge to the surfaced neighbor is kept.
		expect(result.edges).toHaveLength(1);
	});

	test("a project node is never downgraded by a duplicate neighbor row", () => {
		// Same id appears both as a project row and (defensively) a neighbor row.
		const result = assembleProjectGraph({
			projectRows: [task],
			neighborRows: [{ ...task }],
			edgeRows: [],
			truncated: false,
		});
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0]?.inProject).toBe(true);
	});

	test("drops an edge whose endpoint was not surfaced as a node", () => {
		const danglingEdge: EdgeRow = {
			id: "e3",
			sourceEntityId: "t1",
			targetEntityId: "missing",
			relation: "blocks",
			resolved: true,
		};
		const result = assembleProjectGraph({
			projectRows: [task],
			neighborRows: [],
			edgeRows: [danglingEdge],
			truncated: false,
		});
		expect(result.edges).toHaveLength(0);
	});

	test("passes the truncation flag through", () => {
		const result = assembleProjectGraph({
			projectRows: [task],
			neighborRows: [],
			edgeRows: [],
			truncated: true,
		});
		expect(result.truncated).toBe(true);
	});
});
