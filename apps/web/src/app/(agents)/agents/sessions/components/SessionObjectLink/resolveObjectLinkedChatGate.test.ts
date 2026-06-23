import { describe, expect, test } from "bun:test";

import { resolveExperimentalFeatureState } from "@rox/shared/experimental-features";
import { resolveObjectLinkedChatGate } from "./resolveObjectLinkedChatGate";

/**
 * `projectOs.objectLinkedChat` link-to-object surface gate. The control must
 * stay INERT until ALL hold:
 *   1. there is an active organization to scope the org-gated `graph.*` calls,
 *   2. there is a concrete chat session to bind the control to, and
 *   3. the experimental feature resolves usable (status `ready`, not killed).
 *
 * We do NOT invent a new flag — we reuse the existing experimental-features
 * registry (same pattern as `resolveUnifiedSearchGate` / `resolvePresenceGate`).
 * The pure decision keeps the React surface a thin shell. The feature's only
 * dependency (`desktop-runtime`) is a `runtime` dep, so it never gates this web
 * surface.
 */
describe("resolveObjectLinkedChatGate", () => {
	test("open when there is an active org, a session, and the feature is available", () => {
		const gate = resolveObjectLinkedChatGate({
			organizationId: "org_1",
			sessionId: "sess_1",
		});
		expect(gate.enabled).toBe(true);
	});

	test("inert when there is no active organization to scope the graph calls", () => {
		const gate = resolveObjectLinkedChatGate({
			organizationId: undefined,
			sessionId: "sess_1",
		});
		expect(gate.enabled).toBe(false);
	});

	test("inert when there is no concrete session to bind the control to", () => {
		const gate = resolveObjectLinkedChatGate({
			organizationId: "org_1",
			sessionId: undefined,
		});
		expect(gate.enabled).toBe(false);
	});

	test("inert when the org id or session id is an empty / whitespace string", () => {
		expect(
			resolveObjectLinkedChatGate({ organizationId: "", sessionId: "sess_1" })
				.enabled,
		).toBe(false);
		expect(
			resolveObjectLinkedChatGate({
				organizationId: "   ",
				sessionId: "sess_1",
			}).enabled,
		).toBe(false);
		expect(
			resolveObjectLinkedChatGate({ organizationId: "org_1", sessionId: "  " })
				.enabled,
		).toBe(false);
	});

	test("respects a platform kill switch on projectOs.objectLinkedChat", () => {
		const gate = resolveObjectLinkedChatGate({
			organizationId: "org_1",
			sessionId: "sess_1",
			killSwitched: true,
		});
		expect(gate.enabled).toBe(false);
	});

	test("the underlying feature is registered ready (so the gate can open)", () => {
		// Anchors the flip: a stubbed/planned status would resolve `not_implemented`
		// and the gate would stay closed regardless of org/session. With `ready` +
		// an org the availability is `available`.
		const state = resolveExperimentalFeatureState(
			"projectOs.objectLinkedChat",
			{ overrides: { "projectOs.objectLinkedChat": true } },
		);
		expect(state.availability).toBe("available");
	});
});
