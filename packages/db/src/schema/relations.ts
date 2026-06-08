import { relations } from "drizzle-orm";

import {
	accounts,
	invitations,
	members,
	organizations,
	sessions,
	users,
} from "./auth";
import {
	executionCircuits,
	experienceTraceEvents,
	transitionRuns,
} from "./circuit";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "./github";
import { knowledgeDocuments, knowledgeLinks } from "./knowledge";
import {
	accessGrants,
	agentCommands,
	chatSessions,
	devicePresence,
	integrationConnections,
	projects,
	sandboxImages,
	secrets,
	subscriptions,
	taskStatuses,
	tasks,
	usersSlackUsers,
	v2Clients,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
	workspaces,
} from "./schema";
import {
	approvalRequests,
	artifacts,
	contextPacks,
	objectRelations,
	skillBindings,
	skills,
	skillVersions,
	workflowDefinitions,
	workflowDeployments,
	workflowRunSteps,
	workflowRuns,
	workflowVersions,
} from "./workflow";

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	members: many(members),
	invitations: many(invitations),
	createdTasks: many(tasks, { relationName: "creator" }),
	assignedTasks: many(tasks, { relationName: "assignee" }),
	connectedIntegrations: many(integrationConnections),
	githubInstallations: many(githubInstallations),
	devicePresence: many(devicePresence),
	v2Hosts: many(v2Hosts),
	v2Clients: many(v2Clients),
	v2UsersHosts: many(v2UsersHosts),
	v2Workspaces: many(v2Workspaces),
	agentCommands: many(agentCommands),
	chatSessions: many(chatSessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(members),
	invitations: many(invitations),
	subscriptions: many(subscriptions),
	projects: many(projects),
	v2Hosts: many(v2Hosts),
	v2Clients: many(v2Clients),
	v2UsersHosts: many(v2UsersHosts),
	v2Projects: many(v2Projects),
	v2Workspaces: many(v2Workspaces),
	secrets: many(secrets),
	sandboxImages: many(sandboxImages),
	workspaces: many(workspaces),
	tasks: many(tasks),
	taskStatuses: many(taskStatuses),
	integrations: many(integrationConnections),
	githubInstallations: many(githubInstallations),
	githubRepositories: many(githubRepositories),
	githubPullRequests: many(githubPullRequests),
	devicePresence: many(devicePresence),
	agentCommands: many(agentCommands),
	chatSessions: many(chatSessions),
	accessGrants: many(accessGrants),
	knowledgeDocuments: many(knowledgeDocuments),
}));

export const accessGrantsRelations = relations(accessGrants, ({ one }) => ({
	organization: one(organizations, {
		fields: [accessGrants.organizationId],
		references: [organizations.id],
	}),
	createdByUser: one(users, {
		fields: [accessGrants.createdByUserId],
		references: [users.id],
	}),
}));

export const membersRelations = relations(members, ({ one }) => ({
	organization: one(organizations, {
		fields: [members.organizationId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [members.userId],
		references: [users.id],
	}),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
	organization: one(organizations, {
		fields: [invitations.organizationId],
		references: [organizations.id],
	}),
	inviter: one(users, {
		fields: [invitations.inviterId],
		references: [users.id],
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
	organization: one(organizations, {
		fields: [subscriptions.referenceId],
		references: [organizations.id],
	}),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [tasks.organizationId],
		references: [organizations.id],
	}),
	status: one(taskStatuses, {
		fields: [tasks.statusId],
		references: [taskStatuses.id],
	}),
	assignee: one(users, {
		fields: [tasks.assigneeId],
		references: [users.id],
		relationName: "assignee",
	}),
	creator: one(users, {
		fields: [tasks.creatorId],
		references: [users.id],
		relationName: "creator",
	}),
	workspaces: many(v2Workspaces),
	executionCircuits: many(executionCircuits),
}));

export const taskStatusesRelations = relations(
	taskStatuses,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [taskStatuses.organizationId],
			references: [organizations.id],
		}),
		tasks: many(tasks),
	}),
);

export const integrationConnectionsRelations = relations(
	integrationConnections,
	({ one }) => ({
		organization: one(organizations, {
			fields: [integrationConnections.organizationId],
			references: [organizations.id],
		}),
		connectedBy: one(users, {
			fields: [integrationConnections.connectedByUserId],
			references: [users.id],
		}),
	}),
);

// GitHub relations
export const githubInstallationsRelations = relations(
	githubInstallations,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [githubInstallations.organizationId],
			references: [organizations.id],
		}),
		connectedBy: one(users, {
			fields: [githubInstallations.connectedByUserId],
			references: [users.id],
		}),
		repositories: many(githubRepositories),
	}),
);

export const githubRepositoriesRelations = relations(
	githubRepositories,
	({ one, many }) => ({
		installation: one(githubInstallations, {
			fields: [githubRepositories.installationId],
			references: [githubInstallations.id],
		}),
		organization: one(organizations, {
			fields: [githubRepositories.organizationId],
			references: [organizations.id],
		}),
		pullRequests: many(githubPullRequests),
		projects: many(projects),
		v2Projects: many(v2Projects),
	}),
);

export const githubPullRequestsRelations = relations(
	githubPullRequests,
	({ one }) => ({
		repository: one(githubRepositories, {
			fields: [githubPullRequests.repositoryId],
			references: [githubRepositories.id],
		}),
		organization: one(organizations, {
			fields: [githubPullRequests.organizationId],
			references: [organizations.id],
		}),
	}),
);

// Agent relations
export const devicePresenceRelations = relations(devicePresence, ({ one }) => ({
	user: one(users, {
		fields: [devicePresence.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [devicePresence.organizationId],
		references: [organizations.id],
	}),
}));

export const agentCommandsRelations = relations(agentCommands, ({ one }) => ({
	user: one(users, {
		fields: [agentCommands.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [agentCommands.organizationId],
		references: [organizations.id],
	}),
	parentCommand: one(agentCommands, {
		fields: [agentCommands.parentCommandId],
		references: [agentCommands.id],
		relationName: "parentCommand",
	}),
}));

export const usersSlackUsersRelations = relations(
	usersSlackUsers,
	({ one }) => ({
		user: one(users, {
			fields: [usersSlackUsers.userId],
			references: [users.id],
		}),
		organization: one(organizations, {
			fields: [usersSlackUsers.organizationId],
			references: [organizations.id],
		}),
	}),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [projects.organizationId],
		references: [organizations.id],
	}),
	githubRepository: one(githubRepositories, {
		fields: [projects.githubRepositoryId],
		references: [githubRepositories.id],
	}),
	secrets: many(secrets),
	sandboxImage: one(sandboxImages),
	workspaces: many(workspaces),
}));

export const v2ProjectsRelations = relations(v2Projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [v2Projects.organizationId],
		references: [organizations.id],
	}),
	githubRepository: one(githubRepositories, {
		fields: [v2Projects.githubRepositoryId],
		references: [githubRepositories.id],
	}),
	workspaces: many(v2Workspaces),
	knowledgeDocuments: many(knowledgeDocuments),
}));

export const v2HostsRelations = relations(v2Hosts, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [v2Hosts.organizationId],
		references: [organizations.id],
	}),
	createdBy: one(users, {
		fields: [v2Hosts.createdByUserId],
		references: [users.id],
	}),
	usersHosts: many(v2UsersHosts),
	workspaces: many(v2Workspaces),
}));

export const v2ClientsRelations = relations(v2Clients, ({ one }) => ({
	organization: one(organizations, {
		fields: [v2Clients.organizationId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [v2Clients.userId],
		references: [users.id],
	}),
}));

export const v2UsersHostsRelations = relations(v2UsersHosts, ({ one }) => ({
	organization: one(organizations, {
		fields: [v2UsersHosts.organizationId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [v2UsersHosts.userId],
		references: [users.id],
	}),
	host: one(v2Hosts, {
		fields: [v2UsersHosts.organizationId, v2UsersHosts.hostId],
		references: [v2Hosts.organizationId, v2Hosts.machineId],
	}),
}));

export const v2WorkspacesRelations = relations(
	v2Workspaces,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [v2Workspaces.organizationId],
			references: [organizations.id],
		}),
		project: one(v2Projects, {
			fields: [v2Workspaces.projectId],
			references: [v2Projects.id],
		}),
		host: one(v2Hosts, {
			fields: [v2Workspaces.organizationId, v2Workspaces.hostId],
			references: [v2Hosts.organizationId, v2Hosts.machineId],
		}),
		createdBy: one(users, {
			fields: [v2Workspaces.createdByUserId],
			references: [users.id],
		}),
		chatSessions: many(chatSessions),
		task: one(tasks, {
			fields: [v2Workspaces.taskId],
			references: [tasks.id],
		}),
	}),
);

export const secretsRelations = relations(secrets, ({ one }) => ({
	organization: one(organizations, {
		fields: [secrets.organizationId],
		references: [organizations.id],
	}),
	project: one(projects, {
		fields: [secrets.projectId],
		references: [projects.id],
	}),
	createdBy: one(users, {
		fields: [secrets.createdByUserId],
		references: [users.id],
	}),
}));

export const sandboxImagesRelations = relations(sandboxImages, ({ one }) => ({
	organization: one(organizations, {
		fields: [sandboxImages.organizationId],
		references: [organizations.id],
	}),
	project: one(projects, {
		fields: [sandboxImages.projectId],
		references: [projects.id],
	}),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [workspaces.organizationId],
		references: [organizations.id],
	}),
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	createdBy: one(users, {
		fields: [workspaces.createdByUserId],
		references: [users.id],
	}),
	chatSessions: many(chatSessions),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one }) => ({
	organization: one(organizations, {
		fields: [chatSessions.organizationId],
		references: [organizations.id],
	}),
	createdBy: one(users, {
		fields: [chatSessions.createdBy],
		references: [users.id],
	}),
	workspace: one(workspaces, {
		fields: [chatSessions.workspaceId],
		references: [workspaces.id],
	}),
	v2Workspace: one(v2Workspaces, {
		fields: [chatSessions.v2WorkspaceId],
		references: [v2Workspaces.id],
	}),
}));

// ---------------------------------------------------------------------------
// Automation Fabric relations
// ---------------------------------------------------------------------------

export const workflowDefinitionsRelations = relations(
	workflowDefinitions,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [workflowDefinitions.organizationId],
			references: [organizations.id],
		}),
		v2Project: one(v2Projects, {
			fields: [workflowDefinitions.v2ProjectId],
			references: [v2Projects.id],
		}),
		owner: one(users, {
			fields: [workflowDefinitions.ownerUserId],
			references: [users.id],
		}),
		versions: many(workflowVersions),
		deployments: many(workflowDeployments),
	}),
);

export const workflowVersionsRelations = relations(
	workflowVersions,
	({ one, many }) => ({
		workflow: one(workflowDefinitions, {
			fields: [workflowVersions.workflowId],
			references: [workflowDefinitions.id],
		}),
		createdBy: one(users, {
			fields: [workflowVersions.createdByUserId],
			references: [users.id],
		}),
		deployments: many(workflowDeployments),
	}),
);

export const workflowDeploymentsRelations = relations(
	workflowDeployments,
	({ one }) => ({
		workflow: one(workflowDefinitions, {
			fields: [workflowDeployments.workflowId],
			references: [workflowDefinitions.id],
		}),
		version: one(workflowVersions, {
			fields: [workflowDeployments.workflowVersionId],
			references: [workflowVersions.id],
		}),
		deployedBy: one(users, {
			fields: [workflowDeployments.deployedByUserId],
			references: [users.id],
		}),
	}),
);

export const skillsRelations = relations(skills, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [skills.organizationId],
		references: [organizations.id],
	}),
	v2Project: one(v2Projects, {
		fields: [skills.v2ProjectId],
		references: [v2Projects.id],
	}),
	owner: one(users, {
		fields: [skills.ownerUserId],
		references: [users.id],
	}),
	// `currentVersionId` is a soft pointer queried directly to avoid a second
	// (ambiguous) relation between skills and skill_versions.
	versions: many(skillVersions),
	bindings: many(skillBindings),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
	skill: one(skills, {
		fields: [skillVersions.skillId],
		references: [skills.id],
	}),
	workflowDeployment: one(workflowDeployments, {
		fields: [skillVersions.workflowDeploymentId],
		references: [workflowDeployments.id],
	}),
	createdBy: one(users, {
		fields: [skillVersions.createdByUserId],
		references: [users.id],
	}),
}));

export const skillBindingsRelations = relations(skillBindings, ({ one }) => ({
	skill: one(skills, {
		fields: [skillBindings.skillId],
		references: [skills.id],
	}),
}));

export const workflowRunsRelations = relations(
	workflowRuns,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [workflowRuns.organizationId],
			references: [organizations.id],
		}),
		workflow: one(workflowDefinitions, {
			fields: [workflowRuns.workflowId],
			references: [workflowDefinitions.id],
		}),
		skill: one(skills, {
			fields: [workflowRuns.skillId],
			references: [skills.id],
		}),
		contextPack: one(contextPacks, {
			fields: [workflowRuns.contextPackId],
			references: [contextPacks.id],
		}),
		parentRun: one(workflowRuns, {
			fields: [workflowRuns.parentRunId],
			references: [workflowRuns.id],
			relationName: "runHierarchy",
		}),
		childRuns: many(workflowRuns, { relationName: "runHierarchy" }),
		steps: many(workflowRunSteps),
		artifacts: many(artifacts),
	}),
);

export const workflowRunStepsRelations = relations(
	workflowRunSteps,
	({ one, many }) => ({
		run: one(workflowRuns, {
			fields: [workflowRunSteps.runId],
			references: [workflowRuns.id],
		}),
		parentStep: one(workflowRunSteps, {
			fields: [workflowRunSteps.parentStepId],
			references: [workflowRunSteps.id],
			relationName: "stepHierarchy",
		}),
		childSteps: many(workflowRunSteps, { relationName: "stepHierarchy" }),
	}),
);

export const contextPacksRelations = relations(
	contextPacks,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [contextPacks.organizationId],
			references: [organizations.id],
		}),
		runs: many(workflowRuns),
	}),
);

export const artifactsRelations = relations(artifacts, ({ one }) => ({
	organization: one(organizations, {
		fields: [artifacts.organizationId],
		references: [organizations.id],
	}),
	run: one(workflowRuns, {
		fields: [artifacts.runId],
		references: [workflowRuns.id],
	}),
}));

export const objectRelationsRelations = relations(
	objectRelations,
	({ one }) => ({
		organization: one(organizations, {
			fields: [objectRelations.organizationId],
			references: [organizations.id],
		}),
	}),
);

export const approvalRequestsRelations = relations(
	approvalRequests,
	({ one }) => ({
		organization: one(organizations, {
			fields: [approvalRequests.organizationId],
			references: [organizations.id],
		}),
		run: one(workflowRuns, {
			fields: [approvalRequests.runId],
			references: [workflowRuns.id],
		}),
		step: one(workflowRunSteps, {
			fields: [approvalRequests.stepId],
			references: [workflowRunSteps.id],
		}),
	}),
);

// Execution Circuit (execution-circuit epic) ----------------------------------

export const executionCircuitsRelations = relations(
	executionCircuits,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [executionCircuits.organizationId],
			references: [organizations.id],
		}),
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
		organization: one(organizations, {
			fields: [transitionRuns.organizationId],
			references: [organizations.id],
		}),
		circuit: one(executionCircuits, {
			fields: [transitionRuns.executionCircuitId],
			references: [executionCircuits.id],
		}),
		traceEvents: many(experienceTraceEvents),
	}),
);

export const experienceTraceEventsRelations = relations(
	experienceTraceEvents,
	({ one }) => ({
		organization: one(organizations, {
			fields: [experienceTraceEvents.organizationId],
			references: [organizations.id],
		}),
		transitionRun: one(transitionRuns, {
			fields: [experienceTraceEvents.transitionRunId],
			references: [transitionRuns.id],
		}),
	}),
);

// Knowledge / notebook layer (fumadocs epic) ----------------------------------

export const knowledgeDocumentsRelations = relations(
	knowledgeDocuments,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [knowledgeDocuments.organizationId],
			references: [organizations.id],
		}),
		v2Project: one(v2Projects, {
			fields: [knowledgeDocuments.v2ProjectId],
			references: [v2Projects.id],
		}),
		createdByUser: one(users, {
			fields: [knowledgeDocuments.createdByUserId],
			references: [users.id],
		}),
		outgoingLinks: many(knowledgeLinks, { relationName: "linkSource" }),
		incomingLinks: many(knowledgeLinks, { relationName: "linkTarget" }),
	}),
);

export const knowledgeLinksRelations = relations(knowledgeLinks, ({ one }) => ({
	organization: one(organizations, {
		fields: [knowledgeLinks.organizationId],
		references: [organizations.id],
	}),
	sourceDocument: one(knowledgeDocuments, {
		fields: [knowledgeLinks.sourceDocumentId],
		references: [knowledgeDocuments.id],
		relationName: "linkSource",
	}),
	targetDocument: one(knowledgeDocuments, {
		fields: [knowledgeLinks.targetDocumentId],
		references: [knowledgeDocuments.id],
		relationName: "linkTarget",
	}),
}));
