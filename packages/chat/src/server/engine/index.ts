/**
 * Public surface of the pluggable agent {@link Engine} seam.
 *
 * Call sites should import the `Engine` type and obtain an instance through
 * {@link createEngine} (the default factory). Today {@link createEngine} is bound
 * to the mastracode-backed {@link createMastraEngine}; swapping in a future
 * `omp` engine is a one-line change here, with no edits to the tRPC service,
 * host-service runtime manager, or shared runtime helpers.
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

import type { EngineFactory } from "./engine";
import { createMastraEngine } from "./mastra-engine";

export { createMastraEngine, MastraEngine } from "./mastra-engine";

/**
 * The default engine factory. Bound to the mastracode engine for now; this is
 * the single seam where an alternative engine implementation gets wired in.
 */
export const createEngine: EngineFactory = createMastraEngine;
