/**
 * Pure default-draft factory: turn a task's basic fields into a valid
 * `todo -> working -> done` execution circuit. Deterministic (no Date/random),
 * so the same task always produces the same draft.
 */

import type { JsonSchema } from "../types";
import type { ExecutionCircuitSpec } from "./types";

export interface DefaultCircuitTaskInput {
	title: string;
	description?: string | null;
	priority?: string | null;
	status?: string | null;
}

const SUMMARY_CONTRACT: JsonSchema = {
	type: "object",
	properties: {
		status: { type: "string", enum: ["completed", "failed"] },
		summary: { type: "string" },
	},
	required: ["status", "summary"],
};

/**
 * Build a valid default-draft {@link ExecutionCircuitSpec} for a task. The
 * circuit models the canonical lifecycle todo -> working -> done with the
 * TargetState set to `done`.
 */
export function defaultCircuitForTask(
	input: DefaultCircuitTaskInput,
): ExecutionCircuitSpec {
	const title = input.title.trim() || "Untitled task";
	const description = input.description?.trim() || undefined;
	const priority = input.priority?.trim() || undefined;

	return {
		name: `Circuit: ${title}`,
		description,
		initialState: "todo",
		targetState: "done",
		states: [
			{ id: "todo", label: "To do", description: "Work has not started." },
			{
				id: "working",
				label: "Working",
				description: "Work is in progress.",
			},
			{
				id: "done",
				label: "Done",
				description: "Target state reached.",
				terminal: true,
			},
		],
		transitions: [
			{
				id: "start",
				from: "todo",
				to: "working",
				label: "Start work",
				event: "work_started",
				monad: {
					runtimeBinding: {
						kind: "manual",
						config: priority ? { priority } : undefined,
					},
					events: [{ id: "work_started", label: "Work started" }],
				},
			},
			{
				id: "complete",
				from: "working",
				to: "done",
				label: "Complete work",
				event: "work_completed",
				monad: {
					runtimeBinding: { kind: "agent" },
					outputContract: {
						schema: { ...SUMMARY_CONTRACT },
						description: "Summarize the completed work.",
					},
					validators: [
						{
							id: "summary-present",
							kind: "schema",
							description: "Final response must include a non-empty summary.",
						},
					],
					events: [{ id: "work_completed", label: "Work completed" }],
				},
			},
		],
	};
}
