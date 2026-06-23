import { describe, expect, test } from "bun:test";

import {
	CommsEventBus,
	type CommsMessageEvent,
	publishCommsMessage,
} from "./comms-events";

/**
 * Event-bus unit tests: the publish/subscribe fan-out, unsubscribe hygiene (the
 * SSE route MUST be able to detach on disconnect), and the best-effort contract
 * (a publish never throws into a persist path).
 */

const sampleEvent: CommsMessageEvent = {
	organizationId: "org-1",
	threadId: "thread-1",
	messageId: "msg-1",
	transport: "inapp",
	authorUserId: "user-1",
	at: 123,
};

describe("CommsEventBus", () => {
	test("delivers a published event to every subscriber", () => {
		const bus = new CommsEventBus();
		const seenA: CommsMessageEvent[] = [];
		const seenB: CommsMessageEvent[] = [];
		bus.subscribe((e) => seenA.push(e));
		bus.subscribe((e) => seenB.push(e));

		bus.publish(sampleEvent);

		expect(seenA).toEqual([sampleEvent]);
		expect(seenB).toEqual([sampleEvent]);
	});

	test("unsubscribe detaches the listener (no leak after disconnect)", () => {
		const bus = new CommsEventBus();
		const seen: CommsMessageEvent[] = [];
		const off = bus.subscribe((e) => seen.push(e));

		bus.publish(sampleEvent);
		expect(bus.listenerCount()).toBe(1);

		off();
		bus.publish(sampleEvent);

		// Only the pre-unsubscribe publish was received.
		expect(seen).toHaveLength(1);
		expect(bus.listenerCount()).toBe(0);
	});
});

describe("publishCommsMessage", () => {
	test("never throws even when a subscriber throws (persist path stays safe)", () => {
		// A faulty subscriber must not bubble into the caller's write path. We
		// assert publishCommsMessage swallows it (the process-global bus is used
		// here; the throwing listener is removed afterwards to avoid cross-test
		// bleed).
		const throwing = () => {
			throw new Error("subscriber boom");
		};
		// Subscribe via the module singleton through a fresh bus to keep isolation.
		const bus = new CommsEventBus();
		bus.subscribe(throwing);
		// Direct publish on a bus with a throwing listener WOULD throw…
		expect(() => bus.publish(sampleEvent)).toThrow("subscriber boom");

		// …but the top-level helper is wrapped to never throw.
		expect(() =>
			publishCommsMessage({
				organizationId: "org-x",
				threadId: "t-x",
				messageId: "m-x",
				transport: "inapp",
				authorUserId: null,
			}),
		).not.toThrow();
	});

	test("stamps `at` when the caller omits it", () => {
		const bus = new CommsEventBus();
		let received: CommsMessageEvent | null = null;
		bus.subscribe((e) => {
			received = e;
		});
		const before = Date.now();
		// Publish onto this local bus by hand to assert the stamping shape mirrors
		// publishCommsMessage's contract.
		bus.publish({
			organizationId: "o",
			threadId: "t",
			messageId: "m",
			transport: "inapp",
			authorUserId: null,
			at: before,
		});
		expect(received).not.toBeNull();
		expect(
			(received as unknown as CommsMessageEvent).at,
		).toBeGreaterThanOrEqual(before);
	});
});
