// Side-effect import: registers `dispatchPipelineEvent` as the global pipeline
// event sink (design §4.3) on first import of this barrel. `root.ts` imports the
// pipeline router for every server entry, so the sink is always installed.
import "./register-event-sink";

export { agentRoleRouter } from "./agent-role";
export { dispatchPipelineEvent, triggerKindToEventKind } from "./dispatcher";
export { pipelineRouter } from "./pipeline";
export { registerPipelineEventSink } from "./register-event-sink";
export { triggerRouter } from "./trigger";
