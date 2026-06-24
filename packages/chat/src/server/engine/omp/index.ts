/**
 * Public surface of the omp (`oh-my-pi`) engine: the {@link OmpEngine} class and
 * its {@link createOmpEngine} factory. Selected by `createEngine` when
 * `ROX_AGENT_ENGINE=omp`.
 */

export { createOmpEngine, OmpEngine } from "./omp-engine";
export type { OmpModelRouting } from "./omp-models";
export { resolveOmpModelRouting } from "./omp-models";
export type { OmpPushEvent } from "./omp-process";
export { OmpProcess } from "./omp-process";
