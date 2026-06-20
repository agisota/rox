import { describe, expect, it } from "bun:test";
import type { AgentStateEntry } from "../core/service";
import { createAgentStateClient } from "./index";

describe("createAgentStateClient", () => {
	it("maps every service method to the corresponding transport call", async () => {
		const calls: Array<{ method: string; input: unknown }> = [];
		const sampleEntry: AgentStateEntry = {
			id: "e1",
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
			valueJson: '"v"',
			revision: 1,
			updatedAt: 10,
		};

		const client = createAgentStateClient({
			async request(method, input) {
				calls.push({ method, input });
				switch (method) {
					case "get":
						return sampleEntry;
					case "set":
						return sampleEntry;
					case "listScope":
						return { entries: [sampleEntry] };
					case "reportPresence":
						return {
							deviceId: "dev_a",
							orgId: "org_1",
							machineId: "machine_a",
							hostKind: "local",
							state: "online",
							lastSeenAt: 1,
							updatedAt: 1,
						};
					case "claim":
						return { ok: false, reason: "claims-not-wired" };
					default:
						throw new Error(`Unexpected method: ${method}`);
				}
			},
			async *subscribe(method, input) {
				calls.push({ method, input });
				yield {
					scope: "run" as const,
					scopeId: "run_1",
					entries: [sampleEntry],
				};
			},
		});

		const got = await client.get({
			orgId: "org_1",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
		});
		expect(got?.id).toBe("e1");

		const set = await client.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
			valueJson: '"v"',
		});
		expect(set.id).toBe("e1");

		const { entries } = await client.listScope({
			orgId: "org_1",
			scope: "run",
			scopeId: "run_1",
		});
		expect(entries).toHaveLength(1);

		const presence = await client.reportPresence({
			deviceId: "dev_a",
			orgId: "org_1",
			machineId: "machine_a",
			hostKind: "local",
			state: "online",
		});
		expect(presence.state).toBe("online");

		const claim = await client.claim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "lock",
		});
		expect(claim.ok).toBe(false);

		const iterator = client
			.subscribeScope({ orgId: "org_1", scope: "run", scopeId: "run_1" })
			[Symbol.asyncIterator]();
		const first = await iterator.next();
		expect(first.value.entries).toHaveLength(1);

		expect(calls.map((c) => c.method)).toEqual([
			"get",
			"set",
			"listScope",
			"reportPresence",
			"claim",
			"subscribeScope",
		]);
	});
});
