import type { RunRecorder, StepRecord } from "./types";

/** Collects step records in memory. Used for tests and for buffering before a
 * batched DB write. */
export class InMemoryRunRecorder implements RunRecorder {
	readonly steps: StepRecord[] = [];
	recordStep(step: StepRecord): void {
		this.steps.push(step);
	}
}
