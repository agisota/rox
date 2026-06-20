import { buildHostRoutingKey } from "@rox/shared/host-routing";

/**
 * One host as the agents cabinet lists it (WS-B T3). Derived from
 * `host.list(org)` rows plus the active-org id (needed to build the relay
 * routing key the {@link import("../../../trpc/host-client").createRelayHostClient}
 * dials).
 */
export type AgentsHostTarget = {
	hostId: string;
	name: string;
	online: boolean;
	kind: "local" | "remote" | "sandbox";
	routingKey: string;
};

/** Raw `host.list` row shape the resolver consumes (subset we use). */
export type HostListRow = {
	id: string;
	name: string;
	online: boolean;
	kind: "local" | "remote" | "sandbox";
};

/**
 * D1 continue-on-web decision. When the user opens the cabinet and NO online
 * host is reachable, web must auto-provision a cloud sandbox and continue there
 * — with NO confirmation prompt. The only gate is the prepaid balance check
 * (`canAffordSandbox`): affordable → `autoProvisionSandbox`; not affordable →
 * `topUpRequired` (a top-up prompt, never a "want a sandbox?" dialog).
 */
export type AgentsContinueDecision =
	| { kind: "useOnlineHost"; target: AgentsHostTarget }
	| { kind: "autoProvisionSandbox" }
	| { kind: "topUpRequired" };

/**
 * Pure host-listing resolver (WS-B T3). Maps `host.list` rows to cabinet
 * targets, marking whether the live path is available. Falls back to the mock
 * prototype ONLY when the org has no hosts at all (keeps the mock module, never
 * deletes it).
 */
export function resolveAgentsHostListing(
	organizationId: string,
	rows: HostListRow[],
): { targets: AgentsHostTarget[]; useMock: boolean } {
	if (rows.length === 0) {
		return { targets: [], useMock: true };
	}
	const targets = rows.map((row) => ({
		hostId: row.id,
		name: row.name,
		online: row.online,
		kind: row.kind,
		routingKey: buildHostRoutingKey(organizationId, row.id),
	}));
	return { targets, useMock: false };
}

/**
 * Pure D1 decision. Prefer the first online host. If none is online,
 * auto-provision a sandbox when the balance covers it, else require a top-up.
 * No "ask for a host" branch exists by design (D1).
 */
export function resolveAgentsContinueDecision(
	targets: AgentsHostTarget[],
	canAffordSandbox: boolean,
): AgentsContinueDecision {
	const online = targets.find((target) => target.online);
	if (online) {
		return { kind: "useOnlineHost", target: online };
	}
	return canAffordSandbox
		? { kind: "autoProvisionSandbox" }
		: { kind: "topUpRequired" };
}
