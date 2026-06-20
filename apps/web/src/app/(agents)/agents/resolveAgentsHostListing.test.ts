import { describe, expect, it } from "bun:test";
import { buildHostRoutingKey } from "@rox/shared/host-routing";
import {
	type HostListRow,
	resolveAgentsContinueDecision,
	resolveAgentsHostListing,
} from "./resolveAgentsHostListing";

const onlineLocal: HostListRow = {
	id: "machine-1",
	name: "Desktop",
	online: true,
	kind: "local",
};
const offlineLocal: HostListRow = {
	id: "machine-1",
	name: "Desktop",
	online: false,
	kind: "local",
};

describe("resolveAgentsHostListing", () => {
	it("maps host.list rows to cabinet targets with routing keys", () => {
		const result = resolveAgentsHostListing("org-1", [onlineLocal]);
		expect(result.useMock).toBe(false);
		expect(result.targets).toEqual([
			{
				hostId: "machine-1",
				name: "Desktop",
				online: true,
				kind: "local",
				routingKey: buildHostRoutingKey("org-1", "machine-1"),
			},
		]);
	});

	it("falls back to mock only when the org has no hosts", () => {
		const result = resolveAgentsHostListing("org-1", []);
		expect(result.useMock).toBe(true);
		expect(result.targets).toEqual([]);
	});
});

describe("resolveAgentsContinueDecision (D1)", () => {
	it("uses the first online host when one is reachable", () => {
		const { targets } = resolveAgentsHostListing("org-1", [onlineLocal]);
		const decision = resolveAgentsContinueDecision(targets, false);
		expect(decision.kind).toBe("useOnlineHost");
		expect(decision.kind === "useOnlineHost" && decision.target.hostId).toBe(
			"machine-1",
		);
	});

	it("auto-provisions a sandbox (no prompt) when offline and affordable", () => {
		const { targets } = resolveAgentsHostListing("org-1", [offlineLocal]);
		expect(resolveAgentsContinueDecision(targets, true)).toEqual({
			kind: "autoProvisionSandbox",
		});
	});

	it("requires a top-up when offline and the balance cannot cover a sandbox", () => {
		const { targets } = resolveAgentsHostListing("org-1", [offlineLocal]);
		expect(resolveAgentsContinueDecision(targets, false)).toEqual({
			kind: "topUpRequired",
		});
	});

	it("auto-provisions when the org has no hosts at all but can afford it", () => {
		const { targets } = resolveAgentsHostListing("org-1", []);
		expect(resolveAgentsContinueDecision(targets, true)).toEqual({
			kind: "autoProvisionSandbox",
		});
	});
});
