import { describe, expect, it } from "bun:test";
import type {
	AgentStateChange,
	AgentStateEntry,
	AgentStateEntryInput,
	AgentStateScope,
	AgentStateService,
	HostPresence,
	HostPresenceInput,
} from "@rox/agent-state/core";
import type { HostServiceContext } from "../../../types";
import { agentStateRouter } from "./agent-state";

/**
 * In-memory fake satisfying the `AgentStateService` contract — proves the router
 * round-trips through `ctx.runtime.agentState.service` without the libSQL host.
 * Mirrors the `app.ts` test-injection pattern (`as unknown as HostServiceContext`).
 */
class FakeAgentStateService implements AgentStateService {
	private readonly entries = new Map<string, AgentStateEntry>();
	private readonly presence = new Map<string, HostPresence>();
	private readonly listeners = new Map<string, Set<() => void>>();

	private key(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
		key: string;
	}): string {
		return `${input.orgId}|${input.scope}|${input.scopeId}|${input.key}`;
	}

	private scopeChannel(orgId: string, scope: string, scopeId: string): string {
		return `${orgId}|${scope}|${scopeId}`;
	}

	async get(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
		key: string;
	}): Promise<AgentStateEntry | null> {
		return this.entries.get(this.key(input)) ?? null;
	}

	async set(input: AgentStateEntryInput): Promise<AgentStateEntry> {
		const existing = this.entries.get(this.key(input));
		const entry: AgentStateEntry = {
			id: existing?.id ?? `id-${this.entries.size + 1}`,
			orgId: input.orgId,
			deviceId: input.deviceId,
			scope: input.scope,
			scopeId: input.scopeId,
			key: input.key,
			valueJson: input.valueJson,
			revision: input.revision ?? (existing ? existing.revision + 1 : 1),
			updatedAt: input.updatedAt ?? Date.now(),
		};
		this.entries.set(this.key(input), entry);
		const channel = this.scopeChannel(input.orgId, input.scope, input.scopeId);
		for (const fn of this.listeners.get(channel) ?? []) fn();
		return entry;
	}

	async listScope(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
	}): Promise<{ entries: AgentStateEntry[] }> {
		const entries = [...this.entries.values()].filter(
			(e) =>
				e.orgId === input.orgId &&
				e.scope === input.scope &&
				e.scopeId === input.scopeId,
		);
		return { entries };
	}

	async *subscribeScope(input: {
		orgId: string;
		scope: AgentStateScope;
		scopeId: string;
	}): AsyncIterable<AgentStateChange> {
		// Register the change listener BEFORE the cache-first snapshot so a write
		// that lands between the snapshot and the first re-park is not lost.
		const channel = this.scopeChannel(input.orgId, input.scope, input.scopeId);
		const queue: AgentStateChange[] = [];
		let wake: (() => void) | null = null;
		const listener = () => {
			void this.listScope(input).then((snap) => {
				queue.push({
					scope: input.scope,
					scopeId: input.scopeId,
					entries: snap.entries,
				});
				wake?.();
				wake = null;
			});
		};
		const set = this.listeners.get(channel) ?? new Set();
		set.add(listener);
		this.listeners.set(channel, set);

		const snapshot = await this.listScope(input);
		yield {
			scope: input.scope,
			scopeId: input.scopeId,
			entries: snapshot.entries,
		};

		try {
			while (true) {
				if (queue.length === 0) {
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
				}
				const next = queue.shift();
				if (next) yield next;
			}
		} finally {
			set.delete(listener);
		}
	}

	async reportPresence(input: HostPresenceInput): Promise<HostPresence> {
		const presence: HostPresence = {
			deviceId: input.deviceId,
			orgId: input.orgId,
			machineId: input.machineId,
			hostKind: input.hostKind,
			state: input.state,
			lastSeenAt: input.lastSeenAt ?? Date.now(),
			updatedAt: Date.now(),
		};
		this.presence.set(input.deviceId, presence);
		return presence;
	}

	async claim() {
		return { ok: false, reason: "claims-not-wired" } as const;
	}
}

function createCaller(service: AgentStateService | null) {
	const ctx = {
		isAuthenticated: true,
		runtime: { agentState: { service } },
	} as unknown as HostServiceContext;
	return agentStateRouter.createCaller(ctx);
}

describe("agentStateRouter", () => {
	it("setEntry then getScope round-trips through the runtime service", async () => {
		const caller = createCaller(new FakeAgentStateService());
		const written = await caller.setEntry({
			orgId: "org-1",
			deviceId: "device-a",
			scope: "workspace",
			scopeId: "ws-1",
			key: "status",
			valueJson: JSON.stringify({ phase: "running" }),
		});
		expect(written.revision).toBe(1);

		const scope = await caller.getScope({
			orgId: "org-1",
			scope: "workspace",
			scopeId: "ws-1",
		});
		expect(scope.entries).toHaveLength(1);
		expect(scope.entries[0]?.valueJson).toBe(
			JSON.stringify({ phase: "running" }),
		);
	});

	it("reportPresence persists and returns the row", async () => {
		const caller = createCaller(new FakeAgentStateService());
		const presence = await caller.reportPresence({
			deviceId: "device-a",
			orgId: "org-1",
			machineId: "machine-1",
			hostKind: "local",
			state: "online",
		});
		expect(presence.deviceId).toBe("device-a");
		expect(presence.state).toBe("online");
	});

	it("subscribeScope yields the cache-first snapshot then live changes", async () => {
		const service = new FakeAgentStateService();
		const caller = createCaller(service);
		const iterator = await caller.subscribeScope({
			orgId: "org-1",
			scope: "workspace",
			scopeId: "ws-1",
		});

		const it = iterator[Symbol.asyncIterator]();
		const first = await it.next();
		const firstValue = first.value;
		if (!firstValue) throw new Error("expected a cache-first snapshot");
		expect(firstValue.entries).toHaveLength(0); // cache-first empty snapshot

		await service.set({
			orgId: "org-1",
			deviceId: "device-a",
			scope: "workspace",
			scopeId: "ws-1",
			key: "step",
			valueJson: "3",
		});
		const second = await it.next();
		const secondValue = second.value;
		if (!secondValue) throw new Error("expected a live change");
		expect(secondValue.entries).toHaveLength(1);
		await it.return?.();
	});

	it("throws PRECONDITION_FAILED when the agent-state layer is disabled", async () => {
		const caller = createCaller(null);
		await expect(
			caller.getScope({ orgId: "org-1", scope: "workspace", scopeId: "ws-1" }),
		).rejects.toThrow(/agent-state/i);
	});

	it("requires authentication", async () => {
		const ctx = {
			isAuthenticated: false,
			runtime: { agentState: { service: new FakeAgentStateService() } },
		} as unknown as HostServiceContext;
		const caller = agentStateRouter.createCaller(ctx);
		await expect(
			caller.getScope({ orgId: "org-1", scope: "workspace", scopeId: "ws-1" }),
		).rejects.toThrow();
	});
});
