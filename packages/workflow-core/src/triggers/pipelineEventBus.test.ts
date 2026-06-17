import { afterEach, describe, expect, it } from "bun:test";
import {
	clearPipelineEventSink,
	hasPipelineEventSink,
	type PipelineEventSink,
	publishPipelineEvent,
	setPipelineEventSink,
} from "./pipelineEventBus";
import type { PipelineEvent } from "./triggerMatch";

function event(
	kind: PipelineEvent["kind"] = "project_initialized",
): PipelineEvent {
	return {
		kind,
		organizationId: "org-1",
		v2ProjectId: "proj-1",
		payload: { projectId: "proj-1" },
	};
}

describe("pipelineEventBus", () => {
	afterEach(() => {
		clearPipelineEventSink();
	});

	it("is a no-op when no sink is registered (no throw)", () => {
		expect(hasPipelineEventSink()).toBe(false);
		expect(() => publishPipelineEvent(event())).not.toThrow();
	});

	it("delivers published events to the registered sink", () => {
		const received: PipelineEvent[] = [];
		const sink: PipelineEventSink = (e) => {
			received.push(e);
		};
		setPipelineEventSink(sink);
		expect(hasPipelineEventSink()).toBe(true);

		const e = event("agent_run_finished");
		publishPipelineEvent(e);
		expect(received).toEqual([e]);
	});

	it("unsubscribe restores the previously-registered sink", () => {
		const first: PipelineEvent[] = [];
		const second: PipelineEvent[] = [];
		setPipelineEventSink((e) => {
			first.push(e);
		});
		const unsubscribeSecond = setPipelineEventSink((e) => {
			second.push(e);
		});

		publishPipelineEvent(event());
		expect(second).toHaveLength(1);
		expect(first).toHaveLength(0);

		unsubscribeSecond();
		publishPipelineEvent(event());
		// Restored to the first sink.
		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
	});

	it("swallows a synchronous throw from the sink", () => {
		setPipelineEventSink(() => {
			throw new Error("boom");
		});
		expect(() => publishPipelineEvent(event())).not.toThrow();
	});

	it("swallows an async rejection from the sink", async () => {
		let settled = false;
		setPipelineEventSink(async () => {
			settled = true;
			throw new Error("async boom");
		});
		// Must not throw synchronously, and the rejected promise must not surface.
		expect(() => publishPipelineEvent(event())).not.toThrow();
		// Let the microtask queue drain so the swallowed rejection is observed.
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(true);
	});

	it("clearPipelineEventSink drops the sink", () => {
		const received: PipelineEvent[] = [];
		setPipelineEventSink((e) => {
			received.push(e);
		});
		clearPipelineEventSink();
		expect(hasPipelineEventSink()).toBe(false);
		publishPipelineEvent(event());
		expect(received).toHaveLength(0);
	});
});
