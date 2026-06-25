import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "@rox/workflow-runtime";
import { buildPipelineHandlers } from "./handlers";

/**
 * DB-free coverage for the I/O node registration (#547). `buildPipelineHandlers`
 * with no scope still wires the executable I/O nodes — `manual_input` (pure entry
 * node) and `notify` (port-backed output node) — while `webhook`/`schedule` are
 * trigger nodes with no executable handler (a run STARTS at them via the
 * pipeline_triggers registry + `entryNodeId` dispatch; the node-entry handoff is
 * proven in `dispatcher.test.ts` DISP-ENTRY-01).
 */

function ctx(
	type: string,
	subBlocks: Record<string, unknown>,
	runInput: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: `${type}-1`,
		block: { type, subBlocks },
		input: runInput,
		runInput,
		resolveSecret: () => undefined,
	};
}

describe("buildPipelineHandlers — I/O nodes (#547)", () => {
	test("registers manual_input as a pure entry node that shapes the run input", async () => {
		const handlers = buildPipelineHandlers();
		const handler = handlers.manual_input;
		expect(handler).toBeDefined();
		const res = await handler(
			ctx(
				"manual_input",
				{ fields: { age: "number", name: "string" } },
				{ age: "30", name: "Mark", extra: "drop" },
			),
		);
		expect(res.handle).toBe("out");
		expect(res.output).toEqual({ age: 30, name: "Mark" });
	});

	test("registers notify wired to the server port (unconfigured channel → error)", async () => {
		const handlers = buildPipelineHandlers();
		const handler = handlers.notify;
		expect(handler).toBeDefined();
		// No TELEGRAM_BOT_TOKEN / unsupported channel: the real port throws a typed
		// not-configured error which the handler surfaces on the `error` handle.
		const res = await handler(
			ctx(
				"notify",
				{ channel: "slack", message: "hi {{name}}" },
				{ name: "x" },
			),
		);
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("NOTIFY_DELIVERY_FAILED");
	});

	test("webhook/schedule are trigger nodes (no executable handler — node-entry dispatch)", () => {
		const handlers = buildPipelineHandlers();
		// They are NOT in the handler map: the executor's generic pass-through
		// forwards their node-entry `runInput`, and a run is STARTED at them via the
		// trigger registry's `entryNodeId` (see dispatcher DISP-ENTRY-01).
		expect(handlers.webhook).toBeUndefined();
		expect(handlers.schedule).toBeUndefined();
	});
});
