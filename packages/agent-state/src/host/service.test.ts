import { describe, expect, it } from "bun:test";
import type { AgentStateChange } from "../core/service";
import { createFakeLibsqlClient } from "./fake-client";
import { createEmbeddedReplica } from "./replica";
import { AgentStateHostService } from "./service";

async function makeService(now?: () => number) {
	const replica = await createEmbeddedReplica({
		localPath: ":memory:",
		createClient: () => createFakeLibsqlClient(),
	});
	return new AgentStateHostService({ replica, now });
}

describe("AgentStateHostService", () => {
	it("upserts and reads back an entry", async () => {
		const svc = await makeService(() => 1000);
		const written = await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
			valueJson: JSON.stringify({ step: 1 }),
		});
		expect(written.revision).toBe(1);
		expect(written.updatedAt).toBe(1000);

		const got = await svc.get({
			orgId: "org_1",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
		});
		expect(got?.valueJson).toBe(JSON.stringify({ step: 1 }));
	});

	it("resolves concurrent writes by last-writer-wins on revision", async () => {
		const svc = await makeService(() => 2000);

		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
			valueJson: '"r5"',
			revision: 5,
			updatedAt: 100,
		});

		// A stale write at a lower revision must be ignored.
		const stale = await svc.set({
			orgId: "org_1",
			deviceId: "dev_b",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
			valueJson: '"r3"',
			revision: 3,
			updatedAt: 999,
		});
		expect(stale.valueJson).toBe('"r5"');
		expect(stale.revision).toBe(5);

		// A newer revision wins.
		const fresh = await svc.set({
			orgId: "org_1",
			deviceId: "dev_b",
			scope: "run",
			scopeId: "run_1",
			key: "progress",
			valueJson: '"r6"',
			revision: 6,
			updatedAt: 50,
		});
		expect(fresh.valueJson).toBe('"r6"');
		expect(fresh.revision).toBe(6);
	});

	it("lists every entry in a scope", async () => {
		const svc = await makeService();
		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "owner",
			valueJson: '"dev_a"',
		});
		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "phase",
			valueJson: '"building"',
		});
		// Different scope — must not appear.
		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_2",
			key: "owner",
			valueJson: '"dev_a"',
		});

		const { entries } = await svc.listScope({
			orgId: "org_1",
			scope: "workspace",
			scopeId: "ws_1",
		});
		expect(entries).toHaveLength(2);
		expect(entries.map((e) => e.key).sort()).toEqual(["owner", "phase"]);
	});

	it("subscribeScope yields the current snapshot first, then live changes", async () => {
		const svc = await makeService();
		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "step",
			valueJson: "1",
		});

		const iterator = svc
			.subscribeScope({ orgId: "org_1", scope: "run", scopeId: "run_1" })
			[Symbol.asyncIterator]();

		const first = await iterator.next();
		expect(first.done).toBe(false);
		expect(first.value.entries).toHaveLength(1);

		// Trigger a live change; the next() promise should resolve with it.
		const pending = iterator.next();
		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "step",
			valueJson: "2",
		});
		const second = await pending;
		expect(second.done).toBe(false);
		const secondChange = second.value as AgentStateChange;
		const stepEntry = secondChange.entries.find((e) => e.key === "step");
		expect(stepEntry?.valueJson).toBe("2");
	});

	it("reports and upserts host presence", async () => {
		const svc = await makeService(() => 4000);
		const presence = await svc.reportPresence({
			deviceId: "dev_a",
			orgId: "org_1",
			machineId: "machine_a",
			hostKind: "local",
			state: "online",
		});
		expect(presence.state).toBe("online");
		expect(presence.lastSeenAt).toBe(4000);

		const draining = await svc.reportPresence({
			deviceId: "dev_a",
			orgId: "org_1",
			machineId: "machine_a",
			hostKind: "local",
			state: "draining",
		});
		expect(draining.state).toBe("draining");
	});

	it("delegates claims and returns not-wired by default", async () => {
		const svc = await makeService();
		const result = await svc.claim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "lock",
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("claims-not-wired");
	});

	it("invokes onLocalWrite after a successful set", async () => {
		const replica = await createEmbeddedReplica({
			localPath: ":memory:",
			createClient: () => createFakeLibsqlClient(),
		});
		let writes = 0;
		const svc = new AgentStateHostService({
			replica,
			onLocalWrite: () => {
				writes += 1;
			},
		});
		await svc.set({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "host",
			scopeId: "host_1",
			key: "k",
			valueJson: "1",
		});
		expect(writes).toBe(1);
	});
});
