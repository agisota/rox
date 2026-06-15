import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { achievementsRouter } from "./router/achievements";
import { adminRouter } from "./router/admin";
import { agentRouter } from "./router/agent";
import { agentSourceRouter } from "./router/agent-source";
import { analyticsRouter } from "./router/analytics";
import { apiKeyRouter } from "./router/api-key";
import { automationRouter } from "./router/automation";
import { chatRouter } from "./router/chat";
import { deviceRouter } from "./router/device";
import { executionCircuitRouter } from "./router/executionCircuit";
import { hostRouter } from "./router/host";
import { integrationRouter } from "./router/integration";
import { knowledgeRouter } from "./router/knowledge";
import { notesRouter } from "./router/notes";
import { organizationRouter } from "./router/organization";
import { profileRouter } from "./router/profile";
import { projectRouter } from "./router/project";
import { rankingRouter } from "./router/ranking";
import { shareRouter } from "./router/share";
import { skillRouter } from "./router/skill";
import { supportRouter } from "./router/support/support";
import { taskRouter } from "./router/task";
import { teamRouter } from "./router/team";
import { usageRouter } from "./router/usage";
import { userRouter } from "./router/user";
import { v2HostRouter } from "./router/v2-host";
import { v2ProjectRouter } from "./router/v2-project";
import { v2WorkspaceRouter } from "./router/v2-workspace";
import { workflowRouter } from "./router/workflow";
import { workspaceRouter } from "./router/workspace";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	achievements: achievementsRouter,
	admin: adminRouter,
	agent: agentRouter,
	agentSource: agentSourceRouter,
	apiKey: apiKeyRouter,
	analytics: analyticsRouter,
	automation: automationRouter,
	chat: chatRouter,
	device: deviceRouter,
	executionCircuit: executionCircuitRouter,
	host: hostRouter,
	integration: integrationRouter,
	knowledge: knowledgeRouter,
	notes: notesRouter,
	organization: organizationRouter,
	profile: profileRouter,
	project: projectRouter,
	ranking: rankingRouter,
	share: shareRouter,
	skill: skillRouter,
	support: supportRouter,
	task: taskRouter,
	team: teamRouter,
	usage: usageRouter,
	user: userRouter,
	v2Host: v2HostRouter,
	v2Project: v2ProjectRouter,
	v2Workspace: v2WorkspaceRouter,
	workflow: workflowRouter,
	workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
