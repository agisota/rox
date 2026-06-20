import { describe, expect, test } from "bun:test";

import { resolvePresenceGate } from "./resolvePresenceGate";

/**
 * WS-L T10 — the presence mount must stay INERT until BOTH conditions hold:
 *   1. the existing `collaboration.presence` experimental feature is available
 *      (its required LiveBlocks provider is configured), and
 *   2. the client public key (`NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY`) is present.
 *
 * We do NOT invent a new flag — we reuse the existing experimental-features
 * registry + env keys (per D3 / hardening review (a)(1)). `resolvePresenceGate`
 * is the pure decision so the React component stays a thin shell.
 */
describe("resolvePresenceGate", () => {
	test("open when the public key is set and the feature resolves available", () => {
		const gate = resolvePresenceGate({
			publicKey: "pk_test_abc",
			organizationId: "org_1",
			dashboardId: "ws_1",
		});

		expect(gate.enabled).toBe(true);
		// the room id is org/project-scoped so the server can authorize from it
		expect(gate.roomId).toBe("org:org_1:dashboard:ws_1");
	});

	test("inert when the LiveBlocks public key is missing (env unset)", () => {
		const gate = resolvePresenceGate({
			publicKey: undefined,
			organizationId: "org_1",
			dashboardId: "ws_1",
		});

		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	test("inert when the public key is an empty string", () => {
		const gate = resolvePresenceGate({
			publicKey: "   ",
			organizationId: "org_1",
			dashboardId: "ws_1",
		});

		expect(gate.enabled).toBe(false);
	});

	test("inert when there is no active organization to scope the room", () => {
		const gate = resolvePresenceGate({
			publicKey: "pk_test_abc",
			organizationId: undefined,
			dashboardId: "ws_1",
		});

		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	test("inert when the dashboard/workspace id is missing", () => {
		const gate = resolvePresenceGate({
			publicKey: "pk_test_abc",
			organizationId: "org_1",
			dashboardId: "",
		});

		expect(gate.enabled).toBe(false);
		expect(gate.roomId).toBeNull();
	});

	test("respects a platform kill switch on collaboration.presence", () => {
		const gate = resolvePresenceGate({
			publicKey: "pk_test_abc",
			organizationId: "org_1",
			dashboardId: "ws_1",
			killSwitched: true,
		});

		expect(gate.enabled).toBe(false);
	});
});
