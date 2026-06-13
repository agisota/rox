import {
	executionCircuits,
	experienceTraceEvents,
	tasks,
	transitionRuns,
	workspaces,
} from "@rox/local-db";
import { desc, eq } from "drizzle-orm";
import type { localDb } from "main/lib/local-db";
import type { ExecutionCircuitStore } from "./service";

type LocalDb = typeof localDb;

export function createDrizzleExecutionCircuitStore(
	db: LocalDb,
): ExecutionCircuitStore {
	return {
		getLatestCircuitByTaskId(taskId) {
			return (
				db
					.select()
					.from(executionCircuits)
					.where(eq(executionCircuits.taskId, taskId))
					.orderBy(desc(executionCircuits.updatedAt))
					.limit(1)
					.get() ?? null
			);
		},

		getCircuitById(circuitId) {
			return (
				db
					.select()
					.from(executionCircuits)
					.where(eq(executionCircuits.id, circuitId))
					.limit(1)
					.get() ?? null
			);
		},

		getTaskById(taskId) {
			return (
				db
					.select({
						id: tasks.id,
						title: tasks.title,
						description: tasks.description,
					})
					.from(tasks)
					.where(eq(tasks.id, taskId))
					.limit(1)
					.get() ?? null
			);
		},

		getWorkspaceById(workspaceId) {
			return (
				db
					.select({
						id: workspaces.id,
						projectId: workspaces.projectId,
					})
					.from(workspaces)
					.where(eq(workspaces.id, workspaceId))
					.limit(1)
					.get() ?? null
			);
		},

		listTransitionRuns(circuitId) {
			return db
				.select()
				.from(transitionRuns)
				.where(eq(transitionRuns.circuitId, circuitId))
				.orderBy(desc(transitionRuns.createdAt))
				.all();
		},

		listTraceEvents(transitionRunId) {
			return db
				.select()
				.from(experienceTraceEvents)
				.where(eq(experienceTraceEvents.transitionRunId, transitionRunId))
				.orderBy(experienceTraceEvents.sequence)
				.all();
		},

		insertCircuit(circuit) {
			return db.insert(executionCircuits).values(circuit).returning().get();
		},

		updateCircuit(id, patch) {
			return (
				db
					.update(executionCircuits)
					.set(patch)
					.where(eq(executionCircuits.id, id))
					.returning()
					.get() ?? null
			);
		},

		insertTransitionRun(input) {
			return db.insert(transitionRuns).values(input).returning().get();
		},

		getTransitionRun(transitionRunId) {
			return (
				db
					.select()
					.from(transitionRuns)
					.where(eq(transitionRuns.id, transitionRunId))
					.limit(1)
					.get() ?? null
			);
		},

		insertTraceEvent(input) {
			return db.transaction((tx) => {
				const sequence =
					(tx
						.select({ sequence: experienceTraceEvents.sequence })
						.from(experienceTraceEvents)
						.where(
							eq(experienceTraceEvents.transitionRunId, input.transitionRunId),
						)
						.orderBy(desc(experienceTraceEvents.sequence))
						.limit(1)
						.get()?.sequence ?? 0) + 1;

				return tx
					.insert(experienceTraceEvents)
					.values({ ...input, sequence })
					.returning()
					.get();
			});
		},

		updateTransitionRun(transitionRunId, patch) {
			return (
				db
					.update(transitionRuns)
					.set(patch)
					.where(eq(transitionRuns.id, transitionRunId))
					.returning()
					.get() ?? null
			);
		},
	};
}
