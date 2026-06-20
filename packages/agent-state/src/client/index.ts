import type {
	AgentStateRequestMap,
	AgentStateService,
	AgentStateSubscriptionMap,
} from "../core/service";

export type {
	AgentStateRequestMap,
	AgentStateService,
	AgentStateSubscriptionMap,
} from "../core/service";

/**
 * Transport-agnostic client for the agent-state service, mirroring
 * `createFsClient` (`packages/workspace-fs/src/client/index.ts`). Every method
 * forwards to `transport.request`/`transport.subscribe`, so web/desktop can bind
 * the same client to any transport (relay, cloud, or in-process) without the UI
 * branching on where the host lives.
 */
export interface AgentStateClientTransport {
	request<TKey extends keyof AgentStateRequestMap>(
		method: TKey,
		input: AgentStateRequestMap[TKey]["input"],
	): Promise<AgentStateRequestMap[TKey]["output"]>;
	subscribe<TKey extends keyof AgentStateSubscriptionMap>(
		method: TKey,
		input: AgentStateSubscriptionMap[TKey]["input"],
	): AsyncIterable<AgentStateSubscriptionMap[TKey]["event"]>;
}

export function createAgentStateClient(
	transport: AgentStateClientTransport,
): AgentStateService {
	return {
		async get(input) {
			return await transport.request("get", input);
		},
		async set(input) {
			return await transport.request("set", input);
		},
		async listScope(input) {
			return await transport.request("listScope", input);
		},
		subscribeScope(input) {
			return transport.subscribe("subscribeScope", input);
		},
		async reportPresence(input) {
			return await transport.request("reportPresence", input);
		},
		async claim(input) {
			return await transport.request("claim", input);
		},
	};
}
