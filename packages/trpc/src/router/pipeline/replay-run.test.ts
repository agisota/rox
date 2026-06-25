import { describe, expect, test } from "bun:test";
import type { SelectWorkflowDefinition } from "@rox/db/schema";
import { buildReplayArgs } from "./replay";

// DB-light unit tests for the replay arg-builder (issue #553). `buildReplayArgs`
// is pure (no DB / no ctx / no env) so we can assert the replay provenance
// contract — same input, parentRunId link, replay-marked triggerRef — without
// touching Neon or the trpc router's module-load env validation. The mutation's
// DB reads (source run / step load) live in pipeline.replayRun; here we lock the
// provenance shape.

const pipeline = {
	id: "pipe-1",
	v2ProjectId: "proj-1",
	draftState: { blocks: {}, edges: [] },
} as unknown as SelectWorkflowDefinition;

describe("buildReplayArgs (issue #553)", () => {
	test("REPLAY-ARGS-01: whole-run replay reuses input + stamps parentRunId/replay provenance", () => {
		const args = buildReplayArgs({
			organizationId: "org-1",
			userId: "user-1",
			pipeline,
			sourceRun: {
				id: "run-src",
				input: { message: "original payload" },
				accumulatedContext: { seedMessage: "seed text", entries: [] },
			},
		});

		// Same input as the source run.
		expect(args.input).toEqual({ message: "original payload" });
		// Provenance: the replay points back at the source run.
		expect(args.parentRunId).toBe("run-src");
		expect(args.triggerRef).toEqual({ replay: true, sourceRunId: "run-src" });
		// Manually-fired re-run.
		expect(args.triggerKind).toBe("manual");
		// Seed message carried over (entries reset — the replay re-derives them).
		expect(args.initialContext.seedMessage).toBe("seed text");
		expect(args.initialContext.entries).toEqual([]);
		// Whole-run replay does not pin an entry node.
		expect(args.entryNodeId).toBeUndefined();
	});

	test("REPLAY-ARGS-02: fromStepBlockId is recorded in triggerRef provenance", () => {
		const args = buildReplayArgs({
			organizationId: "org-1",
			userId: "user-1",
			pipeline,
			sourceRun: {
				id: "run-src",
				input: { message: "original payload" },
				accumulatedContext: { seedMessage: "seed text", entries: [] },
			},
			fromStepBlockId: "node-2",
		});

		expect(args.triggerRef).toEqual({
			replay: true,
			sourceRunId: "run-src",
			fromStepBlockId: "node-2",
		});
		// The mutation overrides input/entryNodeId from the recorded step afterwards;
		// the builder itself still defaults input to the source run's input.
		expect(args.parentRunId).toBe("run-src");
	});

	test("REPLAY-ARGS-03: missing source context/input falls back to empty seed + {}", () => {
		const args = buildReplayArgs({
			organizationId: "org-1",
			userId: "user-1",
			pipeline,
			sourceRun: { id: "run-src", input: null, accumulatedContext: null },
		});

		expect(args.input).toEqual({});
		expect(args.initialContext.seedMessage).toBe("");
		expect(args.initialContext.entries).toEqual([]);
	});
});
