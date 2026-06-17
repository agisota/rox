/**
 * Pipeline event bus port (Agent Pipelines, design §4.3).
 *
 * The cross-run trigger dispatcher (`dispatchPipelineEvent`) lives in `@rox/trpc`
 * because it needs DB access. The concrete signal sources that should fire it —
 * chat sends, agent-run completions, project creation, artifact creation, skill
 * binding / service connection — live in many packages, some of which sit BELOW
 * `@rox/trpc` in the dependency graph (e.g. `@rox/chat`, `@rox/host-service`).
 * Importing the dispatcher's runtime value into those packages would pull the
 * entire tRPC server graph into them (and risk a runtime cycle).
 *
 * This module is the decoupling seam the spec calls for ("expose a hook the
 * dispatcher subscribes to"): a single process-global sink reference plus a
 * `publishPipelineEvent` helper. Producers depend only on `@rox/workflow-core`
 * (pure, already ubiquitous) and call `publishPipelineEvent(...)`; the tRPC layer
 * registers `dispatchPipelineEvent` as the sink once at app init via
 * `setPipelineEventSink`.
 *
 * Purity note: this file holds an injected function reference and forwards to it.
 * It performs no DB / network / React work of its own — it is dependency
 * injection, exactly like the executor's injected `resolveAgentRun` port. When no
 * sink is registered (tests, web-only bundles), publishing is a safe no-op.
 */

import type { PipelineEvent } from "./triggerMatch";

/**
 * A registered consumer of pipeline events. The tRPC layer registers
 * `dispatchPipelineEvent`. Implementations MUST be fire-and-forget safe: they
 * own their error handling and never throw back into the producer's path.
 */
export type PipelineEventSink = (event: PipelineEvent) => void | Promise<void>;

let currentSink: PipelineEventSink | null = null;

/**
 * Register the process-global pipeline event sink (typically the tRPC
 * `dispatchPipelineEvent`). Returns an unsubscribe function that restores the
 * previously-registered sink (handy for tests).
 */
export function setPipelineEventSink(sink: PipelineEventSink): () => void {
	const previous = currentSink;
	currentSink = sink;
	return () => {
		// Only clear if we are still the active sink; avoids clobbering a
		// later registration when teardown order is interleaved.
		if (currentSink === sink) currentSink = previous;
	};
}

/** Test/escape hatch: drop the registered sink. */
export function clearPipelineEventSink(): void {
	currentSink = null;
}

/** Whether a sink is currently registered (lets producers skip building payloads). */
export function hasPipelineEventSink(): boolean {
	return currentSink !== null;
}

/**
 * Publish a pipeline event to the registered sink. Fire-and-forget by contract:
 * never blocks and never throws into the caller's path. When no sink is
 * registered the call is a safe no-op (e.g. unit tests, web-only runtime).
 */
export function publishPipelineEvent(event: PipelineEvent): void {
	const sink = currentSink;
	if (!sink) return;
	try {
		const result = sink(event);
		if (result && typeof (result as Promise<void>).catch === "function") {
			(result as Promise<void>).catch(() => {
				// The sink owns its own error reporting; swallow here so a failing
				// dispatch never breaks the originating user action.
			});
		}
	} catch {
		// Synchronous throw from the sink must not propagate to the producer.
	}
}
