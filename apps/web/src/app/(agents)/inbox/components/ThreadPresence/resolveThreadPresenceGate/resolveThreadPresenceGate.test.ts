import { describe, expect, it } from "bun:test";

import { resolveThreadPresenceGate } from "./resolveThreadPresenceGate";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const THREAD = "00000000-0000-0000-0000-0000000000bb";

describe("resolveThreadPresenceGate", () => {
	it("stays inert without a public key", () => {
		const gate = resolveThreadPresenceGate({
			publicKey: undefined,
			organizationId: ORG,
			threadId: THREAD,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("stays inert without an active org", () => {
		const gate = resolveThreadPresenceGate({
			publicKey: "pk_test",
			organizationId: undefined,
			threadId: THREAD,
		});
		expect(gate.enabled).toBe(false);
	});

	it("stays inert without a selected thread", () => {
		const gate = resolveThreadPresenceGate({
			publicKey: "pk_test",
			organizationId: ORG,
			threadId: null,
		});
		expect(gate.enabled).toBe(false);
	});

	it("stays inert when kill-switched even with keys + scope", () => {
		const gate = resolveThreadPresenceGate({
			publicKey: "pk_test",
			organizationId: ORG,
			threadId: THREAD,
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	it("opens with an org/thread-scoped room id when configured", () => {
		const gate = resolveThreadPresenceGate({
			publicKey: "pk_test",
			organizationId: ORG,
			threadId: THREAD,
		});
		expect(gate.enabled).toBe(true);
		expect(gate.roomId).toBe(`org:${ORG}:dashboard:${THREAD}`);
	});
});
