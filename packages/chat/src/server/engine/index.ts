/**
 * Public surface of the pluggable agent {@link Engine} seam.
 *
 * Call sites should import the `Engine` type and obtain an instance through
 * {@link createEngine} (the default factory). {@link createEngine} selects the
 * concrete engine at runtime from the `ROX_AGENT_ENGINE` env flag:
 *
 *   - `ROX_AGENT_ENGINE` unset or `"mastra"` (default) → {@link createMastraEngine}.
 *   - `ROX_AGENT_ENGINE=omp` → {@link createOmpEngine} (drives `oh-my-pi`
 *     `omp --mode rpc` as a headless subprocess).
 *
 * MastraEngine stays the default and fallback. Both factories return the same
 * {@link EngineBundle}, so nothing downstream (tRPC service, host-service runtime
 * manager, shared runtime helpers, UI) changes when the flag flips.
 */

export type {
	Engine,
	EngineBundle,
	EngineConfig,
	EngineFactory,
	EngineMemoryStore,
	EngineMode,
	EngineStoredMessage,
	EngineStoredThread,
	MastraEngineState,
	MastraHarness,
} from "./engine";

import type { EngineBundle, EngineConfig, EngineFactory } from "./engine";
import { createMastraEngine } from "./mastra-engine";
import { createOmpEngine } from "./omp";

export { createMastraEngine, MastraEngine } from "./mastra-engine";
export { createOmpEngine, OmpEngine } from "./omp";

/** Env flag selecting the active engine. Default `"mastra"`. */
export const ROX_AGENT_ENGINE_ENV = "ROX_AGENT_ENGINE";

/**
 * The default engine factory. Selects the concrete engine from
 * {@link ROX_AGENT_ENGINE_ENV} at call time: `"omp"` → {@link createOmpEngine};
 * anything else (including unset) → {@link createMastraEngine}. This is the
 * single seam where the engine implementation is chosen.
 */
export const createEngine: EngineFactory = (
	config?: EngineConfig,
): Promise<EngineBundle> => {
	const selected = process.env[ROX_AGENT_ENGINE_ENV]?.trim().toLowerCase();
	if (selected === "omp") {
		return createOmpEngine(config);
	}
	return createMastraEngine(config);
};
