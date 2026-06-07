import { relations } from "drizzle-orm";
import {
	executionCircuits,
	experienceTraceEvents,
	projects,
	tasks,
	transitionRuns,
	workspaceSections,
	workspaces,
	worktrees,
} from "./schema";

export const projectsRelations = relations(projects, ({ many }) => ({
	worktrees: many(worktrees),
	workspaces: many(workspaces),
	workspaceSections: many(workspaceSections),
}));

export const worktreesRelations = relations(worktrees, ({ one, many }) => ({
	project: one(projects, {
		fields: [worktrees.projectId],
		references: [projects.id],
	}),
	workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	worktree: one(worktrees, {
		fields: [workspaces.worktreeId],
		references: [worktrees.id],
	}),
	section: one(workspaceSections, {
		fields: [workspaces.sectionId],
		references: [workspaceSections.id],
	}),
}));

export const workspaceSectionsRelations = relations(
	workspaceSections,
	({ one, many }) => ({
		project: one(projects, {
			fields: [workspaceSections.projectId],
			references: [projects.id],
		}),
		workspaces: many(workspaces),
	}),
);

export const tasksRelations = relations(tasks, ({ many }) => ({
	executionCircuits: many(executionCircuits),
}));

export const executionCircuitsRelations = relations(
	executionCircuits,
	({ one, many }) => ({
		task: one(tasks, {
			fields: [executionCircuits.taskId],
			references: [tasks.id],
		}),
		transitionRuns: many(transitionRuns),
	}),
);

export const transitionRunsRelations = relations(
	transitionRuns,
	({ one, many }) => ({
		circuit: one(executionCircuits, {
			fields: [transitionRuns.circuitId],
			references: [executionCircuits.id],
		}),
		workspace: one(workspaces, {
			fields: [transitionRuns.workspaceId],
			references: [workspaces.id],
		}),
		traceEvents: many(experienceTraceEvents),
	}),
);

export const experienceTraceEventsRelations = relations(
	experienceTraceEvents,
	({ one }) => ({
		transitionRun: one(transitionRuns, {
			fields: [experienceTraceEvents.transitionRunId],
			references: [transitionRuns.id],
		}),
	}),
);
