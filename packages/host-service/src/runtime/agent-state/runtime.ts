import type { AgentStateService } from "@rox/agent-state/core";
import type {
	ClaimTransport,
	CreateEmbeddedReplicaOptions,
} from "@rox/agent-state/host";
import {
	type AgentStateEnv,
	type AgentStateRuntimeManager,
	createAgentStateRuntimeManager,
} from "./index";

/**
 * Synchronous holder for the agent-state runtime manager, suitable for
 * `createApp`'s synchronous wiring. The underlying libSQL replica opens
 * asynchronously (a real file/primary handshake); this holder is returned
 * immediately and fills `manager` in the background — exactly the fire-and-forget
 * bootstrap discipline `app.ts` already uses for the main-workspace sweep and
 * preinstall.
 *
 * Until init resolves, `service` is `null` (callers degrade: the cache-first
 * subscription yields an empty snapshot). `dispose()` awaits init first so the
 * libSQL handle is never leaked by racing teardown against open.
 */
export interface AgentStateRuntime {
	/** The host agent-state service once ready, else null. */
	readonly service: AgentStateService | null;
	/** True once the underlying manager finished constructing. */
	readonly ready: boolean;
	/** True when configured against a Turso primary. */
	readonly isSynced: boolean;
	/** Request an immediate, coalesced sync. */
	kickSync(): void;
	/** Stop the sync loop and close the libSQL handle. Idempotent. */
	dispose(): Promise<void>;
}

export interface StartAgentStateRuntimeOptions {
	/**
	 * The host's environment. Accepts `process.env` directly (a superset of
	 * {@link AgentStateEnv}); only the agent-state keys are read.
	 */
	env: AgentStateEnv & Record<string, string | undefined>;
	claimTransport?: ClaimTransport;
	resolveSecret?: (keyName: string) => Promise<string | undefined>;
	createClient?: CreateEmbeddedReplicaOptions["createClient"];
	/** Surface a background-init failure (defaults to a console warning). */
	onError?: (error: unknown) => void;
}

/**
 * Construct the agent-state runtime holder synchronously and open the replica in
 * the background. Returns immediately so `createApp` stays synchronous.
 */
export function startAgentStateRuntime(
	options: StartAgentStateRuntimeOptions,
): AgentStateRuntime {
	let manager: AgentStateRuntimeManager | null = null;
	let disposed = false;

	const initPromise = createAgentStateRuntimeManager({
		env: options.env,
		claimTransport: options.claimTransport,
		resolveSecret: options.resolveSecret,
		createClient: options.createClient,
	})
		.then((m) => {
			if (disposed) {
				// Disposed before init finished — close immediately.
				void m.dispose();
				return;
			}
			manager = m;
		})
		.catch((error) => {
			(options.onError ?? defaultOnError)(error);
		});

	return {
		get service() {
			return manager?.service ?? null;
		},
		get ready() {
			return manager !== null;
		},
		get isSynced() {
			return manager?.isSynced ?? false;
		},
		kickSync() {
			manager?.kickSync();
		},
		async dispose() {
			disposed = true;
			await initPromise;
			await manager?.dispose();
		},
	};
}

function defaultOnError(error: unknown): void {
	console.warn("[host-service] agent-state runtime init failed:", error);
}
