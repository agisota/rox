import { describe, expect, test } from "bun:test";

import { resolveLiveRoomActivityGate } from "./resolveLiveRoomActivityGate";

const LIVEKIT_URL = "wss://rox.livekit.cloud";

describe("resolveLiveRoomActivityGate", () => {
	test("opens with LiveKit configured, an org, and a thread", () => {
		const gate = resolveLiveRoomActivityGate({
			livekitUrl: LIVEKIT_URL,
			organizationId: "org_1",
			threadId: "thread_42",
		});
		expect(gate.enabled).toBe(true);
		// Reuses the proven voice room-name convention the call button mints for.
		expect(gate.roomName).toBe("org:org_1:voice:thread_42");
	});

	test("stays inert without a LiveKit URL", () => {
		expect(
			resolveLiveRoomActivityGate({
				livekitUrl: undefined,
				organizationId: "org_1",
				threadId: "thread_42",
			}),
		).toEqual({ enabled: false, roomName: null });

		expect(
			resolveLiveRoomActivityGate({
				livekitUrl: "   ",
				organizationId: "org_1",
				threadId: "thread_42",
			}),
		).toEqual({ enabled: false, roomName: null });
	});

	test("stays inert without an org or thread scope", () => {
		expect(
			resolveLiveRoomActivityGate({
				livekitUrl: LIVEKIT_URL,
				organizationId: undefined,
				threadId: "thread_42",
			}).enabled,
		).toBe(false);

		expect(
			resolveLiveRoomActivityGate({
				livekitUrl: LIVEKIT_URL,
				organizationId: "org_1",
				threadId: "",
			}).enabled,
		).toBe(false);
	});

	test("closes under the platform kill switch", () => {
		const gate = resolveLiveRoomActivityGate({
			livekitUrl: LIVEKIT_URL,
			organizationId: "org_1",
			threadId: "thread_42",
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomName).toBeNull();
	});
});
