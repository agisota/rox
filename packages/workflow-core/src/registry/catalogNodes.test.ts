import { describe, expect, test } from "bun:test";
import { WorkflowErrorCode } from "../errors";
import { validateGraph } from "../graph";
import type { RoxBlockState, RoxWorkflowState } from "../types";
import {
	CATALOG_NODE_TYPES,
	getNodeType,
	isRegisteredNodeType,
	listByCategory,
} from "./index";
import { NodeCategory } from "./nodeCategory";
import { validateNodeConfig } from "./validateNodeConfig";

const CATALOG_IDS = [
	"manual_input",
	"webhook",
	"schedule",
	"condition",
	"switch",
	"merge",
	"gate",
	"notify",
	"db_write",
] as const;

function need(id: string) {
	const def = getNodeType(id);
	if (!def) throw new Error(`${id} not registered`);
	return def;
}

/** Build a complete RoxWorkflowState (mirrors validateGraph.test.ts). */
function makeState(
	blocks: Record<string, RoxBlockState>,
	edges: RoxWorkflowState["edges"],
): RoxWorkflowState {
	return {
		blocks,
		edges,
		variables: {},
		loops: {},
		parallels: {},
		metadata: { name: "test" },
	};
}

describe("catalog node types (Slice 1b)", () => {
	test("all 9 catalog types register into the shared registry", () => {
		expect(CATALOG_NODE_TYPES).toHaveLength(9);
		for (const id of CATALOG_IDS) {
			expect(isRegisteredNodeType(id)).toBe(true);
			expect(getNodeType(id)?.id).toBe(id);
		}
	});

	test("catalog types land in the right palette categories", () => {
		const input = listByCategory(NodeCategory.Input).map((d) => d.id);
		const logic = listByCategory(NodeCategory.Logic).map((d) => d.id);
		const output = listByCategory(NodeCategory.Output).map((d) => d.id);
		expect(input).toEqual(
			expect.arrayContaining(["manual_input", "webhook", "schedule"]),
		);
		expect(logic).toEqual(
			expect.arrayContaining(["condition", "switch", "merge", "gate"]),
		);
		expect(output).toEqual(expect.arrayContaining(["notify", "db_write"]));
	});

	test("no catalog type collides with a built-in id", () => {
		for (const id of CATALOG_IDS) {
			expect(
				["start", "agent_run", "loop", "human_approval", "response"].includes(
					id,
				),
			).toBe(false);
		}
	});

	test("every catalog field key round-trips through its configSchema", () => {
		// Guards the auto-form ↔ schema contract for the new modules.
		for (const def of CATALOG_NODE_TYPES) {
			for (const field of def.fields) {
				const sample = sampleForField(def.id, field.key, field.kind);
				const result = def.configSchema.safeParse({ [field.key]: sample });
				expect(result.success).toBe(true);
			}
		}
	});

	// --- LOGIC ----------------------------------------------------------------

	test("condition: true/false out-ports + required expression", () => {
		const def = need("condition");
		expect(def.outputs.map((p) => p.name)).toEqual(["true", "false"]);
		expect(def.inputs[0]?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "expression")?.required).toBe(true);
		expect(def.configSchema.safeParse({ expression: "x > 1" }).success).toBe(
			true,
		);
		expect(def.configSchema.safeParse({ expression: "" }).success).toBe(false);
		expect(
			def.configSchema.safeParse({ expression: "x".repeat(2001) }).success,
		).toBe(false);
	});

	test("switch: case out-ports include a default + cases record", () => {
		const def = need("switch");
		expect(def.outputs.map((p) => p.name)).toEqual([
			"case1",
			"case2",
			"case3",
			"default",
		]);
		expect(
			def.configSchema.safeParse({ value: "x", cases: { a: "1", b: "2" } })
				.success,
		).toBe(true);
		// case values must be strings (key-value record contract).
		expect(
			def.configSchema.safeParse({ value: "x", cases: { a: 1 } }).success,
		).toBe(false);
	});

	test("merge: single out-port, mode enum, inputs not required", () => {
		const def = need("merge");
		expect(def.outputs.map((p) => p.name)).toEqual(["out"]);
		expect(def.inputs[0]?.required).toBeUndefined();
		expect(def.configSchema.safeParse({ mode: "wait_all" }).success).toBe(true);
		expect(def.configSchema.safeParse({ mode: "first" }).success).toBe(true);
		expect(def.configSchema.safeParse({ mode: "bogus" }).success).toBe(false);
		expect(def.configSchema.safeParse({}).success).toBe(true);
	});

	test("gate: allowed/blocked out-ports + required condition", () => {
		const def = need("gate");
		expect(def.outputs.map((p) => p.name)).toEqual(["allowed", "blocked"]);
		expect(def.fields.find((f) => f.key === "condition")?.required).toBe(true);
		expect(def.configSchema.safeParse({ condition: "isAdmin" }).success).toBe(
			true,
		);
		expect(def.configSchema.safeParse({ condition: "" }).success).toBe(false);
	});

	// --- INPUT ----------------------------------------------------------------

	test("manual_input: entry node, typed fields record", () => {
		const def = need("manual_input");
		expect(def.category).toBe(NodeCategory.Input);
		expect(def.inputs).toEqual([]);
		expect(def.outputs.map((p) => p.name)).toEqual(["out"]);
		expect(
			def.configSchema.safeParse({ fields: { name: "string", age: "number" } })
				.success,
		).toBe(true);
		// only the allowed scalar types are accepted.
		expect(
			def.configSchema.safeParse({ fields: { x: "datetime" } }).success,
		).toBe(false);
	});

	test("webhook: entry node, path must start with a slash", () => {
		const def = need("webhook");
		expect(def.inputs).toEqual([]);
		expect(def.fields.find((f) => f.key === "path")?.required).toBe(true);
		expect(def.configSchema.safeParse({ path: "/hooks/x" }).success).toBe(true);
		expect(def.configSchema.safeParse({ path: "no-slash" }).success).toBe(
			false,
		);
		expect(
			def.configSchema.safeParse({ path: "/x", secret: "s3cr3t" }).success,
		).toBe(true);
	});

	test("schedule: entry node, cron/rrule kind enum + required expression", () => {
		const def = need("schedule");
		expect(def.inputs).toEqual([]);
		expect(def.fields.find((f) => f.key === "expression")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({ kind: "cron", expression: "0 9 * * *" })
				.success,
		).toBe(true);
		expect(
			def.configSchema.safeParse({ kind: "rrule", expression: "FREQ=DAILY" })
				.success,
		).toBe(true);
		expect(
			def.configSchema.safeParse({ kind: "weekly", expression: "x" }).success,
		).toBe(false);
	});

	// --- OUTPUT ---------------------------------------------------------------

	test("notify: out/error ports, channel enum + required message", () => {
		const def = need("notify");
		expect(def.category).toBe(NodeCategory.Output);
		expect(def.outputs.map((p) => p.name)).toEqual(["out", "error"]);
		expect(def.fields.find((f) => f.key === "message")?.required).toBe(true);
		expect(def.fields.find((f) => f.key === "channel")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({ channel: "email", message: "hi" }).success,
		).toBe(true);
		expect(
			def.configSchema.safeParse({ channel: "carrier_pigeon", message: "hi" })
				.success,
		).toBe(false);
	});

	test("db_write: out/error ports, target + mapping record", () => {
		const def = need("db_write");
		expect(def.outputs.map((p) => p.name)).toEqual(["out", "error"]);
		expect(def.fields.find((f) => f.key === "target")?.required).toBe(true);
		expect(
			def.configSchema.safeParse({
				target: "leads",
				mapping: { name: "ctx.name" },
			}).success,
		).toBe(true);
		expect(
			def.configSchema.safeParse({ target: "leads", mapping: { x: 1 } })
				.success,
		).toBe(false);
	});

	// --- validateNodeConfig integration --------------------------------------

	test("validateNodeConfig flags a missing required field on a catalog node", () => {
		const def = need("notify");
		const issues = validateNodeConfig(def, { type: "notify" }, "n1");
		const codes = issues.map((i) => i.code);
		expect(codes).toContain(WorkflowErrorCode.MISSING_REQUIRED_CONFIG);
		expect(issues.every((i) => i.blockId === "n1")).toBe(true);
	});

	test("validateNodeConfig passes when catalog required fields are provided", () => {
		const def = need("condition");
		expect(
			validateNodeConfig(
				def,
				{ type: "condition", subBlocks: { expression: "x > 1" } },
				"c1",
			),
		).toEqual([]);
	});

	test("validateNodeConfig surfaces an invalid-config issue from the schema", () => {
		const def = need("webhook");
		const issues = validateNodeConfig(
			def,
			{ type: "webhook", subBlocks: { path: "no-slash" } },
			"w1",
		);
		expect(issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.INVALID_NODE_CONFIG,
		);
	});

	test("validateGraph stays happy with a start → condition → response graph", () => {
		const state = makeState(
			{
				s: { type: "start" },
				c: { type: "condition", subBlocks: { expression: "x > 1" } },
				r: { type: "response" },
			},
			[
				{ id: "e1", source: "s", target: "c" },
				{ id: "e2", source: "c", target: "r" },
			],
		);
		// Registry-driven required-config + required-port checks run for the
		// catalog `condition` node and must pass end-to-end.
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	test("validateGraph flags a catalog node missing its required incoming port", () => {
		// `notify` has a required `in` port; with no incoming edge the registry
		// port check should surface a MISSING_REQUIRED_PORT issue.
		const state = makeState(
			{
				s: { type: "start" },
				n: {
					type: "notify",
					subBlocks: { channel: "email", message: "hi" },
				},
			},
			[],
		);
		const result = validateGraph(state, { resolveNodeType: getNodeType });
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain(
			WorkflowErrorCode.MISSING_REQUIRED_PORT,
		);
	});
});

/** Per-field sample that satisfies the catalog schemas (enum/path constraints). */
function sampleForField(defId: string, key: string, kind: string): unknown {
	if (kind === "key-value") {
		if (defId === "manual_input") return { f: "string" };
		return { k: "v" };
	}
	if (kind === "select") {
		if (key === "mode") return "wait_all";
		if (key === "kind") return "cron";
		if (key === "channel") return "email";
		return "sample";
	}
	if (key === "path") return "/hooks/x";
	return "sample";
}
