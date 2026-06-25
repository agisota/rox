import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { achievementsRouter } from "./router/achievements";
import { adminRouter } from "./router/admin";
import { agentRouter } from "./router/agent";
import { agentSourceRouter } from "./router/agent-source";
import { ambientRouter } from "./router/ambient";
import { analyticsRouter } from "./router/analytics";
import { apiKeyRouter } from "./router/api-key";
import { automationRouter } from "./router/automation";
import { calendarRouter } from "./router/calendar";
import { chatLabelsRouter, chatRouter } from "./router/chat";
import { collabRouter } from "./router/collab";
import { commsRouter } from "./router/comms";
import { dashboardRouter } from "./router/dashboard";
import { deviceRouter } from "./router/device";
import { driveRouter } from "./router/drive";
import { economyRouter } from "./router/economy";
import { executionCircuitRouter } from "./router/executionCircuit";
import { graphRouter } from "./router/graph";
import { hostRouter } from "./router/host";
import { integrationRouter } from "./router/integration";
import { journalRouter } from "./router/journal";
import { knowledgeRouter } from "./router/knowledge";
import { mailRouter } from "./router/mail";
import { mcpAdminRouter } from "./router/mcp-admin";
import { memoryRouter } from "./router/memory";
import { meshRouter } from "./router/mesh";
import { notebooksRouter } from "./router/notebooks";
import { notesRouter } from "./router/notes";
import { organizationRouter } from "./router/organization";
import {
	agentRoleRouter,
	pipelineRouter,
	triggerRouter,
} from "./router/pipeline";
import {
	identityRouter,
	personasRouter,
	profileRouter,
} from "./router/profile";
import { projectRouter } from "./router/project";
import { rankingRouter } from "./router/ranking";
import { rtcRouter } from "./router/rtc";
import { runtimeRouter } from "./router/runtime";
import { shareRouter } from "./router/share";
import { skillRouter } from "./router/skill";
import { skillLibraryRouter } from "./router/skill-library";
import { supportRouter } from "./router/support/support";
import { taskRouter } from "./router/task";
import { teamRouter } from "./router/team";
import { usageRouter } from "./router/usage";
import { userRouter } from "./router/user";
import { v2HostRouter } from "./router/v2-host";
import { v2ProjectRouter } from "./router/v2-project";
import { v2WorkspaceRouter } from "./router/v2-workspace";
import { voiceRouter } from "./router/voice";
import { workflowRouter } from "./router/workflow";
import { workspaceRouter } from "./router/workspace";
import { xmppRouter } from "./router/xmpp";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	achievements: achievementsRouter,
	admin: adminRouter,
	agent: agentRouter,
	agentRole: agentRoleRouter,
	agentSource: agentSourceRouter,
	ambient: ambientRouter,
	apiKey: apiKeyRouter,
	analytics: analyticsRouter,
	automation: automationRouter,
	calendar: calendarRouter,
	chat: chatRouter,
	chatLabels: chatLabelsRouter,
	collab: collabRouter,
	comms: commsRouter,
	device: deviceRouter,
	drive: driveRouter,
	economy: economyRouter,
	skillLibrary: skillLibraryRouter,
	dashboard: dashboardRouter,
	mcpAdmin: mcpAdminRouter,
	executionCircuit: executionCircuitRouter,
	graph: graphRouter,
	host: hostRouter,
	identity: identityRouter,
	integration: integrationRouter,
	journal: journalRouter,
	knowledge: knowledgeRouter,
	mail: mailRouter,
	memory: memoryRouter,
	mesh: meshRouter,
	// D7 Notes (notebooks → notes, org+user-scoped) is the canonical `notes`
	// surface. The legacy unscoped per-profile notes router is bound under
	// `profileNotes` to remove the wrong-router footgun (N4).
	notes: notebooksRouter,
	profileNotes: notesRouter,
	organization: organizationRouter,
	personas: personasRouter,
	pipeline: pipelineRouter,
	pipelineTrigger: triggerRouter,
	profile: profileRouter,
	project: projectRouter,
	ranking: rankingRouter,
	rtc: rtcRouter,
	runtime: runtimeRouter,
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
	voice: voiceRouter,
	workflow: workflowRouter,
	workspace: workspaceRouter,
	xmpp: xmppRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
