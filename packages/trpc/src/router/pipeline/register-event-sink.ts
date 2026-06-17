import { setPipelineEventSink } from "@rox/workflow-core";
import { dispatchPipelineEvent } from "./dispatcher";

/**
 * Wire the cross-run pipeline dispatcher (`dispatchPipelineEvent`, this package)
 * as the process-global sink for pipeline events published through the pure port
 * in `@rox/workflow-core` (design §4.3).
 *
 * Producers across packages — chat sends, agent-run completions, project
 * creation, artifact creation, skill binding / service connection — call
 * `publishPipelineEvent(...)` from `@rox/workflow-core` (which they already
 * depend on). Those that live below `@rox/trpc` in the dependency graph
 * (`@rox/chat`, `@rox/host-service`) cannot import the dispatcher directly
 * without pulling the whole tRPC server graph in; the pure port is the seam.
 *
 * Registration is idempotent and side-effectful at module load: importing the
 * pipeline router (which `root.ts` does for every server entry) installs the
 * sink exactly once. The sink itself is fire-and-forget — `dispatchPipelineEvent`
 * owns its own per-trigger error handling, and `publishPipelineEvent` swallows
 * any rejection so a failing dispatch never breaks the originating user action.
 */
let registered = false;

export function registerPipelineEventSink(): void {
	if (registered) return;
	registered = true;
	setPipelineEventSink(async (event) => {
		// Discard the `{ dispatched }` result — the sink contract is `void`.
		// `publishPipelineEvent` already swallows rejections, but dispatching is
		// fully self-contained (per-trigger try/catch inside dispatchPipelineEvent).
		await dispatchPipelineEvent(event);
	});
}

// Install on first import of the pipeline router barrel.
registerPipelineEventSink();
